import { SerialPortMock } from 'serialport';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeBoard, latin1, type FakeBoardOptions } from '@lib/repl';
import type { BoardCheck, FoundBoard } from '@lib/usb';
import { backupFolder, Boards, checkPort, type PortDeps } from '../../../src/main/board-check';
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
    expect(d.keepOld).toHaveBeenCalledWith(expect.stringMatching(/^Pico W \d{4}-\d\d-\d\d \d\d-\d\d-\d\d$/), 'main.py', enc('# theirs\n'));
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

describe('M10.3 the folder an old main.py is kept in', () => {
  it('names the board and the time, with nothing Windows refuses (the micro:bit\'s colon)', () => {
    expect(backupFolder('micro:bit', new Date(2026, 10, 6, 14, 3, 9))).toBe('micro-bit 2026-11-06 14-03-09');
    expect(backupFolder('Pico W', new Date(2026, 0, 2, 3, 4, 5))).toBe('Pico W 2026-01-02 03-04-05');
  });
});

describe('M10.4 F-51 the board\'s console, from the main process', () => {
  const enc = (t: string) => new TextEncoder().encode(t);
  function rig(opts: Partial<FakeBoardOptions> = {}) {
    const b = new FakeBoard({ preset: 'pico-w', program: { output: 'Traffic lights ready\r\n' }, ...opts } as FakeBoardOptions);
    const { d, closed } = deps(b);
    const said: string[] = [];
    const ids = new Set<string>();
    const sessions: Record<string, unknown>[] = [];
    const c = new Boards(d, () => {}, { output: (id, text) => { ids.add(id); said.push(text); }, sessions: (s) => sessions.push(s) });
    const settle = async () => { await b.settled(); await new Promise((r) => setTimeout(r, 5)); };
    return { b, d, closed, c, said, ids, sessions, settle, shown: () => said.join('') };
  }

  it('opened: the port stays open and what the board prints comes as it comes; closed: let go', async () => {
    const r = rig();
    expect(await r.c.openConsole(PICO)).toEqual({ ok: true });
    r.b.emit('tick\r\n');
    await r.settle();
    expect(r.shown()).toBe('tick\n');
    expect([...r.ids]).toEqual(['e661']);
    expect(r.closed).not.toHaveBeenCalled();
    await r.c.closeConsole('e661');
    expect(r.closed).toHaveBeenCalledOnce();
    expect(r.sessions.at(-1)).toEqual({});
  });

  it('Send and run opens it: the board restarts into main.py there, and the port stays open', async () => {
    const r = rig();
    const s = await r.c.send(PICO, { 'main.py': 'print("x")' }, { run: true, keep: false });
    expect(s.ok).toBe(true);
    await r.settle();
    expect(r.shown()).toBe('\nMPY: soft reboot\nTraffic lights ready\n');
    expect(r.closed).not.toHaveBeenCalled();
    expect(r.sessions.at(-1)).toEqual({ e661: { prompt: false, running: 'main.py' } });
  });

  it('a send while it is open uses the open port; none of the copying shows in it', async () => {
    const r = rig();
    await r.c.openConsole(PICO);
    await r.c.send(PICO, { 'main.py': 'print("x")', 'lib/a.py': 'a = 1' }, { run: true, keep: false });
    await r.settle();
    expect(r.d.open).toHaveBeenCalledOnce();
    expect(r.shown()).not.toMatch(/raw REPL|_ml|OK/);
    expect(r.shown()).toMatch(/MPY: soft reboot/);
    expect(new TextDecoder().decode(r.b.files.get('lib/a.py'))).toBe('a = 1');
  });

  it('typed, stopped, restarted, a file run — and Stop gets through while that file runs', async () => {
    const r = rig({ exec: (code: string) => (code === '1+1' ? { out: '2\r\n' } : undefined) });
    await r.c.openConsole(PICO);
    await r.c.console('e661', { do: 'interrupt' });
    await r.c.console('e661', { do: 'type', text: '1+1' });
    await r.settle();
    expect(r.shown()).toMatch(/1\+1\n2\n>>> $/);
    const run = r.c.console('e661', { do: 'run', name: 'main.py', code: 'while True: pass' });
    await vi.waitFor(() => expect(r.sessions.at(-1)).toEqual({ e661: { prompt: false, running: 'main.py' } }));
    await r.c.console('e661', { do: 'interrupt' });
    await run;
    await r.settle();
    expect(r.shown()).toMatch(/KeyboardInterrupt: \n>>> $/);
    await r.c.console('e661', { do: 'restart' });
    await r.settle();
    expect(r.shown()).toMatch(/MPY: soft reboot\nTraffic lights ready\n$/);
  });

  it('a file run there tells which board it is: the chip learns "Pico W"', async () => {
    const r = rig({ exec: () => ({ out: '' }) });
    await r.c.openConsole(PICO);
    await r.c.console('e661', { do: 'run', name: 'main.py', code: 'x = 1' });
    expect(r.c.checks.e661).toMatchObject({ state: 'micropython', uname: { machine: 'Raspberry Pi Pico W with RP2040' } });
  });

  it('a check while it is open asks nothing (the board is already talking)', async () => {
    const r = rig();
    await r.c.openConsole(PICO);
    await r.c.check(PICO);
    expect(r.d.open).toHaveBeenCalledOnce();
  });

  it('unplugged: the session ends and is told', async () => {
    const r = rig();
    await r.c.openConsole(PICO);
    r.b.unplug();
    expect(r.sessions.at(-1)).toEqual({});
  });

  it('a port another program holds: not opened, and why', async () => {
    const c = new Boards(deps(new Error('Cannot lock port'), 'Thonny').d, () => {}, { output: () => {}, sessions: () => {} });
    expect(await c.openConsole(PICO)).toEqual({ ok: false, message: expect.stringMatching(/used by Thonny/) });
    expect(enc('x')).toBeDefined();
  });
});

describe('M10.4 a file run on the board holds the port', () => {
  it('a send while main.py runs as a file stops it first, then sends', async () => {
    const b = new FakeBoard({ preset: 'pico-w', exec: () => undefined } as FakeBoardOptions);
    const c = new Boards(deps(b).d, () => {}, { output: () => {}, sessions: () => {} });
    await c.openConsole(PICO);
    void c.console('e661', { do: 'run', name: 'main.py', code: 'while True: pass' });
    await vi.waitFor(() => expect(c.consoles.e661).toEqual({ prompt: false, running: 'main.py' }));
    const r = await c.send(PICO, { 'main.py': 'print(1)' }, { run: false, keep: false });
    expect(r.ok).toBe(true);
  });
});

describe('M10.4 the console\'s rarer ways', () => {
  const rig = (b: FakeBoard) => {
    const { d, closed } = deps(b);
    return { d, closed, c: new Boards(d, () => {}, { output: () => {}, sessions: () => {} }) };
  };

  it('opened twice: one port; a console action or close with none open does nothing', async () => {
    const r = rig(new FakeBoard({ preset: 'pico-w' }));
    await r.c.openConsole(PICO);
    expect(await r.c.openConsole(PICO)).toEqual({ ok: true });
    expect(r.d.open).toHaveBeenCalledOnce();
    await expect(r.c.console('nope', { do: 'interrupt' })).resolves.toBeUndefined();
    await expect(r.c.closeConsole('nope')).resolves.toBeUndefined();
  });

  it('closed while a file runs there: the file is stopped first, then the port let go', async () => {
    const b = new FakeBoard({ preset: 'pico-w', exec: () => undefined });
    const r = rig(b);
    await r.c.openConsole(PICO);
    const run = r.c.console('e661', { do: 'run', name: 'main.py', code: 'while True: pass' });
    await vi.waitFor(() => expect(r.c.consoles.e661).toEqual({ prompt: false, running: 'main.py' }));
    await r.c.closeConsole('e661');
    await run;
    expect(r.closed).toHaveBeenCalledOnce();
    expect(r.c.consoles).toEqual({});
  });

  it('a port that won\'t open for another reason: why, in the board\'s own words', async () => {
    const c = new Boards(deps(new Error('Opening COM7: The semaphore timeout period has expired.')).d, () => {}, { output: () => {}, sessions: () => {} });
    expect(await c.openConsole(PICO)).toEqual({ ok: false, message: "MicroLab can't talk to the board: Opening COM7: The semaphore timeout period has expired." });
  });

  it('unplugged (forgotten by the watcher) with its console open: the session ends', async () => {
    const r = rig(new FakeBoard({ preset: 'pico-w' }));
    await r.c.openConsole(PICO);
    r.c.forget(['e661']);
    expect(r.c.consoles).toEqual({});
  });
});

describe('M10.5 F-53 Board files, from the main process', () => {
  const enc = (t: string) => new TextEncoder().encode(t);
  const dec = (b?: Uint8Array) => (b ? new TextDecoder().decode(b) : undefined);
  function rig() {
    const b = new FakeBoard({ preset: 'pico-w', program: {}, files: {
      'main.py': enc('# theirs\n'), 'lib/a.py': enc('a = 1\n'), 'smarthome/door.py': enc('door'), 'smarthome/web/x.html': enc('<p>'),
    } } as FakeBoardOptions);
    const { d } = deps(b);
    const kept: [string, string, string][] = [];
    d.keepOld = vi.fn(async (folder: string, path: string, data: Uint8Array) => { kept.push([folder, path, dec(data)!]); return `/backups/${folder}`; });
    return { b, d, kept, c: new Boards(d, () => {}) };
  }

  it('lists the board beside the project; its program waits while the panel is open, and runs again when it is done', async () => {
    const r = rig();
    const l = await r.c.listFiles(PICO, { 'main.py': '# mine\n', 'lib/a.py': 'a = 1\n' });
    expect(l).toMatchObject({ ok: true, board: 'Pico W', listing: { same: { 'main.py': false, 'lib/a.py': true }, dirs: ['lib', 'smarthome', 'smarthome/web'] } });
    expect(r.b.state).toBe('friendly');
    await r.c.filesDone(PICO);
    expect(r.b.state).toBe('program');
    expect(r.b.softReboots).toBe(1);
  });

  it('copied to the laptop: a file, or a folder with all in it', async () => {
    const r = rig();
    const got = await r.c.readFiles(PICO, ['main.py', 'smarthome']);
    expect(got.ok && Object.fromEntries(Object.entries(got.files).map(([k, v]) => [k, dec(v)]))).toEqual({
      'main.py': '# theirs\n', 'smarthome/door.py': 'door', 'smarthome/web/x.html': '<p>',
    });
  });

  it('copied to the board: what it replaces is kept on the laptop first, all in one folder', async () => {
    const r = rig();
    const res = await r.c.copyToBoard(PICO, { 'main.py': 'new', 'lib/a.py': 'a = 2\n', 'lib/b.py': 'b' }, true);
    expect(res).toMatchObject({ ok: true, sent: [{ path: 'lib/a.py' }, { path: 'lib/b.py' }, { path: 'main.py' }] });
    expect(r.kept.map(([, p, t]) => [p, t])).toEqual([['lib/a.py', 'a = 1\n'], ['main.py', '# theirs\n']]);
    expect(new Set(r.kept.map(([f]) => f)).size).toBe(1);
    expect(dec(r.b.files.get('main.py'))).toBe('new');
    expect(r.b.softReboots).toBe(0);
  });

  it('deleted: a file, and a folder with all in it — each kept first when asked', async () => {
    const r = rig();
    const res = await r.c.deleteOnBoard(PICO, ['smarthome', 'lib/a.py'], true);
    expect(res).toMatchObject({ ok: true, keptIn: expect.stringMatching(/^\/backups\/Pico W /) });
    expect(r.kept.map(([, p]) => p).sort()).toEqual(['lib/a.py', 'smarthome/door.py', 'smarthome/web/x.html']);
    expect([...r.b.files.keys()]).toEqual(['main.py']);
    expect([...r.b.dirs]).toEqual(['lib']);
  });

  it('a folder made', async () => {
    const r = rig();
    expect(await r.c.makeFolder(PICO, 'www')).toEqual({ ok: true });
    expect(r.b.dirs.has('www')).toBe(true);
  });

  it('a board another program holds: why', async () => {
    const c = new Boards(deps(new Error('Cannot lock port'), 'Thonny').d, () => {});
    expect(await c.listFiles(PICO, {})).toEqual({ ok: false, message: expect.stringMatching(/used by Thonny/) });
  });
});

describe('M10.5 Board files: when it can\'t be done', () => {
  const enc = (t: string) => new TextEncoder().encode(t);
  const quiet = { pauseMs: 0, replyMs: 60, chunkPauseMs: 0 };

  it.each([
    [{ preset: 'pico-w' as const, silent: true }, /didn't answer as MicroPython does/],
    [{ preset: 'pico-w' as const, unplugged: true }, /unplugged|stopped answering/],
  ])('listing a board that %j says why', async (board, message) => {
    const c = new Boards({ ...deps(board).d, repl: quiet }, () => {});
    expect(await c.listFiles(PICO, {})).toEqual({ ok: false, message: expect.stringMatching(message) });
  });

  it('a board that stops answering mid-way: "stopped answering"', async () => {
    const b = new FakeBoard({ preset: 'pico-w', pace: 5, stallAfter: 1, files: { 'main.py': enc('x\n'.repeat(400)) } } as FakeBoardOptions);
    const c = new Boards({ ...deps(b).d, repl: { ...quiet } }, () => {});
    const r = await c.readFiles(PICO, ['main.py']);
    expect(r).toEqual({ ok: false, message: expect.stringMatching(/stopped answering/) });
  }, 15_000);

  it('copied to a micro:bit into a folder: refused, saying why; a held port: who holds it', async () => {
    const mb = new Boards(deps({ preset: 'microbit-v2' }).d, () => {});
    expect(await mb.copyToBoard({ ...PICO, kind: 'microbit' }, { 'lib/x.py': 'x' }, false)).toEqual({ ok: false, message: expect.stringMatching(/micro:bit has no folders/) });
    const held = new Boards(deps(new Error('Cannot lock port'), 'Thonny').d, () => {});
    expect(await held.copyToBoard(PICO, { 'main.py': 'x' }, false)).toEqual({ ok: false, message: expect.stringMatching(/used by Thonny/) });
  });

  it('deleted without a copy kept; done with its console open leaves it be', async () => {
    const b = new FakeBoard({ preset: 'pico-w', files: { 'a.py': enc('a') } } as FakeBoardOptions);
    const { d } = deps(b);
    d.keepOld = vi.fn(async () => '/k');
    const c = new Boards(d, () => {}, { output: () => {}, sessions: () => {} });
    expect(await c.deleteOnBoard(PICO, ['a.py'], false)).toEqual({ ok: true });
    expect(d.keepOld).not.toHaveBeenCalled();
    await c.openConsole(PICO);
    await c.filesDone(PICO);
    expect(b.softReboots).toBe(0);
  });
});

describe('M10.7 F-52 the board side of installing', () => {
  const enc = (t: string) => new TextEncoder().encode(t);

  it('a Pico running MicroPython is asked to restart into BOOTSEL (machine.bootloader()): its port goes', async () => {
    const b = new FakeBoard({ preset: 'pico-w', program: {} } as FakeBoardOptions);
    const c = new Boards({ ...deps(b).d, repl: { pauseMs: 0, replyMs: 100 } }, () => {});
    await c.bootloader(PICO);
    expect(b.bootloaded).toBe(true);
  });

  it('all of a micro:bit\'s files, read to keep them', async () => {
    const b = new FakeBoard({ preset: 'microbit-v2', files: { 'main.py': enc('# mine'), 'data.txt': enc('42') } } as FakeBoardOptions);
    const c = new Boards(deps(b).d, () => {});
    const all = await c.readAll({ ...PICO, kind: 'microbit' });
    expect(Object.keys(all).sort()).toEqual(['data.txt', 'main.py']);
    expect(new TextDecoder().decode(all['main.py'])).toBe('# mine');
  });

  it('a board that can\'t be read: an error, not an empty list (installing would lose its files)', async () => {
    const c = new Boards(deps(new Error('Cannot lock port'), 'Thonny').d, () => {});
    await expect(c.readAll(PICO)).rejects.toThrow(/used by Thonny/);
  });
});
