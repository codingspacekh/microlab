import { SerialPortMock } from 'serialport';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeBoard, latin1, type FakeBoardOptions } from '@lib/repl';
import type { BoardCheck, FoundBoard } from '@lib/usb';
import { Boards, checkPort, type PortDeps } from '../../../src/main/board-check';
import { whoHolds } from '../../../src/main/port-holder';
import { openSerial } from '../../../src/main/serial-link';

/** M10.2 F-55, F-56, R10: the main process asks a board that was just plugged in what it is, and says why it couldn't. */
const PICO: FoundBoard = { id: 'e661', kind: 'pico', port: '/dev/cu.usbmodem14201', usb: '2e8a:0005' };
const quick = { pauseMs: 0, replyMs: 60 };

function deps(board: FakeBoardOptions | Error | FakeBoard, holder?: string) {
  const closed = vi.fn(async () => {});
  const d: PortDeps = {
    open: vi.fn(async () => {
      if (board instanceof Error) throw board;
      const b = board instanceof FakeBoard ? board : new FakeBoard(board);
      if (board instanceof FakeBoard) b.replug();
      return { write: (x: Uint8Array) => b.write(x), onData: (l: (x: Uint8Array) => void) => b.onData(l), onClose: (l: () => void) => b.onClose(l), close: closed };
    }),
    whoHolds: vi.fn(async () => holder),
    repl: quick,
  };
  return { d, closed };
}

describe('M10.2 checking the board on a port', () => {
  it('a Pico W: its answer; the port is closed again so Thonny can use it', async () => {
    const { d, closed } = deps({ preset: 'pico-w', program: {} });
    expect(await checkPort(PICO, d)).toEqual({ state: 'micropython', uname: expect.objectContaining({ machine: 'Raspberry Pi Pico W with RP2040' }) });
    expect(d.open).toHaveBeenCalledWith('/dev/cu.usbmodem14201');
    expect(closed).toHaveBeenCalledOnce();
  });

  it('no answer: no MicroPython', async () => {
    const { d, closed } = deps({ preset: 'microbit-v2', silent: true });
    expect(await checkPort(PICO, d)).toEqual({ state: 'no-micropython', seen: '' });
    expect(closed).toHaveBeenCalledOnce();
  });

  it('a port another program holds: busy, and by whom when that can be told', async () => {
    expect(await checkPort(PICO, deps(new Error('Error Resource temporarily unavailable Cannot lock port'), 'Thonny').d)).toEqual({ state: 'busy', by: 'Thonny' });
    expect(await checkPort(PICO, deps(new Error('Opening COM7: Access denied')).d)).toEqual({ state: 'busy' });
  });

  it('a port that won\'t open for another reason, or a board lost mid-way: can\'t connect, with the reason', async () => {
    expect(await checkPort(PICO, deps(new Error('Opening COM7: The semaphore timeout period has expired.')).d))
      .toEqual({ state: 'cant-open', message: 'Opening COM7: The semaphore timeout period has expired.' });
    const { d, closed } = deps({ preset: 'pico-w', unplugged: true });
    expect(await checkPort(PICO, d)).toMatchObject({ state: 'cant-open', message: expect.stringMatching(/stopped answering/) });
    expect(closed).toHaveBeenCalledOnce();
  });
});

describe('M10.2 the checker keeps what each board said', () => {
  it('checking first, then the answer; every change is told', async () => {
    const seen: Record<string, BoardCheck>[] = [];
    const c = new Boards(deps({ preset: 'pico-w' }).d, (checks) => seen.push({ ...checks }));
    await c.check(PICO);
    expect(seen.map((s) => s.e661?.state)).toEqual(['checking', 'micropython']);
    expect(c.checks.e661?.state).toBe('micropython');
  });

  it('asked twice at once: the port is opened once', async () => {
    const { d } = deps({ preset: 'pico-w' });
    const c = new Boards(d, () => {});
    await Promise.all([c.check(PICO), c.check(PICO)]);
    expect(d.open).toHaveBeenCalledOnce();
  });

  it('unplugged while being asked: its answer is dropped', async () => {
    const c = new Boards(deps({ preset: 'pico-w' }).d, () => {});
    const p = c.check(PICO);
    c.forget(['e661']);
    await p;
    expect(c.checks).toEqual({});
  });
});

describe('M10.2 who holds a port (macOS and Linux: lsof, then ps)', () => {
  it('names the program from its command line', async () => {
    const run = vi.fn(async (cmd: string) => (cmd === 'lsof' ? '4242\n' : '/Applications/Thonny.app/Contents/MacOS/thonny\n'));
    expect(await whoHolds('/dev/cu.usbmodem14201', 'darwin', run)).toBe('Thonny');
    expect(run).toHaveBeenCalledWith('lsof', ['-t', '/dev/cu.usbmodem14201']);
    expect(run).toHaveBeenCalledWith('ps', ['-o', 'command=', '-p', '4242']);
  });

  it('nobody found, lsof failing, or Windows: not named', async () => {
    expect(await whoHolds('/dev/x', 'darwin', async () => '')).toBeUndefined();
    expect(await whoHolds('/dev/x', 'linux', async () => { throw new Error('lsof: not found'); })).toBeUndefined();
    const run = vi.fn(async () => 'x');
    expect(await whoHolds('COM7', 'win32', run)).toBeUndefined();
    expect(run).not.toHaveBeenCalled();
  });
});

describe('M10.2 the serial port as a link', () => {
  afterEach(() => SerialPortMock.binding.reset());

  it('bytes written reach the port; bytes from the board reach the listeners; closed, it is let go', async () => {
    SerialPortMock.binding.createPort('/dev/cu.fake', { record: true });
    let port: SerialPortMock | undefined;
    const link = await openSerial('/dev/cu.fake', (o) => (port = new SerialPortMock(o)));
    await link.write(latin1('\r\x03\x03'));
    expect(port!.port!.recording.toString('latin1')).toBe('\r\x03\x03');
    const got: string[] = [];
    link.onData((d) => got.push(Buffer.from(d).toString('latin1')));
    port!.port!.emitData('raw REPL; CTRL-B to exit\r\n>');
    await vi.waitFor(() => expect(got.join('')).toBe('raw REPL; CTRL-B to exit\r\n>'));
    const gone = vi.fn();
    link.onClose!(gone);
    await link.close();
    expect(port!.isOpen).toBe(false);
    expect(gone).toHaveBeenCalled();
    await expect(link.write(latin1('x'))).rejects.toThrow();
  });

  it('a port that won\'t open rejects with the reason', async () => {
    await expect(openSerial('/dev/cu.none', (o) => new SerialPortMock(o))).rejects.toThrow(/does not exist/);
  });
});

describe('M10.2 the rarer ways', () => {
  it('who holds it can\'t be told: busy, not named', async () => {
    const { d } = deps(new Error('Cannot lock port'));
    d.whoHolds = vi.fn(async () => { throw new Error('lsof failed'); });
    expect(await checkPort(PICO, d)).toEqual({ state: 'busy' });
  });

  it('a board whose os.uname() fails is still MicroPython, not named', async () => {
    const { d } = deps({ preset: 'pico-w' });
    const open = d.open;
    d.open = async (p) => {
      const l = await open(p);
      return { ...l, write: (x: Uint8Array) => l.write(Buffer.from(x).toString('latin1') === 'import os\nprint(os.uname())\x04' ? latin1('import os\nprint(os.unam())\x04') : x) };
    };
    expect(await checkPort(PICO, d)).toEqual({ state: 'micropython' });
  });

  it('forgetting a board never asked changes nothing', () => {
    const told = vi.fn();
    new Boards(deps({ preset: 'pico-w' }).d, told).forget(['nope']);
    expect(told).not.toHaveBeenCalled();
  });

  it('lsof run for real on a port nobody holds: not named', async () => {
    expect(await whoHolds('/dev/cu.no-such-port', 'darwin')).toBeUndefined();
  });

  it('a write the port refuses, or a drain that fails, rejects; closing twice is fine', async () => {
    const make = (writeErr?: Error, drainErr?: Error) => () => ({
      isOpen: true,
      open: (cb: (e: Error | null) => void) => cb(null),
      write: (_d: Buffer, cb: (e: Error | null | undefined) => void) => { cb(writeErr); return true; },
      drain: (cb: (e: Error | null) => void) => cb(drainErr ?? null),
      close(cb: (e: Error | null) => void) { this.isOpen = false; cb(null); },
      on: () => undefined,
      off: () => undefined,
    });
    await expect((await openSerial('/x', make(new Error('write failed')))).write(latin1('a'))).rejects.toThrow('write failed');
    await expect((await openSerial('/x', make(undefined, new Error('drain failed')))).write(latin1('a'))).rejects.toThrow('drain failed');
    const l = await openSerial('/x', make());
    await l.close();
    await expect(l.close()).resolves.toBeUndefined();
  });
});

describe('M10.3 F-50 sending, from the main process', () => {
  const enc = (t: string) => new TextEncoder().encode(t);
  const W = { preset: 'pico-w' as const, program: {}, files: { 'main.py': enc('# theirs\n'), 'lib/a.py': enc('a = 1\n') } };

  it('"sending 1 of 2" as it goes, then the board\'s answer; what was sent, what was the same', async () => {
    const seen: string[] = [];
    const b = new FakeBoard(W);
    const c = new Boards(deps(b).d, (checks) => {
      const x = checks.e661;
      if (x) seen.push(x.state === 'sending' ? `sending ${x.done}/${x.total}` : x.state);
    });
    const r = await c.send(PICO, { 'main.py': 'print(1)\n', 'lib/a.py': 'a = 1\n' }, { run: true, keep: false });
    expect(r).toEqual({ ok: true, board: 'Pico W', sent: [{ path: 'main.py', size: 9 }], same: ['lib/a.py'], kept: [] });
    expect(seen).toEqual(['sending 0/2', 'sending 0/2', 'sending 0/2', 'sending 1/2', 'sending 2/2', 'micropython']);
    expect(c.checks.e661).toMatchObject({ state: 'micropython', uname: { machine: 'Raspberry Pi Pico W with RP2040' } });
  });

  it('the board\'s old main.py is kept on the laptop when asked, and where is told', async () => {
    const { d } = deps(new FakeBoard(W));
    d.keepOld = vi.fn(async () => '/Users/t/Documents/MicroLab/Board backups/Pico W 2026-11-06 13-40');
    const r = await new Boards(d, () => {}).send(PICO, { 'main.py': 'new' }, { run: true, keep: true });
    expect(d.keepOld).toHaveBeenCalledWith('Pico W', 'main.py', enc('# theirs\n'));
    expect(r).toMatchObject({ ok: true, kept: ['main.py'], keptIn: '/Users/t/Documents/MicroLab/Board backups/Pico W 2026-11-06 13-40' });
  });

  it.each([
    [new Error('Error Resource temporarily unavailable Cannot lock port'), /used by Thonny\. Close Thonny, or press Stop\/Disconnect in it, then send again/, 'busy'],
    [{ preset: 'pico-w' as const, silent: true }, /didn't answer as MicroPython does/, 'no-micropython'],
    [{ preset: 'microbit-v2' as const }, /micro:bit has no folders/, 'micropython'],
  ])('a send that can\'t be done says why (%#)', async (board, message, state) => {
    const c = new Boards(deps(board, 'Thonny').d, () => {});
    const r = await c.send(PICO, { 'main.py': 'm', 'lib/x.py': 'x' }, { run: true, keep: false });
    expect(r).toEqual({ ok: false, message: expect.stringMatching(message) });
    expect(c.checks.e661?.state).toBe(state);
  });

  it('unplugged while sending: its files are as they were; plug it back in and send again', async () => {
    const b = new FakeBoard(W);
    b.unplugAt('_mlc', 1);
    const c = new Boards(deps(b).d, () => {});
    const r = await c.send(PICO, { 'main.py': 'new' }, { run: true, keep: false });
    expect(r).toEqual({ ok: false, message: expect.stringMatching(/unplugged while sending.*send again/) });
    expect(new TextDecoder().decode(b.files.get('main.py'))).toBe('# theirs\n');
  });

  it('a check asked while sending waits for the send: the port is never opened twice at once', async () => {
    const { d } = deps(new FakeBoard(W));
    let open = 0;
    let most = 0;
    const inner = d.open;
    d.open = async (p) => {
      open++; most = Math.max(most, open);
      const l = await inner(p);
      return { ...l, close: async () => { open--; } };
    };
    const c = new Boards(d, () => {});
    await Promise.all([c.send(PICO, { 'main.py': 'x' }, { run: true, keep: false }), c.check(PICO)]);
    expect(most).toBe(1);
  });
});
