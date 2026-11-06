import { describe, expect, it } from 'vitest';
import { BoardConsole, FakeBoard, type ConsoleState, type FakeBoardOptions } from '@lib/repl';

/**
 * M10.4 F-51 (screen 16): the real board's console — what it prints as it comes, its errors in red, its >>> prompt
 * to type at (a block pasted whole, as the board's auto-indent would double it), Stop (Ctrl-C), Restart (soft
 * reset: main.py again), and running the open file there without making it main.py (F-50 Rev 7, as Thonny does).
 */
const quick = { pauseMs: 0, replyMs: 300, chunkPauseMs: 0 };

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

describe('M10.4 F-50 run the open file on the board', () => {
  it('its output as it comes, then the >>> prompt; none of the raw REPL shows', async () => {
    const s = setup({ exec: (code) => (code.startsWith('print') ? { out: 'hello from the board\r\n' } : undefined) });
    await s.c.runFile('main.py', 'print("hello from the board")');
    await s.settle();
    expect(s.shown()).toBe('hello from the board\n>>> ');
    expect(s.last()).toEqual({ prompt: true, running: null });
    expect(s.board.softReboots).toBe(0);   // its own main.py is not run, nor changed
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
    await s.settle();
    expect(s.last()).toEqual({ prompt: false, running: 'main.py' });
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
