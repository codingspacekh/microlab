import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openPyFile, savePyFile } from '../../../src/main/python3/files';

/** M12 slice 2 (F-91): .py files as IDLE has them — opened as text, saved whole, never half a file. */
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const dir = () => { const d = mkdtempSync(join(tmpdir(), 'ml-py-')); dirs.push(d); return d; };

describe('opening a .py file', () => {
  it('its text, its name without .py, where it is', async () => {
    const d = dir();
    writeFileSync(join(d, 'guess.py'), 'print("hi")\n');
    expect(await openPyFile(join(d, 'guess.py'))).toEqual({ ok: true, path: join(d, 'guess.py'), name: 'guess', text: 'print("hi")\n' });
  });
  it('a file saved by Notepad with a BOM, and Windows line endings: as a student wrote it', async () => {
    const d = dir();
    writeFileSync(join(d, 'win.py'), '﻿print(1)\r\nprint(2)\r\n');
    expect(await openPyFile(join(d, 'win.py'))).toMatchObject({ ok: true, text: 'print(1)\nprint(2)\n' });
  });
  it('gone, or not text: a message naming the file', async () => {
    const d = dir();
    expect(await openPyFile(join(d, 'gone.py'))).toEqual({ ok: false, message: "“gone.py” can't be opened: the file isn't there any more." });
    writeFileSync(join(d, 'pic.py'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]));
    expect(await openPyFile(join(d, 'pic.py'))).toEqual({ ok: false, message: "“pic.py” can't be opened: it isn't a text file." });
  });
  it('a very large file is refused (more than 2 MB is not a program to edit here)', async () => {
    const d = dir();
    writeFileSync(join(d, 'big.py'), 'x = 1\n'.repeat(400_000));
    expect(await openPyFile(join(d, 'big.py'))).toEqual({ ok: false, message: "“big.py” can't be opened: it is larger than 2 MB." });
  });
});

describe('saving a .py file', () => {
  it('written whole, .py added when the name has none', async () => {
    const d = dir();
    expect(await savePyFile(join(d, 'spiral'), 'import turtle\n')).toEqual({ ok: true, path: join(d, 'spiral.py'), name: 'spiral' });
    expect(readFileSync(join(d, 'spiral.py'), 'utf8')).toBe('import turtle\n');
  });
  it('a full disk mid-write: the file before stays as it was, and no half file is left', async () => {
    const d = dir();
    writeFileSync(join(d, 'a.py'), 'old\n');
    const fs = {
      writeFile: vi.fn(async () => { throw Object.assign(new Error('no space'), { code: 'ENOSPC' }); }),
      rename: vi.fn(), rm: vi.fn(async () => undefined),
    };
    expect(await savePyFile(join(d, 'a.py'), 'new\n', fs as never)).toEqual({ ok: false, message: "“a.py” can't be saved: the disk is full." });
    expect(readFileSync(join(d, 'a.py'), 'utf8')).toBe('old\n');
    expect(fs.rm).toHaveBeenCalledWith(`${join(d, 'a.py')}.saving`, { force: true });
  });
  it('a folder it may not write in: says so, and what to do', async () => {
    const fs = {
      writeFile: vi.fn(async () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }); }),
      rename: vi.fn(), rm: vi.fn(async () => undefined),
    };
    expect(await savePyFile('/x/b.py', '', fs as never)).toEqual({ ok: false, message: "“b.py” can't be saved: MicroLab isn't allowed to write in that folder. Choose another one with Save as." });
  });
});
