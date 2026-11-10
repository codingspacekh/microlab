import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Assistant, findAssist, findTools } from '../../src/main/python3/assist';
import { findPython } from '../../src/main/python3/session';

/**
 * M12 slice 5b (F-97): the helper's process as the main process keeps it — started when first asked, answers matched
 * to their questions, nothing when it is gone or too slow, started again after. A stand-in helper (written here, in
 * the computer's Python) answers as assist.py does, so this runs without Jedi.
 */
const python = findPython();
const dir = mkdtempSync(join(tmpdir(), 'ml-assist-proc-'));
afterAll(() => rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }));
const tools = join(dir, 'tools');
mkdirSync(join(tools, 'jedi'), { recursive: true });
const helper = join(dir, 'helper.py');
writeFileSync(helper, [
  'import json, sys, time',
  'print(json.dumps({"ready": True}), flush=True)',
  'for line in sys.stdin:',
  '    q = json.loads(line)',
  '    if "complete" in q:',
  '        c = q["complete"]',
  '        if c["code"] == "die": sys.exit(1)',
  '        if c["code"] == "slow": time.sleep(2)',
  '        print("not json", flush=True)',
  '        print(json.dumps({"id": q["id"], "completions": [{"name": c["code"] + "!", "type": "variable"}]}), flush=True)',
  '    else:',
  '        print(json.dumps({"id": q["id"], "signature": {"name": "f", "params": ["x"], "active": 0, "doc": ""}}), flush=True)',
].join('\n'));
const at = (code: string) => ({ code, line: 1, column: code.length, path: 'main.py' });

describe('the helper\'s process', () => {
  it('answers each question with its own answer, several asked at once', async () => {
    const a = new Assistant({ python, tools, libs: dir, script: helper });
    const [x, y, s] = await Promise.all([a.complete(at('x')), a.complete(at('y')), a.signature(at('f('))]);
    expect(x).toEqual([{ name: 'x!', type: 'variable' }]);
    expect(y).toEqual([{ name: 'y!', type: 'variable' }]);
    expect(s).toEqual({ name: 'f', params: ['x'], active: 0, doc: '' });
    a.dispose();
  });

  it('gone: nothing; the next question starts it again', async () => {
    const a = new Assistant({ python, tools, libs: dir, script: helper });
    expect(await a.complete(at('die'))).toEqual([]);
    expect(await a.complete(at('back'))).toEqual([{ name: 'back!', type: 'variable' }]);
    a.dispose();
    expect(await a.complete(at('again'))).toEqual([{ name: 'again!', type: 'variable' }]);   // disposed (a library installed): started anew
    a.dispose();
  });

  it('too slow: nothing, and typing never waits for it', async () => {
    const a = new Assistant({ python, tools, libs: dir, script: helper, timeoutMs: 300 });
    const t = Date.now();
    expect(await a.complete(at('slow'))).toEqual([]);
    expect(Date.now() - t).toBeLessThan(1500);
    a.dispose();
  });

  it('a Python that can\'t start: nothing', async () => {
    const a = new Assistant({ python: join(dir, 'no-python'), tools, libs: dir, script: helper });
    expect(await a.complete(at('x'))).toEqual([]);
    expect(await a.signature(at('f('))).toBeNull();
  });
});

describe('finding Jedi and the helper', () => {
  it('Jedi in the app\'s resources, else vendor/python-tools; undefined when not fetched', () => {
    const res = join(dir, 'res');
    mkdirSync(join(res, 'python-tools', 'jedi'), { recursive: true });
    expect(findTools(res, join(dir, 'nowhere'))).toBe(join(res, 'python-tools'));
    mkdirSync(join(dir, 'src', 'vendor', 'python-tools', 'jedi'), { recursive: true });
    expect(findTools('', join(dir, 'src'))).toBe(join(dir, 'src', 'vendor', 'python-tools'));
    expect(findTools('', join(dir, 'nowhere'))).toBeUndefined();
  });

  it('the helper shipped in the app\'s resources, else the source tree\'s', () => {
    const res = join(dir, 'res2');
    mkdirSync(join(res, 'python3'), { recursive: true });
    writeFileSync(join(res, 'python3', 'assist.py'), '');
    expect(findAssist(res, '/src')).toBe(join(res, 'python3', 'assist.py'));
    expect(findAssist('', '/src')).toBe(join('/src', 'src', 'python3', 'assist.py'));
  });
});
