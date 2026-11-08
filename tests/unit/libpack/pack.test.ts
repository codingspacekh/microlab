import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PART_KINDS } from '@lib/editor';
import { addLibrary, buildFor, filesFor, isAdded, licencePath, librariesFor, needsOf, parsePack, wouldReplace } from '@lib/libpack';
import { addFile, newProject } from '@lib/project';
import json from '../../../library/lib-pack/pack.json';

/** M6.7 (F-54): the library pack — each driver as its authors wrote it, with its licence; Add library's files. */
const ROOT = join(process.cwd(), 'library/lib-pack');
const pack = parsePack(json);
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8');
const sha = (f: string) => createHash('sha256').update(readFileSync(join(ROOT, f))).digest('hex');
const lib = (id: string) => pack.libraries.find((l) => l.id === id)!;
const LICENCE_TEXT = { MIT: /MIT License/, 'Apache-2.0': /Apache License\s+Version 2\.0/, 'BSD-3-Clause': /BSD 3-Clause License/ };

const OWN_EVERYWHERE = new Set(['mfrc522']);

describe('M6.7 the library pack, as shipped', () => {
  it('has the drivers the M6 and M7 parts need', () => {
    expect(pack.libraries.map((l) => l.id).sort()).toEqual(['bmp280', 'ds1302', 'hcsr04', 'lcd', 'max30102', 'max7219', 'mfrc522', 'micropygps', 'mpu6050', 'rotary', 'ssd1306', 'tm1637', 'vl53l0x']);
  });

  it.each(pack.libraries.map((l) => [l.id, l] as const))('%s: upstream files unchanged with their licence; the micro:bit\'s own with its notice', (id, l) => {
    const listed = new Set<string>(l.builds.some((b) => b.licenceFile) ? ['LICENSE'] : []);   // the RC522's is all MicroLab's
    for (const b of l.builds) {
      const mine = [...Object.keys(b.files), ...Object.values(b.boardFiles ?? {}).flatMap((f) => Object.keys(f))];
      mine.forEach((f) => listed.add(f));
      if (b.commit) {   // a driver people already use, as its authors wrote it
        expect(Object.keys(b.sha256 ?? {}).sort()).toEqual([...mine].sort());
        for (const [f, hash] of Object.entries(b.sha256!)) expect(sha(`${id}/${f}`), f).toBe(hash);
        expect(b.licenceFile).toBe('LICENSE');
        expect(read(`${id}/LICENSE`)).toMatch(LICENCE_TEXT[b.licence]);
        expect(read('LICENCES.md')).toContain(`[${b.source!.split('github.com/')[1]}](${b.source}/tree/${b.commit})`);
      } else {   // MicroLab's own: the MIT notice is in each file
        expect(b.licence).toBe('MIT');
        expect(b.licenceFile).toBeNull();
        for (const f of mine) expect(read(`${id}/${f}`), f).toMatch(/^(# .*\n)+# MIT License\. Copyright \(c\) 2026 MicroLab\./);
      }
      expect(Object.keys(b.use).sort()).toEqual([...b.boards].sort());
    }
    // nothing in its folder that pack.json doesn't list
    const onDisk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? onDisk(join(dir, e.name)) : [relative(join(ROOT, id), join(dir, e.name))]));
    expect(onDisk(join(ROOT, id)).sort()).toEqual([...listed].sort());
  });

  it('every library runs on every board: upstream on the Pico W and the ESP32, MicroLab\'s on the micro:bit, small', () => {
    for (const l of pack.libraries) {
      // the RC522's: MicroLab's own everywhere — the driver people use builds its SPI bytes with b'%c' % v, two bytes
      // from 0x80 on MicroPython 1.29, and calls SPI() with no id on the ESP32 (LICENCES.md)
      if (OWN_EVERYWHERE.has(l.id)) expect(buildFor(l, 'pico-w')?.authors, l.id).toBe('MicroLab');
      else {
        expect(buildFor(l, 'pico-w')?.commit, l.id).toBeDefined();
        expect(buildFor(l, 'esp32-devkit-v1')?.commit, l.id).toBeDefined();
      }
      const mb = buildFor(l, 'microbit-v2')!;
      expect(mb.authors).toBe('MicroLab');
      const size = filesFor(l, 'microbit-v2').reduce((n, [from]) => n + read(from).length, 0);
      // of the micro:bit's ~20 KB; a display's drawing calls and 8×8 letters (768 bytes) take more (M7 slice 2)
      expect(size, l.id).toBeLessThan((['ssd1306', 'max7219', 'mfrc522'].includes(l.id) ? 7 : 4) * 1024);   // the RC522's: a whole protocol
      for (const [, to] of filesFor(l, 'microbit-v2')) expect(to, 'no folders on the micro:bit').not.toContain('/');
    }
  });

  it('its parts are parts of the editor', () => {
    const types = new Set<string>(PART_KINDS.map((k) => k.type));
    for (const l of pack.libraries) for (const p of l.parts) expect(types.has(p), `${l.id}: ${p}`).toBe(true);
    for (const b of pack.builtIn) for (const p of b.parts) expect(types.has(p), p).toBe(true);
  });

  it('an example that brings a driver of the pack brings the pack\'s file', () => {
    const ex = join(process.cwd(), 'library/examples');
    for (const l of pack.libraries) {
      for (const board of l.builds.flatMap((b) => b.boards)) {
        for (const [from, to] of filesFor(l, board).filter(([, t]) => !t.includes('LICENSE-'))) {
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
    expect(needsOf(pack, 'hc-sr04', 'microbit-v2')).toMatchObject({ kind: 'library', library: { id: 'hcsr04' } });
    expect(needsOf(pack, 'dht', 'microbit-v2')).toBeNull();
    expect(needsOf(pack, 'button', 'pico-w')).toBeNull();
    expect(librariesFor(pack, 'microbit-v2')).toHaveLength(13);
    expect(needsOf(pack, 'neopixel', 'microbit-v2')).toMatchObject({ kind: 'built-in', modules: ['neopixel'] });   // M7 slice 3
    expect(needsOf(pack, 'gps', 'pico-w')).toMatchObject({ kind: 'library', library: { id: 'micropygps' } });   // M7 slice 5
    expect(filesFor(lib('max30102'), 'microbit-v2')).toEqual([['max30102/microbit/max30102.py', 'max30102.py']]);   // next to main.py, no licence file
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
