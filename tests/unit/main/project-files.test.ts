import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { addPart, addWire } from '@lib/editor';
import { newProject, readMlab, writeMlab, type ProjectDoc } from '@lib/project';
import { openProjectFile, saveProjectFile } from '../../../src/main/project-files';

/** M4.2 F-02: the main process opens a .mlab the student chose; anything wrong is a message, never a crash. */
const dir = mkdtempSync(join(tmpdir(), 'microlab-open-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('M4.2 F-02 opening a project file', () => {
  it('gives the project, its path and its name', async () => {
    const file = join(dir, 'Night light.mlab');
    writeFileSync(file, writeMlab(newProject('esp32-devkit-v1')));
    const r = await openProjectFile(file);
    expect(r).toEqual({ ok: true, path: file, name: 'Night light', doc: newProject('esp32-devkit-v1') });
  });

  it('a file that is not a project: says so, with the file\'s name', async () => {
    const file = join(dir, 'photo.mlab');
    writeFileSync(file, 'not a zip');
    expect(await openProjectFile(file)).toEqual({ ok: false, message: expect.stringMatching(/^“photo\.mlab” isn't a MicroLab project/) });
  });

  it('a file that is gone: says so', async () => {
    expect(await openProjectFile(join(dir, 'gone.mlab'))).toEqual({ ok: false, message: '“gone.mlab” can\'t be opened: the file isn\'t there any more.' });
  });

  it('a file that can\'t be read: says so', async () => {
    expect(await openProjectFile(dir)).toMatchObject({ ok: false, message: expect.stringMatching(/can't be opened/) });
  });
});

/** A project with a bit of everything: parts, wires with bends and a colour, a moved board, two files. */
function blink(): ProjectDoc {
  const d = newProject('pico-w');
  let p = addPart(d.project, 'resistor', { a: 'bb1.a5', b: 'bb1.a8' }).project;
  p = addPart(p, 'led', { a: 'bb1.b8', k: 'bb1.b10' }).project;
  p = addWire(p, 'board.GP15', 'bb1.e5', [{ x: 300, y: 180 }])!;
  p = { ...p, wires: p.wires.map((w) => ({ ...w, color: 'yellow' })), view: { board: { x: 72, y: 0 }, breadboards: { bb1: { x: 0, y: 200 } } } };
  return { project: p, files: { 'main.py': 'from machine import Pin\n', 'lib/helper.py': '# °C\n' } };
}

describe('M4.6 F-02 saving a project file', () => {
  it('save → open gives the same project (the M4 unit test)', async () => {
    const file = join(dir, 'Blink.mlab');
    expect(await saveProjectFile(file, blink())).toEqual({ ok: true, path: file, name: 'Blink' });
    expect(await openProjectFile(file)).toEqual({ ok: true, path: file, name: 'Blink', doc: blink() });
  });

  it('a name without .mlab gets it', async () => {
    const r = await saveProjectFile(join(dir, 'Night light'), blink());
    expect(r).toEqual({ ok: true, path: join(dir, 'Night light.mlab'), name: 'Night light' });
    expect(existsSync(join(dir, 'Night light.mlab'))).toBe(true);
  });

  it('saving again replaces the file whole, and leaves no half-written file behind', async () => {
    const sub = mkdtempSync(join(dir, 'again-'));
    const file = join(sub, 'P.mlab');
    await saveProjectFile(file, newProject('microbit-v2'));
    await saveProjectFile(file, blink());
    expect(readMlab(readFileSync(file))).toEqual(blink());
    expect(readdirSync(sub)).toEqual(['P.mlab']);
  });

  it('a folder that isn\'t there, or can\'t be written: a message naming the file, never a crash', async () => {
    expect(await saveProjectFile(join(dir, 'gone', 'x.mlab'), blink())).toEqual({ ok: false, message: '“x.mlab” can\'t be saved: its folder isn\'t there any more.' });
    const locked = join(dir, 'locked');
    mkdirSync(locked);
    chmodSync(locked, 0o500);
    try {
      expect(await saveProjectFile(join(locked, 'y.mlab'), blink())).toMatchObject({ ok: false, message: expect.stringMatching(/^“y\.mlab” can't be saved/) });
    } finally {
      chmodSync(locked, 0o700);
    }
  });

  it('a full disk, or anything else: says so, and leaves no half-written file', async () => {
    const fail = (code: string, message = 'boom') => Object.assign(new Error(message), { code });
    const removed: string[] = [];
    const fs = (e: Error) => ({
      writeFile: (async () => {}) as never,
      rename: (async () => { throw e; }) as never,
      rm: (async (p: string) => { removed.push(p); throw new Error('gone already'); }) as never,
    });
    const file = join(dir, 'z.mlab');
    expect(await saveProjectFile(file, blink(), fs(fail('ENOSPC')))).toEqual({ ok: false, message: '“z.mlab” can\'t be saved: the disk is full.' });
    expect(await saveProjectFile(file, blink(), fs(fail('EIO', 'the disk went away')))).toEqual({ ok: false, message: '“z.mlab” can\'t be saved: the disk went away.' });
    expect(removed).toEqual([`${file}.saving`, `${file}.saving`]);
  });
});
