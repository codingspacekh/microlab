import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOARD_IDS, NEW_PROJECT_BOARDS } from '@lib/boards';
import { newProject, parseProject } from '@lib/project';

/** M4.2 F-01: a new project starts from the board the student chose, with a breadboard and a starter main.py. */
describe('M4.2 F-01 a new project', () => {
  it('the board list is the folders in library/boards', () => {
    expect([...BOARD_IDS].sort()).toEqual(readdirSync('library/boards').sort());
  });

  it('is offered for the three boards of v1, in the start screen\'s order', () => {
    expect(NEW_PROJECT_BOARDS).toEqual(['microbit-v2', 'pico-w', 'esp32-devkit-v1']);
  });

  it.each([
    ['microbit-v2', 'from microbit import *'],
    ['pico-w', 'from machine import Pin'],
    ['esp32-devkit-v1', 'from machine import Pin'],
  ] as const)('on %s: the board alone (M6.8: breadboards come from the parts panel), and a main.py that starts with %j', (board, first) => {
    const d = newProject(board);
    expect(parseProject(d.project)).toEqual(d.project);
    // M6.9 (screen 24): the micro:bit alone, out of its GPIO board
    expect(d.project).toEqual({ format: 1, title: 'Untitled project', board, ...(board === 'microbit-v2' ? { gpioBoard: false } : {}), breadboards: [], parts: [], wires: [] });
    expect(Object.keys(d.files)).toEqual(['main.py']);
    expect(d.files['main.py']).toMatch(new RegExp(`^${first.replace('*', '\\*')}\n`));
  });

  it('each new project is its own copy', () => {
    const a = newProject('pico-w');
    a.project.parts.push({ id: 'x', type: 'led', legs: {} });
    expect(newProject('pico-w').project.parts).toEqual([]);
  });

  it('refuses a board it does not know', () => {
    expect(() => newProject('arduino-uno' as never)).toThrow(/arduino-uno/);
  });
});
