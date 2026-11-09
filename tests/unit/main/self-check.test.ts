import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { selfCheck } from '../../../src/main/self-check';

/** M11 (Rev 13): the packaged app checks itself (MICROLAB_SELF_CHECK, run by scripts/package.ts), as OneEditor's: its
 *  Python runs and is 3.13, its runner and Jedi are there, its pages, and its updater loads. */
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function app() {
  const res = mkdtempSync(join(tmpdir(), 'ml-self-'));
  dirs.push(res);
  for (const f of ['python/bin/python3', 'python3/runner.py', 'python3/assist.py', 'python-tools/jedi/__init__.py', 'renderer/index.html', 'updates.json']) {
    mkdirSync(join(res, f, '..'), { recursive: true });
    writeFileSync(join(res, f), 'x');
  }
  return {
    res,
    deps: {
      python: join(res, 'python/bin/python3'), runner: join(res, 'python3/runner.py'), assist: join(res, 'python3/assist.py'),
      tools: join(res, 'python-tools'), renderer: join(res, 'renderer'), updatesFile: join(res, 'updates.json'),
      runPython: vi.fn(async () => '3.13.18'), loadUpdater: vi.fn(async () => ({})),
    },
  };
}

describe('the packaged app checks itself', () => {
  it('everything in place: ok, each part said', async () => {
    const { deps } = app();
    const r = await selfCheck(deps);
    expect(r.ok).toBe(true);
    expect(r.checks).toEqual({ python: 'Python 3.13.18', runner: true, help: true, jedi: true, pages: true, updates: true, updater: true });
  });

  it('a part missing, a Python that is not 3.13 or doesn\'t run, an updater that won\'t load: not ok, and why', async () => {
    const { res, deps } = app();
    rmSync(join(res, 'python3/assist.py'));
    deps.runPython = vi.fn(async () => '3.14.5');
    deps.loadUpdater = vi.fn(async () => { throw new Error('electron-updater has no autoUpdater'); });
    const r = await selfCheck(deps);
    expect(r.ok).toBe(false);
    expect(r.checks.help).toMatch(/missing/);
    expect(r.checks.python).toBe('Python 3.14.5, not the bundled 3.13');
    expect(r.checks.updater).toBe('electron-updater has no autoUpdater');
    deps.runPython = vi.fn(async () => { throw new Error('spawn ENOENT'); });
    expect((await selfCheck(deps)).checks.python).toBe("Python doesn't run: spawn ENOENT");
  });
});
