import { describe, expect, it } from 'vitest';
import {
  addPart, addWire, deleteMany, deletePart, deleteWire, duplicate, EMPTY_HISTORY, moveBoard, moveBreadboard, moveParts, movePart,
  record, redo, rotateParts, setBreadboardSize, setPartProp, setWireColour, undo, type History,
} from '@lib/editor';
import { type Project } from '@lib/project';
import { newProject } from './with-breadboard';

/** M5.1 F-16: undo / redo for every command — a history of whole projects, so each one undoes the same way. */
const start = (): Project => {
  let p = newProject('pico-w').project;
  p = addPart(p, 'resistor', { a: 'bb1.a5', b: 'bb1.a8' }).project;
  p = addWire(p, 'board.GP15', 'bb1.b5')!;
  return p;
};

/** Every edit the canvas and the inspector make. */
const COMMANDS: [string, (p: Project) => Project][] = [
  ['add a part', (p) => addPart(p, 'led', { a: 'bb1.c10', k: 'bb1.c12' }).project],
  ['move a part', (p) => movePart(p, 'r1', { a: 'bb1.c1', b: 'bb1.c4' })],
  ['move several', (p) => moveParts(p, ['r1'], { x: 16, y: 16 })!],
  ['rotate', (p) => rotateParts(p, ['r1'])!],
  ['duplicate', (p) => duplicate(p, { parts: ['r1'], wires: [] })!.project],
  ['delete a part', (p) => deletePart(p, 'r1')],
  ['delete several', (p) => deleteMany(p, { parts: ['r1'], wires: ['w1'] })],
  ['add a wire', (p) => addWire(p, 'bb1.j1', 'bb1.j9', [{ x: 40, y: 320 }])!],
  ['delete a wire', (p) => deleteWire(p, 'w1')],
  ['a wire colour', (p) => setWireColour(p, 'w1', 'purple')],
  ['a value', (p) => setPartProp(p, 'r1', 'ohms', 4700)],
  ['the breadboard size', (p) => setBreadboardSize(p, 'bb1', 'full')!],
  ['move the board', (p) => moveBoard(p, { x: 64, y: -32 })],
  ['move the breadboard', (p) => moveBreadboard(p, 'bb1', { x: 16, y: 600 })],
];

describe('M5.1 undo / redo', () => {
  it.each(COMMANDS)('%s: done then undone gives back the same project; redone gives the edit again', (_name, cmd) => {
    const before = start();
    const after = cmd(before);
    expect(after).not.toEqual(before);
    const h = record(EMPTY_HISTORY, before);
    const u = undo(h, after)!;
    expect(u.project).toEqual(before);
    const r = redo(u.history, u.project)!;
    expect(r.project).toEqual(after);
    expect(undo(r.history, r.project)!.project).toEqual(before);
  });

  it('all the commands one after another, undone back to the start and redone to the end', () => {
    let p = start();
    let h: History = EMPTY_HISTORY;
    const states = [p];
    for (const [, cmd] of COMMANDS.filter(([n]) => !n.startsWith('delete'))) {
      const next = cmd(p);
      h = record(h, p);
      p = next;
      states.push(p);
    }
    for (let i = states.length - 2; i >= 0; i--) {
      const u = undo(h, p)!;
      ({ history: h, project: p } = u);
      expect(p).toEqual(states[i]);
    }
    expect(undo(h, p)).toBeUndefined();
    for (let i = 1; i < states.length; i++) ({ history: h, project: p } = redo(h, p)!);
    expect(p).toEqual(states[states.length - 1]);
    expect(redo(h, p)).toBeUndefined();
  });

  it('a new edit after an undo drops what could have been redone', () => {
    const a = start();
    const b = setPartProp(a, 'r1', 'ohms', 1000);
    const u = undo(record(EMPTY_HISTORY, a), b)!;
    const h = record(u.history, u.project);
    expect(h.future).toEqual([]);
    expect(redo(h, setPartProp(a, 'r1', 'ohms', 330))).toBeUndefined();
  });

  it('keeps the last 200 steps', () => {
    let h: History = EMPTY_HISTORY;
    let p = start();
    for (let i = 0; i < 250; i++) { h = record(h, p); p = setPartProp(p, 'r1', 'ohms', i + 1); }
    expect(h.past).toHaveLength(200);
    expect(h.past[0]!.parts[0]!.props!.ohms).toBe(50);
  });

  it('the same edit twice in a row with a merge key is one step (dragging a stepper, typing a value)', () => {
    const a = start();
    let h = record(EMPTY_HISTORY, a, 'ohms:r1');
    h = record(h, setPartProp(a, 'r1', 'ohms', 330), 'ohms:r1');
    h = record(h, setPartProp(a, 'r1', 'ohms', 470), 'ohms:r1');
    expect(h.past).toEqual([a]);
    h = record(h, setPartProp(a, 'r1', 'ohms', 470), 'color:w1');
    expect(h.past).toHaveLength(2);
  });
});
