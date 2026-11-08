import { describe, expect, it } from 'vitest';
import { closest, explain, type ErrorInfo } from '@lib/errors';

/** M9 slice 1 (screen 05), F-24: what an error means, for students — keyed on MicroPython's own texts (v1.29, as the
 *  boards and the simulator print them), about this line of this code on this board. */
const BLINK = 'from machine import Pin\nimport time\n\nled = Pin(15, Pin.OUT)\npin.on()\n';
const why = (e: ErrorInfo, main = BLINK, board = 'pico-w', extra: Record<string, string> = {}) =>
  explain(e, { files: { 'main.py': main, ...extra }, board, libraries: [{ module: 'ssd1306', title: 'SSD1306 OLED' }] });
const text = (e: Partial<ErrorInfo> & { type: string }, main?: string, board?: string) =>
  why({ message: '', file: 'main.py', line: 1, ...e }, main, board)?.text ?? '';

describe('M9 closest: a slip of the keys', () => {
  it('the same name but for capitals first; one or two letters off; nothing for a name far away', () => {
    expect(closest('pin', ['Pin', 'pins', 'led'])).toBe('Pin');
    expect(closest('sleep_m', ['sleep_ms', 'sleep_us', 'sleep'])).toBe('sleep_ms');
    expect(closest('lde', ['led'])).toBe('led');
    expect(closest('motor', ['led', 'Pin'])).toBeUndefined();
  });
});

describe('M9 NameError', () => {
  it('screen 05: pin on line 5 — names are case-sensitive, line 1 brings in Pin with a capital P; Go to line 5', () => {
    const e = why({ type: 'NameError', message: "name 'pin' isn't defined", file: 'main.py', line: 5 });
    expect(e).toMatchObject({ type: 'NameError', file: 'main.py', line: 5 });
    expect(e!.text).toBe("Python doesn't know the name `pin` on line 5. Names are case-sensitive — line 1 brings in `Pin`, with a capital **P**.");
  });

  it('a slip: did you mean led (made on line 4)?', () => {
    expect(text({ type: 'NameError', message: "name 'lde' isn't defined", line: 5 }, BLINK.replace('pin.on()', 'lde.on()'))).toContain('Did you mean `led` (made on line 4)?');
  });

  it('a module not imported; a name from a module not imported (Pin, sleep_ms)', () => {
    expect(text({ type: 'NameError', message: "name 'time' isn't defined" }, 'time.sleep(1)\n')).toContain('add `import time`');
    expect(text({ type: 'NameError', message: "name 'Pin' isn't defined" }, 'led = Pin(15)\n')).toContain('`from machine import Pin`');
    expect(text({ type: 'NameError', message: "name 'display' isn't defined" }, 'display.show(1)\n', 'microbit-v2')).toContain('`from microbit import display`');
  });

  it('used before it is made: made further down', () => {
    expect(text({ type: 'NameError', message: "name 'n' isn't defined", line: 1 }, 'print(n)\nn = 3\n')).toContain('it is made on line 2, further down');
  });

  it('a word meant as text: put it in quotes', () => {
    expect(text({ type: 'NameError', message: "name 'hello' isn't defined" }, 'print(hello)\n')).toContain("`'hello'`");
  });

  it('local variable referenced before assignment: global, in the function it names', () => {
    const code = 'count = 0\ndef add():\n    count = count + 1\nadd()\n';
    expect(text({ type: 'NameError', message: 'local variable referenced before assignment', line: 3 }, code)).toMatch(/\(`add`\).*`global`/);
  });
});

describe('M9 SyntaxError: what is wrong with the line', () => {
  const syn = (code: string, line: number) => text({ type: 'SyntaxError', message: 'invalid syntax', line }, code);
  it('a missing colon', () => expect(syn('x = 1\nif x > 0\n    print(x)\n', 2)).toContain('ends with a colon `:` on line 2: `if x > 0:`'));
  it('= in a condition', () => expect(syn('x = 1\nif x = 1:\n    pass\n', 2)).toContain('use `==`'));
  it('a bracket left open: Python notices on the line after', () => expect(syn('print((1 + 2)\nx = 3\n', 2)).toContain('A bracket opened on line 1 isn\'t closed'));
  it('a quote left open', () => expect(syn('print("hello)\n', 1)).toContain('no closing quote'));
  it('one of Python\'s words as a name', () => expect(syn('class = 3\n', 1)).toContain("`class` is one of Python's own words"));
  it('a block not indented', () => expect(syn('while True:\nprint(1)\n', 2)).toContain('should be indented'));
  it('else if, print without brackets, a misspelt while', () => {
    expect(syn('if a:\n    pass\nelse if b:\n    pass\n', 3)).toContain('`elif`');
    expect(syn('print "hi"\n', 1)).toContain('`print("Hello")`');
    expect(syn('whlie True:\n    pass\n', 1)).toContain('did you mean `while`?');
  });
  it('anything else: check brackets, quotes and colons', () => expect(syn('x = = 2\n', 1)).toContain("can't read line 1"));
});

describe('M9 IndentationError', () => {
  it('unexpected indent; unindent doesn\'t match', () => {
    expect(text({ type: 'IndentationError', message: 'unexpected indent', line: 2 }, 'x = 1\n  y = 2\n')).toContain('indented more than the line before');
    expect(text({ type: 'IndentationError', message: "unindent doesn't match any outer indent level", line: 3 }, 'if x:\n    a\n  b\n')).toContain("doesn't line up");
  });
});

describe('M9 TypeError', () => {
  it('text + a number: str(…) or an f-string', () => {
    const t = text({ type: 'TypeError', message: "unsupported types for __add__: 'str', 'int'" });
    expect(t).toContain("`+` on line 1 can't join text (a str) and a whole number (an int)");
    expect(t).toContain('`str(…)`');
  });
  it('another operator; None on one side', () => {
    expect(text({ type: 'TypeError', message: "unsupported types for __lt__: 'str', 'int'" })).toContain('`<`');
    expect(text({ type: 'TypeError', message: "unsupported types for __mul__: 'NoneType', 'int'" })).toContain('`None`');
  });
  it('too many arguments: self counts', () => expect(text({ type: 'TypeError', message: 'function takes 1 positional arguments but 2 were given' })).toContain('`self`'));
  it('None called, None subscripted', () => {
    expect(text({ type: 'TypeError', message: "'NoneType' object isn't callable" })).toContain('not a function');
    expect(text({ type: 'TypeError', message: "'NoneType' object isn't subscriptable" })).toContain('`[…]`');
  });
  it('a module\'s name given a value, then called', () => {
    expect(text({ type: 'TypeError', message: "'int' object isn't callable", line: 2 }, 'from time import sleep\nsleep = 5\nsleep(1)\n'.replace('sleep(1)', 'x') + 'sleep(1)\n')).toContain('not a function');
  });
  it('for over a number; a float index; text changed in place; len of a number', () => {
    expect(text({ type: 'TypeError', message: "'int' object isn't iterable" })).toContain('`for i in range(n):`');
    expect(text({ type: 'TypeError', message: 'list indices must be integers, not float' })).toContain('`//`');
    expect(text({ type: 'TypeError', message: "'str' object doesn't support item assignment" })).toContain("Text can't be changed in place");
    expect(text({ type: 'TypeError', message: "object of type 'int' has no len()" })).toContain('`len(str(n))`');
  });
  it('a float where a whole number goes (sleep_ms(0.5))', () => expect(text({ type: 'TypeError', message: "can't convert float to int" })).toContain('`sleep_ms(500)`'));
});

describe('M9 AttributeError', () => {
  it('a Pin has value, not values', () => {
    expect(text({ type: 'AttributeError', message: "'Pin' object has no attribute 'values'" })).toBe('A `Pin` has no `values` on line 1. It has `value`: did you mean that?');
  });
  it('time has no delay: sleep_ms; a misspelt module member', () => {
    expect(text({ type: 'AttributeError', message: "'module' object has no attribute 'delay'" }, 'import time\ntime.delay(1)\n'.split('\n').reverse().join('\n'))).toContain('`module` module');
    expect(text({ type: 'AttributeError', message: "'module' object has no attribute 'delay'", line: 2 }, 'import time\ntime.delay(1)\n')).toContain('Did you mean `time.sleep_ms`?');
    expect(text({ type: 'AttributeError', message: "'module' object has no attribute 'slep'", line: 2 }, 'import time\ntime.slep(1)\n')).toContain('`time.sleep`');
  });
  it('Pin.OUTPUT is Pin.OUT; None has nothing', () => {
    expect(text({ type: 'AttributeError', message: "type object 'Pin' has no attribute 'OUTPUT'" })).toContain('`Pin.OUT`');
    expect(text({ type: 'AttributeError', message: "'NoneType' object has no attribute 'on'" })).toContain('`None`');
  });
});

describe('M9 ImportError', () => {
  it('a library from the pack: add it from Libraries', () => expect(text({ type: 'ImportError', message: "no module named 'ssd1306'" })).toContain('add “SSD1306 OLED” from Libraries'));
  it('microbit on a Pico; RPi.GPIO; Machine for machine', () => {
    expect(text({ type: 'ImportError', message: "no module named 'microbit'" })).toContain('this project is for the Pico W');
    expect(text({ type: 'ImportError', message: "no module named 'RPi'" })).toContain('Raspberry Pi computer');
    expect(text({ type: 'ImportError', message: "no module named 'Machine'" })).toContain('Did you mean `machine`?');
  });
  it('a module nowhere: its .py in lib', () => expect(text({ type: 'ImportError', message: "no module named 'servo'" })).toContain('lib folder'));
  it('can\'t import name: the capitals', () => expect(text({ type: 'ImportError', message: "can't import name pin" }, 'from machine import pin\n')).toContain('Did you mean `Pin`?'));
});

describe('M9 ValueError, and the rest', () => {
  it('int() of text that isn\'t a number', () => expect(text({ type: 'ValueError', message: "invalid syntax for integer with base 10: 'abc'" })).toContain("(`'abc'`)"));
  it('a pin the board doesn\'t have; a pin that can\'t read voltages — each board\'s own', () => {
    expect(text({ type: 'ValueError', message: 'invalid pin' })).toContain('GP0 to GP28');
    expect(text({ type: 'ValueError', message: "Pin doesn't have ADC capabilities" })).toContain('GP26, GP27 and GP28');
    expect(text({ type: 'ValueError', message: "Pin doesn't have ADC capabilities" }, '', 'esp32-devkit-v1')).toContain('GPIO 32 to 39');
  });
  it('unpacking', () => expect(text({ type: 'ValueError', message: 'too many values to unpack (expected 2)' })).toContain('has 2 names'));
  it('divide by zero; an index past the end; a key not there', () => {
    expect(text({ type: 'ZeroDivisionError', message: 'divide by zero' })).toContain('divided by zero');
    expect(text({ type: 'IndexError', message: 'list index out of range' })).toContain('count from 0');
    expect(text({ type: 'IndexError', message: 'string index out of range' })).toContain('of the text');
    expect(text({ type: 'KeyError', message: "'x'" })).toContain('`d.get(key)`');
  });
  it('OSError: a device not answering, no device at the address, no file', () => {
    expect(text({ type: 'OSError', message: '[Errno 5] EIO' })).toContain('`i2c.scan()`');
    expect(text({ type: 'OSError', message: '[Errno 19] ENODEV' })).toContain('No device answered');
    expect(text({ type: 'OSError', message: '[Errno 2] ENOENT' })).toContain('no file by that name');
    expect(text({ type: 'OSError', message: '[Errno 110] ETIMEDOUT' })).toContain('in time');
  });
  it('memory, recursion, a garbled UART, an empty assert', () => {
    expect(text({ type: 'MemoryError', message: 'memory allocation failed, allocating 10000000 bytes' })).toContain('out of memory');
    expect(text({ type: 'RuntimeError', message: 'maximum recursion depth exceeded' })).toContain('calls itself');
    expect(text({ type: 'UnicodeError' })).toContain('baud rates');
    expect(text({ type: 'AssertionError' })).toContain('`assert`');
  });
  it('KeyboardInterrupt and the student\'s own exceptions aren\'t explained', () => {
    expect(why({ type: 'KeyboardInterrupt', message: '' })).toBeUndefined();
    expect(why({ type: 'MyError', message: 'boom' })).toBeUndefined();
  });
});

describe('M9 at the REPL (<stdin>)', () => {
  it('the line typed is the code; main.py\'s names count; no line to go to', () => {
    const e = explain({ type: 'NameError', message: "name 'Led' isn't defined", file: '<stdin>', line: 1 }, { files: { 'main.py': BLINK }, board: 'pico-w', typed: 'Led.on()' });
    expect(e!.text).toContain('`led`');
    expect(e!.line).toBeUndefined();
  });
});

describe('M9 the rest of what MicroPython says (each text from the simulator\'s own run)', () => {
  it('TypeError: None where a number goes, a str as an int, a float for-looped, a number subscripted, a tuple changed', () => {
    expect(text({ type: 'TypeError', message: "can't convert NoneType to int" })).toContain('where a number is needed');
    expect(text({ type: 'TypeError', message: "can't convert str to int" })).toContain('`int(…)`');
    expect(text({ type: 'TypeError', message: "'float' object isn't iterable" })).toContain('a decimal number (a float) has none');
    expect(text({ type: 'TypeError', message: "'int' object isn't subscriptable" })).toContain('has no items');
    expect(text({ type: 'TypeError', message: "'tuple' object doesn't support item assignment" })).toContain('use a list');
    expect(text({ type: 'TypeError', message: "unsupported types for __mul__: 'str', 'str'" })).toContain('`*`');
    expect(text({ type: 'TypeError', message: 'function missing 1 required positional arguments' })).toContain('1 more');
    expect(text({ type: 'TypeError', message: "unexpected keyword argument 'x'" })).toContain('`x`');
    expect(text({ type: 'TypeError', message: "'int' object isn't callable", line: 3 }, 'from time import sleep\nsleep = 5\nsleep(1)\n')).toContain('`sleep` was given a value');
    expect(why({ type: 'TypeError', message: 'something new' })).toBeUndefined();
  });
  it('ValueError: fewer values than names, an empty separator, not in the list, not in the text, an empty max, anything else', () => {
    expect(text({ type: 'ValueError', message: 'need more than 2 values to unpack' })).toContain('2 values on the right');
    expect(text({ type: 'ValueError', message: 'empty separator' })).toContain("`split(',')`");
    expect(text({ type: 'ValueError', message: 'object not in sequence' })).toContain('`if x in items:`');
    expect(text({ type: 'ValueError', message: 'substring not found' })).toContain('`find(…)`');
    expect(text({ type: 'ValueError', message: 'arg is an empty sequence' })).toContain('empty list');
    expect(text({ type: 'ValueError', message: 'math domain error' })).toContain('square root');
    expect(text({ type: 'ValueError', message: 'bad TX pin' })).toContain('TX');
    expect(text({ type: 'ValueError', message: 'could not convert string to float' })).toContain('`float(…)`');
    expect(text({ type: 'ValueError', message: 'char not in range(0x110000)' })).toContain('char not in range');
    expect(text({ type: 'ValueError', message: '' })).toContain('out of range');
  });
  it('a pin and the analog pins on the micro:bit', () => {
    expect(text({ type: 'ValueError', message: 'invalid pin' }, '', 'microbit-v2')).toContain('pin0 to pin16');
  });
  it('IndexError of an empty list\'s pop; OSError EEXIST, ENOSPC, any other; RuntimeError\'s queue and any other', () => {
    expect(text({ type: 'IndexError', message: 'pop from empty list' })).toContain('empty');
    expect(why({ type: 'IndexError', message: 'something new' })).toBeUndefined();
    expect(text({ type: 'OSError', message: '[Errno 17] EEXIST' })).toContain('already there');
    expect(text({ type: 'OSError', message: '[Errno 28] ENOSPC' })).toContain('full');
    expect(text({ type: 'OSError', message: '[Errno 1] EPERM' })).toContain('EPERM');
    expect(text({ type: 'RuntimeError', message: 'schedule queue full' })).toContain('handler short');
    expect(text({ type: 'RuntimeError', message: 'oops' })).toContain('oops');
  });
  it('StopIteration, NotImplementedError, OverflowError', () => {
    expect(text({ type: 'StopIteration' })).toContain('`next(…)`');
    expect(text({ type: 'NotImplementedError', message: 'no' })).toContain("The Pico W's MicroPython can't do this on line 1: no.");
    expect(text({ type: 'OverflowError', message: 'overflow converting long int to machine word' })).toContain('too big');
  });
  it('AttributeError: a module by its alias; a class not in the catalogue; a list\'s method; text\'s; another message', () => {
    expect(text({ type: 'AttributeError', message: "'module' object has no attribute 'slep'", line: 2 }, 'import time as t\nt.slep(1)\n')).toContain('`t.sleep`');
    expect(text({ type: 'AttributeError', message: "'Robot' object has no attribute 'go'" })).toContain('list what it has');
    expect(text({ type: 'AttributeError', message: "'list' object has no attribute 'add'" })).toContain('list what it has');
    expect(text({ type: 'AttributeError', message: "'list' object has no attribute 'apend'" })).toContain('`append`');
    expect(text({ type: 'AttributeError', message: "'str' object has no attribute 'uper'" })).toContain('`upper`');
    expect(text({ type: 'AttributeError', message: "type object 'Pin' has no attribute 'PULLUP'" })).toContain('`Pin.PULL_UP`');
    expect(text({ type: 'AttributeError', message: "'module' object has no attribute 'zzz'", line: 2 }, 'import time\ntime.zzz()\n')).toContain('list what it has');
    expect(why({ type: 'AttributeError', message: 'something new' })).toBeUndefined();
  });
  it('ImportError: the project\'s own module (it is there: not explained), can\'t import from an unknown module, another message', () => {
    expect(why({ type: 'ImportError', message: "no module named 'util'", file: 'main.py', line: 1 }, 'import util\n', 'pico-w', { 'util.py': 'x = 1\n' })).toBeUndefined();
    expect(text({ type: 'ImportError', message: "can't import name foo" }, 'from mystery import foo\n')).toContain('Check the spelling');
    expect(why({ type: 'ImportError', message: 'something new' })).toBeUndefined();
  });
  it('NameError: a capital where a small one goes (Print), a slip of Python\'s own name (pirnt), a message not known', () => {
    expect(text({ type: 'NameError', message: "name 'Print' isn't defined" }, 'Print(1)\n')).toContain('Python has `print`, with a small **p**');
    expect(text({ type: 'NameError', message: "name 'pirnt' isn't defined" }, 'pirnt(1)\n')).toContain('Did you mean `print`?');
    expect(why({ type: 'NameError', message: 'something new' })).toBeUndefined();
  });
  it('SyntaxError: a closing bracket too many; a number as a name; = with nothing after; no line', () => {
    expect(text({ type: 'SyntaxError', message: 'invalid syntax', line: 1 }, 'x = (1))\n')).toContain('closes a bracket');
    expect(text({ type: 'SyntaxError', message: 'invalid syntax', line: 1 }, '2x = 1\n')).toContain('start with a digit');
    expect(text({ type: 'SyntaxError', message: 'invalid syntax', line: 1 }, 'x =\n')).toContain('nothing is after');
    expect(text({ type: 'SyntaxError', message: 'invalid syntax', line: 2 }, 'x = 1\nprint(x.)\n')).toContain("can't read line 2");
    expect(why({ type: 'SyntaxError', message: 'invalid syntax' })!.text).toContain("can't read line ?");
    expect(text({ type: 'SyntaxError', message: 'invalid syntax', line: 1 }, "s = 'it\\'s' + (\n")).toContain('isn\'t closed');
    expect(text({ type: 'SyntaxError', message: 'invalid syntax', line: 1 }, 'x = """a\n')).toContain("can't read");
  });
  it('IndentationError: tabs and spaces mixed; another message', () => {
    expect(text({ type: 'IndentationError', message: "unindent doesn't match any outer indent level", line: 3 }, 'if x:\n\ta\n  b\n')).toContain('mixes tabs and spaces');
    expect(why({ type: 'IndentationError', message: 'something new' })).toBeUndefined();
  });
  it('a binary file is passed over; an error in another file goes to that file', () => {
    const e = explain({ type: 'ZeroDivisionError', message: 'divide by zero', file: 'lib/util.py', line: 2 }, { files: { 'main.py': 'import util\n', 'lib/util.py': 'a = 1\nb = a / 0\n', 'img.bin': new Uint8Array([1]) }, board: 'pico-w' });
    expect(e).toMatchObject({ file: 'lib/util.py', line: 2 });
  });
});
