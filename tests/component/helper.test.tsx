import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { parseUname } from '@lib/repl';
import type { Detection, FoundBoard } from '@lib/usb';
import { App } from '../../src/renderer/app/App';
import { fakeApi } from './fake-api';
import { newProjectFromStart } from './new-project';

/** M10.6 F-56 (screen 14): the connection helper — step by step, in plain words, with a report for the teacher. */
const PICO: FoundBoard = { id: 'e661', kind: 'pico', port: '/dev/cu.usbmodem14201', usb: '2e8a:0005' };
const W = parseUname("(sysname='rp2', nodename='rp2', release='1.29.0', version='v1.29.0 on 2026-08-24', machine='Raspberry Pi Pico W with RP2040')")!;
const none: Detection = { boards: [], drives: [] };

async function setup(start: Detection = none, project = 'New Pico W project') {
  const api = fakeApi();
  let push: (now: Detection) => void = () => {};
  api.boards.get = vi.fn(async () => start);
  api.boards.onChange = vi.fn((h) => { push = (now) => h(now, { plugged: [], unplugged: [] }); return () => {}; });
  render(<App api={api} width={1440} />);
  await newProjectFromStart(project);
  return { api, change: (d: Detection) => act(() => push(d)) };
}

async function openHelper() {
  fireEvent.click(await screen.findByRole('button', { name: /^Board:/ }));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Board' })).getByRole('button', { name: /Help connecting/ }));
  return screen.getByRole('dialog', { name: 'Help connecting a board' });
}
const step = (d: HTMLElement, name: RegExp) => within(within(d).getByRole('list', { name: 'Steps' })).getByText(name).closest('li')!;

describe('M10.6 F-56 the connection helper', () => {
  it('nothing on USB, a Pico W: plugged in? then the BOOTSEL test; no drive: the cable only charges', async () => {
    await setup();
    const d = await openHelper();
    expect(d).toHaveTextContent('Is the Pico W plugged in at both ends?');
    fireEvent.click(within(d).getByRole('button', { name: /Yes, it's plugged in/ }));
    expect(d).toHaveTextContent('hold the white BOOTSEL button');
    expect(step(d, /The laptop sees the board/)).toHaveAttribute('aria-current', 'step');
    fireEvent.click(within(d).getByRole('button', { name: /No, nothing appeared/ }));
    expect(d).toHaveTextContent('The cable only carries power');
    expect(step(d, /The laptop sees the board/)).toHaveClass('is-bad');
  });

  it('another board: a micro:bit is asked about its power light', async () => {
    await setup();
    const d = await openHelper();
    fireEvent.click(within(d).getByRole('radio', { name: 'micro:bit' }));
    fireEvent.click(within(d).getByRole('button', { name: /Yes, it's plugged in/ }));
    expect(d).toHaveTextContent("Is the micro:bit's power light on?");
    fireEvent.click(within(d).getByRole('button', { name: /No, it's off/ }));
    expect(d).toHaveTextContent('The board gets no power');
  });

  it('the board plugged in while it is open: it goes on by itself; asked, all is well', async () => {
    const s = await setup();
    const d = await openHelper();
    s.change({ boards: [PICO], drives: [] });
    expect(d).toHaveTextContent('The Pico W is found');
    fireEvent.click(within(d).getByRole('button', { name: 'Ask the board' }));
    expect(s.api.boards.check).toHaveBeenCalledWith('e661');
    s.change({ boards: [PICO], drives: [], checks: { e661: { state: 'micropython', uname: W } } });
    expect(d).toHaveTextContent('The Pico W is connected: MicroPython 1.29.');
  });

  it('used by Thonny: says so and how to free it; Try again asks again', async () => {
    const s = await setup({ boards: [PICO], drives: [], checks: { e661: { state: 'busy', by: 'Thonny' } } });
    const d = await openHelper();
    expect(d).toHaveTextContent('Another program is using the Pico W — Thonny.');
    expect(d).toHaveTextContent('Close Thonny, or press Stop/Disconnect in it.');
    fireEvent.click(within(d).getByRole('button', { name: 'Try again' }));
    expect(s.api.boards.check).toHaveBeenCalledWith('e661');
  });

  it('an ESP32 with no driver: which, and its official page', async () => {
    const s = await setup({ boards: [], drives: [], noDriver: [{ usb: '10c4:ea60', chip: 'CP210x' }] }, 'New ESP32 project');
    expect(await screen.findByRole('button', { name: /^Board:/ })).toHaveAccessibleName("Board: Board found, can't connect");
    const d = await openHelper();
    expect(d).toHaveTextContent('This laptop has no driver for the CP210x chip');
    fireEvent.click(within(d).getByRole('button', { name: 'Open the CP210x driver page' }));
    expect(s.api.app.openDriverPage).toHaveBeenCalledWith('CP210x');
  });

  it('Copy report for the teacher: what was seen and answered', async () => {
    const s = await setup();
    const d = await openHelper();
    fireEvent.click(within(d).getByRole('button', { name: /Yes, it's plugged in/ }));
    fireEvent.click(within(d).getByRole('button', { name: /No, nothing appeared/ }));
    fireEvent.click(within(d).getByRole('button', { name: 'Copy report for the teacher' }));
    await waitFor(() => expect(s.api.app.copy).toHaveBeenCalled());
    const text = vi.mocked(s.api.app.copy).mock.calls[0]![0];
    expect(text).toMatch(/^MicroLab connection report — /);
    expect(text).toContain('Answers: plugged in: yes; RPI-RP2 drive came: no');
    expect(within(d).getByRole('status')).toHaveTextContent('Copied');
  });

  it('Close (or Esc) closes it', async () => {
    await setup();
    const d = await openHelper();
    fireEvent.keyDown(d, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Help connecting a board' })).toBeNull();
  });
});
