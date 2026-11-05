import { describe, expect, it } from 'vitest';
import { parseTraceback, runProject } from '../../../src/sim/run';
import { Console, type LoadMicroPython, type MicroPython } from '../../../src/sim/vm';

describe('M2.1 parseTraceback', () => {
  it('takes the type and message from the last line, the file and line from the innermost frame', () => {
    expect(parseTraceback('Traceback (most recent call last):\n  File "main.py", line 4, in <module>\n  File "/lib/a.py", line 9, in f\nValueError: invalid pin\n'))
      .toEqual({ type: 'ValueError', message: 'invalid pin', file: 'lib/a.py', line: 9 });
  });
  it('a dotted type, no frames, no message', () => {
    expect(parseTraceback('ure.error\n')).toEqual({ type: 'ure.error', message: '' });
  });
  it('something that is not a traceback at all is kept as the message', () => {
    expect(parseTraceback('!! the VM crashed')).toEqual({ type: 'Error', message: '!! the VM crashed' });
  });
});

describe('M2.1 Console', () => {
  const bytes = (s: string) => new TextEncoder().encode(s);
  it('decodes UTF-8 split across writes, and hands text over at newlines and at flush', () => {
    const got: string[] = [];
    const c = new Console((t) => got.push(t));
    const deg = bytes('°');
    c.write(deg.slice(0, 1));   // half a character: nothing yet
    c.write(deg.slice(1));
    c.write(bytes('C\nnext'));
    expect(got).toEqual(['°C\nnext']);
    c.flush();
    c.flush();   // nothing pending: nothing sent
    expect(got).toEqual(['°C\nnext']);
    expect(c.output).toBe('°C\nnext');
  });
  it('line ends are \\n: a cooked \\r\\n from MicroPython reads as one', () => {
    const c = new Console();
    c.write(bytes('Traceback\r\n  File "main.py"\r'));
    c.write(bytes('\n'));
    expect(c.output).toBe('Traceback\n  File "main.py"\n');
  });
  it('works with no listener', () => {
    const c = new Console();
    c.write(bytes('a\n'));
    c.flush();
    expect(c.output).toBe('a\n');
  });
});

describe('M2.1 runProject when Python fails outside the student\'s code', () => {
  const fake = (fail: string): LoadMicroPython => async () => ({
    runPython: (code: string) => { if (code.includes('setup')) throw new Error(fail); },
    registerJsModule: () => {},
    pyimport: () => Object.assign(() => undefined, { last: 'done\n' }),
    FS: { mkdir: () => {}, writeFile: () => {}, readdir: () => [] },
    _module: { _mp_sched_keyboard_interrupt: () => {} },
  }) as unknown as MicroPython;

  it('Stop landing in the runner still ends as stopped', async () => {
    expect(await runProject(fake('PythonError: KeyboardInterrupt'), { files: { 'main.py': '' } })).toEqual({ output: '', trace: [], pwm: [], analog: [], display: [], sound: [], bus: [], parts: [], ended: 'stopped' });
  });
  it('anything else is an error, with the text kept', async () => {
    const r = await runProject(fake('PythonError: MemoryError'), { files: {} });
    expect(r.ended).toBe('error');
    expect(r.error?.message).toContain('MemoryError');
  });
});
