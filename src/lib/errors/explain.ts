import { apiFor, type ApiItem } from '../editor/api/model';

/**
 * What an error means, for students (M9, F-24, screen 05): beside MicroPython's own message, a few plain sentences
 * about this error on this line of this code — the name that is close to the one Python doesn't know, the colon a
 * line is missing, the pin this board doesn't have. Keyed on the texts MicroPython prints (v1.29, the boards' and
 * the simulator's: the same), never replacing them. Pure: the error and the code in, the explanation out.
 */
export interface ErrorInfo {
  /** NameError, SyntaxError, or the student's own exception class. */
  type: string;
  /** As printed after "Type: "; '' when there is none. */
  message: string;
  /** The student's file the error is in ('main.py', 'lib/util.py', '<stdin>' at the REPL). */
  file?: string;
  line?: number;
}

export interface Explanation {
  type: string;
  /** What it means: sentences, with code in `backticks`. */
  text: string;
  /** Where to go: a file of the project (not '<stdin>') and its line. */
  file?: string;
  line?: number;
}

export interface ExplainContext {
  /** The project's files (a binary one is passed over). */
  files: Record<string, string | Uint8Array>;
  /** The board's id ('pico-w', 'esp32-devkit-v1', 'microbit-v2'): its modules, its pins. */
  board: string;
  /** The library pack's modules: an ImportError of one says where to add it. */
  libraries?: { module: string; title: string }[];
  /** The line typed at the REPL, when the error is in '<stdin>'. */
  typed?: string;
}

const KEYWORDS = ['False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
  'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield'];
const BLOCK = ['if', 'elif', 'else', 'while', 'for', 'def', 'class', 'try', 'except', 'finally', 'with'];
const BUILTINS = ['print', 'input', 'range', 'len', 'int', 'float', 'str', 'list', 'dict', 'tuple', 'set', 'bool', 'abs', 'min', 'max', 'sum', 'round',
  'sorted', 'enumerate', 'zip', 'map', 'filter', 'open', 'type', 'isinstance', 'chr', 'ord', 'hex', 'bin', 'divmod', 'pow', 'any', 'all', 'iter',
  'next', 'repr', 'help', 'dir', 'globals', 'locals', 'super', 'object', 'bytes', 'bytearray', 'reversed', 'hash', 'id', 'callable', 'getattr',
  'setattr', 'hasattr', 'Exception', 'ValueError', 'TypeError', 'OSError', 'KeyboardInterrupt'];

const TYPE_WORDS: Record<string, string> = {
  str: 'text (a str)', int: 'a whole number (an int)', float: 'a decimal number (a float)', NoneType: '`None`', bool: '`True` / `False`',
  list: 'a list', tuple: 'a tuple', dict: 'a dictionary', bytes: 'bytes', bytearray: 'a bytearray', function: 'a function', module: 'a module',
};
const typeWord = (t: string) => TYPE_WORDS[t] ?? `a ${t}`;
const OPS: Record<string, string> = {
  __add__: '+', __sub__: '-', __mul__: '*', __truediv__: '/', __floordiv__: '//', __mod__: '%', __pow__: '**', __lt__: '<', __gt__: '>',
  __le__: '<=', __ge__: '>=', __and__: '&', __or__: '|', __lshift__: '<<', __rshift__: '>>',
};

/** How many single edits (a letter changed, added, dropped, two swapped) turn one into the other. */
export function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
    }
  }
  return d[a.length]![b.length]!;
}

/** The closest of `names` to `name` — the same but for capitals first — if it is close enough to be a slip. */
export function closest(name: string, names: Iterable<string>): string | undefined {
  let best: string | undefined;
  let score = Infinity;
  const limit = name.length <= 3 ? 1 : 2;
  for (const n of new Set(names)) {
    if (n === name) continue;
    const s = n.toLowerCase() === name.toLowerCase() ? 0.5 : editDistance(n, name);
    if (s <= limit && s < score) { best = n; score = s; }
  }
  return best;
}

/** The names the code makes, with the line each is first made on. */
function namesMade(code: string): Map<string, number> {
  const made = new Map<string, number>();
  const add = (name: string, line: number) => { if (/^[A-Za-z_]\w*$/.test(name) && !made.has(name)) made.set(name, line); };
  code.split('\n').forEach((text, i) => {
    const n = i + 1;
    let m = /^\s*import\s+(.+)$/.exec(text);
    if (m) for (const part of m[1]!.split(',')) { const [mod, alias] = part.trim().split(/\s+as\s+/); add((alias ?? mod ?? '').split('.')[0]!, n); }
    m = /^\s*from\s+[\w.]+\s+import\s+(.+)$/.exec(text);
    if (m) for (const part of m[1]!.replace(/[()]/g, '').split(',')) { const [name, alias] = part.trim().split(/\s+as\s+/); add(alias ?? name ?? '', n); }
    m = /^\s*((?:[A-Za-z_]\w*\s*,\s*)*[A-Za-z_]\w*)\s*(?:[-+*/%|&]|\/\/)?=(?!=)/.exec(text);
    if (m) for (const name of m[1]!.split(',')) add(name.trim(), n);
    m = /^\s*(?:def|class)\s+([A-Za-z_]\w*)/.exec(text);
    if (m) add(m[1]!, n);
    m = /^\s*def\s+\w+\s*\(([^)]*)\)/.exec(text);
    if (m) for (const p of m[1]!.split(',')) add(p.trim().split(/[=:]/)[0]!.replace(/^\*+/, '').trim(), n);
    m = /^\s*for\s+(.+?)\s+in\s/.exec(text);
    if (m) for (const name of m[1]!.replace(/[()]/g, '').split(',')) add(name.trim(), n);
    m = /\bexcept\s+.*\bas\s+([A-Za-z_]\w*)/.exec(text);
    if (m) add(m[1]!, n);
    m = /^\s*(?:global|nonlocal)\s+(.+)$/.exec(text);
    if (m) for (const name of m[1]!.split(',')) add(name.trim(), n);
  });
  return made;
}

/** Where a module member (Pin, sleep_ms) comes from on this board: the module that has it. */
function homeOf(name: string, board: string): string | undefined {
  for (const [mod, item] of apiFor(board)) if (item.members.get(name) && !item.members.get(name)!.hidden) return mod;
  return undefined;
}

/** A class by name in any of the board's modules (Pin, PWM, I2C): what its objects have. */
function classNamed(name: string, board: string): ApiItem | undefined {
  for (const [, mod] of apiFor(board)) {
    const c = mod.members.get(name);
    if (c && c.kind === 'class') return c;
  }
  return undefined;
}

const PINS: Record<string, { all: string; adc: string }> = {
  pico: { all: 'GP0 to GP28 (and "LED", its own LED)', adc: 'GP26, GP27 and GP28 (ADC 0–2)' },
  esp32: { all: 'GPIO 0 to 39, but not 6–11 (the flash chip\'s) and 20, 24, 28–31', adc: 'GPIO 32 to 39 (ADC1); 0, 2, 4, 12–15 and 25–27 (ADC2) only while Wi-Fi is off' },
  microbit: { all: 'pin0 to pin16, pin19 and pin20 (named, not numbered)', adc: 'pin0, pin1, pin2, pin3, pin4 and pin10' },
};
const boardKind = (board: string) => (board.startsWith('esp32') ? 'esp32' : board.startsWith('microbit') ? 'microbit' : 'pico');
const BOARD_NAME = { pico: 'the Pico W', esp32: 'the ESP32', microbit: 'the micro:bit' } as const;

/** The explanation of an error, or undefined for one it doesn't know (the student's own exception, a KeyboardInterrupt). */
export function explain(error: ErrorInfo, ctx: ExplainContext): Explanation | undefined {
  const files = Object.fromEntries(Object.entries(ctx.files).filter((e): e is [string, string] => typeof e[1] === 'string'));
  const inFile = error.file && error.file !== '<stdin>' && files[error.file] !== undefined ? error.file : undefined;
  const code = inFile ? files[inFile]! : error.file === '<stdin>' ? ctx.typed ?? '' : '';
  const lines = code.split('\n');
  const n = error.line;
  const text = n ? lines[n - 1] ?? '' : '';
  const on = n ? ` on line ${n}` : '';
  const at = (t: string): Explanation | undefined => ({ type: error.type, text: t, ...(inFile && n ? { file: inFile, line: n } : {}) });
  const kind = boardKind(ctx.board);
  const msg = error.message;
  // the names the program has: its own files' (the REPL's line runs among main.py's)
  const allCode = [code, ...(error.file === '<stdin>' ? Object.entries(files).filter(([f]) => f.endsWith('.py')).map(([, c]) => c) : [])].join('\n');
  let m: RegExpExecArray | null;

  switch (error.type) {
    case 'NameError': {
      if (/local variable referenced before assignment/.test(msg)) {
        const fn = [...lines.slice(0, n ?? 0)].reverse().find((l) => /^\s*def\s/.test(l));
        const name = fn ? /def\s+(\w+)/.exec(fn)![1] : undefined;
        return at(`A function${name ? ` (\`${name}\`)` : ''} uses a name${on} before it gives it a value. A name given a value anywhere in a function is that function's own, so the program's one isn't seen there. To change the program's one, put \`global\` and its name on the function's first line.`);
      }
      m = /name '(\w+)' isn't defined/.exec(msg);
      if (!m) break;
      const name = m[1]!;
      const made = namesMade(allCode);
      const madeAt = made.get(name);
      if (madeAt && n && madeAt > n && error.file !== '<stdin>') return at(`Python doesn't know \`${name}\` yet${on}: it is made on line ${madeAt}, further down. Python runs from the top, so a name has to be made before the line that uses it.`);
      if (apiFor(ctx.board).has(name) && !made.has(name)) return at(`\`${name}\` is a module: add \`import ${name}\` at the top of the file, before the lines that use it.`);
      // a slip: one of the program's names (two letters off at most); else one the board has; else one of Python's
      const slip = (near: string) => {
        if (near.toLowerCase() === name.toLowerCase()) {
          const where = made.get(near);
          return at(`Python doesn't know the name \`${name}\`${on}. Names are case-sensitive —${where ? ` line ${where} brings in` : ' Python has'} \`${near}\`, with ${capitalsOf(near, name)}.`);
        }
        return at(`Python doesn't know the name \`${name}\`${on}. Did you mean \`${near}\`${made.get(near) ? ` (made on line ${made.get(near)})` : ''}?`);
      };
      const mine = closest(name, made.keys());
      if (mine) return slip(mine);
      const home = homeOf(name, ctx.board);
      if (home) return at(`\`${name}\` comes from the \`${home}\` module: add \`from ${home} import ${name}\` at the top (or write \`${home}.${name}\` after \`import ${home}\`).`);
      const python = closest(name, BUILTINS.filter((b) => editDistance(b, name) <= 1 || b.toLowerCase() === name.toLowerCase()));
      if (python) return slip(python);
      return at(`Python doesn't know the name \`${name}\`${on}. A name has to be made first — with \`=\`, \`def\`, \`import\` — before a line uses it. If \`${name}\` is text, put it in quotes: \`'${name}'\`.`);
    }

    case 'SyntaxError':
      return at(syntax(lines, n, on) ?? `Python can't read line ${n ?? '?'} as Python. Check its brackets, quotes and colons — and the line before it.`);

    case 'IndentationError':
      if (/unexpected indent/.test(msg)) return at(`Line ${n} is indented more than the line before it, but nothing above opens a block (a line ending in \`:\`). Line it up with the lines around it.`);
      if (/unindent/.test(msg)) return at(`Line ${n}'s indent doesn't line up with any line above it. Use the same number of spaces as the lines of its block — 4 a level is usual${/\t/.test(code) ? '; the file mixes tabs and spaces, which look the same but aren\'t' : ''}.`);
      break;

    case 'TypeError': {
      if ((m = /unsupported types for (__\w+__): '(\w+)', '(\w+)'/.exec(msg))) {
        const op = OPS[m[1]!] ?? m[1]!;
        const [a, b] = [m[2]!, m[3]!];
        if (op === '+' && (a === 'str' || b === 'str') && a !== b) return at(`\`+\`${on} can't join ${typeWord(a)} and ${typeWord(b)}. Make the number text with \`str(…)\` — \`'Count: ' + str(n)\` — or the text a number with \`int(…)\`. An f-string does it too: \`f'Count: {n}'\`.`);
        if (a === 'NoneType' || b === 'NoneType') return at(`\`${op}\`${on} got \`None\` — nothing — on one side. A function without \`return\` gives \`None\`; check what each side is with \`print(…)\`.`);
        return at(`\`${op}\`${on} can't be used on ${typeWord(a)} and ${typeWord(b)}. Make them the same kind first: \`int(…)\`, \`float(…)\` or \`str(…)\`.`);
      }
      if ((m = /can't convert (\w+) to (\w+)/.exec(msg))) {
        if (m[1] === 'float' && m[2] === 'int') return at(`This needs a whole number${on}, not a decimal one: \`sleep_ms(500)\`, not \`sleep_ms(0.5)\`. \`int(x)\` or \`round(x)\` makes one.`);
        if (m[1] === 'NoneType') return at(`Something${on} is \`None\` — nothing — where a ${m[2] === 'int' ? 'number' : m[2]} is needed. A function without \`return\` gives \`None\`.`);
        return at(`${typeWord(m[1]!)}${on} can't be used as ${typeWord(m[2]!)} by itself: convert it with \`${m[2]}(…)\`.`.replace(/^./, (c) => c.toUpperCase()));
      }
      if ((m = /(?:function|\w+\(\)) takes (\d+) positional arguments? but (\d+) were given/.exec(msg))) {
        return at(`The call${on} gives ${m[2]} values in its brackets, but the function takes ${m[1]}. In a class's method, \`self\` is one of them — it comes from the object before the dot.`);
      }
      if ((m = /function missing (\d+) required positional arguments?/.exec(msg))) return at(`The call${on} gives the function too few values: it needs ${m[1]} more in its brackets.`);
      if ((m = /unexpected keyword argument '(\w+)'/.exec(msg))) return at(`The function${on} doesn't take a value named \`${m[1]}\`. Check the name's spelling — the editor's hints (type \`(\` after the name) list what it takes.`);
      if ((m = /'(\w+)' object isn't callable/.exec(msg))) {
        if (m[1] === 'NoneType') return at(`Something${on} is \`None\`, not a function, but has \`(…)\` after it. Was a name given \`None\`, or the result of a function that returns nothing?`);
        const reused = [...namesMade(allCode).keys()].find((k) => text.includes(`${k}(`) && (apiFor(ctx.board).has(k) || BUILTINS.includes(k) || homeOf(k, ctx.board)));
        return at(`\`(…)\`${on} calls something, but it is ${typeWord(m[1]!)}, not a function.${reused ? ` \`${reused}\` was given a value with \`=\`, so it no longer is the function — use another name for the value.` : ' Was a function\'s name used for a value (`time = 5`)?'}`);
      }
      if ((m = /'(\w+)' object isn't subscriptable/.exec(msg))) {
        if (m[1] === 'NoneType') return at(`\`[…]\`${on} is used on \`None\` — nothing. A function without \`return\` gives \`None\`; check where the value comes from.`);
        return at(`\`[…]\`${on} takes an item out of a list, text or dictionary — ${typeWord(m[1]!)} has no items.`);
      }
      if ((m = /'(\w+)' object isn't iterable/.exec(msg))) {
        if (m[1] === 'int') return at(`\`for\`${on} goes through a list, text or a \`range\`, not a number: write \`for i in range(n):\` to count to n.`);
        return at(`\`for\` (or unpacking)${on} goes through the items of a list, text or \`range\`; ${typeWord(m[1]!)} has none.`);
      }
      if ((m = /(?:list|tuple|string) indices must be integers, not (\w+)/.exec(msg))) return at(`An index${on} must be a whole number, not ${typeWord(m[1]!)}: \`items[int(i)]\`, or divide with \`//\`, which gives a whole number.`);
      if ((m = /'(\w+)' object doesn't support item assignment/.exec(msg))) {
        if (m[1] === 'str') return at(`Text can't be changed in place${on}. Make a new text instead: \`word = word[:1] + 'x' + word[2:]\`, or use a list.`);
        return at(`${typeWord(m[1]!).replace(/^./, (c) => c.toUpperCase())} can't be changed in place${on}${m[1] === 'tuple' ? ': use a list (`[…]`) instead of a tuple (`(…)`)' : ''}.`);
      }
      if ((m = /object of type '(\w+)' has no len\(\)/.exec(msg))) return at(`\`len(…)\`${on} counts the items of a list or text — ${typeWord(m[1]!)} has none.${m[1] === 'int' ? ' To count a number\'s digits, `len(str(n))`.' : ''}`);
      break;
    }

    case 'AttributeError': {
      if ((m = /'module' object has no attribute '(\w+)'/.exec(msg))) {
        const attr = m[1]!;
        const mod = new RegExp(`(\\w+)\\.${attr}\\b`).exec(text)?.[1];
        const item = mod ? apiFor(ctx.board).get(mod) ?? apiFor(ctx.board).get(aliasOf(allCode, mod) ?? '') : undefined;
        const near = item ? closest(attr, [...item.members.keys()]) : undefined;
        const tip = attr === 'delay' || attr === 'wait' ? 'sleep_ms' : near;
        return at(`The \`${mod ?? 'module'}\` module has no \`${attr}\`${on}.${tip ? ` Did you mean \`${mod}.${tip}\`?` : ' The editor\'s hints (type `.` after its name) list what it has.'}`);
      }
      if ((m = /type object '(\w+)' has no attribute '(\w+)'/.exec(msg))) {
        const c = classNamed(m[1]!, ctx.board);
        const near = c ? closest(m[2]!, [...c.members.keys()]) ?? ({ OUTPUT: 'OUT', INPUT: 'IN', PULLUP: 'PULL_UP' } as Record<string, string>)[m[2]!] : undefined;
        return at(`\`${m[1]}\` has no \`${m[2]}\`${on}.${near ? ` Did you mean \`${m[1]}.${near}\`?` : ''}`);
      }
      if ((m = /'(\w+)' object has no attribute '(\w+)'/.exec(msg))) {
        const [cls, attr] = [m[1]!, m[2]!];
        if (cls === 'NoneType') return at(`Something before the dot${on} is \`None\` — nothing — so it has no \`${attr}\`. A function without \`return\` gives \`None\`.`);
        const c = classNamed(cls, ctx.board);
        const known = c ? [...c.members.keys()] : cls === 'str' ? ['upper', 'lower', 'strip', 'split', 'replace', 'startswith', 'endswith', 'find', 'format', 'join', 'encode'] : cls === 'list' ? ['append', 'extend', 'insert', 'remove', 'pop', 'index', 'count', 'sort', 'reverse', 'clear', 'copy'] : [];
        const near = closest(attr, known);
        return at(`${article(cls)} \`${cls}\` has no \`${attr}\`${on}.${near ? ` It has \`${near}\`: did you mean that?` : ' The editor\'s hints (type `.` after it) list what it has.'}`);
      }
      break;
    }

    case 'ImportError': {
      if ((m = /no module named '([\w.]+)'/.exec(msg))) {
        const name = m[1]!;
        const lib = ctx.libraries?.find((l) => l.module === name);
        if (lib) return at(`\`${name}\` is a library, not part of MicroPython: add “${lib.title}” from Libraries (it goes in the project's lib folder), then run again.`);
        if (name === 'microbit' && kind !== 'microbit') return at(`\`microbit\` is the micro:bit's module; this project is for ${BOARD_NAME[kind]}. Its pins are in \`machine\`: \`from machine import Pin\`.`);
        if (name === 'RPi' || name === 'RPi.GPIO' || name === 'gpiozero') return at(`\`${name}\` is for a Raspberry Pi computer, not a microcontroller. MicroPython's pins are in \`machine\`: \`from machine import Pin\`.`);
        const near = closest(name, apiFor(ctx.board).keys());
        if (near) return at(`There is no module \`${name}\` on ${BOARD_NAME[kind]}. Did you mean \`${near}\`? Module names are lower-case.`);
        if (files[`${name}.py`] === undefined && files[`lib/${name}.py`] === undefined) return at(`There is no module \`${name}\` on ${BOARD_NAME[kind]} or in the project. Check its spelling; a library needs its .py file in the project's lib folder.`);
        break;
      }
      if ((m = /can't import name (\w+)/.exec(msg))) {
        const mod = /from\s+([\w.]+)\s+import/.exec(text)?.[1];
        const item = mod ? apiFor(ctx.board).get(mod) : undefined;
        const near = item ? closest(m[1]!, [...item.members.keys()]) : undefined;
        return at(`\`${mod ?? 'The module'}\` has no \`${m[1]}\`${on}.${near ? ` Did you mean \`${near}\`? Capitals count.` : ' Check the spelling and the capitals.'}`);
      }
      break;
    }

    case 'ValueError':
      if (/invalid syntax for integer with base (\d+)/.test(msg)) {
        const got = /: '(.*)'$/.exec(msg)?.[1];
        return at(`\`int(…)\`${on} got text that isn't a whole number${got !== undefined ? ` (\`'${got}'\`)` : ''} — empty, a decimal like \`'3.5'\`, or letters. Check what \`input()\` or the sensor gave; \`float(…)\` reads decimals.`);
      }
      if (/could not convert string to float/.test(msg)) return at(`\`float(…)\`${on} got text that isn't a number. Check what \`input()\` or the sensor gave.`);
      if (/invalid pin|Pin\(\d+\) doesn't exist|pin can only be/i.test(msg)) return at(`${BOARD_NAME[kind].replace(/^./, (c) => c.toUpperCase())} has no such pin${on}. Its pins are ${PINS[kind]!.all}.`);
      if (/doesn't have ADC capabilities|invalid pin for ADC|ADC/.test(msg)) return at(`That pin${on} can't read voltages. On ${BOARD_NAME[kind]}, the analog pins are ${PINS[kind]!.adc}.`);
      if ((m = /too many values to unpack \(expected (\d+)\)/.exec(msg))) return at(`The left of \`=\`${on} has ${m[1]} names, but the right gives more values than that. Give each value a name.`);
      if ((m = /need more than (\d+) values to unpack/.exec(msg))) return at(`The left of \`=\`${on} has more names than the ${m[1]} values on the right.`);
      if (/math domain error/.test(msg)) return at(`The maths${on} has no answer for that number — the square root or the log of a negative one, say.`);
      if (/empty separator/.test(msg)) return at(`\`split(…)\`${on} needs something to split at: \`split(',')\`, or \`split()\` for spaces.`);
      if (/arg is an empty sequence/.test(msg)) return at(`\`min\` or \`max\`${on} got an empty list: there's nothing to choose from.`);
      if (/substring not found/.test(msg)) return at(`The text looked for${on} isn't in the text. \`find(…)\` gives -1 instead of an error.`);
      if (/list\.remove\(x\): x not in list|object not in sequence/.test(msg)) return at(`What is removed or looked for${on} isn't in the list. Check first with \`if x in items:\`.`);
      if (/bad (TX|RX|SCK|MOSI|MISO|SCL|SDA) pin/.test(msg)) return at(`That pin${on} can't be ${/bad (\w+)/.exec(msg)![1]} for this bus: each UART, SPI or I²C has its own pins. The board's pin map shows them.`);
      return at(`A value${on} isn't one this call takes: ${msg || 'it is out of range'}. Check the numbers in its brackets.`);

    case 'ZeroDivisionError':
      return at(`Something${on} is divided by zero, which has no answer. Check the number first: \`if count != 0:\`.`);

    case 'IndexError':
      if ((m = /(list|string|tuple|bytes|bytearray) index out of range/.exec(msg)) || /index out of range/.test(msg)) {
        const what = m?.[1] === 'string' ? 'text' : m?.[1] ?? 'list';
        return at(`The index${on} asks for an item past the end of the ${what}. Items count from 0: one of 3 items has [0], [1] and [2]; \`len(…)\` says how many there are.`);
      }
      if (/pop from empty list/.test(msg)) return at(`\`pop()\`${on} takes from a list that is empty.`);
      break;

    case 'KeyError':
      return at(`The dictionary has no key ${msg ? `\`${msg}\`` : 'like that'}${on}. Check the spelling and capitals, or use \`d.get(key)\`, which gives \`None\` instead of an error.`);

    case 'OSError': {
      if (/EIO|Errno 5\b/.test(msg)) return at(`The device didn't answer${on}. Check its wires — power, GND, and SDA / SCL or the data pin — and that the address in the code is the one \`i2c.scan()\` finds.`);
      if (/ENODEV|Errno 19\b/.test(msg)) return at(`No device answered at that address${on}. \`i2c.scan()\` lists the addresses that answer; check the wires to SDA and SCL, and the power.`);
      if (/ETIMEDOUT|Errno 110\b/.test(msg)) return at(`The device didn't answer in time${on}. Check its data wire and its power; a DHT needs about 2 s between readings.`);
      if (/ENOENT|Errno 2\b/.test(msg)) return at(`There's no file by that name on the board${on}. Check its name — capitals count — and that it is in the project.`);
      if (/EEXIST|Errno 17\b/.test(msg)) return at(`A file or folder by that name is already there${on}.`);
      if (/ENOSPC|Errno 28\b/.test(msg)) return at(`The board's storage is full${on}.`);
      return at(`The board couldn't do what line ${n ?? '?'} asked (${msg || 'an OS error'}). Often a device that isn't wired right, or a file that isn't there.`);
    }

    case 'MemoryError':
      return at(`The board ran out of memory${on}: it has far less than a computer. A big list, a long text or a big number of bytes asks too much; make it smaller.`);

    case 'RuntimeError':
      if (/maximum recursion depth exceeded/.test(msg)) return at(`A function calls itself${on} again and again without stopping. It needs a case where it returns without calling itself.`);
      if (/schedule queue full/.test(msg)) return at(`Too many interrupts${on} came at once: keep the handler short.`);
      return at(`MicroPython stopped${on}: ${msg || 'a run-time error'}.`);

    case 'UnicodeError':
      return at(`Bytes that aren't text were turned into text${on}. From a UART this usually means the two ends' baud rates differ; \`print(data)\` shows the bytes.`);

    case 'StopIteration':
      return at(`\`next(…)\`${on} asked for one more item than there was.`);

    case 'AssertionError':
      return at(`The \`assert\`${on} found its condition \`False\`${msg ? `: ${msg}` : ''}.`);

    case 'NotImplementedError':
      return at(`${BOARD_NAME[kind].replace(/^./, (c) => c.toUpperCase())}'s MicroPython can't do this${on}${msg ? `: ${msg}` : ''}.`);

    case 'OverflowError':
      return at(`The number${on} is too big for where it goes${msg ? ` (${msg})` : ''} — a pin's duty, a byte (0–255) or a timer's period.`);

    case 'KeyboardInterrupt':
      return undefined;
  }
  return undefined;
}

function article(word: string): string {
  return /^[aeiouAEIOU]/.test(word) ? 'An' : 'A';
}

/** "a capital P" / "a small p": what differs between two spellings of a name. */
function capitalsOf(right: string, wrong: string): string {
  const c = [...right].find((ch, i) => ch !== wrong[i])!;   // they differ (only) in capitals
  return c === c.toUpperCase() ? `a capital **${c}**` : `a small **${c}**`;
}

/** What `import x as y` calls y. */
function aliasOf(code: string, alias: string): string | undefined {
  return new RegExp(`import\\s+(\\w+)\\s+as\\s+${alias}\\b`).exec(code)?.[1];
}

/** A SyntaxError: what is wrong with the line (or the one before it), if it is one of the usual slips. */
function syntax(lines: string[], n: number | undefined, on: string): string | undefined {
  if (!n) return undefined;
  const line = lines[n - 1] ?? '';
  const t = line.trim();
  const first = /^(\w+)/.exec(t)?.[1] ?? '';
  // a bracket still open after the lines before: MicroPython reports the next line
  let open = 0;
  let openedAt = 0;
  for (let i = 1; i < n; i++) {
    const was = open;
    open = Math.max(0, open + depth(lines[i - 1] ?? ''));
    if (was === 0 && open > 0) openedAt = i;
  }
  if (open > 0) return `A bracket opened on line ${openedAt} isn't closed — \`(\` needs its \`)\`, \`[\` its \`]\`. Python only notices on the line after.`;
  if (quotesOpen(line)) return `The text that starts with a quote${on} has no closing quote. Text goes between two of the same: \`'Hi'\` or \`"Hi"\`.`;
  if (depth(line) > 0) return `A bracket${on} isn't closed — \`(\` needs its \`)\`, \`[\` its \`]\`.`;
  if (depth(line) < 0) return `Line ${n} closes a bracket that isn't open.`;
  if (/^else\s+if\b/.test(t)) return `Python writes \`elif\`, not \`else if\`${on}.`;
  if (/^print\s+[^\s(=]/.test(t)) return `\`print\` needs brackets${on}: \`print("Hello")\`.`;
  if (KEYWORDS.includes(first) && /^\w+\s*=[^=]/.test(t)) return `\`${first}\` is one of Python's own words and can't be a name${on}. Pick another name.`;
  const slip = closest(first, BLOCK);
  if (slip && !BLOCK.includes(first) && first.length > 2 && t.endsWith(':')) return `\`${first}\`${on} isn't one of Python's words — did you mean \`${slip}\`?`;
  if (BLOCK.includes(first) && !t.endsWith(':') && !t.includes(':')) return `A line that starts with \`${first}\` ends with a colon \`:\`${on}: \`${t}:\`.`;
  if (/^(if|elif|while)\b/.test(first) && /[^=!<>]=[^=]/.test(t.replace(/^(\w+)/, ''))) return `To compare${on}, use \`==\`. A single \`=\` gives a name a value.`;
  if (/^\d/.test(t) && /^\d\w*\s*=/.test(t)) return `A name can't start with a digit${on}.`;
  const before = lines.slice(0, n - 1).reverse().find((l) => l.trim());
  if (before?.trimEnd().endsWith(':') && indentOf(line) <= indentOf(before)) return `Line ${n} should be indented: the line before it ends with \`:\`, so the lines that belong to it go 4 spaces in.`;
  if (/[^=!<>]=\s*$/.test(t)) return `Line ${n} gives a name a value, but nothing is after the \`=\`.`;
  return undefined;
}

const indentOf = (s: string) => /^\s*/.exec(s)![0].replace(/\t/g, '    ').length;

/** Open brackets left at the end of a line (outside its quotes); < 0 if it closes more. */
function depth(line: string): number {
  let d = 0;
  let q = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (q) { if (c === '\\') i++; else if (c === q) q = ''; continue; }
    if (c === '#') break;
    if (c === '"' || c === "'") q = c;
    else if ('([{'.includes(c)) d++;
    else if (')]}'.includes(c)) d--;
  }
  return d;
}

function quotesOpen(line: string): boolean {
  let q = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (q) { if (c === '\\') i++; else if (c === q) q = ''; continue; }
    if (c === '#') return false;
    if (c === '"' || c === "'") {
      if (line.slice(i, i + 3) === c.repeat(3)) return false;   // a triple-quoted text may go on
      q = c;
    }
  }
  return q !== '';
}
