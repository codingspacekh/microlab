import {
  BUILTINS, capitalsOf, closest, editDistance, namesMade, syntax, typeWord,
  type ErrorInfo, type Explanation,
} from './explain';

/**
 * What a Python 3 error means, for students (M12 slice 5, F-94, screen 05's way): the same plain sentences as the
 * boards' (M9), keyed on the texts **CPython** prints (3.13, and 3.14 where it words them differently), never
 * replacing them. Python 3's own hints (*Did you mean: 'print'?*) are used when they are a slip; MicroLab adds what
 * a student of 10–13 needs — text from `input()` isn't a number, a file named `turtle.py`, a library to install from
 * Libraries, a board's module that belongs in the workspace. Pure: the error and the code in, the explanation out.
 */
export interface Python3Context {
  /** The text of the file that ran, as it was in the editor. */
  code: string;
  /** Its path (or its name, not saved yet), as the runner names it in errors. */
  file: string;
  /** The line typed at >>>, when the error is in '<stdin>'. */
  typed?: string;
}

/** Modules of Python's own that students use (an import of one close to these is a slip). */
const STDLIB = ['random', 'math', 'time', 'turtle', 'tkinter', 'os', 'sys', 'datetime', 'json', 'csv', 'string', 'statistics', 'itertools',
  'collections', 're', 'pathlib', 'socket', 'threading', 'sqlite3', 'urllib', 'calendar', 'decimal', 'fractions', 'copy', 'pickle', 'typing',
  'functools', 'operator', 'shutil', 'glob', 'textwrap', 'unittest', 'winsound', 'webbrowser', 'secrets', 'hashlib', 'base64', 'array', 'queue'];
/** MicroPython's modules for boards: not in Python 3 on a computer. */
const BOARD_MODULES = ['machine', 'microbit', 'utime', 'network', 'neopixel', 'ujson', 'uos', 'onewire', 'dht', 'rp2', 'esp32', 'esp', 'bluetooth',
  'ubluetooth', 'music', 'radio', 'speech', 'micropython', 'urequests', 'umqtt', 'uasyncio', 'ssd1306'];
/** A library's import name and its name on PyPI, where they differ. */
const ON_PYPI: Record<string, string> = {
  PIL: 'pillow', cv2: 'opencv-python', sklearn: 'scikit-learn', bs4: 'beautifulsoup4', yaml: 'pyyaml', serial: 'pyserial', dateutil: 'python-dateutil',
};
const METHODS: Record<string, string[]> = {
  str: ['upper', 'lower', 'strip', 'split', 'replace', 'startswith', 'endswith', 'find', 'format', 'join', 'count', 'title', 'capitalize', 'isdigit', 'isalpha'],
  list: ['append', 'extend', 'insert', 'remove', 'pop', 'index', 'count', 'sort', 'reverse', 'clear', 'copy'],
  dict: ['keys', 'values', 'items', 'get', 'pop', 'update', 'setdefault', 'clear', 'copy'],
};

const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase());
const base = (path: string) => path.split(/[\\/]/).pop() ?? path;
/** Python 3's own hint at the end of a message: "Did you mean: 'print'?" */
const hintOf = (msg: string) => /Did you mean: '([\w.]+)'\?/.exec(msg)?.[1];

export function explainPython3(error: ErrorInfo, ctx: Python3Context): Explanation | undefined {
  const inFile = !!error.file && error.file === ctx.file;
  const atShell = error.file === '<stdin>';
  const code = inFile ? ctx.code : atShell ? ctx.typed ?? '' : '';
  const lines = code.split('\n');
  const n = error.line ?? undefined;
  const text = n ? lines[n - 1] ?? '' : '';
  const on = n && (inFile || atShell) ? ` on line ${n}` : '';
  const at = (t: string): Explanation => ({ type: error.type, text: t, ...(inFile && n ? { file: ctx.file, line: n } : {}) });
  const msg = error.message;
  // the names the program has (at >>>, the file's too: the line runs among them)
  const allCode = atShell ? `${ctx.code}\n${code}` : code;
  const made = () => namesMade(atShell ? ctx.code : code);
  const usesInput = /\binput\s*\(/.test(ctx.code) || /\binput\s*\(/.test(ctx.typed ?? '');
  const fromInput = usesInput ? ' `input()` gives text, even when a number is typed: `int(input(…))` makes it a whole number, `float(input(…))` a decimal one.' : '';
  /** "This file is named turtle.py": an import of a module of that name brings in the file itself. */
  const shadows = (mod: string) => base(ctx.file) === `${mod}.py`
    ? at(`This file is named \`${mod}.py\`, so \`import ${mod}\` brings in this file instead of Python's \`${mod}\`. Give it another name with **Save as…** — \`my_${mod}.py\` — then run again.`)
    : undefined;
  let m: RegExpExecArray | null;

  switch (error.type) {
    case 'NameError': {
      m = /name '(\w+)' is not defined/.exec(msg);
      if (!m) break;
      const name = m[1]!;
      const names = made();
      const madeAt = names.get(name);
      if (madeAt && n && madeAt > n && !atShell) return at(`Python doesn't know \`${name}\` yet${on}: it is made on line ${madeAt}, further down. Python runs from the top, so a name has to be made before the line that uses it.`);
      if ((/forget to import '(\w+)'/.test(msg) || STDLIB.includes(name)) && !names.has(name)) return at(`\`${name}\` is a module: add \`import ${name}\` at the top of the file, before the lines that use it.`);
      const slip = (near: string) => {
        const where = names.get(near);
        if (near.toLowerCase() === name.toLowerCase()) {
          return at(`Python doesn't know the name \`${name}\`${on}. Names are case-sensitive —${where ? ` line ${where} makes` : ' Python has'} \`${near}\`, with ${capitalsOf(near, name)}.`);
        }
        return at(`Python doesn't know the name \`${name}\`${on}. Did you mean \`${near}\`${where ? ` (made on line ${where})` : ''}?`);
      };
      const mine = closest(name, names.keys());
      if (mine) return slip(mine);
      // Python's hint, when it is a slip (one letter, or capitals) — not a far one ('hello' → 'help')
      const hint = hintOf(msg);
      if (hint && (editDistance(hint, name) <= 1 || hint.toLowerCase() === name.toLowerCase())) return slip(hint);
      const builtin = closest(name, BUILTINS.filter((b) => editDistance(b, name) <= 1 || b.toLowerCase() === name.toLowerCase()));
      if (builtin) return slip(builtin);
      return at(`Python doesn't know the name \`${name}\`${on}. A name has to be made first — with \`=\`, \`def\`, \`import\` — before a line uses it. If \`${name}\` is text, put it in quotes: \`'${name}'\`.`);
    }

    case 'UnboundLocalError': {
      m = /local variable '(\w+)'/.exec(msg);
      const name = m?.[1] ?? 'it';
      const fn = [...lines.slice(0, n ?? 0)].reverse().find((l) => /^\s*def\s/.test(l));
      const fname = fn ? /def\s+(\w+)/.exec(fn)![1] : undefined;
      return at(`The function${fname ? ` \`${fname}\`` : ''} gives \`${name}\` a value, so inside it \`${name}\` is the function's own — and${on} it is used before it has one. To change the program's \`${name}\`, put \`global ${name}\` on the function's first line.`);
    }

    case 'SyntaxError': {
      if ((m = /invalid character '(.)' \(U\+(\w+)\)/.exec(msg))) {
        if ('“”‘’'.includes(m[1]!)) return at(`Line ${n} has a curly quote \`${m[1]}\` — from a document or a web page. Python's text needs straight ones: \`"\` or \`'\`. Type the quotes again in the editor.`);
        return at(`Line ${n} has a character Python doesn't read: \`${m[1]}\` (U+${m[2]}). Often it came with text copied from a document: type it again.`);
      }
      if ((m = /invalid non-printable character U\+(\w+)/.exec(msg))) return at(`Line ${n} has a hidden character (U+${m[1]}), often from text copied from a web page. Type the line's spaces again.`);
      if (/Missing parentheses in call to 'print'/.test(msg)) {
        const rest = /^\s*print\s+(.*)$/.exec(text)?.[1]?.trim();
        return at(`\`print\` needs brackets${on}: \`print(${rest ?? '"Hello"'})\`. (Without them is how Python 2 wrote it.)`);
      }
      if (/cannot assign to (function call|literal|expression)/.test(msg)) return at(`The left of \`=\`${on} must be a name: \`x = 5\`, not \`5 = x\`. To compare, use \`==\`.`);
      if (/Maybe you meant '==' or ':=' instead of '='|Maybe you meant '==' instead of '='/.test(msg)) return at(`To compare${on}, use \`==\`. A single \`=\` gives a name a value.`);
      if (/Perhaps you forgot a comma/.test(msg)) return at(`Two values${on} sit side by side with nothing between them: a comma \`,\` goes between the values in brackets — \`print("Age:", age)\`.`);
      if ((m = /'([([{])' was never closed/.exec(msg))) return at(`A bracket opened on line ${n} isn't closed: \`${m[1]}\` needs its \`${{ '(': ')', '[': ']', '{': '}' }[m[1] as '(' | '[' | '{']}\`.`);
      if (/unterminated (triple-quoted )?string literal/.test(msg)) return at(`The text that starts with a quote${on} has no closing quote. Text goes between two of the same: \`'Hi'\` or \`"Hi"\`.`);
      if ((m = /unmatched '([)\]}])'/.exec(msg))) return at(`Line ${n} closes a bracket that isn't open: a \`${m[1]}\` too many.`);
      if ((m = /closing parenthesis '(.)' does not match opening parenthesis '(.)'/.exec(msg))) return at(`Line ${n} closes \`${m[2]}\` with \`${m[1]}\`: each bracket closes with its own — \`( )\`, \`[ ]\`, \`{ }\`.`);
      if ((m = /'(return|yield)' outside function/.exec(msg))) return at(`\`${m[1]}\`${on} works only inside a function (a \`def\`): it gives the function's answer back.`);
      if ((m = /'(break|continue)' (?:not properly in|outside) loop/.exec(msg))) return at(`\`${m[1]}\`${on} works only inside a loop (\`for\` or \`while\`). Check its indent: it belongs in the loop's block.`);
      if (/invalid decimal literal/.test(msg)) return at(`A name can't start with a digit${on}, and a number times a name needs its \`*\`: \`2 * x\`.`);
      if (/expected 'except' or 'finally' block/.test(msg)) return at(`A \`try:\` block needs an \`except:\` (or \`finally:\`) after it, lined up with the \`try\`${on}.`);
      const plain = syntax(lines, n, on);
      if (plain) return at(plain);
      if (/expected ':'/.test(msg)) return at(`Line ${n} needs a colon \`:\` at its end.`);
      return at(`Python can't read line ${n ?? '?'} as Python. Check its brackets, quotes and colons — and the line before it.`);
    }

    case 'IndentationError':
    case 'TabError': {
      if ((m = /expected an indented block after '?(\w+)'? .*?on line (\d+)/.exec(msg))) return at(`Line ${m[2]} ends with \`:\`, so the lines that belong to it go 4 spaces in — line ${n} isn't. Press Tab at its start.`);
      if (/unexpected indent/.test(msg)) return at(`Line ${n} is indented more than the line before it, but nothing above opens a block (a line ending in \`:\`). Line it up with the lines around it.`);
      if (/unindent does not match/.test(msg)) return at(`Line ${n}'s indent doesn't line up with any line above it. Use the same number of spaces as the lines of its block — 4 a level is usual.`);
      if (/inconsistent use of tabs and spaces/.test(msg) || error.type === 'TabError') return at(`Line ${n} is indented with tabs and spaces mixed: they look the same but aren't. Indent each line with spaces only.`);
      break;
    }

    case 'TypeError': {
      if ((m = /can only concatenate str \(not "(\w+)"\) to str/.exec(msg))) return at(`\`+\`${on} can't join text (a str) and ${typeWord(m[1]!)}. Make the number text with \`str(…)\` — \`'Age: ' + str(age)\` — or use an f-string: \`f'Age: {age}'\`.`);
      if ((m = /unsupported operand type\(s\) for ([^:]+): '(\w+)' and '(\w+)'/.exec(msg))) {
        const [op, a, b] = [m[1]!.trim(), m[2]!, m[3]!];
        if (a === 'NoneType' || b === 'NoneType') return at(`\`${op}\`${on} got \`None\` — nothing — on one side. A function without \`return\` gives \`None\`; check what each side is with \`print(…)\`.`);
        const text = a === 'str' || b === 'str';
        return at(`\`${op}\`${on} can't be used on ${typeWord(a)} and ${typeWord(b)}. Make them the same kind first: \`int(…)\`, \`float(…)\` or \`str(…)\`.${text ? fromInput : ''}`);
      }
      if ((m = /'(.+?)' not supported between instances of '(\w+)' and '(\w+)'/.exec(msg))) {
        const [op, a, b] = [m[1]!, m[2]!, m[3]!];
        if ((a === 'str') !== (b === 'str')) return at(`\`${op}\`${on} compares ${typeWord(a)} with ${typeWord(b)}, which Python can't do.${fromInput || ' Make them the same kind first: `int(…)` or `str(…)`.'}`);
        if (a === 'NoneType' || b === 'NoneType') return at(`\`${op}\`${on} compares with \`None\` — nothing. A function without \`return\` gives \`None\`.`);
        return at(`\`${op}\`${on} can't compare ${typeWord(a)} with ${typeWord(b)}.`);
      }
      if ((m = /can't multiply sequence by non-int of type '(\w+)'/.exec(msg))) {
        return at(`\`*\`${on} got text (or a list) and ${typeWord(m[1]!)}. Text can be repeated by a whole number — \`'ab' * 3\` — but to multiply, it must be a number first.${usesInput ? ' `input()` gives text: `float(input(…))` makes it a number.' : ' `float(…)` makes it one.'}`);
      }
      if ((m = /(?:\w+\.)?(\w+)\(\) takes (\d+) positional arguments? but (\d+) (?:were|was) given/.exec(msg))) {
        const method = /\w+\.\w+\(\) takes/.test(msg);
        return at(`The call${on} gives ${m[3]} values in its brackets, but the function takes ${m[2]}.${method ? ' In a class\'s method, `self` is one of them — it comes from the object before the dot.' : ''}`);
      }
      if ((m = /missing (\d+) required (?:positional|keyword-only) arguments?: (.+)$/.exec(msg))) {
        const names = m[2]!.replace(/'(\w+)'/g, '`$1`');
        return at(`The call${on} gives the function too few values: it needs ${names} too, in its brackets.`);
      }
      if ((m = /got an unexpected keyword argument '(\w+)'/.exec(msg))) return at(`The function${on} doesn't take a value named \`${m[1]}\`. Check the name's spelling.`);
      if ((m = /'(\w+)' object cannot be interpreted as an integer/.exec(msg))) {
        if (m[1] === 'float') return at(`This needs a whole number${on}, not a decimal one: \`range(5)\`, not \`range(2.5)\`. \`int(x)\` or \`round(x)\` makes one; \`//\` divides into a whole number.`);
        if (m[1] === 'str') return at(`This needs a whole number${on}, not text.${fromInput || ' `int(…)` makes text a number.'}`);
        return at(`This needs a whole number${on}, not ${typeWord(m[1]!)}.`);
      }
      if ((m = /'(\w+)' object is not callable/.exec(msg))) {
        if (m[1] === 'NoneType') return at(`Something${on} is \`None\`, not a function, but has \`(…)\` after it. Was a name given \`None\`, or the result of a function that returns nothing?`);
        const reused = [...namesMade(allCode).keys()].find((k) => text.includes(`${k}(`) && (BUILTINS.includes(k) || STDLIB.includes(k)));
        return at(`\`(…)\`${on} calls something, but it is ${typeWord(m[1]!)}, not a function.${reused ? ` \`${reused}\` was given a value with \`=\`, so it no longer is the function — use another name for the value.` : ' Was a function\'s name used for a value (`max = 5`)?'}`);
      }
      if ((m = /'(\w+)' object is not subscriptable/.exec(msg))) {
        if (m[1] === 'NoneType') return at(`\`[…]\`${on} is used on \`None\` — nothing. A function without \`return\` gives \`None\`; check where the value comes from.`);
        if (m[1] === 'function' || m[1] === 'builtin_function_or_method') return at(`\`[…]\`${on} is used on a function: call it with \`(…)\`.`);
        return at(`\`[…]\`${on} takes an item out of a list, text or dictionary — ${typeWord(m[1]!)} has no items.`);
      }
      if ((m = /'(\w+)' object is not iterable/.exec(msg))) {
        if (m[1] === 'int') return at(`\`for\`${on} goes through a list, text or a \`range\`, not a number: write \`for i in range(n):\` to count to n.`);
        return at(`\`for\` (or unpacking)${on} goes through the items of a list, text or \`range\`; ${typeWord(m[1]!)} has none.`);
      }
      if ((m = /(?:list|tuple|string) indices must be integers(?: or slices)?, not (\w+)/.exec(msg))) {
        return at(`An index${on} must be a whole number, not ${typeWord(m[1]!)}: \`items[0]\`.${m[1] === 'float' ? ' `//` divides into a whole number.' : m[1] === 'str' ? ' `int(…)` makes text a number.' : ''}`);
      }
      if ((m = /'(\w+)' object does not support item assignment/.exec(msg))) {
        if (m[1] === 'str') return at(`Text can't be changed in place${on}. Make a new text instead: \`word = 'b' + word[1:]\`, or use a list.`);
        return at(`${cap(typeWord(m[1]!))} can't be changed in place${on}${m[1] === 'tuple' ? ': use a list (`[…]`) instead of a tuple (`(…)`)' : ''}.`);
      }
      if ((m = /object of type '(\w+)' has no len\(\)/.exec(msg))) return at(`\`len(…)\`${on} counts the items of a list or text — ${typeWord(m[1]!)} has none.${m[1] === 'int' ? ' To count a number\'s digits, `len(str(n))`.' : ''}`);
      if ((m = /unhashable type: '(\w+)'/.exec(msg))) return at(`${cap(typeWord(m[1]!))} can't be a dictionary's key or in a set${on}: it can change. Use a tuple (\`(…)\`) or text instead.`);
      break;
    }

    case 'AttributeError': {
      if ((m = /module '([\w.]+)'.* has no attribute '(\w+)'/.exec(msg))) {
        const [mod, attr] = [m[1]!, m[2]!];
        const own = shadows(mod.split('.')[0]!);
        if (own) return own;
        const hint = hintOf(msg);
        return at(`The \`${mod}\` module has no \`${attr}\`${on}.${hint ? ` Did you mean \`${mod}.${hint}\`?` : ' Check the spelling — capitals count.'}`);
      }
      if ((m = /type object '(\w+)' has no attribute '(\w+)'/.exec(msg))) {
        const hint = hintOf(msg);
        return at(`\`${m[1]}\` has no \`${m[2]}\`${on}.${hint ? ` Did you mean \`${m[1]}.${hint}\`?` : ''}`);
      }
      if ((m = /'(\w+)' object has no attribute '(\w+)'/.exec(msg))) {
        const [cls, attr] = [m[1]!, m[2]!];
        if (cls === 'NoneType') return at(`Something before the dot${on} is \`None\` — nothing — so it has no \`${attr}\`. A function without \`return\` gives \`None\`.`);
        const near = hintOf(msg) ?? closest(attr, METHODS[cls] ?? []);
        const what = TYPE_WORDS_SHORT[cls] ?? `A \`${cls}\``;
        return at(`${what} has no \`${attr}\`${on}.${near ? ` It has \`${near}\`: did you mean that?` : ' Check the spelling — capitals count.'}`);
      }
      break;
    }

    case 'ModuleNotFoundError':
    case 'ImportError': {
      if ((m = /cannot import name '(\w+)' from (?:partially initialized module )?'([\w.]+)'/.exec(msg))) {
        const own = shadows(m[2]!.split('.')[0]!);
        if (own) return own;
        const hint = hintOf(msg);
        return at(`\`${m[2]}\` has no \`${m[1]}\`${on}.${hint ? ` Did you mean \`${hint}\`?` : ' Check the spelling and the capitals.'}`);
      }
      if ((m = /No module named '([\w.]+)'/.exec(msg))) {
        const name = m[1]!;
        const top = name.split('.')[0]!;
        if (BOARD_MODULES.includes(top)) return at(`\`${top}\` is MicroPython's, for boards — it isn't in Python 3 on a computer. A program for a micro:bit, a Pico W or an ESP32 goes in a project: open the workspace from the Start page and choose the board.`);
        const near = closest(top, STDLIB);
        if (near) return at(`There is no module \`${top}\`${on}. Did you mean \`${near}\`? Module names are lower-case.`);
        const pypi = ON_PYPI[top];
        return at(`\`${top}\` isn't installed in MicroLab: open **Libraries** (in the top bar), look up \`${pypi ?? top}\` and press Install, then run again.${pypi ? ` On PyPI it is called \`${pypi}\`.` : ''} If it is a file of your own, save it beside this one.`);
      }
      break;
    }

    case 'ValueError':
      if ((m = /invalid literal for int\(\) with base \d+: (.*)$/.exec(msg))) {
        return at(`\`int(…)\`${on} got text that isn't a whole number (\`${m[1]}\`) — empty, a decimal like \`'3.5'\`, or letters.${usesInput ? ' Check what was typed for `input()`;' : ''} \`float(…)\` reads decimals.`);
      }
      if (/could not convert string to float/.test(msg)) return at(`\`float(…)\`${on} got text that isn't a number.${usesInput ? ' Check what was typed for `input()`.' : ''}`);
      if ((m = /too many values to unpack \(expected (\d+)(?:, got (\d+))?\)/.exec(msg))) return at(`The left of \`=\`${on} has ${m[1]} names, but the right gives ${m[2] ?? 'more'} values. Give each value a name.`);
      if ((m = /not enough values to unpack \(expected (\d+), got (\d+)\)/.exec(msg))) return at(`The left of \`=\`${on} has ${m[1]} names, but the right gives only ${m[2]} values.`);
      if (/math domain error|expected a (nonnegative|positive) input/.test(msg)) return at(`The maths${on} has no answer for that number — the square root or the log of a negative one, say.`);
      if (/x not in list/.test(msg)) return at(`What is removed or looked for${on} isn't in the list. Check first with \`if x in items:\`.`);
      if (/(arg is an empty sequence|iterable argument is empty)/.test(msg)) return at(`\`min\` or \`max\`${on} got an empty list: there's nothing to choose from.`);
      if (/substring not found/.test(msg)) return at(`The text looked for${on} isn't in the text. \`find(…)\` gives -1 instead of an error.`);
      if (/empty separator/.test(msg)) return at(`\`split(…)\`${on} needs something to split at: \`split(',')\`, or \`split()\` for spaces.`);
      if (/empty range (for randrange|in randrange)|empty range/.test(msg)) return at(`The range${on} has no numbers in it: the first must be smaller than the second — \`randint(1, 6)\`.`);
      break;

    case 'ZeroDivisionError':
      return at(`Something${on} is divided by zero, which has no answer. Check the number first: \`if count != 0:\`.`);

    case 'IndexError':
      if ((m = /(list|string|tuple) index out of range/.exec(msg))) {
        const what = m[1] === 'string' ? 'text' : m[1]!;
        return at(`The index${on} asks for an item past the end of the ${what}. Items count from 0: a list of 3 has [0], [1] and [2]; \`len(…)\` says how many there are.`);
      }
      if (/pop from empty list/.test(msg)) return at(`\`pop()\`${on} takes from a list that is empty.`);
      break;

    case 'KeyError':
      return at(`The dictionary has no key ${msg ? `\`${msg}\`` : 'like that'}${on}. Check the spelling and capitals, or use \`d.get(key)\`, which gives \`None\` instead of an error.`);

    case 'FileNotFoundError': {
      const name = /No such file or directory: '(.+)'/.exec(msg)?.[1];
      return at(`There's no file${name ? ` \`${name}\`` : ''} in the program's folder${on} — the folder its .py file is in. Check the name (capitals count), or put the file beside the .py file. To make a new file, open it for writing: \`open('${name ?? 'data.txt'}', 'w')\`.`);
    }
    case 'PermissionError':
      return at(`The computer doesn't let the program use that file${on}. It may be open in another program, or in a folder that is only for reading.`);
    case 'IsADirectoryError':
      return at(`That name${on} is a folder, not a file.`);

    case 'RecursionError':
      return at(`A function calls itself${on} again and again without stopping. It needs a case where it returns without calling itself.`);

    case 'TurtleGraphicsError':
      if ((m = /bad colou?r string: (.*)$/.exec(msg))) return at(`Python's turtle doesn't know the colour \`${m[1]}\`${on}. Use a colour's name — \`'red'\`, \`'blue'\`, \`'dark green'\` — or its code: \`'#ff8800'\`.`);
      if (/bad colou?r sequence/.test(msg)) return at(`A colour as numbers${on} needs three, each 0–1 — or 0–255 after \`turtle.colormode(255)\`.`);
      break;

    case 'TclError':
      if ((m = /unknown color name "(.*)"/.exec(msg))) return at(`tkinter doesn't know the colour \`${m[1]}\`${on}. Use a colour's name — \`'red'\`, \`'light blue'\` — or its code: \`'#ff8800'\`.`);
      break;

    case 'OverflowError':
      return at(`The number${on} is too big${/float|Result too large|Numerical result/.test(msg) ? ' for a decimal number (a float)' : ''}. Check the maths — a power (\`**\`) grows very fast.`);

    case 'StopIteration':
      return at(`\`next(…)\`${on} asked for one more item than there was.`);

    case 'AssertionError':
      return at(`The \`assert\`${on} found its condition \`False\`${msg ? `: ${msg}` : ''}.`);

    case 'EOFError':
    case 'KeyboardInterrupt':
      return undefined;
  }
  return undefined;
}

const TYPE_WORDS_SHORT: Record<string, string> = {
  str: 'Text (a str)', int: 'A whole number (an int)', float: 'A decimal number (a float)', list: 'A list', dict: 'A dictionary', tuple: 'A tuple',
  bool: '`True` / `False`', function: 'A function', module: 'A module',
};
