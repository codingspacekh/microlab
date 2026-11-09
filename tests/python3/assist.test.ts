import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Assistant, findTools } from '../../src/main/python3/assist';
import { findPython, startPython } from '../../src/main/python3/session';

/**
 * M12 slice 5b (F-97): help while typing, from Jedi in its own process (src/python3/assist.py) — Python's modules,
 * the file's names, the libraries installed in MicroLab; a call's arguments. Jedi and parso come from
 * `npm run fetch:python` (vendor/python-tools, checked by hash); never on the student's program's path.
 */
const python = findPython();
const tools = findTools();
const libs = mkdtempSync(join(tmpdir(), 'ml-assist-libs-'));
mkdirSync(join(libs, 'greet'));
writeFileSync(join(libs, 'greet', '__init__.py'), 'def hello(name, times=1):\n    """Says hello to someone, for MicroLab\'s tests."""\n    return name\n');
const assistant = new Assistant({ python, tools, libs });
afterAll(() => { assistant.dispose(); rmSync(libs, { recursive: true, force: true }); });

const at = (code: string) => {
  const lines = code.split('\n');
  return { code, line: lines.length, column: lines.at(-1)!.length, path: join(tmpdir(), 'main.py') };
};

describe('Jedi, as the editor asks it', () => {
  it('Jedi is there: `npm run fetch:python -- --tools` fetched it into vendor/python-tools', () => {
    expect(tools, 'run: npm run fetch:python -- --tools').toBeDefined();
    expect(assistant.available).toBe(true);
  });

  it('a module\'s names after a dot, each with its signature and explanation; a call with arguments', async () => {
    const found = await assistant.complete(at('import turtle\nturtle.fo'));
    const forward = found.find((c) => c.name === 'forward');
    expect(forward).toMatchObject({ type: 'function', call: 'args' });
    expect(forward!.doc).toMatch(/^forward\(distance\)\n.*Move the turtle forward/s);
  });

  it('Python\'s modules to import; the file\'s own names; Python\'s words', async () => {
    expect((await assistant.complete(at('import tur'))).map((c) => c.name)).toContain('turtle');
    expect(await assistant.complete(at('score = 0\nsco'))).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'score', type: 'variable' })]));
    expect((await assistant.complete(at('whi'))).find((c) => c.name === 'while')).toMatchObject({ type: 'keyword' });
  });

  it('a library installed in MicroLab\'s folder completes, with its explanation', async () => {
    expect((await assistant.complete(at('import gre'))).map((c) => c.name)).toContain('greet');
    const hello = (await assistant.complete(at('import greet\ngreet.he'))).find((c) => c.name === 'hello');
    expect(hello).toMatchObject({ type: 'function', call: 'args' });
    expect(hello!.doc).toMatch(/hello\(name, times=1\)\nSays hello to someone/);
  });

  it('a module\'s own _names only when _ is typed', async () => {
    const names = (await assistant.complete(at('import random\nrandom.'))).map((c) => c.name);
    expect(names).toContain('randint');
    expect(names.some((n) => n.startsWith('_'))).toBe(false);
  });

  it('a call\'s arguments, the one being typed', async () => {
    expect(await assistant.signature(at('import turtle\nturtle.goto('))).toMatchObject({ name: 'goto', params: ['x', 'y=None'], active: 0 });
    expect(await assistant.signature(at('import turtle\nturtle.goto(10, '))).toMatchObject({ active: 1 });
    expect(await assistant.signature(at('x = 1'))).toBeNull();
  });

  it('half-typed code: nothing, never a crash; then it answers again; quickly once warm', async () => {
    expect(await assistant.complete(at('def (:\n    ))'))).toEqual(expect.any(Array));
    const t = Date.now();
    expect((await assistant.complete(at('import math\nmath.sq'))).map((c) => c.name)).toContain('sqrt');
    expect(Date.now() - t).toBeLessThan(1500);
  });
});

describe('Jedi kept apart', () => {
  it('not on the student\'s program\'s path', async () => {
    const s = startPython({ python, libs });
    let err = '';
    s.on((e) => { if ('err' in e) err += e.err; });
    s.run({ code: 'import jedi\n', file: 'main.py', cwd: tmpdir() });
    expect(await s.ended()).toMatchObject({ ended: 'error', error: { type: 'ModuleNotFoundError' } });
    s.kill();
    expect(err).toMatch(/No module named 'jedi'/);
  });

  it('without Jedi (not fetched): nothing offered, at once — the editor has the file\'s names still', async () => {
    const none = new Assistant({ python, tools: undefined, libs });
    expect(none.available).toBe(false);
    expect(await none.complete(at('import tur'))).toEqual([]);
    expect(await none.signature(at('print('))).toBeNull();
  });
});
