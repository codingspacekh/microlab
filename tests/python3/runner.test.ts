import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { findPython, findRunner, startPython, type PythonSession } from '../../src/main/python3/session';

/**
 * M12 slice 1 (F-92, architecture §2.11): MicroLab's runner in a real CPython — the bundled one when the build has
 * fetched it, else MICROLAB_PYTHON or the computer's python3 (development). Each test drives a session as the window
 * will: run a file, answer input(), Stop, the >>> after the program.
 */
const python = findPython();
const sessions: PythonSession[] = [];
afterEach(() => { for (const s of sessions.splice(0)) s.kill(); });

function session(opts: { libs?: string; env?: NodeJS.ProcessEnv } = {}) {
  const s = startPython({ python, ...opts });
  sessions.push(s);
  return s;
}

/** Everything the program printed, with the input prompts, until it ends. */
async function runToEnd(s: PythonSession, code: string, answers: string[] = [], file = 'main.py', cwd = tmpdir()) {
  let out = '';
  let err = '';
  const off = s.on((e) => {
    if ('out' in e) out += e.out;
    else if ('err' in e) err += e.err;
    else if ('input' in e) s.line(answers.shift() ?? '');
  });
  s.run({ code, file, cwd });
  const ended = await s.ended();
  off();
  return { out, err, ended };
}

describe('the runner', () => {
  it('says it is ready, with its Python version', async () => {
    const s = session();
    expect(await s.ready).toMatch(/^3\.\d+\.\d+/);
  });

  it('runs a file: what it prints, in order; it ends by itself', async () => {
    const s = session();
    const r = await runToEnd(s, 'class Dog:\n    def speak(self):\n        return "woof"\nprint(Dog().speak(), 2 ** 100)\nprint("é ✓")\n');
    expect(r.out).toBe('woof 1267650600228229401496703205376\né ✓\n');
    expect(r.ended).toEqual({ ended: 'done' });
  });

  it('input(): the prompt is printed, the answer is what the window sends', async () => {
    const s = session();
    const r = await runToEnd(s, 'name = input("Name? ")\nage = int(input("Age? "))\nprint(f"Hello {name}, {age + 1} next year")\n', ['Sok', '11']);
    expect(r.out).toBe('Name? Age? Hello Sok, 12 next year\n');
  });

  it('an error: the traceback as CPython prints it, without the runner\'s own frames; where it was', async () => {
    const s = session();
    const r = await runToEnd(s, 'x = 1\n\ndef f():\n    return pritn(x)\n\nf()\n', [], 'guess.py');
    expect(r.err).toMatch(/^Traceback \(most recent call last\):\n {2}File "guess\.py", line 6, in <module>/);
    expect(r.err).toContain("NameError: name 'pritn' is not defined. Did you mean: 'print'?");
    expect(r.err).not.toContain('runner.py');
    expect(r.err).toContain('    return pritn(x)');   // its code line, though the file isn't saved (M12 slice 3)
    expect(r.ended).toEqual({ ended: 'error', error: { type: 'NameError', message: "name 'pritn' is not defined. Did you mean: 'print'?", file: 'guess.py', line: 4 } });
  });

  it('a syntax error: the line, the caret, where', async () => {
    const s = session();
    const r = await runToEnd(s, 'print("hi")\nif True\n    print(1)\n', [], 'bad.py');
    expect(r.out).toBe('');
    expect(r.err).toContain("SyntaxError: expected ':'");
    expect(r.ended).toMatchObject({ ended: 'error', error: { type: 'SyntaxError', file: 'bad.py', line: 2 } });
  });

  it('the file runs in its folder: open() finds the file beside it; its folder is importable', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ml-py-'));
    try {
      writeFileSync(join(dir, 'data.txt'), 'apples\n');
      writeFileSync(join(dir, 'helpers.py'), 'def twice(x):\n    return x * 2\n');
      const s = session();
      const r = await runToEnd(s, 'import helpers, os\nprint(open("data.txt").read().strip(), helpers.twice(21), os.path.basename(__file__))\n', [], join(dir, 'main.py'), dir);
      expect(r.out).toBe('apples 42 main.py\n');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('libraries in MicroLab\'s own folder are importable; the computer\'s user site is not used', async () => {
    const libs = mkdtempSync(join(tmpdir(), 'ml-libs-'));
    try {
      writeFileSync(join(libs, 'mylib.py'), 'NAME = "from MicroLab\'s folder"\n');
      const s = session({ libs });
      const r = await runToEnd(s, 'import mylib, sys, site\nprint(mylib.NAME, sys.flags.no_user_site)\n');
      expect(r.out).toBe("from MicroLab's folder 1\n");
    } finally { rmSync(libs, { recursive: true, force: true }); }
  });

  it('exit() and sys.exit() end the program quietly', async () => {
    const s = session();
    const r = await runToEnd(s, 'print("bye")\nimport sys\nsys.exit(0)\nprint("never")\n');
    expect(r.out).toBe('bye\n');
    expect(r.ended).toEqual({ ended: 'done' });
  });
});

describe('Stop and Ctrl+C', () => {
  it('Ctrl+C stops a busy loop within 0.5 s (N-03): a KeyboardInterrupt, as CPython prints it', async () => {
    const s = session();
    let err = '';
    s.on((e) => { if ('err' in e) err += e.err; });
    s.run({ code: 'i = 0\nwhile True:\n    i += 1\n', file: 'loop.py', cwd: tmpdir() });
    await new Promise((r) => setTimeout(r, 200));
    const t = Date.now();
    s.interrupt();
    expect(await s.ended()).toEqual({ ended: 'stopped' });
    expect(Date.now() - t).toBeLessThan(500);
    expect(err).toContain('KeyboardInterrupt');
  });

  it('Ctrl+C while input() waits: stopped too', async () => {
    const s = session();
    s.on((e) => { if ('input' in e) setTimeout(() => s.interrupt(), 50); });
    s.run({ code: 'input("Name? ")\n', file: 'ask.py', cwd: tmpdir() });
    expect(await s.ended()).toEqual({ ended: 'stopped' });
  });

  it('Stop ends the process, even a program that catches KeyboardInterrupt', async () => {
    const s = session();
    s.run({ code: 'while True:\n    try:\n        pass\n    except KeyboardInterrupt:\n        pass\n', file: 'stubborn.py', cwd: tmpdir() });
    await new Promise((r) => setTimeout(r, 200));
    const t = Date.now();
    await s.stop();
    expect(s.alive).toBe(false);
    expect(Date.now() - t).toBeLessThan(1500);
  });
});

describe('the shell after the program (>>>, as IDLE\'s Run Module)', () => {
  /** Runs the code and waits for the shell's first >>> after it (it comes just after the program's end). */
  async function toShell(s: PythonSession, code: string) {
    const first = new Promise<string>((resolve) => { const off = s.on((e) => { if ('prompt' in e) { off(); resolve(e.prompt); } }); });
    await runToEnd(s, code);
    return first;
  }

  /** Sends a line at the REPL and collects what comes back until the next prompt. */
  async function at(s: PythonSession, line: string) {
    let text = '';
    let prompt = '';
    await new Promise<void>((resolve) => {
      const off = s.on((e) => {
        if ('out' in e) text += e.out;
        else if ('err' in e) text += e.err;
        else if ('prompt' in e) { prompt = e.prompt; off(); resolve(); }
      });
      s.line(line);
    });
    return { text, prompt };
  }

  it('the program\'s names are there; an expression shows its repr; a block continues with ...', async () => {
    const s = session();
    expect(await toShell(s, 'secret = 7\ntries = 3\n')).toBe('>>> ');
    expect(await at(s, 'secret, tries')).toEqual({ text: '(7, 3)\n', prompt: '>>> ' });
    expect(await at(s, 'for i in range(2):')).toEqual({ text: '', prompt: '... ' });
    expect(await at(s, '    print(i * tries)')).toEqual({ text: '', prompt: '... ' });
    expect(await at(s, '')).toEqual({ text: '0\n3\n', prompt: '>>> ' });
  });

  it('an error at >>> is a traceback in <stdin>, and the shell goes on', async () => {
    const s = session();
    await toShell(s, 'x = 1\n');
    let replError: unknown;
    s.on((e) => { if ('replError' in e) replError = e.replError; });
    const r = await at(s, 'x / 0');
    expect(r.text).toContain('ZeroDivisionError: division by zero');
    expect(r.text).toContain('File "<stdin>", line 1');
    expect(replError).toEqual({ type: 'ZeroDivisionError', message: 'division by zero', file: '<stdin>', line: 1 });
    expect(r.prompt).toBe('>>> ');
  });

  it('Ctrl+C at >>> stops a line that runs on; the names stay', async () => {
    const s = session();
    await toShell(s, 'n = 5\n');
    expect((await at(s, 'while True: pass')).prompt).toBe('... ');   // a compound statement waits for its empty line
    const back = new Promise<string>((resolve) => { const off = s.on((e) => { if ('prompt' in e) { off(); resolve(e.prompt); } }); });
    s.line('');
    await new Promise((r) => setTimeout(r, 150));
    s.interrupt();
    expect(await back).toBe('>>> ');
    expect((await at(s, 'n')).text).toBe('5\n');
  });
});

describe('finding Python and the runner', () => {
  it('MICROLAB_PYTHON first; then the one in the app\'s resources; then vendor/python; else the computer\'s python3', () => {
    const root = mkdtempSync(join(tmpdir(), 'ml-find-'));
    try {
      const bin = process.platform === 'win32' ? ['python.exe'] : ['bin', 'python3'];
      expect(findPython({ MICROLAB_PYTHON: '/x/python3' }, root, root)).toBe('/x/python3');
      expect(findPython({}, '', root)).toBe(process.platform === 'win32' ? 'python' : 'python3');
      const vendor = join(root, 'vendor', 'python', `${process.platform}-${process.arch}`, 'python', ...bin);
      mkdirSync(join(vendor, '..'), { recursive: true });
      writeFileSync(vendor, '');
      expect(findPython({}, '', root)).toBe(vendor);
      const shipped = join(root, 'res', 'python', ...bin);
      mkdirSync(join(shipped, '..'), { recursive: true });
      writeFileSync(shipped, '');
      expect(findPython({}, join(root, 'res'), root)).toBe(shipped);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('the runner shipped in the app\'s resources, else the source tree\'s', () => {
    const root = mkdtempSync(join(tmpdir(), 'ml-find-'));
    try {
      expect(findRunner('', root)).toBe(join(root, 'src', 'python3', 'runner.py'));
      mkdirSync(join(root, 'res', 'python3'), { recursive: true });
      writeFileSync(join(root, 'res', 'python3', 'runner.py'), '');
      expect(findRunner(join(root, 'res'), root)).toBe(join(root, 'res', 'python3', 'runner.py'));
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('a Python that can\'t start says so; the session is over', async () => {
    const s = startPython({ python: join(tmpdir(), 'no-such-python') });
    sessions.push(s);
    let err = '';
    s.on((e) => { if ('err' in e) err += e.err; });
    await expect(s.ready).rejects.toThrow(/Python couldn't start/);
    expect(err).toMatch(/^Python couldn't start/);
    expect(s.alive).toBe(false);
    expect(await s.ended()).toEqual({ ended: 'stopped' });
  });
});

describe('turtle and tkinter (F-93): their windows are the program\'s own', () => {
  // the tests never show a window or take focus (MICROLAB_HIDDEN, the teacher's rule): the runner withdraws them
  const hidden = { env: { ...process.env, MICROLAB_HIDDEN: '1' } };

  it('a tkinter window: the window says it is open; the program goes on; the window is the program\'s', async () => {
    const s = session(hidden);
    const events: string[] = [];
    s.on((e) => { if ('window' in e) events.push('window'); if ('out' in e) events.push(e.out.trim()); });
    const r = await runToEnd(s, 'import tkinter\nroot = tkinter.Tk()\nroot.title("Hello")\nprint(root.state())\nroot.destroy()\n');
    expect(r.ended).toEqual({ ended: 'done' });
    expect(events.filter(Boolean)).toEqual(['window', 'withdrawn']);
  });

  it('turtle draws, and turtle.done() waits for its window — Ctrl+C there stops it', async () => {
    const s = session(hidden);
    let window = false;
    s.on((e) => { if ('window' in e) window = true; });
    s.run({ code: 'import turtle\nt = turtle.Turtle()\nt.speed(0)\nfor i in range(4):\n    t.forward(50)\n    t.left(90)\nprint("drawn", round(t.xcor()), round(t.ycor()))\nturtle.done()\n', file: 'square.py', cwd: tmpdir() });
    await vi.waitFor(() => expect(window).toBe(true), { timeout: 10_000 });
    await new Promise((r) => setTimeout(r, 400));
    s.interrupt();
    expect(await s.ended()).toEqual({ ended: 'stopped' });
  });

  it('a turtle window closed while it draws: the program ends quietly, not with turtle.Terminator', async () => {
    const s = session(hidden);
    const r = await runToEnd(s, 'import turtle\nt = turtle.Turtle()\nturtle.bye()\nt.forward(10)\nprint("never")\n');
    expect(r.ended).toEqual({ ended: 'done' });
    expect(r.err).toBe('');
    expect(r.out).toBe('');
  });

  it('Stop ends a program in its mainloop, and its window with it', async () => {
    const s = session(hidden);
    let window = false;
    s.on((e) => { if ('window' in e) window = true; });
    s.run({ code: 'import tkinter\nroot = tkinter.Tk()\nroot.mainloop()\n', file: 'win.py', cwd: tmpdir() });
    await vi.waitFor(() => expect(window).toBe(true), { timeout: 10_000 });
    const t = Date.now();
    await s.stop();
    expect(s.alive).toBe(false);
    expect(Date.now() - t).toBeLessThan(1500);
  });
});
