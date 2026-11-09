import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  insideProject, newBoardProjectPath, newEntry, newPythonProject, projectNameProblem, projectOf, projectTree, renameEntry, STARTER_PY, textFile,
} from '../../../src/main/projects';

/**
 * M12 slice 6b (Rev 11, F-100, F-101; screens 31e, 31b): projects as folders, as PyCharm has them — a new one is
 * made where the student chose, with its name; a Python project's files and folders as a tree; files made, renamed
 * in it — never outside the project's folder.
 */
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const dir = () => { const d = mkdtempSync(join(tmpdir(), 'ml-proj-')); dirs.push(d); return d; };

describe('a project\'s name', () => {
  it('letters, digits, spaces, - and _; said plainly when not', () => {
    for (const ok of ['guessing_game', 'Traffic lights', 'turtle-art 2', 'Sokha']) expect(projectNameProblem(ok)).toBeNull();
    expect(projectNameProblem('')).toBe('Give the project a name.');
    expect(projectNameProblem('   ')).toBe('Give the project a name.');
    expect(projectNameProblem('a/b')).toBe('A project\'s name has letters, digits, spaces, - and _ only: not “/”.');
    expect(projectNameProblem('what?')).toBe('A project\'s name has letters, digits, spaces, - and _ only: not “?”.');
    expect(projectNameProblem('..')).toBe('A project\'s name has letters, digits, spaces, - and _ only: not “.”.');
    expect(projectNameProblem(' spaced ')).toBe('A project\'s name doesn\'t start or end with a space.');
    expect(projectNameProblem('x'.repeat(61))).toBe('A project\'s name is 60 letters at most.');
  });
});

describe('a new Python project: a folder with main.py', () => {
  it('made where it was asked, with main.py in it', () => {
    const at = dir();
    const r = newPythonProject(at, 'guessing_game');
    expect(r).toEqual({ ok: true, root: join(at, 'guessing_game'), name: 'guessing_game', main: join(at, 'guessing_game', 'main.py') });
    expect(readFileSync(join(at, 'guessing_game', 'main.py'), 'utf8')).toBe(STARTER_PY);
  });
  it('the location made if it isn\'t there yet (MicroLab\'s folder, the first time)', () => {
    const at = join(dir(), 'MicroLab', 'Sokha');
    expect(newPythonProject(at, 'p')).toMatchObject({ ok: true });
    expect(existsSync(join(at, 'p', 'main.py'))).toBe(true);
  });
  it('a name already there is never overwritten; a bad name is refused', () => {
    const at = dir();
    mkdirSync(join(at, 'taken'));
    writeFileSync(join(at, 'taken', 'main.py'), 'mine');
    expect(newPythonProject(at, 'taken')).toEqual({ ok: false, message: 'There is already a project called “taken” there: choose another name.' });
    expect(readFileSync(join(at, 'taken', 'main.py'), 'utf8')).toBe('mine');
    expect(newPythonProject(at, 'a/b')).toMatchObject({ ok: false });
  });
});

describe('a new board project: one .mlab file', () => {
  it('its path; a name already there is refused', () => {
    const at = dir();
    expect(newBoardProjectPath(at, 'Traffic lights')).toEqual({ ok: true, path: join(at, 'Traffic lights.mlab') });
    writeFileSync(join(at, 'Traffic lights.mlab'), 'x');
    expect(newBoardProjectPath(at, 'Traffic lights')).toEqual({ ok: false, message: 'There is already a project called “Traffic lights” there: choose another name.' });
  });
});

describe('a Python project\'s tree', () => {
  it('folders first, then files, by name; main.py first among them; hidden files and __pycache__ left out', () => {
    const root = dir();
    for (const f of ['main.py', 'helpers.py', 'scores.txt', 'data/words.txt', 'data/more/deep.csv', '.hidden', '__pycache__/x.pyc', '.venv/a']) {
      mkdirSync(join(root, f, '..'), { recursive: true });
      writeFileSync(join(root, f), 'x');
    }
    expect(projectTree(root)).toEqual([
      { path: 'data', dir: true },
      { path: 'data/more', dir: true },
      { path: 'data/more/deep.csv', dir: false },
      { path: 'data/words.txt', dir: false },
      { path: 'main.py', dir: false },
      { path: 'helpers.py', dir: false },
      { path: 'scores.txt', dir: false },
    ]);
  });
  it('a project folder gone: empty', () => {
    expect(projectTree(join(dir(), 'gone'))).toEqual([]);
  });
});

describe('files made and renamed in a project — never outside it', () => {
  it('a new file (empty) and a new folder; one already there is refused', () => {
    const root = dir();
    expect(newEntry(root, 'helpers.py', 'file')).toEqual({ ok: true, path: 'helpers.py' });
    expect(readFileSync(join(root, 'helpers.py'), 'utf8')).toBe('');
    expect(newEntry(root, 'data', 'folder')).toEqual({ ok: true, path: 'data' });
    expect(newEntry(root, 'data/words.txt', 'file')).toEqual({ ok: true, path: 'data/words.txt' });
    expect(newEntry(root, 'helpers.py', 'file')).toEqual({ ok: false, message: '“helpers.py” is already there.' });
  });
  it('renamed (a file, or a folder with what it holds); a name taken is refused', () => {
    const root = dir();
    newEntry(root, 'a.py', 'file');
    newEntry(root, 'b.py', 'file');
    expect(renameEntry(root, 'a.py', 'game.py')).toEqual({ ok: true, path: 'game.py' });
    expect(existsSync(join(root, 'game.py'))).toBe(true);
    expect(renameEntry(root, 'game.py', 'b.py')).toEqual({ ok: false, message: '“b.py” is already there.' });
    newEntry(root, 'data', 'folder');
    newEntry(root, 'data/w.txt', 'file');
    expect(renameEntry(root, 'data', 'words')).toEqual({ ok: true, path: 'words' });
    expect(existsSync(join(root, 'words', 'w.txt'))).toBe(true);
  });
  it('names that would leave the project, or aren\'t file names, are refused', () => {
    const root = dir();
    for (const bad of ['../x.py', '/etc/x', 'a/../../x', '', 'a\\b', 'con?.py']) expect(newEntry(root, bad, 'file')).toMatchObject({ ok: false });
    expect(renameEntry(root, 'x', '../y')).toMatchObject({ ok: false });
    expect(insideProject(root, 'data/a.py')).toBe(join(root, 'data', 'a.py'));
    expect(insideProject(root, '../a.py')).toBeNull();
    expect(insideProject(root, '')).toBeNull();
  });
});

describe('opening', () => {
  it('a project is a folder: a .py file opens its folder, with the file shown; a folder opens as it is', () => {
    const root = dir();
    writeFileSync(join(root, 'game.py'), 'x');
    expect(projectOf(join(root, 'game.py'))).toEqual({ root, file: join(root, 'game.py') });
    writeFileSync(join(root, 'main.py'), 'x');
    expect(projectOf(root)).toEqual({ root, file: join(root, 'main.py') });
    const empty = dir();
    expect(projectOf(empty)).toEqual({ root: empty });
  });
  it('text files open in a tab; others are not (a picture, a .pyc)', () => {
    for (const t of ['a.py', 'b.txt', 'c.csv', 'd.json', 'e.md', 'f.html', 'g.css', 'h.js', 'i.toml', 'j.cfg', 'k.ini', 'README']) expect(textFile(t)).toBe(true);
    for (const n of ['a.png', 'b.pyc', 'c.mp3', 'd.zip', 'e.exe']) expect(textFile(n)).toBe(false);
  });
});
