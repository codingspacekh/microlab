import { describe, expect, it } from 'vitest';
import { VirtualClock } from '../../src/sim/clock';
import { runProject, type RunOptions, type RunResult, type SimBoard, type SimError } from '../../src/sim/run';
import { nodeLoader } from './vm';

/** M9 slice 1 (screen 29c), F-23: input() answered in the console, and the REPL after the program — >>> in the
 *  program's names, ... for a block, an expression's value printed, Ctrl+C, help() as the board's firmware prints it. */
const py = (...lines: string[]) => `${lines.join('\n')}\n`;
const run = async (main: string, stdin: [number, string][], o: Partial<RunOptions> & { board?: SimBoard } = {}): Promise<RunResult> =>
  runProject(await nodeLoader(), { board: 'pico-w', files: { 'main.py': main }, clock: new VirtualClock(), stdin, maxUs: 2e6, ...o });
const body = (r: RunResult) => r.output.split('\n').filter((l) => !l.startsWith('MicroPython')).join('\n');
const BLINK = py('from machine import Pin', 'led = Pin(15, Pin.OUT)');

describe('M9 input() answered in the console', () => {
  it('prints its prompt, waits for a line, echoes it and returns it without the line ending', async () => {
    const r = await run(py("name = input(\"What's your name? \")", "print('Hello, ' + name + '!')", 'print(repr(name))'), [[500_000, 'Sok\r\n']]);
    expect(r.error).toBeUndefined();
    expect(body(r)).toBe("What's your name? Sok\nHello, Sok!\n'Sok'\n");
  });

  it('waits as long as it takes (the board\'s time goes on); what was typed early waits for the next input()', async () => {
    const r = await run(py('import time', 'a = input()', 't = time.ticks_ms()', 'b = input()', 'print(a, b, t >= 700)'), [[700_000, 'one\ntwo\n']]);
    expect(body(r)).toBe('one\ntwo\none two True\n');
  });

  it('a timer goes on while input() waits', async () => {
    const r = await run(py('from machine import Timer', 'n = []', 'Timer(period=100, callback=lambda t: n.append(1))', 'input()', 'print(len(n) >= 4)'), [[500_000, '\n']]);
    expect(body(r)).toBe('\nTrue\n');
  });

  it('Ctrl+C while it waits: KeyboardInterrupt, as on a board', async () => {
    const r = await run(py('input("? ")', "print('not here')"), [[300_000, '\x03']]);
    expect(r.ended).toBe('stopped');
    expect(body(r)).toContain('KeyboardInterrupt');
    expect(body(r)).not.toContain('not here');
  });

  it('the same on the micro:bit and the ESP32', async () => {
    for (const board of ['microbit-v2', 'esp32-devkit-v1'] as const) {
      const r = await run(py('print(int(input("n? ")) * 2)'), [[100_000, '21\n']], { board });
      expect(body(r)).toBe('n? 21\n42\n');
    }
  });
});

describe('M9 the REPL after the program (F-23)', () => {
  it('>>> in the program\'s names: led.value() prints 0, led.on() lights GP15; the program ended as done', async () => {
    const ends: RunResult[] = [];
    const r = await run(BLINK, [[200_000, 'led.value()\n'], [400_000, 'led.on()\n']], { repl: true, onProgramEnd: (x) => ends.push(x) });
    expect(ends.map((x) => x.ended)).toEqual(['done']);
    expect(r.ended).toBe('done');
    expect(r.repl).toBe(true);
    expect(body(r)).toBe('>>> led.value()\n0\n>>> led.on()\n>>> ');
    const high = r.trace.find(([, pin, level]) => pin.endsWith('15') && level === 1); // the trace names pins by number
    expect(high?.[0]).toBeGreaterThanOrEqual(400_000);
  });

  it('an expression\'s value is printed as its repr; None isn\'t', async () => {
    const r = await run('x = 5\n', [[0, "'ab' * 2\n"], [0, 'x + 1\n'], [0, 'print(x)\n'], [0, 'None\n']], { repl: true });
    expect(body(r)).toBe(">>> 'ab' * 2\n'abab'\n>>> x + 1\n6\n>>> print(x)\n5\n>>> None\n>>> ");
  });

  it('a block: after a line ending in ":" comes ..., until an empty line runs it', async () => {
    const r = await run('', [[0, 'for i in range(3):\n'], [0, '    print(i)\n'], [100_000, '\n']], { repl: true });
    expect(body(r)).toBe('>>> for i in range(3):\n...     print(i)\n... \n0\n1\n2\n>>> ');
  });

  it('open brackets go on to the next line; a compound statement on one line still waits for an empty one', async () => {
    const r = await run('', [[0, 'print((1,\n'], [0, '2))\n'], [0, 'if True: print(3)\n'], [0, '\n']], { repl: true });
    expect(body(r)).toBe('>>> print((1,\n... 2))\n(1, 2)\n>>> if True: print(3)\n... \n3\n>>> ');
  });

  it('an error at the REPL: the traceback in <stdin>, line 1 — and the window is told, to explain it', async () => {
    const errors: SimError[] = [];
    const r = await run(BLINK, [[0, 'pin.on()\n'], [0, 'led.on()\n']], { repl: true, onReplError: (e) => errors.push(e) });
    expect(body(r)).toBe(">>> pin.on()\nTraceback (most recent call last):\n  File \"<stdin>\", line 1, in <module>\nNameError: name 'pin' isn't defined\n>>> led.on()\n>>> ");
    expect(errors).toEqual([{ type: 'NameError', message: "name 'pin' isn't defined", file: '<stdin>', line: 1 }]);
    expect(r.ended).toBe('done');
  });

  it('after an error in the program: the REPL, with the names it had made', async () => {
    const r = await run(py('a = 7', 'b = a / 0'), [[0, 'a\n']], { repl: true });
    expect(r.ended).toBe('error');
    expect(r.error).toMatchObject({ type: 'ZeroDivisionError', line: 2 });
    expect(body(r)).toMatch(/ZeroDivisionError: divide by zero\n>>> a\n7\n>>> $/);
  });

  it('Ctrl+C stops a line that runs on, then >>> again; at an empty prompt it starts a fresh line', async () => {
    const r = await run('', [[0, 'while True: pass\n'], [0, '\n'], [300_000, '\x03'], [400_000, '\x03'], [500_000, '1 + 1\n']], { repl: true });
    expect(body(r)).toBe('>>> while True: pass\n... \nTraceback (most recent call last):\n  File "<stdin>", line 1, in <module>\nKeyboardInterrupt: \n>>> \n>>> 1 + 1\n2\n>>> ');
  });

  it('Ctrl+C in the program: KeyboardInterrupt, the program stopped — then the REPL (the pins stay as they were)', async () => {
    const r = await run(py('import time', 'from machine import Pin', 'led = Pin(15, Pin.OUT, value=1)', 'while True:', '    time.sleep(0.1)'), [[300_000, '\x03'], [400_000, 'led.value()\n']], { repl: true });
    expect(r.ended).toBe('stopped');
    expect(r.repl).toBe(true);
    expect(body(r)).toMatch(/KeyboardInterrupt: \n>>> led.value\(\)\n1\n>>> $/);
  });

  it('no REPL after Stop or the time limit: the session ends with the program', async () => {
    const r = await run(py('while True:', '    pass'), [[0, '1\n']], { repl: true, maxUs: 300_000 });
    expect(r.ended).toBe('stopped');
    expect(r.repl).toBeUndefined();
    expect(body(r)).not.toContain('>>>');
  });

  it('a timer goes on at the REPL, as it does on a board after main.py', async () => {
    const r = await run(py('from machine import Timer', 'n = []', 'Timer(period=100, callback=lambda t: n.append(1))'), [[1_000_000, 'len(n) >= 9\n']], { repl: true });
    expect(body(r)).toBe('>>> len(n) >= 9\nTrue\n>>> ');
  });

  it('help() prints the board\'s own text; help(obj) is MicroPython\'s', async () => {
    const pico = await run('', [[0, 'help()\n']], { repl: true });
    expect(body(pico)).toContain("RP2 specific commands\nare in the 'rp2' module.");
    const mbit = await run('', [[0, 'help()\n']], { repl: true, board: 'microbit-v2' });
    expect(body(mbit)).toContain('Welcome to MicroPython on the micro:bit!');
    const esp = await run('', [[0, 'help()\n'], [0, 'help(1)\n']], { repl: true, board: 'esp32-devkit-v1' });
    expect(body(esp)).toContain('Welcome to MicroPython on the ESP32!');
    expect(body(esp)).toContain('object 1 is of type int');
  });
});
