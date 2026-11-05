import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SettingsStore } from '../../../src/main/settings';

describe('M4.1 settings (panel widths and the like), kept in the app data folder', () => {
  const dirs: string[] = [];
  const dir = () => { const d = mkdtempSync(join(tmpdir(), 'microlab-settings-')); dirs.push(d); return d; };
  afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

  it('a value set is there after a restart (a new store on the same file)', () => {
    const file = join(dir(), 'settings.json');
    new SettingsStore(file).set('layout', { parts: 0.2, side: 0.3 });
    expect(new SettingsStore(file).get('layout')).toEqual({ parts: 0.2, side: 0.3 });
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ layout: { parts: 0.2, side: 0.3 } });
  });

  it('no file, or a broken one, is no settings — never a crash', () => {
    const d = dir();
    expect(new SettingsStore(join(d, 'none.json')).get('layout')).toBeUndefined();
    writeFileSync(join(d, 'bad.json'), '{ not json');
    expect(new SettingsStore(join(d, 'bad.json')).get('layout')).toBeUndefined();
  });
});
