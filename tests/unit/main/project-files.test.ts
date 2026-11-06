import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { newProject, writeMlab } from '@lib/project';
import { openProjectFile } from '../../../src/main/project-files';

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
