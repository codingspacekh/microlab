import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { explainPython3 } from '../../src/lib/errors';
import type { ErrorInfo } from '../../src/lib/errors';
import { findPython, startPython } from '../../src/main/python3/session';

/**
 * M12 slice 5 (F-94, screen 05's way): every friendly error from CPython's real text — each program below runs in a
 * real CPython (the bundled one, or the computer's in development) through MicroLab's runner; the error it sends
 * (type, CPython's message with its hints, file, line) is explained as the shell will.
 */
const python = findPython();
const folder = mkdtempSync(join(tmpdir(), 'ml-explain-'));
afterAll(() => rmSync(folder, { recursive: true, force: true }));

async function errorOf(code: string, file = join(folder, 'main.py'), stdin: string[] = []): Promise<ErrorInfo> {
  const s = startPython({ python });
  s.on((e) => { if ('input' in e) s.line(stdin.shift() ?? ''); });
  s.run({ code, file, cwd: folder });
  const end = await s.ended();
  s.kill();
  if (end.ended !== 'error' || !end.error) throw new Error(`no error from:\n${code}\n(${JSON.stringify(end)})`);
  return end.error as ErrorInfo;
}

/** [what the student wrote, what the explanation says, the line it points to] */
const CASES: [string, string, RegExp, number?][] = [
  // names
  ['a slip in a name', 'pritn("Hi")\n', /doesn't know the name `pritn` on line 1\. Did you mean `print`\?/, 1],
  ['a name made further down', 'print(score)\nscore = 0\n', /made on line 2, further down/, 1],
  ['capitals', 'Name = "Sok"\nprint(name)\n', /case-sensitive .* `Name`, with a capital \*\*N\*\*/, 2],
  ['a module not imported', 't = turtle.Turtle()\n', /`turtle` is a module: add `import turtle` at the top/, 1],
  ['text without quotes', 'print(hello)\n', /If `hello` is text, put it in quotes/, 1],
  ['a function changing the program\'s name', 'score = 0\ndef win():\n    score = score + 1\nwin()\n', /`win`.* put `global score` on the function's first line/, 3],
  // syntax
  ['a missing colon', 'age = 12\nif age > 10\n    print("big")\n', /ends with a colon `:` .* `if age > 10:`/, 2],
  ['a bracket never closed', 'print("Hi"\nx = 1\n', /A bracket opened on line 1 isn't closed/, 1],
  ['a quote never closed', 'print("Hi)\n', /no closing quote/, 1],
  ['= for comparing', 'x = 3\nif x = 3:\n    pass\n', /To compare on line 2, use `==`/, 2],
  ['print without brackets', 'print "Hi"\n', /`print` needs brackets on line 1/, 1],
  ['curly quotes from a document', 'print(“Hi”)\n', /curly quote .* straight ones/, 1],
  ['else if', 'x = 1\nif x:\n    pass\nelse if x == 2:\n    pass\n', /`elif`, not `else if`/, 4],
  ['a name starting with a digit', '2x = 5\n', /A name can't start with a digit/, 1],
  ['a missing comma', 'age = 12\nprint("Age:" age)\n', /comma `,` between `"Age:"` and `age`|a comma `,`/, 2],
  ['a keyword as a name', 'class = 3\n', /`class` is one of Python's own words/, 1],
  ['a bracket closed but never opened', 'x = 1)\n', /closes a bracket that isn't open/, 1],
  ['return outside a function', 'return 5\n', /`return` .* only inside a function/, 1],
  // indentation
  ['a block not indented', 'for i in range(3):\nprint(i)\n', /line 1 ends with `:`.* line 2/i, 2],
  ['an unexpected indent', 'x = 1\n    y = 2\n', /indented more than the line before/, 2],
  ['an indent that lines up with nothing', 'if True:\n        x = 1\n    y = 2\n', /doesn't line up/, 3],
  // types
  ['text + a number', 'age = 12\nprint("Age: " + age)\n', /can't join text \(a str\) and a whole number \(an int\).*str\(…\)/, 2],
  ['a number + text', 'n = 5\nprint(n + "!")\n', /can't be used on a whole number \(an int\) and text \(a str\)/, 2],
  ['input() compared with a number', 'guess = input("Guess: ")\nif guess < 7:\n    pass\n', /`input\(\)` gives text.*int\(input\(…\)\)/, 2],
  ['input() times a decimal', 'n = input()\nprint(n * 1.5)\n', /Text can be repeated by a whole number.*float\(input\(…\)\)/, 2],
  ['a function\'s name used for a value', 'print = 5\nprint("hi")\n', /`print` was given a value with `=`/, 2],
  ['too many arguments', 'def hi(name):\n    pass\nhi("a", "b")\n', /gives 2 values in its brackets, but the function takes 1/, 3],
  ['a missing argument', 'def hi(name):\n    pass\nhi()\n', /too few values: it needs `name`/, 3],
  ['range of a decimal', 'for i in range(2.5):\n    pass\n', /needs a whole number on line 1, not a decimal one/, 1],
  ['a for over a number', 'for i in 10:\n    pass\n', /`for i in range\(n\):`/, 1],
  ['a list index that is text', 'items = [1, 2]\nprint(items["0"])\n', /must be a whole number, not text/, 2],
  ['changing a letter of text', 'w = "cat"\nw[0] = "b"\n', /Text can't be changed in place on line 2/, 2],
  ['len of a number', 'print(len(5))\n', /`len\(str\(n\)\)`/, 1],
  ['None used as a list', 'def f():\n    pass\nx = f()\nprint(x[0])\n', /used on `None`/, 4],
  // attributes
  ['a slip in a module\'s name', 'import turtle\nturtle.forwad(10)\n', /The `turtle` module has no `forwad` on line 2\. Did you mean `turtle\.forward`\?/, 2],
  ['a slip in a method', 'print("a".uper())\n', /Text \(a str\) has no `uper` on line 1\. It has `upper`/, 1],
  // imports
  ['a library not installed', 'import numpy_microlab_test\n', /isn't installed in MicroLab: open \*\*Libraries\*\*/, 1],
  ['a board\'s module', 'from machine import Pin\n', /for boards.*the workspace/, 1],
  ['a slip in a module name', 'import randon\n', /Did you mean `random`\?/, 1],
  ['a name the module hasn\'t', 'from math import squareroot\n', /`math` has no `squareroot`/, 1],
  // values
  ['int() of text that isn\'t a number', 'n = int(input())\n', /`int\(…\)` on line 1 got text that isn't a whole number \(`'abc'`\)/, 1],
  ['float() of text', 'x = float("ten")\n', /`float\(…\)` on line 1 got text that isn't a number/, 1],
  ['too many to unpack', 'a, b = 1, 2, 3\n', /has 2 names, but the right gives 3 values/, 1],
  ['too few to unpack', 'a, b, c = 1, 2\n', /has 3 names, but the right gives only 2/, 1],
  ['the square root of a negative', 'import math\nmath.sqrt(-1)\n', /no answer for that number/, 2],
  ['remove what isn\'t there', 'items = [1]\nitems.remove(5)\n', /isn't in the list/, 2],
  ['max of nothing', 'print(max([]))\n', /got an empty list/, 1],
  ['division by zero', 'print(5 / 0)\n', /divided by zero/, 1],
  ['modulo zero', 'print(5 % 0)\n', /divided by zero/, 1],
  ['past the end of a list', 'items = [1, 2, 3]\nprint(items[3])\n', /Items count from 0/, 2],
  ['past the end of text', 'print("ab"[5])\n', /past the end of the text/, 1],
  ['pop from empty', '[].pop()\n', /takes from a list that is empty/, 1],
  ['a key not there', 'ages = {"Sok": 12}\nprint(ages["Dara"])\n', /no key `'Dara'`.*d\.get\(key\)/, 2],
  ['a file not in the folder', 'open("scores.txt")\n', /no file `scores\.txt` in the program's folder/, 1],
  ['a function calling itself for ever', 'def f():\n    f()\nf()\n', /calls itself .* again and again/, 2],
  ['turtle: a colour it doesn\'t know', 'import turtle\nturtle.color("blu")\n', /turtle doesn't know the colour `blu`/, 2],
];

describe('every friendly error from CPython\'s real text (F-94)', () => {
  it.each(CASES)('%s', async (_what, code, says, line) => {
    const file = join(folder, 'main.py');
    const error = await errorOf(code, file, ['abc']);
    const why = explainPython3(error, { code, file });
    expect(why?.text, `${error.type}: ${error.message}`).toMatch(says);
    if (line) expect(why).toMatchObject({ file, line });
  });

  it('the file named after a module it imports: said when the file is turtle.py', async () => {
    const file = join(folder, 'turtle.py');
    const code = 'import turtle\nt = turtle.Turtle()\n';
    writeFileSync(file, code);
    const error = await errorOf(code, file);
    expect(explainPython3(error, { code, file })?.text).toMatch(/This file is named `turtle\.py`, so `import turtle` brings in this file.*Save as/);
  });

  it('at >>>: the line typed is what is explained; Go to line only for the file', async () => {
    const why = explainPython3({ type: 'NameError', message: "name 'secrt' is not defined. Did you mean: 'secret'?", file: '<stdin>', line: 1 },
      { code: 'secret = 7\n', file: '/x/main.py', typed: 'print(secrt)' });
    expect(why?.text).toMatch(/Did you mean `secret` \(made on line 1\)\?/);
    expect(why?.file).toBeUndefined();
  });

  it('an error it doesn\'t know, the student\'s own, and KeyboardInterrupt: no explanation (CPython\'s message stands)', () => {
    expect(explainPython3({ type: 'MyError', message: 'boom', file: 'main.py', line: 1 }, { code: 'x', file: 'main.py' })).toBeUndefined();
    expect(explainPython3({ type: 'KeyboardInterrupt', message: '', file: 'main.py', line: 1 }, { code: 'x', file: 'main.py' })).toBeUndefined();
  });
});
