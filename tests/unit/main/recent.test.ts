import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newProject } from '@lib/project';
import { Recent, Recovery } from '../../../src/main/recent';
import { SettingsStore } from '../../../src/main/settings';

/** M5.7 F-05 recent projects (screen 01); F-03 autosave and crash recovery — on real folders. */
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'microlab-recent-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('M5.7 F-05 recent projects', () => {
  const at = (h: number) => Date.UTC(2026, 10, 7, h);
  const file = (name: string) => { const p = join(dir, `${name}.mlab`); writeFileSync(p, 'x'); return p; };

  it('newest first, each once, at most 8; kept in the settings', () => {
    const settings = new SettingsStore(join(dir, 'settings.json'));
    const r = new Recent(settings, dir);
    const a = file('Blink');
    const b = file('Night light');
    r.add({ path: a, name: 'Blink', board: 'pico-w' }, at(9));
    r.add({ path: b, name: 'Night light', board: 'microbit-v2' }, at(10));
    r.add({ path: a, name: 'Blink', board: 'pico-w' }, at(11));
    expect(r.list().map((e) => [e.name, e.at])).toEqual([['Blink', at(11)], ['Night light', at(10)]]);
    for (let i = 0; i < 10; i++) r.add({ path: file(`p${i}`), name: `p${i}`, board: 'pico-w' }, at(12 + i));
    expect(r.list()).toHaveLength(8);
    expect(new Recent(new SettingsStore(join(dir, 'settings.json')), dir).list()[0]!.name).toBe('p9');
  });

  it('where it is, from the home folder; a file that is gone is marked so', () => {
    const r = new Recent(new SettingsStore(join(dir, 'settings.json')), dir);
    const a = file('Blink');
    r.add({ path: a, name: 'Blink', board: 'pico-w' }, at(9));
    r.add({ path: join(dir, 'gone.mlab'), name: 'gone', board: 'pico-w' }, at(10));
    expect(r.list()).toEqual([
      { path: join(dir, 'gone.mlab'), name: 'gone', board: 'pico-w', at: at(10), where: 'gone.mlab', missing: true },
      { path: a, name: 'Blink', board: 'pico-w', at: at(9), where: 'Blink.mlab', missing: false },
    ]);
    r.forget(join(dir, 'gone.mlab'));
    expect(r.list().map((e) => e.name)).toEqual(['Blink']);
  });

  it('a broken list in the settings is no list', () => {
    const settings = new SettingsStore(join(dir, 'settings.json'));
    settings.set('recent', [{ path: 3 }, 'x', null]);
    expect(new Recent(settings, dir).list()).toEqual([]);
  });
});

describe('M5.7 F-03 the recovery copy', () => {
  it('written whole, read back as it was, with its name, file and time; cleared', async () => {
    const r = new Recovery(join(dir, 'recovery'));
    expect(await r.get()).toBeNull();
    const doc = newProject('microbit-v2');
    doc.files['main.py'] = 'print("unsaved")\n';
    await r.write(doc, { name: 'Night light', path: '/Users/x/Night light.mlab' }, 1234);
    const back = (await r.get())!;
    expect(back.name).toBe('Night light');
    expect(back.path).toBe('/Users/x/Night light.mlab');
    expect(back.at).toBe(1234);
    expect(back.doc.files['main.py']).toBe('print("unsaved")\n');
    expect(back.doc.project).toEqual(doc.project);
    await r.clear();
    expect(await r.get()).toBeNull();
    expect(existsSync(join(dir, 'recovery'))).toBe(true);
  });

  it('a project never saved has no file; a damaged copy is no copy', async () => {
    const r = new Recovery(join(dir, 'recovery'));
    await r.write(newProject('pico-w'), { name: 'Untitled project' }, 1);
    expect((await r.get())!.path).toBeUndefined();
    writeFileSync(join(dir, 'recovery', 'project.mlab'), 'not a zip');
    expect(await r.get()).toBeNull();
  });
});
