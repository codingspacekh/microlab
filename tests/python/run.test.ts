import { describe, expect, it } from 'vitest';
import { runProject, type ProjectFiles } from '../../src/sim/run';
import { nodeLoader } from './vm';

/** M2 slice 1: the sim core without a worker — files in, boot.py then main.py, console and errors out (F-21, F-30). */
const run = async (files: ProjectFiles) => runProject(await nodeLoader(), { files });

describe('M2.1 running a project', () => {
  it('prints what the program prints, partial lines and Unicode included', async () => {
    const r = await run({ 'main.py': 'print("Hello")\nprint("a", end="")\nprint("b")\nprint("24 °C", end="")\n' });
    expect(r.output).toBe('Hello\nab\n24 °C');
    expect(r.error).toBeUndefined();
    expect(r.ended).toBe('done');
  });

  it('streams the console as it goes', async () => {
    const seen: string[] = [];
    await runProject(await nodeLoader(), { files: { 'main.py': 'for i in range(3):\n    print(i)\n' }, onOutput: (t) => seen.push(t) });
    expect(seen.join('')).toBe('0\n1\n2\n');
  });

  it('runs boot.py, then main.py, in one namespace (as the boards do)', async () => {
    const r = await run({ 'boot.py': 'greeting = "from boot"\nprint("boot")\n', 'main.py': 'print(greeting)\n' });
    expect(r.output).toBe('boot\nfrom boot\n');
  });

  it('with no main.py, nothing runs and nothing is wrong', async () => {
    const r = await run({ 'notes.txt': 'hi' });
    expect(r).toMatchObject({ output: '', ended: 'done' });
    expect(r.error).toBeUndefined();
  });

  it('every run starts from a fresh board: nothing is left from the last one', async () => {
    await run({ 'main.py': 'left = 1\n' });
    const r = await run({ 'main.py': 'print(left)\n' });
    expect(r.error).toMatchObject({ type: 'NameError', file: 'main.py', line: 1 });
  });
});

describe('M2.1 errors, as the board prints them, with file and line', () => {
  it('an error in main.py: the traceback has only the student\'s frames', async () => {
    const r = await run({ 'main.py': 'x = 1\ndef f():\n    return y\nf()\n' });
    expect(r.output).toBe([
      'Traceback (most recent call last):',
      '  File "main.py", line 4, in <module>',
      '  File "main.py", line 3, in f',
      "NameError: name 'y' isn't defined",
      '',
    ].join('\n'));
    expect(r.error).toEqual({ type: 'NameError', message: "name 'y' isn't defined", file: 'main.py', line: 3 });
    expect(r.ended).toBe('error');
  });

  it('an error inside a lib/ module points at that file', async () => {
    const r = await run({ 'main.py': 'import util\nutil.half(0)\n', 'lib/util.py': 'def half(x):\n    return 1 / x\n' });
    expect(r.output).toContain('  File "/lib/util.py", line 2, in half\n');   // the board's own text
    expect(r.error).toEqual({ type: 'ZeroDivisionError', message: 'divide by zero', file: 'lib/util.py', line: 2 });
  });

  it('a syntax error gives its line', async () => {
    const r = await run({ 'main.py': 'print("ok")\nif x\n    pass\n' });
    expect(r.output).toBe('Traceback (most recent call last):\n  File "main.py", line 2\nSyntaxError: invalid syntax\n');
    expect(r.error).toEqual({ type: 'SyntaxError', message: 'invalid syntax', file: 'main.py', line: 2 });
  });

  it('OSError keeps its errno text; an exception with no message has an empty one', async () => {
    expect((await run({ 'main.py': 'raise OSError(19)\n' })).error).toMatchObject({ type: 'OSError', message: '[Errno 19] ENODEV' });
    expect((await run({ 'main.py': 'class Oops(Exception):\n    pass\nraise Oops\n' })).error).toMatchObject({ type: 'Oops', message: '', line: 3 });
  });

  it('an error in boot.py is printed, and main.py still runs (as on the boards)', async () => {
    const r = await run({ 'boot.py': 'boom()\n', 'main.py': 'print("main ran")\n' });
    expect(r.output).toBe("Traceback (most recent call last):\n  File \"boot.py\", line 1, in <module>\nNameError: name 'boom' isn't defined\nmain ran\n");
    expect(r.error).toMatchObject({ file: 'boot.py' });
  });

  it('sys.exit() ends the program quietly', async () => {
    const r = await run({ 'main.py': 'import sys\nprint("before")\nsys.exit()\nprint("after")\n' });
    expect(r).toMatchObject({ output: 'before\n', ended: 'done' });
    expect(r.error).toBeUndefined();
  });

  it('KeyboardInterrupt (what Stop raises) ends the run as stopped, traceback printed like the board', async () => {
    const r = await run({ 'main.py': 'print("go")\nraise KeyboardInterrupt\n' });
    expect(r.output).toBe('go\nTraceback (most recent call last):\n  File "main.py", line 2, in <module>\nKeyboardInterrupt: \n');
    expect(r.ended).toBe('stopped');
    expect(r.error).toBeUndefined();
  });
});

describe('M2.1 the board\'s file system holds the project (F-21)', () => {
  it('os sees only the project\'s files and folders, from /', async () => {
    const r = await run({
      'main.py': 'import os\nprint(os.getcwd(), sorted(os.listdir("/")), os.listdir("lib"))\n',
      'lib/util.py': '',
      'data/levels.txt': '3',
    });
    expect(r.output).toBe("/ ['data', 'lib', 'main.py'] ['util.py']\n");
  });

  it('the program reads its own files, text and binary, and can write new ones', async () => {
    const r = await runProject(await nodeLoader(), {
      files: {
        'main.py': 'print(open("data/levels.txt").read())\nprint(list(open("img.bin", "rb").read()))\nwith open("log.txt", "w") as f:\n    f.write("ok")\nprint(open("log.txt").read())\n',
        'data/levels.txt': '3',
        'img.bin': new Uint8Array([0, 255, 7]),
      },
    });
    expect(r.output).toBe('3\n[0, 255, 7]\nok\n');
  });

  it('file errors carry the board\'s errno numbers and text (OSError: [Errno 2] ENOENT)', async () => {
    const r = await run({ 'main.py': 'open("missing.txt")\n' });
    expect(r.output).toBe('Traceback (most recent call last):\n  File "main.py", line 1, in <module>\nOSError: [Errno 2] ENOENT\n');
    const r2 = await run({ 'main.py': 'import os\nos.mkdir("lib")\n', 'lib/a.py': '' });
    expect(r2.error).toMatchObject({ type: 'OSError', message: '[Errno 17] EEXIST', line: 2 });
  });

  it('a program can\'t reach JavaScript: no js or jsffi module, as on a board', async () => {
    const r = await run({ 'main.py': 'for m in ("js", "jsffi"):\n    try:\n        __import__(m)\n    except ImportError as e:\n        print(e)\n' });
    expect(r.output).toBe("no module named 'js'\nno module named 'jsffi'\n");
  });

  it('the sim\'s own modules are not visible to the program', async () => {
    const r = await run({ 'main.py': 'try:\n    import _sim\nexcept ImportError as e:\n    print(e)\nimport os\nprint(os)\n' });
    expect(r.output).toBe("no module named '_sim'\n<module 'os'>\n");
  });

  it('nothing outside the project can be reached (no /tmp, /dev, /proc)', async () => {
    const r = await run({ 'main.py': 'try:\n    open("/tmp/x", "w")\nexcept OSError as e:\n    print("OSError", e.errno)\n' });
    expect(r.output).toBe('OSError 2\n');
  });
});
