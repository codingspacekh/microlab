import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PART_KINDS } from '@lib/editor';
import { addLibrary, filesFor, isAdded, licencePath, librariesFor, needsOf, parsePack, wouldReplace } from '@lib/libpack';
import { addFile, newProject } from '@lib/project';
import json from '../../../library/lib-pack/pack.json';

/** M6.7 (F-54): the library pack — each driver as its authors wrote it, with its licence; Add library's files. */
const ROOT = join(process.cwd(), 'library/lib-pack');
const pack = parsePack(json);
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8');
const sha = (f: string) => createHash('sha256').update(readFileSync(join(ROOT, f))).digest('hex');
const lib = (id: string) => pack.libraries.find((l) => l.id === id)!;
const LICENCE_TEXT = { MIT: /MIT License/, 'Apache-2.0': /Apache License\s+Version 2\.0/, 'BSD-3-Clause': /BSD 3-Clause License/ };

describe('M6.7 the library pack, as shipped', () => {
  it('has the drivers the M6 parts need', () => {
    expect(pack.libraries.map((l) => l.id).sort()).toEqual(['bmp280', 'ds1302', 'hcsr04', 'max30102', 'mpu6050', 'rotary', 'vl53l0x']);
  });

  it.each(pack.libraries.map((l) => [l.id, l] as const))('%s: its files unchanged from its source, its licence beside them', (id, l) => {
    const listed = new Set([...Object.keys(l.files), ...Object.values(l.boardFiles ?? {}).flatMap((f) => Object.keys(f))]);
    expect(Object.keys(l.sha256).sort()).toEqual([...listed].sort());
    for (const [f, hash] of Object.entries(l.sha256)) expect(sha(`${id}/${f}`), f).toBe(hash);
    expect(read(`${id}/LICENSE`)).toMatch(LICENCE_TEXT[l.licence]);
    // nothing in its folder that pack.json doesn't list
    const onDisk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? onDisk(join(dir, e.name)) : [relative(join(ROOT, id), join(dir, e.name))]));
    expect(onDisk(join(ROOT, id)).sort()).toEqual([...listed, 'LICENSE'].sort());
    expect(read('LICENCES.md')).toContain(`[${l.source.split('github.com/')[1]}](${l.source}/tree/${l.commit})`);
  });

  it('its parts are parts of the editor; each runs on the boards it says, with a way to start on each', () => {
    const types = new Set<string>(PART_KINDS.map((k) => k.type));
    for (const l of pack.libraries) {
      for (const p of l.parts) expect(types.has(p), `${l.id}: ${p}`).toBe(true);
      expect(Object.keys(l.use).sort()).toEqual([...l.boards].sort());
    }
    for (const b of pack.builtIn) for (const p of b.parts) expect(types.has(p), p).toBe(true);
  });

  it('an example that brings a driver of the pack brings the pack\'s file', () => {
    const ex = join(process.cwd(), 'library/examples');
    for (const l of pack.libraries) {
      for (const board of l.boards) {
        for (const [from, to] of filesFor(l, board).slice(0, -1)) {
          for (const id of readdirSync(ex)) {
            const f = join(ex, id, board, 'files', to);
            if (existsSync(f)) expect(readFileSync(f, 'utf8'), `${id}/${board}/${to}`).toBe(read(from));
          }
        }
      }
    }
  });
});

describe('M6.7 what a part needs, and Add library', () => {
  it('the rotary library brings the board\'s own interrupt file; every library its licence as lib/LICENSE-<id>.txt', () => {
    expect(filesFor(lib('rotary'), 'pico-w').map(([, to]) => to)).toEqual(['lib/rotary.py', 'lib/rotary_irq_rp2.py', 'lib/LICENSE-rotary.txt']);
    expect(filesFor(lib('rotary'), 'esp32-devkit-v1').map(([, to]) => to)).toEqual(['lib/rotary.py', 'lib/rotary_irq_esp.py', 'lib/LICENSE-rotary.txt']);
    expect(filesFor(lib('max30102'), 'pico-w').map(([, to]) => to)).toEqual(['lib/max30102/__init__.py', 'lib/max30102/circular_buffer.py', 'lib/LICENSE-max30102.txt']);
  });

  it('a part says what it needs on the board: a library, MicroPython\'s own module, or nothing', () => {
    expect(needsOf(pack, 'hc-sr04', 'pico-w')).toMatchObject({ kind: 'library', library: { id: 'hcsr04' } });
    expect(needsOf(pack, 'dht', 'esp32-devkit-v1')).toMatchObject({ kind: 'built-in', modules: ['dht'] });
    expect(needsOf(pack, 'ds18b20', 'pico-w')).toMatchObject({ kind: 'built-in', modules: ['onewire', 'ds18x20'] });
    expect(needsOf(pack, 'hc-sr04', 'microbit-v2')).toBeNull();
    expect(needsOf(pack, 'button', 'pico-w')).toBeNull();
    expect(librariesFor(pack, 'microbit-v2')).toEqual([]);
  });

  it('Add library puts its files in lib/; a file of the same name changed by the student is named first', () => {
    const doc = newProject('pico-w');
    const added = addLibrary(doc, lib('bmp280'), read);
    expect(added.files['lib/bmp280.py']).toBe(read('bmp280/bmp280.py'));
    expect(added.files[licencePath(lib('bmp280'))]).toMatch(/MIT License/);
    expect(added.files['main.py']).toBe(doc.files['main.py']);
    expect(isAdded(doc, lib('bmp280'), read)).toBe(false);
    expect(isAdded(added, lib('bmp280'), read)).toBe(true);
    expect(wouldReplace(added, lib('bmp280'), read)).toEqual([]);
    expect(wouldReplace(addFile(doc, 'lib/bmp280.py', '# mine'), lib('bmp280'), read)).toEqual(['lib/bmp280.py']);
  });
});
