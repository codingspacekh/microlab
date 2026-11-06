import { describe, expect, it } from 'vitest';
import { parseBoard } from '@lib/boards';
import { connect } from '@lib/circuit';
import {
  addPart, addWire, deleteMany, duplicate, footprint, moveParts, partKind, pointAt, rotateParts, sceneOf, snapPart, usedPoints,
} from '@lib/editor';
import { newProject, toCircuit, type Project } from '@lib/project';
import picoJson from '../../../library/boards/pico-w/board.json';

/** M5.1 F-11: rotate, duplicate and select several — whole parts on whole holes, as one rigid group. */
const empty = () => newProject('pico-w').project;
const at = (p: Project, ref: string) => pointAt(sceneOf(p), ref)!;
const legsOf = (p: Project, id: string) => p.parts.find((q) => q.id === id)!.legs;
const shape = (p: Project, id: string) => {
  const pts = Object.values(legsOf(p, id)).map((r) => at(p, r));
  return pts.map((q) => [q.x - pts[0]!.x, q.y - pts[0]!.y]);
};
const r1At = (a: string, b: string) => addPart(empty(), 'resistor', { a, b }).project;

describe('M5.1 rotating a part', () => {
  it('a resistor a5–a8 turned a quarter clockwise stands upright, its legs still 3 holes apart, in free holes', () => {
    const p = r1At('bb1.a5', 'bb1.a8');
    const turned = rotateParts(p, ['r1'])!;
    expect(turned).toBeDefined();
    expect(shape(turned, 'r1')).toEqual([[0, 0], [0, 48]]);
    const [a, b] = Object.values(legsOf(turned, 'r1'));
    expect(a).toMatch(/^bb1\.[a-j](6|7)$/);   // the legs' middle stays near where it was (between columns 6 and 7)
    expect(b!.slice(-1)).toBe(a!.slice(-1));
  });

  it('turned again it lies the other way: b is left of a', () => {
    const p = rotateParts(rotateParts(r1At('bb1.c10', 'bb1.c13'), ['r1'])!, ['r1'])!;
    expect(shape(p, 'r1')).toEqual([[0, 0], [-48, 0]]);
  });

  it('four quarter turns give a part of the same shape; only its holes change, never its props or id', () => {
    let p = addPart(empty(), 'potentiometer', { 1: 'bb1.c10', 2: 'bb1.c12', 3: 'bb1.c14' }).project;
    const before = p.parts[0]!;
    for (let i = 0; i < 4; i++) p = rotateParts(p, ['pot1'])!;
    expect(shape(p, 'pot1')).toEqual([[0, 0], [32, 0], [64, 0]]);
    expect({ ...p.parts[0], legs: before.legs }).toEqual(before);
  });

  it('the push button turned: its legs go 48 across and 32 down — rigid, as the real one', () => {
    const p = addPart(empty(), 'button', { '1a': 'bb1.e10', '2a': 'bb1.e12', '1b': 'bb1.f10', '2b': 'bb1.f12' }).project;
    const t = rotateParts(p, ['btn1'])!;
    expect(shape(t, 'btn1')).toEqual([[0, 0], [0, 32], [-48, 0], [-48, 32]]);
  });

  it('no room to turn (every hole around it used): undefined, the project unchanged', () => {
    let p = r1At('bb1.a5', 'bb1.a8');
    for (const r of 'bcdefghij') for (let c = 1; c <= 12; c++) p = addWire(p, `bb1.${r}${c}`, `bb1.${r}${c + 18}`) ?? p;
    expect(rotateParts(p, ['r1'])).toBeUndefined();
  });

  it('a wire in the way blocks only the holes it uses; the part never blocks itself', () => {
    const p = r1At('bb1.e5', 'bb1.e8');
    const t = rotateParts(p, ['r1'])!;
    const used = usedPoints(t, 'r1');
    for (const h of Object.values(legsOf(t, 'r1'))) expect(used.has(h)).toBe(false);
  });

  it('two parts turned together turn as one group about their middle', () => {
    let p = r1At('bb1.a5', 'bb1.a8');
    p = addPart(p, 'led', { a: 'bb1.c5', k: 'bb1.c7' }).project;
    const t = rotateParts(p, ['r1', 'led1'])!;
    const r = Object.values(legsOf(t, 'r1')).map((h) => at(t, h));
    const l = Object.values(legsOf(t, 'led1')).map((h) => at(t, h));
    expect(r[0]!.x).toBe(r[1]!.x);
    expect(l[0]!.x).toBe(l[1]!.x);
    expect(r[0]!.x).toBeGreaterThan(l[0]!.x);   // the resistor was above the LED: after a clockwise turn it is right of it
  });

  it('the footprint while placing: turns rotate the offsets from the first leg', () => {
    expect(footprint('resistor', 0)).toEqual(partKind('resistor').legs);
    expect(footprint('resistor', 1)).toEqual({ a: [0, 0], b: [0, 48] });
    expect(footprint('led', 2)).toEqual({ a: [0, 0], k: [-32, 0] });
    expect(footprint('led', 5)).toEqual(footprint('led', 1));
    const p = empty();
    expect(snapPart(sceneOf(p), 'resistor', at(p, 'bb1.a5'), undefined, 1)).toEqual({ a: 'bb1.a5', b: 'bb1.d5' });
  });
});

describe('M5.1 moving several parts', () => {
  it('a group moves by whole holes, each part keeping its shape; wires stay where they are', () => {
    let p = r1At('bb1.a5', 'bb1.a8');
    p = addPart(p, 'led', { a: 'bb1.c5', k: 'bb1.c7' }).project;
    p = addWire(p, 'board.GP15', 'bb1.b5')!;
    const m = moveParts(p, ['r1', 'led1'], { x: 2 * 16 + 3, y: 16 - 2 })!;
    expect(legsOf(m, 'r1')).toEqual({ a: 'bb1.b7', b: 'bb1.b10' });
    expect(legsOf(m, 'led1')).toEqual({ a: 'bb1.d7', k: 'bb1.d9' });
    expect(m.wires).toEqual(p.wires);
  });

  it('a group that would land on a used hole or off the breadboard does not move', () => {
    let p = r1At('bb1.a5', 'bb1.a8');
    p = addPart(p, 'led', { a: 'bb1.c5', k: 'bb1.c7' }).project;
    p = addWire(p, 'bb1.d10', 'bb1.d20')!;
    expect(moveParts(p, ['r1', 'led1'], { x: 3 * 16, y: 16 })).toBeUndefined();
    expect(moveParts(p, ['r1', 'led1'], { x: -6 * 16, y: 0 })).toBeUndefined();
  });

  it('moving onto its own old holes is fine', () => {
    const p = r1At('bb1.a5', 'bb1.a8');
    expect(legsOf(moveParts(p, ['r1'], { x: 16, y: 0 })!, 'r1')).toEqual({ a: 'bb1.a6', b: 'bb1.a9' });
  });
});

describe('M5.1 duplicating', () => {
  it('a copy goes in the nearest free place to the right, with the same props and shape, a new id', () => {
    let p = r1At('bb1.a5', 'bb1.a8');
    p = { ...p, parts: p.parts.map((q) => ({ ...q, props: { ohms: 4700 } })) };
    const d = duplicate(p, { parts: ['r1'], wires: [] })!;
    expect(d.parts).toEqual(['r2']);
    const r2 = d.project.parts[1]!;
    expect(r2.props).toEqual({ ohms: 4700 });
    expect(shape(d.project, 'r2')).toEqual(shape(p, 'r1'));
    expect(at(d.project, r2.legs.a!).x).toBeGreaterThan(at(p, 'bb1.a8').x);
    expect(at(d.project, r2.legs.a!).y).toBe(at(p, 'bb1.a5').y);
  });

  it('copying a copied project changes nothing in the original (no shared objects)', () => {
    const p = r1At('bb1.a5', 'bb1.a8');
    const d = duplicate(p, { parts: ['r1'], wires: [] })!;
    d.project.parts[1]!.props!.ohms = 1;
    expect(p.parts[0]!.props).toEqual({ ohms: 220 });
  });

  it('several parts and a wire between holes copied as one group; a wire to a board pin is left out', () => {
    let p = r1At('bb1.a5', 'bb1.a8');
    p = addPart(p, 'led', { a: 'bb1.c8', k: 'bb1.c10' }).project;
    p = addWire(p, 'bb1.b8', 'bb1.T-9', [{ x: 160, y: 304 }])!;
    p = addWire(p, 'board.GP15', 'bb1.b5')!;
    const d = duplicate(p, { parts: ['r1', 'led1'], wires: ['w1', 'w2'] })!;
    expect(d.parts).toEqual(['r2', 'led2']);
    expect(d.wires).toEqual(['w3']);
    const w3 = d.project.wires.find((w) => w.id === 'w3')!;
    const dx = at(d.project, w3.a).x - at(p, 'bb1.b8').x;
    expect(dx).toBeGreaterThan(0);
    expect(at(d.project, legsOf(d.project, 'r2').b!).x - at(p, 'bb1.a8').x).toBe(dx);   // rigid
    expect(w3.via).toEqual([{ x: 160 + dx, y: 304 }]);
  });

  it('a full breadboard: no copy', () => {
    let p = r1At('bb1.a1', 'bb1.a4');
    for (const r of 'abcdefghij') for (let c = 1; c <= 30; c += 2) p = addWire(p, `bb1.${r}${c}`, `bb1.${r}${c + 1}`) ?? p;
    for (const r of ['T-', 'T+', 'B-', 'B+']) for (let c = 1; c <= 30; c++) p = addWire(p, `bb1.${r}${c}`, `bb1.${r}${c + 1}`) ?? p;
    expect(duplicate(p, { parts: ['r1'], wires: [] })).toBeUndefined();
  });
});

describe('M5.1 deleting several', () => {
  it('removes the chosen parts and wires, nothing else', () => {
    let p = r1At('bb1.a5', 'bb1.a8');
    p = addPart(p, 'led', { a: 'bb1.c8', k: 'bb1.c10' }).project;
    p = addWire(p, 'board.GP15', 'bb1.b5')!;
    p = addWire(p, 'board.GND@3', 'bb1.b10')!;
    const d = deleteMany(p, { parts: ['r1'], wires: ['w2'] });
    expect(d.parts.map((q) => q.id)).toEqual(['led1']);
    expect(d.wires.map((w) => w.id)).toEqual(['w1']);
  });
});

describe('M5.1 a turned circuit still works', () => {
  it('Blink with an upright resistor across the channel joins GP15 → resistor → LED → GND', () => {
    let p = rotateParts(r1At('bb1.a5', 'bb1.a8'), ['r1'])!;
    const col = (h: string) => Number(/\d+$/.exec(h)![0]);
    const ra = Object.values(legsOf(p, 'r1'))[0]!;
    const c = col(ra);
    const to = at(p, `bb1.e${c}`);
    p = moveParts(p, ['r1'], { x: to.x - at(p, ra).x, y: to.y - at(p, ra).y })!;
    expect(legsOf(p, 'r1')).toEqual({ a: `bb1.e${c}`, b: `bb1.f${c}` });
    p = addPart(p, 'led', { a: `bb1.h${c}`, k: `bb1.h${c + 2}` }).project;
    p = addWire(p, 'board.GP15', `bb1.d${c}`)!;
    p = addWire(p, 'board.GND@38', `bb1.i${c + 2}`)!;
    const nets = connect(toCircuit(p, parseBoard(picoJson)));
    expect(nets.netOf(`bb1.e${c}`)).toBe(nets.netOf('board.GP15'));
    expect(nets.netOf(`bb1.f${c}`)).toBe(nets.netOf(`bb1.h${c}`));
    expect(nets.netOf(`bb1.h${c + 2}`)).toBe(nets.netOf('board.GND@3'));
  });
});
