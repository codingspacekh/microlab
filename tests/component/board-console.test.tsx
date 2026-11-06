import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { parseUname, type ConsoleKind, type SendResult } from '@lib/repl';
import type { Detection, FoundBoard } from '@lib/usb';
import { App } from '../../src/renderer/app/App';
import { fakeApi } from './fake-api';

/** M10.4 F-51 (screen 16): the real board's console in its own tab; Stop, Restart, Let go; typing at >>>. */
const PICO: FoundBoard = { id: 'e661', kind: 'pico', port: '/dev/cu.usbmodem14201', usb: '2e8a:0005' };
const W = parseUname("(sysname='rp2', nodename='rp2', release='1.29.0', version='v1.29.0 on 2026-08-24', machine='Raspberry Pi Pico W with RP2040')")!;
const ready: Detection = { boards: [PICO], drives: [], checks: { e661: { state: 'micropython', uname: W } } };
const running: Detection = { ...ready, consoles: { e661: { prompt: false, running: 'main.py' } } };
const prompt: Detection = { ...ready, consoles: { e661: { prompt: true, running: null } } };

function setup(start: Detection = ready) {
  const api = fakeApi();
  let push: (now: Detection) => void = () => {};
  let out: (id: string, chunks: { text: string; kind: ConsoleKind }[]) => void = () => {};
  api.boards.get = vi.fn(async () => start);
  api.boards.onChange = vi.fn((h) => { push = (now) => h(now, { plugged: [], unplugged: [] }); return () => {}; });
  api.boards.console.onOutput = vi.fn((h) => { out = h; return () => {}; });
  api.boards.send = vi.fn(async (): Promise<SendResult> => ({ ok: true, board: 'Pico W', sent: [{ path: 'main.py', size: 612 }], same: [], kept: [] }));
  render(<App api={api} width={1440} />);
  fireEvent.click(screen.getByRole('button', { name: 'New Pico W project' }));
  return {
    api,
    change: (now: Detection) => act(() => push(now)),
    print: (text: string, kind: ConsoleKind = 'out') => act(() => out('e661', [{ text, kind }])),
  };
}

const boardTab = () => screen.getByRole('tab', { name: /Pico W \(USB\)/ });
const log = () => screen.getByRole('log', { name: /Console/ });

async function sendAndRun(s: ReturnType<typeof setup>) {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Send to board' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Send to board' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Send to a real board' })).getByRole('button', { name: 'Send and run' }));
  await waitFor(() => expect(s.api.boards.send).toHaveBeenCalled());
  s.change(running);
}

describe('M10.4 F-51 the board\'s console tab', () => {
  it('Send and run: its tab opens, says what was sent, then shows what the board prints', async () => {
    const s = setup();
    await sendAndRun(s);
    await waitFor(() => expect(boardTab()).toHaveAttribute('aria-selected', 'true'));
    s.print('MPY: soft reboot\nTraffic lights ready\n');
    expect(log()).toHaveTextContent('✓ Sent to the Pico W: main.py (0.6 KB).');
    expect(log()).toHaveTextContent('Traffic lights ready');
    expect(within(log()).getByText(/Sent to the Pico W/)).toHaveClass('sent');
  });

  it('running: the canvas says so and the chip and the status bar too; Stop the board stops it', async () => {
    const s = setup(running);
    await waitFor(() => expect(screen.getByRole('button', { name: /^Board:/ })).toHaveAccessibleName('Board: Pico W, running main.py'));
    expect(await screen.findByText(/Running on the real Pico W\./)).toBeInTheDocument();
    expect(screen.getByText('Pico W (USB): running main.py')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stop the board' }));
    expect(s.api.boards.console.do).toHaveBeenCalledWith('e661', { do: 'interrupt' });
  });

  it('its tab while running: what Ctrl+C does; Ctrl+C in it stops the board', async () => {
    const s = setup(running);
    fireEvent.click(await screen.findByRole('tab', { name: /Pico W \(USB\)/ }));
    expect(screen.getByText('main.py runs on the board — Ctrl+C stops it and opens its REPL (>>>)')).toBeInTheDocument();
    fireEvent.keyDown(log(), { key: 'c', ctrlKey: true });
    expect(s.api.boards.console.do).toHaveBeenCalledWith('e661', { do: 'interrupt' });
  });

  it('at >>>: a line typed goes to the board; a block waits for an empty line, then goes whole', async () => {
    const s = setup(prompt);
    fireEvent.click(await screen.findByRole('tab', { name: /Pico W \(USB\)/ }));
    const input = screen.getByRole('textbox', { name: 'Python for the board' });
    fireEvent.change(input, { target: { value: 'led.toggle()' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(s.api.boards.console.do).toHaveBeenLastCalledWith('e661', { do: 'type', text: 'led.toggle()' });
    fireEvent.change(input, { target: { value: 'for i in range(2):' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input).toHaveValue('    ');
    fireEvent.change(input, { target: { value: '    print(i)' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('... for i in range(2):')).toBeInTheDocument();
    expect(s.api.boards.console.do).toHaveBeenCalledTimes(1);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(s.api.boards.console.do).toHaveBeenLastCalledWith('e661', { do: 'type', text: 'for i in range(2):\n    print(i)' });
  });

  it('Restart, and Let go (the port closed so Thonny can use the board); let go, it can be opened again', async () => {
    const s = setup(prompt);
    fireEvent.click(await screen.findByRole('tab', { name: /Pico W \(USB\)/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Restart the board' }));
    expect(s.api.boards.console.do).toHaveBeenCalledWith('e661', { do: 'restart' });
    fireEvent.click(screen.getByRole('button', { name: 'Let go of the board' }));
    expect(s.api.boards.console.close).toHaveBeenCalledWith('e661');
    s.change(ready);
    fireEvent.click(await screen.findByRole('button', { name: 'Open the console' }));
    expect(s.api.boards.console.open).toHaveBeenCalledWith('e661');
  });

  it('the Simulator tab is still there', async () => {
    setup(running);
    fireEvent.click(await screen.findByRole('tab', { name: /Pico W \(USB\)/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Simulator/ }));
    expect(screen.getByText(/Press Run to start the simulation/)).toBeInTheDocument();
  });
});

describe('M10.4 F-50 Rev 7 the Send menu', () => {
  it('Run main.py on the board: the file in the editor runs there, not saved as main.py', async () => {
    const s = setup();
    await waitFor(() => expect(screen.getByRole('button', { name: 'More ways to send' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'More ways to send' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Run main.py on the board/ }));
    await waitFor(() => expect(s.api.boards.console.do).toHaveBeenCalledWith('e661', { do: 'run', name: 'main.py', code: expect.stringContaining('from machine import Pin') }));
    expect(s.api.boards.console.open).toHaveBeenCalledWith('e661');
  });

  it('the app\'s note about it starts on a line of its own, after the board\'s >>>', async () => {
    const s = setup(prompt);
    fireEvent.click(await screen.findByRole('tab', { name: /Pico W \(USB\)/ }));
    s.print('>>> ');
    fireEvent.click(screen.getByRole('button', { name: 'More ways to send' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Run main.py on the board/ }));
    const note = await within(log()).findByText(/Running main.py from the editor on the Pico W/);
    expect(note.textContent!.startsWith('\n')).toBe(true);
    expect(note).toHaveClass('sys');
  });

  it('Open the board\'s console: just its output, nothing stopped', async () => {
    const s = setup();
    await waitFor(() => expect(screen.getByRole('button', { name: 'More ways to send' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'More ways to send' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Open the board's console/ }));
    await waitFor(() => expect(s.api.boards.console.open).toHaveBeenCalledWith('e661'));
    expect(s.api.boards.console.do).not.toHaveBeenCalled();
  });
});
