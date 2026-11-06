import { describe, expect, it } from 'vitest';
import { FakeBoard, RawRepl, ReplError, UNAME_CODE, checkBoard } from '@lib/repl';
import { appWrites, boardText, latin1, loadRecording, replay, text } from './replay';

/**
 * M10.2 Q15, R10: MicroLab talks to a board through MicroPython's raw REPL, as Thonny and mpremote do — Ctrl-C stops
 * its program, Ctrl-A gives a prompt that runs whatever is sent before Ctrl-D, Ctrl-B goes back, and Ctrl-D at the
 * normal prompt restarts the board's own main.py. Checked against exchanges recorded on the teacher's Pico W.
 */
const quick = { pauseMs: 0, replyMs: 60 };

describe('M10.2 Q15 checking a board, against the recordings', () => {
  it.each(['pico-w-idle', 'pico-w-running'])('%s: the same bytes as recorded are sent, in order, and the board is a Pico W', async (name) => {
    const r = loadRecording(name);
    const link = replay(r);
    const answer = await checkBoard(link, { pauseMs: 0 });
    expect(link.mismatch).toBeUndefined();
    expect(link.done()).toBe(true);
    expect(answer).toEqual({
      kind: 'micropython',
      uname: expect.objectContaining({ release: '1.29.0', machine: 'Raspberry Pi Pico W with RP2040' }),
    });
  });

  it('the check ends with a soft reset at the normal prompt, so the board\'s own main.py runs again (R10)', () => {
    const writes = appWrites(loadRecording('pico-w-running'));
    expect(writes.slice(-2)).toEqual(['\x02', '\x04']);
    expect(boardText(loadRecording('pico-w-running'))).toMatch(/MPY: soft reboot\r\nJoining/);
  });
});

describe('M10.2 FakeBoard answers as the real board does', () => {
  it.each([
    ['pico-w-idle', {}],
    ['pico-w-running', { program: { stop: 'stopping\r\n', output: "Joining 'CHAMPIONCODERS' ...\r\n" } }],
  ] as const)('%s: the same app bytes give the same board bytes, up to the soft reboot', async (name, options) => {
    const r = loadRecording(name);
    const board = new FakeBoard({ preset: 'pico-w', ...options });
    let got = '';
    board.onData((d) => { got += text(d); });
    for (const w of appWrites(r)) { await board.write(latin1(w)); await board.settled(); }
    const cut = (s: string) => s.slice(0, s.indexOf('MPY: soft reboot\r\n') + 18);
    expect(cut(got)).toBe(cut(boardText(r)));
  });
});

describe('M10.2 R10 checking a board', () => {
  it('a running program is stopped, the board answers, and its program runs again', async () => {
    const board = new FakeBoard({ preset: 'pico-w', program: {} });
    const answer = await checkBoard(board, quick);
    expect(answer.kind).toBe('micropython');
    expect(board.state).toBe('program');
    expect(board.softReboots).toBe(1);
  });

  it('a program that ignores the first Ctrl-C is asked again', async () => {
    const board = new FakeBoard({ preset: 'microbit-v2', program: { stubborn: 1 } });
    const answer = await checkBoard(board, quick);
    expect(answer).toMatchObject({ kind: 'micropython', uname: { machine: 'micro:bit with nRF52833' } });
  });

  it('no answer at all (MakeCode on a micro:bit, Arduino code on an ESP32): "no MicroPython", and nothing is reset', async () => {
    const board = new FakeBoard({ preset: 'microbit-v2', silent: true });
    expect(await checkBoard(board, quick)).toEqual({ kind: 'no-micropython', seen: '' });
    expect(board.softReboots).toBe(0);
  });

  it('a program that never stops looks the same, with what it printed kept', async () => {
    const board = new FakeBoard({ preset: 'esp32', program: { stubborn: Infinity, output: 'tick\r\n' } });
    expect(await checkBoard(board, quick)).toEqual({ kind: 'no-micropython', seen: expect.stringContaining('tick') });
  });

  it('unplugged during the check: a ReplError that says so', async () => {
    const board = new FakeBoard({ preset: 'pico-w' });
    board.unplugAfter(1);
    await expect(checkBoard(board, quick)).rejects.toThrow(ReplError);
    await expect(checkBoard(new FakeBoard({ preset: 'pico-w', unplugged: true }), quick)).rejects.toMatchObject({ reason: 'lost' });
  });
});

describe('M10.2 Q15 the raw REPL', () => {
  it('runs code and gives back what it printed, and its error apart', async () => {
    const board = new FakeBoard({
      preset: 'pico-w',
      exec: (code) => (code === 'print(1+1)' ? { out: '2\r\n' } : { err: 'Traceback (most recent call last):\r\n  File "<stdin>", line 1\r\nSyntaxError: invalid syntax\r\n' }),
    });
    const repl = new RawRepl(board, quick);
    await repl.enter();
    expect(await repl.exec('print(1+1)')).toEqual({ out: '2\r\n', err: '' });
    expect((await repl.exec('print(')).err).toMatch(/SyntaxError/);
    await repl.leave();
    expect(board.state).toBe('friendly');
  });

  it('text in and out is UTF-8 (a student\'s print("°C"))', async () => {
    const board = new FakeBoard({ preset: 'pico-w', exec: (code) => ({ out: `${code.slice(7, -2)}\r\n` }) });
    const repl = new RawRepl(board, quick);
    await repl.enter();
    expect((await repl.exec('print("25 °C")')).out).toBe('25 °C\r\n');
  });

  it('asks os.uname() in the same words as recorded', () => {
    expect(UNAME_CODE).toBe('import os\nprint(os.uname())');
  });

  it('a command that never comes back times out', async () => {
    const board = new FakeBoard({ preset: 'pico-w', exec: () => undefined });
    const repl = new RawRepl(board, quick);
    await repl.enter();
    await expect(repl.exec('while True: pass')).rejects.toMatchObject({ reason: 'timeout' });
  });
});

describe('M10.2 R10 the soft reset', () => {
  it('a board that words its restart otherwise is still taken as restarted', async () => {
    const board = new FakeBoard({ preset: 'pico-w' });
    const repl = new RawRepl(board, quick);
    await repl.enter();
    await repl.leave();
    const write = board.write.bind(board);
    board.write = async (d) => (d.length === 1 && d[0] === 4 ? undefined : write(d));
    await expect(repl.softReset()).resolves.toBeUndefined();
  });
});
