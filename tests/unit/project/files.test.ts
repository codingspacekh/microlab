import { describe, expect, it } from 'vitest';
import {
  addFile, deletePath, fileNameProblem, MICROBIT_SPACE, newProject, renamePath, runTarget, spaceNote, type ProjectDoc,
} from '@lib/project';

/** M5.6 F-21: the project's files — a folder tree like the board's; the micro:bit's flat list and its small space. */
const pico = (): ProjectDoc => newProject('pico-w');
const mb = (): ProjectDoc => newProject('microbit-v2');

describe('M5.6 a new file\'s name', () => {
  it('a Python file, a library in lib/, a web page in www/', () => {
    for (const ok of ['led_test.py', 'lib/ssd1306.py', 'www/index.html', 'notes.txt', 'data.json', 'lib/sensors/dht.py']) {
      expect(fileNameProblem(pico(), ok)).toBeNull();
    }
  });

  it('refused, with a reason a student can read', () => {
    expect(fileNameProblem(pico(), '')).toBe('Type a name for the file.');
    expect(fileNameProblem(pico(), 'main.py')).toBe('There is already a file called main.py.');
    expect(fileNameProblem(pico(), 'MAIN.PY')).toBe('There is already a file called main.py.');
    expect(fileNameProblem(pico(), 'led test.py')).toMatch(/letters, digits, _ and -/);
    expect(fileNameProblem(pico(), '../x.py')).toMatch(/letters, digits, _ and -/);
    expect(fileNameProblem(pico(), '/x.py')).toMatch(/letters, digits, _ and -/);
    expect(fileNameProblem(pico(), 'lib/')).toMatch(/letters, digits, _ and -/);
    expect(fileNameProblem(pico(), '.hidden.py')).toMatch(/letters, digits, _ and -/);
    expect(fileNameProblem(pico(), 'picture.png')).toBe('MicroLab keeps text files: .py, .txt, .html, .css, .js, .json, .csv, .md …');
    expect(fileNameProblem(pico(), 'main.py/x.py')).toBe('main.py is a file, not a folder.');
    expect(fileNameProblem({ ...pico(), files: { ...pico().files, 'lib/a.py': '' } }, 'lib')).toBe('There is already a folder called lib.');
  });

  it('on the micro:bit a folder is refused: its files sit next to main.py', () => {
    expect(fileNameProblem(mb(), 'lib/ssd1306.py')).toBe('The micro:bit has no folders: its files sit next to main.py. Call it ssd1306.py.');
    expect(fileNameProblem(mb(), 'ssd1306.py')).toBeNull();
  });

  it('renaming to its own name is no problem; to another file\'s is', () => {
    const d = addFile(pico(), 'a.py', '');
    expect(fileNameProblem(d, 'a.py', 'a.py')).toBeNull();
    expect(fileNameProblem(d, 'main.py', 'a.py')).toBe('There is already a file called main.py.');
  });
});

describe('M5.6 adding, renaming, deleting', () => {
  it('a new file is empty text; nothing else changes', () => {
    const d0 = pico();
    const d = addFile(d0, 'lib/helper.py');
    expect(d.files['lib/helper.py']).toBe('');
    expect(d.project).toBe(d0.project);
    expect(Object.keys(d0.files)).toEqual(['main.py']);
  });

  it('a file renamed keeps its text; a folder renamed takes everything in it', () => {
    let d = addFile(pico(), 'lib/a.py', 'A = 1');
    d = addFile(d, 'lib/b.py', 'B = 2');
    expect(renamePath(d, 'lib/a.py', 'lib/aa.py').files['lib/aa.py']).toBe('A = 1');
    const moved = renamePath(d, 'lib', 'modules');
    expect(Object.keys(moved.files).sort()).toEqual(['main.py', 'modules/a.py', 'modules/b.py']);
    expect(renamePath(d, 'libx', 'y')).toBe(d);
  });

  it('a file deleted, or a folder with everything in it; lib.py is not inside lib/', () => {
    let d = addFile(pico(), 'lib/a.py');
    d = addFile(d, 'lib/b.py');
    d = addFile(d, 'lib.py');
    expect(Object.keys(deletePath(d, 'lib/a.py').files).sort()).toEqual(['lib.py', 'lib/b.py', 'main.py']);
    expect(Object.keys(deletePath(d, 'lib').files).sort()).toEqual(['lib.py', 'main.py']);
  });
});

describe('M5.6 F-22 (Q19) which file Run runs', () => {
  const files = { 'main.py': '', 'led_test.py': '', 'www/index.html': '' };
  it('the open file, if it is Python', () => {
    expect(runTarget(files, 'led_test.py', undefined)).toBe('led_test.py');
  });
  it('a file that is not Python: the last Python file run, or main.py', () => {
    expect(runTarget(files, 'www/index.html', 'led_test.py')).toBe('led_test.py');
    expect(runTarget(files, 'www/index.html', undefined)).toBe('main.py');
    expect(runTarget(files, 'www/index.html', 'gone.py')).toBe('main.py');
  });
});

describe('M5.6 the micro:bit\'s small space (§1.12)', () => {
  const big = (n: number) => 'x'.repeat(n);
  it('the Pico W and ESP32 say nothing; the micro:bit says how much of about 20 KB', () => {
    expect(spaceNote(pico())).toBeNull();
    expect(spaceNote(mb())).toMatchObject({ level: 'ok' });
    expect(spaceNote(mb())!.text).toMatch(/^0\.\d KB of about 20 KB$/);
  });
  it('near it: a warning; over it: it won\'t fit', () => {
    const near = { ...mb(), files: { ...mb().files, 'big.py': big(MICROBIT_SPACE * 0.85) } };
    expect(spaceNote(near)).toMatchObject({ level: 'near' });
    expect(spaceNote(near)!.text).toMatch(/nearly full/);
    const over = { ...mb(), files: { ...mb().files, 'big.py': big(MICROBIT_SPACE + 10) } };
    expect(spaceNote(over)).toMatchObject({ level: 'over' });
    expect(spaceNote(over)!.text).toMatch(/won't fit/);
  });
});
