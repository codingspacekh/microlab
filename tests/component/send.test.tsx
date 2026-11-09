import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { parseUname, type SendResult } from '@lib/repl';
import type { Detection, FoundBoard } from '@lib/usb';
import { App } from '../../src/renderer/app/App';
import { fakeApi } from './fake-api';
import { newProjectFromStart } from './new-project';

/** M10.3 F-50 (screens 08, 13b): Send to board — which board, which files, what happens; its progress; its result. */
const PICO: FoundBoard = { id: 'e661', kind: 'pico', port: '/dev/cu.usbmodem14201', usb: '2e8a:0005' };
const MB: FoundBoard = { id: '9906', kind: 'microbit', port: '/dev/cu.usbmodem14202', usb: '0d28:0204' };
const W = parseUname("(sysname='rp2', nodename='rp2', release='1.29.0', version='v1.29.0 on 2026-08-24', machine='Raspberry Pi Pico W with RP2040')")!;
const ready: Detection = { boards: [PICO], drives: [], checks: { e661: { state: 'micropython', uname: W } } };

async function setup(start: Detection, result: SendResult = { ok: true, board: 'Pico W', sent: [{ path: 'main.py', size: 612 }], same: [], kept: [] }) {
  const api = fakeApi();
  let push: (now: Detection, changes: { plugged: FoundBoard[]; unplugged: FoundBoard[] }) => void = () => {};
  let finish: (r: SendResult) => void = () => {};
  api.boards.get = vi.fn(async () => start);
  api.boards.onChange = vi.fn((h) => { push = h; return () => {}; });
  api.boards.send = vi.fn(() => new Promise<SendResult>((r) => { finish = r; }));
  render(<App api={api} width={1440} />);
  await newProjectFromStart('New Pico W project');
  return {
    api,
    change: (now: Detection) => act(() => push(now, { plugged: [], unplugged: [] })),
    finish: (r: SendResult = result) => act(async () => { finish(r); }),
  };
}

const sendButton = () => screen.getByRole('button', { name: /^Send to board|^Sending/ });
const dialog = () => screen.getByRole('dialog', { name: 'Send to a real board' });
async function openDialog() {
  await waitFor(() => expect(sendButton()).toBeEnabled());
  fireEvent.click(sendButton());
  return dialog();
}

describe('M10.3 F-50 the Send to board button', () => {
  it('with no board, it can\'t be pressed and says why', async () => {
    await setup({ boards: [], drives: [] });
    await screen.findByRole('button', { name: /^Board:/ });
    expect(sendButton()).toBeDisabled();
    expect(sendButton()).toHaveAttribute('title', 'Plug a board in to send to it');
  });

  it('with a board: the dialog, as screen 08 — the board, the files, what will happen', async () => {
    await setup(ready);
    const d = await openDialog();
    const board = within(d).getByRole('radio', { name: /Raspberry Pi Pico W/ });
    expect(board).toHaveAttribute('aria-checked', 'true');
    expect(within(d).getByText('MicroPython v1.29.0 (2026-08-24) · /dev/cu.usbmodem14201')).toBeInTheDocument();
    const rows = within(d).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('main.py/main.py the board runs it when it starts');
    expect(within(d).getByRole('checkbox', { name: 'Run it when copied' })).toHaveAttribute('aria-checked', 'true');
    expect(within(d).getByRole('checkbox', { name: /Keep a copy of the board's old main.py/ })).toHaveAttribute('aria-checked', 'true');
    expect(d).toHaveTextContent('Wire the real board like the picture first.');
    expect(d).toHaveTextContent('The board restarts after copying');
  });

  it('a board for another project is shown as such', async () => {
    await setup({ boards: [PICO, MB], drives: [], checks: { e661: { state: 'micropython', uname: W } } });
    const d = await openDialog();
    const mb = within(d).getByRole('radio', { name: /micro:bit/ });
    expect(mb.closest('.crow')).toHaveTextContent('this project is for a Pico W');
  });

  it('Cancel or Esc: nothing is sent', async () => {
    const s = await setup(ready);
    await openDialog();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(await openDialog(), { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Send to a real board' })).toBeNull();
    expect(s.api.boards.send).not.toHaveBeenCalled();
  });
});

describe('M10.3 F-50 sending', () => {
  it('Send and run: the project\'s files go to the chosen board; the chip counts them; the result says what was sent', async () => {
    const s = await setup(ready, { ok: true, board: 'Pico W', sent: [{ path: 'main.py', size: 612 }], same: ['lib/ssd1306.py'], kept: [] });
    await openDialog();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Send and run' }));
    expect(s.api.boards.send).toHaveBeenCalledWith('e661', expect.objectContaining({ 'main.py': expect.any(String) }), { run: true, keep: true });
    expect(screen.queryByRole('dialog', { name: 'Send to a real board' })).toBeNull();
    s.change({ ...ready, checks: { e661: { state: 'sending', done: 1, total: 3, uname: W } } });
    expect(screen.getByRole('button', { name: /^Board:/ })).toHaveAccessibleName('Board: Pico W, sending 2 of 3');
    expect(sendButton()).toHaveTextContent('Sending…');
    expect(sendButton()).toBeDisabled();
    s.change(ready);
    await s.finish();
    expect(screen.getByText('Sent to the Pico W: main.py (0.6 KB). lib/ssd1306.py was the same — not copied.')).toBeInTheDocument();
    expect(screen.getByText('The Pico W restarted. On its own it always starts main.py — now it runs this project.')).toBeInTheDocument();
  });

  it('not run, nothing kept: as asked; the button says Send', async () => {
    const s = await setup(ready);
    await openDialog();
    fireEvent.click(within(dialog()).getByRole('checkbox', { name: 'Run it when copied' }));
    fireEvent.click(within(dialog()).getByRole('checkbox', { name: /Keep a copy/ }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Send' }));
    expect(s.api.boards.send).toHaveBeenCalledWith('e661', expect.anything(), { run: false, keep: false });
    await s.finish();
    expect(screen.queryByText(/restarted/)).toBeNull();
  });

  it('nothing changed: says so; an old main.py kept: says where', async () => {
    const s = await setup(ready);
    await openDialog();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Send and run' }));
    await s.finish({ ok: true, board: 'Pico W', sent: [], same: ['main.py'], kept: [] });
    expect(screen.getByText('Nothing to copy: main.py was already on the Pico W as it is.')).toBeInTheDocument();
    await openDialog();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Send and run' }));
    await s.finish({ ok: true, board: 'Pico W', sent: [{ path: 'main.py', size: 20 }], same: [], kept: ['main.py'], keptIn: '/Users/t/Documents/MicroLab/Board backups/Pico W 2026-11-06 13-40-12' });
    expect(screen.getByText(/The board's old main.py is kept in “Pico W 2026-11-06 13-40-12”/)).toBeInTheDocument();
  });

  it('a send that fails says why', async () => {
    const s = await setup(ready);
    await openDialog();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Send and run' }));
    await s.finish({ ok: false, message: 'The board is used by Thonny. Close Thonny, or press Stop/Disconnect in it, then send again.' });
    expect(screen.getByRole('alert')).toHaveTextContent('The board is used by Thonny.');
  });
});
