import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { parseUname } from '@lib/repl';
import type { Detection, FoundBoard } from '@lib/usb';
import { App } from '../../src/renderer/app/App';
import { fakeApi } from './fake-api';
import { newProjectFromStart } from './new-project';

/** M10.1 F-55 the board chip (screens 13, 13b) — the states USB can tell; the board's own answer comes in M10.2. */
const PICO: FoundBoard = { id: 'e661', kind: 'pico', port: '/dev/cu.usbmodem14201', usb: '2e8a:0005' };
const MB: FoundBoard = { id: '9906', kind: 'microbit', port: '/dev/cu.usbmodem14202', usb: '0d28:0204' };
const ESP: FoundBoard = { id: '0001', kind: 'esp32', port: 'COM7', usb: '10c4:ea60', chip: 'CP210x' };

async function setup(start: Detection, project = 'New Pico W project') {
  const api = fakeApi();
  let push: (now: Detection, changes: { plugged: FoundBoard[]; unplugged: FoundBoard[] }) => void = () => {};
  api.boards.get = vi.fn(async () => start);
  api.boards.onChange = vi.fn((h) => { push = h; return () => {}; });
  render(<App api={api} width={1440} />);
  await newProjectFromStart(project);
  const change = (now: Detection, plugged: FoundBoard[] = [], unplugged: FoundBoard[] = []) => act(() => push(now, { plugged, unplugged }));
  return { api, change };
}

const chip = async () => screen.findByRole('button', { name: /^Board:/ });
const none: Detection = { boards: [], drives: [] };

describe('M10.1 the board chip', () => {
  it('no board: "No board"; its card says what to plug in', async () => {
    await setup(none);
    expect(await chip()).toHaveAccessibleName('Board: No board');
    fireEvent.click(await chip());
    expect(screen.getByRole('dialog', { name: 'Board' })).toHaveTextContent('Plug a micro:bit, Pico W or ESP32 in with a USB cable that carries data');
  });

  it('the project\'s board: ready, with its port in its card', async () => {
    await setup({ boards: [PICO], drives: [] });
    expect(await chip()).toHaveAccessibleName('Board: Pico, ready');
    expect(await chip()).toHaveClass('ok');
    fireEvent.click(await chip());
    const card = screen.getByRole('dialog', { name: 'Board' });
    expect(card).toHaveTextContent('Raspberry Pi Pico');
    expect(card).toHaveTextContent('/dev/cu.usbmodem14201');
    expect(within(card).getByText('matches this project')).toBeInTheDocument();
  });

  it('another board: "project is for Pico W", in amber', async () => {
    await setup({ boards: [MB], drives: [] });
    expect(await chip()).toHaveAccessibleName('Board: micro:bit, project is for Pico W');
    expect(await chip()).toHaveClass('warn');
  });

  it('a Pico in BOOTSEL mode: no program runs; how to start it normally', async () => {
    await setup({ boards: [], drives: [{ kind: 'pico-bootsel', volume: 'RPI-RP2' }] });
    expect(await chip()).toHaveAccessibleName('Board: Pico, BOOTSEL mode');
    fireEvent.click(await chip());
    expect(screen.getByRole('dialog', { name: 'Board' })).toHaveTextContent('Unplug it and plug it back in without holding the button');
  });

  it('two boards: the one that fits is chosen; another can be chosen, and is remembered', async () => {
    const s = await setup({ boards: [PICO, ESP], drives: [] }, 'New ESP32 project');
    expect(await chip()).toHaveAccessibleName('Board: ESP32, ready (2 boards)');
    fireEvent.click(await chip());
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Board' })).getByRole('radio', { name: /Pico/ }));
    expect(await chip()).toHaveAccessibleName('Board: Pico, project is for ESP32 (2 boards)');
    expect(s.api.settings.get).toBeDefined();
    expect(await s.api.settings.get('board.chosen')).toBe('e661');
  });

  it('plugged in and out: the chip changes at once, and a short message says so', async () => {
    const s = await setup(none);
    await chip();
    s.change({ boards: [PICO], drives: [] }, [PICO]);
    expect(await chip()).toHaveAccessibleName('Board: Pico, ready');
    expect(screen.getByText(/Pico plugged in/)).toBeInTheDocument();
    s.change(none, [], [PICO]);
    expect(await chip()).toHaveAccessibleName('Board: No board');
    expect(screen.getByText(/Pico unplugged/)).toBeInTheDocument();
  });

  it('the message goes after 5 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const s = await setup(none);
      await chip();
      s.change({ boards: [MB], drives: [] }, [MB]);
      expect(screen.getByText(/micro:bit plugged in/)).toBeInTheDocument();
      expect(screen.getByText(/This project is for a Pico W/)).toBeInTheDocument();
      await act(async () => { vi.advanceTimersByTime(5100); });
      expect(screen.queryByText(/micro:bit plugged in/)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('Esc or a click elsewhere closes its card', async () => {
    await setup({ boards: [PICO], drives: [] });
    fireEvent.click(await chip());
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Board' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Board' })).toBeNull();
    fireEvent.click(await chip());
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('dialog', { name: 'Board' })).toBeNull();
  });
});

/** M10.2 F-55, F-56 (screen 13b): once the board is asked, the chip names it with its MicroPython, or says why not. */
const W = parseUname("(sysname='rp2', nodename='rp2', release='1.29.0', version='v1.29.0 on 2026-08-24 (GNU 16.1.0 MinSizeRel)', machine='Raspberry Pi Pico W with RP2040')")!;
const at = (checks: Detection['checks'], boards = [PICO]): Detection => ({ boards, drives: [], checks });

describe('M10.2 the chip, with the board\'s answer', () => {
  it('being asked: "checking…"', async () => {
    await setup(at({ e661: { state: 'checking' } }));
    expect(await chip()).toHaveAccessibleName('Board: Pico, checking…');
    expect(await chip()).toHaveClass('looking');
  });

  it('answered: its own name and MicroPython version, in the chip and its card', async () => {
    await setup(at({ e661: { state: 'micropython', uname: W } }));
    expect(await chip()).toHaveAccessibleName('Board: Pico W, ready, MicroPython 1.29');
    expect(await chip()).toHaveTextContent('Pico W · MicroPython 1.29');
    fireEvent.click(await chip());
    const card = screen.getByRole('dialog', { name: 'Board' });
    expect(card).toHaveTextContent('Raspberry Pi Pico W');
    expect(card).toHaveTextContent('MicroPython v1.29.0 (2026-08-24)');
    expect(within(card).queryByRole('button', { name: 'Check the board' })).toBeNull();
  });

  it('plugged in: the message waits for the answer, then names the board and its version', async () => {
    const s = await setup(none);
    await chip();
    s.change(at({ e661: { state: 'checking' } }), [PICO]);
    expect(screen.getByText('Pico plugged in — checking…')).toBeInTheDocument();
    s.change(at({ e661: { state: 'micropython', uname: W } }));
    expect(screen.getByText('Pico W plugged in — MicroPython 1.29.0. It matches this project.')).toBeInTheDocument();
  });

  it('used by another program: says which, how to free it, and asks again', async () => {
    const s = await setup(at({ e661: { state: 'busy', by: 'Thonny' } }));
    expect(await chip()).toHaveAccessibleName('Board: Pico, used by Thonny');
    expect(await chip()).toHaveClass('warn');
    fireEvent.click(await chip());
    const card = screen.getByRole('dialog', { name: 'Board' });
    expect(card).toHaveTextContent('Close Thonny, or press Stop/Disconnect in it');
    fireEvent.click(within(card).getByRole('button', { name: 'Try again' }));
    expect(s.api.boards.check).toHaveBeenCalledWith('e661');
  });

  it('no MicroPython on it', async () => {
    await setup(at({ 9906: { state: 'no-micropython', seen: '' } }, [MB]), 'New micro:bit project');
    expect(await chip()).toHaveAccessibleName('Board: micro:bit, no MicroPython');
    fireEvent.click(await chip());
    expect(screen.getByRole('dialog', { name: 'Board' })).toHaveTextContent('MakeCode');
  });

  it('can\'t connect: in red, with the reason', async () => {
    await setup(at({ e661: { state: 'cant-open', message: 'Opening COM7: The semaphore timeout period has expired.' } }));
    expect(await chip()).toHaveAccessibleName("Board: Board found, can't connect");
    expect(await chip()).toHaveClass('bad');
    fireEvent.click(await chip());
    expect(screen.getByRole('dialog', { name: 'Board' })).toHaveTextContent('The semaphore timeout period has expired.');
  });

  it('there before MicroLab started, not asked yet: its card can ask it, saying its program restarts', async () => {
    const s = await setup({ boards: [PICO], drives: [] });
    fireEvent.click(await chip());
    const card = screen.getByRole('dialog', { name: 'Board' });
    expect(card).toHaveTextContent('its program stops for a moment and starts again');
    fireEvent.click(within(card).getByRole('button', { name: 'Check the board' }));
    expect(s.api.boards.check).toHaveBeenCalledWith('e661');
  });
});
