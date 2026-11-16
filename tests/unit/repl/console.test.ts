import { describe, expect, it, vi } from 'vitest';
import { BoardConsole, FakeBoard, type ConsoleState, type FakeBoardOptions } from '@lib/repl';

/**
 * M10.4 F-51 (screen 16): the real board's console — what it prints as it comes, its errors in red, its >>> prompt
 * to type at (a block pasted whole, as the board's auto-indent would double it), Stop (Ctrl-C), Restart (soft
 * reset: main.py again), and running the open file there without making it main.py (F-50 Rev 7, as Thonny does).
 */
const quick = { pauseMs: 0, replyMs: 300, chunkPauseMs: 0, stopMs: 15, stopTries: 4 };

function setup(opts: Partial<FakeBoardOptions> = {}) {
  const board = new FakeBoard({ preset: 'microbit-v2', program: {}, ...opts } as FakeBoardOptions);
  const out: { text: string; kind: string }[] = [];
  const states: ConsoleState[] = [];
  const c = new BoardConsole(board, { output: (text, kind) => out.push({ text, kind }), state: (s) => states.push(s) }, quick);
  const shown = () => out.map((o) => o.text).join('');
  const red = () => out.filter((o) => o.kind === 'err').map((o) => o.text).join('');
  /** Everything the board had to say has been said and shown. */
  const settle = async () => { await board.settled(); await new Promise((r) => setTimeout(r, 5)); };
  return { board, c, out, states, shown, red, settle, last: () => states.at(-1) };
}

describe('M10.4 F-51 the board\'s console', () => {
  it('shows what the board prints as it comes, without the carriage returns', async () => {
    const s = setup();
    s.board.emit('tick\r\n');
    s.board.emit('tock\r\n');
    await s.settle();
    expect(s.shown()).toBe('tick\ntock\n');
  });

  it('Stop (Ctrl-C): the program stops — its KeyboardInterrupt in red — and the >>> prompt is there to type at', async () => {
    const s = setup();
    await s.c.interrupt();
    await s.settle();
    expect(s.red()).toMatch(/^Traceback \(most recent call last\):\n {2}File "main.py", line 1, in <module>\nKeyboardInterrupt: \n$/);
    expect(s.shown()).toMatch(/>>> $/);
    expect(s.last()).toEqual({ prompt: true, running: null });
  });

  it('a line typed at >>> is the board\'s to echo and answer', async () => {
    const s = setup({ program: undefined, exec: (code) => (code === '1+1' ? { out: '2\r\n' } : undefined) });
    await s.c.type('1+1');
    await s.settle();
    expect(s.shown()).toBe('1+1\n2\n>>> ');
  });

  it('a block (a line ending in ":" and what follows) is pasted whole — shown with ... as typed', async () => {
    const s = setup({ program: undefined, exec: (code) => (code === 'for i in range(2):\n    print(i)' ? { out: '0\r\n1\r\n' } : undefined) });
    await s.c.type('for i in range(2):\n    print(i)');
    await s.settle();
    expect(s.shown()).toBe('for i in range(2):\n...     print(i)\n... \n0\n1\n>>> ');
    expect(s.shown()).not.toMatch(/paste mode/);
  });

  it('an error typed at >>> is in red, the prompt after it is not', async () => {
    const s = setup({ program: undefined });
    await s.c.type('nope');
    await s.settle();
    expect(s.red()).toBe("Traceback (most recent call last):\n  File \"<stdin>\", line 1, in <module>\nNameError: name 'nope' isn't defined\n");
    expect(s.out.at(-1)).toEqual({ text: '>>> ', kind: 'out' });
  });

  it('Restart: the program stops quietly, the board restarts softly and runs main.py again', async () => {
    const s = setup({ program: { output: 'Traffic lights ready\r\n' } });
    await s.c.restart();
    await s.settle();
    expect(s.shown()).toBe('\nMPY: soft reboot\nTraffic lights ready\n');
    expect(s.board.softReboots).toBe(1);
    expect(s.last()).toEqual({ prompt: false, running: 'main.py' });
  });

  it('muted while another job uses the port (a send): nothing of it is shown', async () => {
    const s = setup();
    s.c.mute();
    s.board.emit('raw REPL; CTRL-B to exit\r\n>');
    await s.settle();
    s.c.unmute();
    s.board.emit('after\r\n');
    await s.settle();
    expect(s.shown()).toBe('after\n');
  });
});

describe('M10.4 F-55 the console learns which board it is', () => {
  it('running a file or restarting asks os.uname() on the way (a board there before MicroLab started was never asked)', async () => {
    const board = new FakeBoard({ preset: 'pico-w', program: {}, exec: () => ({ out: '' }) } as FakeBoardOptions);
    const seen: string[] = [];
    const c = new BoardConsole(board, { output: () => {}, answered: (u) => seen.push(u.machine) }, quick);
    await c.runFile('main.py', 'x = 1');
    await c.restart();
    expect(seen).toEqual(['Raspberry Pi Pico W with RP2040', 'Raspberry Pi Pico W with RP2040']);
  });
});

describe('M10.4 F-50 run the open file on the board', () => {
  it('its output as it comes, then the >>> prompt; none of the raw REPL shows', async () => {
    const s = setup({ exec: (code) => (code.startsWith('print') ? { out: 'hello from the board\r\n' } : undefined) });
    await s.c.runFile('main.py', 'print("hello from the board")');
    await s.settle();
    expect(s.shown()).toBe('hello from the board\n>>> ');
    expect(s.last()).toEqual({ prompt: true, running: null });
    expect(s.board.softReboots).toBe(0);   // its own main.py is not run, nor changed
  });

  it('M11.8 a fresh board first, as Thonny and the simulator do (Q19): a soft restart in the raw REPL — boot.py, not main.py', async () => {
    let seen = '';
    const s = setup({ exec: (code) => { seen += code; return { out: '' }; } });
    await s.c.runFile('main.py', 'import lights');
    await s.settle();
    expect(s.board.rawResets).toBe(1);      // modules imported by the last run are gone: a helper copied anew is the one imported
    expect(s.board.softReboots).toBe(0);    // main.py did not run
    expect(seen).toContain('import lights');
    expect(s.shown()).not.toMatch(/soft reboot|raw REPL/);
  });

  it('M11.8 Stop while the board is still getting ready (Stop at once after Run): the file never starts', async () => {
    let ran = false;
    const s = setup({ exec: () => { ran = true; return undefined; } });   // it would run for ever
    const run = s.c.runFile('main.py', 'while True: pass');
    await s.c.interrupt();          // before the raw prompt, the restart, the file
    await run;
    await s.settle();
    expect(ran).toBe(false);
    expect(s.last()).toEqual({ prompt: true, running: null });
    expect(s.shown()).toMatch(/>>> $/);
  });

  it('its error in red', async () => {
    const s = setup({ exec: () => ({ err: 'Traceback (most recent call last):\r\n  File "<stdin>", line 3, in <module>\r\nZeroDivisionError: divide by zero\r\n' }) });
    await s.c.runFile('main.py', 'x = 1 / 0');
    await s.settle();
    expect(s.red()).toBe('Traceback (most recent call last):\n  File "<stdin>", line 3, in <module>\nZeroDivisionError: divide by zero\n');
  });

  it('a file that runs for ever: running it; its prints come; Stop ends it', async () => {
    const s = setup({ exec: () => undefined });
    const run = s.c.runFile('main.py', 'while True: pass');
    // waited for, not a fixed 5 ms: under the full suite's load (M12 adds real Python processes) it can take longer
    await vi.waitFor(() => expect(s.last()).toEqual({ prompt: false, running: 'main.py' }));
    s.board.emit('tick\r\n');
    await s.settle();
    expect(s.shown()).toBe('tick\n');
    await s.c.interrupt();
    await run;
    await s.settle();
    expect(s.red()).toMatch(/KeyboardInterrupt/);
    expect(s.shown()).toMatch(/>>> $/);
    expect(s.last()).toEqual({ prompt: true, running: null });
  });

  it('long files go whole (raw-paste) even to a board whose input drops bytes', async () => {
    let got = '';
    const s = setup({ lossy: true, exec: (code) => { got = code; return { out: 'ok\r\n' }; } });
    const file = `# a long file\n${'x = 1\n'.repeat(300)}print("ok")`;
    await s.c.runFile('main.py', file);
    expect(got).toBe(file);
  });
});

/**
 * The class's report after v1.0 (2026-11-15): "the board sometimes cannot be stopped". A Ctrl-C that comes while the
 * board is still taking the file or compiling it is not heard (pyexec.c listens for it only while the program runs),
 * and one written into the middle of another job's talk breaks that job.
 */
describe('1.0.1 Stop always stops the file run on the board', () => {
  it('a Ctrl-C the board did not hear (it was still compiling the file) is sent again until the program stops', async () => {
    const s = setup({ exec: () => undefined, deaf: 2 });
    const run = s.c.runFile('main.py', 'while True: pass');
    await vi.waitFor(() => expect(s.last()).toEqual({ prompt: false, running: 'main.py' }));
    await s.c.interrupt();
    await run;
    await s.settle();
    expect(s.red()).toMatch(/KeyboardInterrupt/);
    expect(s.last()).toEqual({ prompt: true, running: null });
  });

  it('Stop while the file is still going to the board: nothing is written into the middle of it — it goes whole, then stops', async () => {
    let got = '';
    const board = new FakeBoard({ preset: 'microbit-v2', exec: (code) => { got = code; return undefined; } });
    const states: ConsoleState[] = [];
    let asked = false;
    // Stop is pressed as a piece of the file is on its way
    const link = {
      write: async (d: Uint8Array) => { if (board.state === 'paste' && !asked) { asked = true; await c.interrupt(); } await board.write(d); },
      onData: board.onData.bind(board), onClose: board.onClose.bind(board),
    };
    const c: BoardConsole = new BoardConsole(link, { output: () => {}, state: (st) => states.push(st) }, quick);
    const file = `# a long file\n${'x = 1\n'.repeat(300)}while True: pass`;
    await c.runFile('main.py', file);
    expect(asked).toBe(true);
    expect(got).toBe(file);
    expect(states.at(-1)).toEqual({ prompt: true, running: null });
  });

  it('stopped, the board is quiet: a soft restart in the raw REPL ends its timers, sounds and display — main.py not run', async () => {
    const s = setup({ exec: () => undefined });
    const run = s.c.runFile('main.py', 'while True: pass');
    await vi.waitFor(() => expect(s.last()).toEqual({ prompt: false, running: 'main.py' }));
    await s.c.interrupt();
    await run;
    await s.settle();
    expect(s.board.rawResets).toBe(2);     // one before the run, one after the Stop
    expect(s.board.softReboots).toBe(0);
    expect(s.shown()).not.toMatch(/soft reboot|raw REPL/);
  });

  it('a program that ends by itself is left as it is: its names — and a Timer it started — stay', async () => {
    const s = setup({ exec: () => ({ out: 'done\r\n' }) });
    await s.c.runFile('main.py', 'print("done")');
    expect(s.board.rawResets).toBe(1);
  });

  it('a program that never stops (it catches every Ctrl-C): the run ends anyway, and the console says what to do', async () => {
    const s = setup({ exec: () => undefined, deaf: Infinity });
    const run = s.c.runFile('main.py', 'while True:\n    try:\n        pass\n    except:\n        pass');
    await vi.waitFor(() => expect(s.last()).toEqual({ prompt: false, running: 'main.py' }));
    await s.c.interrupt();
    await run;
    expect(s.red()).toMatch(/doesn't stop when asked.*Unplug the board and plug it back in/s);
    expect(s.c.runningFile).toBe(false);
    // it still runs there, and what it prints is still shown
    expect(s.last()).toEqual({ prompt: false, running: 'main.py' });
    s.board.emit('still here\r\n');
    await s.settle();
    expect(s.shown()).toMatch(/still here\n$/);
  });

  it('Stop while another job has the port (files being copied): no Ctrl-C is written into its talk', async () => {
    const board = new FakeBoard({ preset: 'microbit-v2' });
    const wrote: number[] = [];
    const link = { write: async (d: Uint8Array) => { wrote.push(...d); await board.write(d); }, onData: board.onData.bind(board), onClose: board.onClose.bind(board) };
    const c = new BoardConsole(link, { output: () => {} }, quick);
    c.mute();
    await c.interrupt();
    expect(wrote).toEqual([]);
    c.unmute();
    await c.interrupt();
    expect(wrote).toEqual([3]);
  });

  it('a file about to be run (waiting for the port) is called off by Stop', async () => {
    let ran = false;
    const s = setup({ exec: () => { ran = true; return undefined; } });
    s.c.willRun();
    await s.c.interrupt();
    await s.c.runFile('main.py', 'while True: pass');
    await s.settle();
    expect(ran).toBe(false);
    expect(s.last()).toEqual({ prompt: true, running: null });
  });
});
