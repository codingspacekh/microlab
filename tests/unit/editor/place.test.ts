import { describe, expect, it } from 'vitest';
import { addPart, addWire, freeSpot, legsCentre, partKind, pointAt, sceneOf, snapPart, usedPoints } from '@lib/editor';
import { newProject, type Project } from '@lib/project';

/** M4.3 F-10, F-11, F-12: a part snaps to holes; every leg needs an empty hole on the breadboard. */
const empty = () => newProject('pico-w').project;
const at = (p: Project, ref: string) => pointAt(sceneOf(p), ref)!;

describe('M4.3 a part snaps to holes', () => {
  it('a resistor dropped near a5 goes in a5 and a8', () => {
    const p = empty();
    const a5 = at(p, 'bb1.a5');
    expect(snapPart(sceneOf(p), 'resistor', { x: a5.x + 5, y: a5.y - 4 })).toEqual({ a: 'bb1.a5', b: 'bb1.a8' });
  });

  it('a push button straddles the channel: e24, e26, f24, f26', () => {
    const p = empty();
    expect(snapPart(sceneOf(p), 'button', at(p, 'bb1.e24'))).toEqual({ '1a': 'bb1.e24', '2a': 'bb1.e26', '1b': 'bb1.f24', '2b': 'bb1.f26' });
  });

  it('an LED: anode then cathode, two holes apart; a potentiometer: three legs, two apart', () => {
    const p = empty();
    expect(snapPart(sceneOf(p), 'led', at(p, 'bb1.b8'))).toEqual({ a: 'bb1.b8', k: 'bb1.b10' });
    expect(snapPart(sceneOf(p), 'potentiometer', at(p, 'bb1.e21'))).toEqual({ 1: 'bb1.e21', 2: 'bb1.e23', 3: 'bb1.e25' });
  });

  it('not on the breadboard: no place', () => {
    expect(snapPart(sceneOf(empty()), 'resistor', { x: -300, y: -300 })).toBeUndefined();
  });

  it('a leg off the end of the breadboard: no place (a29 → a32)', () => {
    expect(snapPart(sceneOf(empty()), 'resistor', at(empty(), 'bb1.a29'))).toBeUndefined();
  });

  it('a leg on a board pin: no place — parts go in the breadboard', () => {
    const p = empty();
    expect(snapPart(sceneOf(p), 'resistor', at(p, 'board.GP0'))).toBeUndefined();
  });

  it('a hole already used by a leg or a wire: no place; the part being moved does not block itself', () => {
    let p = addPart(empty(), 'resistor', { a: 'bb1.a5', b: 'bb1.a8' }).project;
    expect(snapPart(sceneOf(p), 'led', at(p, 'bb1.a8'))).toBeUndefined();
    expect(snapPart(sceneOf(p), 'resistor', at(p, 'bb1.a6'), 'r1')).toEqual({ a: 'bb1.a6', b: 'bb1.a9' });
    p = addWire(p, 'board.GP15', 'bb1.c4')!;
    expect(snapPart(sceneOf(p), 'resistor', at(p, 'bb1.c1'))).toBeUndefined();
  });

  it('the points in use: every leg and every wire end', () => {
    let p = addPart(empty(), 'led', { a: 'bb1.b8', k: 'bb1.b10' }).project;
    p = addWire(p, 'board.GND@3', 'bb1.T-1')!;
    expect([...usedPoints(p)].sort()).toEqual(['bb1.T-1', 'bb1.b10', 'bb1.b8', 'board.GND@3']);
  });
});

describe('M4.3 a free spot (a part clicked in the parts panel)', () => {
  it('the first place in the breadboard where every leg has an empty hole', () => {
    let p = empty();
    const first = freeSpot(sceneOf(p), 'resistor')!;
    expect(first).toEqual({ a: 'bb1.a1', b: 'bb1.a4' });
    p = addPart(p, 'resistor', first).project;
    const second = freeSpot(sceneOf(p), 'resistor')!;
    expect(Object.values(second).some((h) => Object.values(first).includes(h))).toBe(false);
  });

  it('a push button is put across the channel', () => {
    expect(freeSpot(sceneOf(empty()), 'button')).toEqual({ '1a': 'bb1.e1', '2a': 'bb1.e3', '1b': 'bb1.f1', '2b': 'bb1.f3' });
  });

  it('none when the breadboard is full', () => {
    let p = empty();
    for (let i = 0; i < 200; i++) {
      const spot = freeSpot(sceneOf(p), 'potentiometer');
      if (!spot) break;
      p = addPart(p, 'potentiometer', spot).project;
    }
    expect(freeSpot(sceneOf(p), 'potentiometer')).toBeUndefined();
    expect(p.parts.length).toBeGreaterThan(20);
  });

  it('a part is held by the middle of its legs: a resistor between a and b, a button in its centre', () => {
    expect(legsCentre('resistor')).toEqual([24, 0]);
    expect(legsCentre('button')).toEqual([16, 24]);
    expect(() => partKind('servo')).toThrow(/no part "servo"/);
  });

  it('each part kind has a name, legs the circuit knows, and its first props', () => {
    expect(partKind('resistor')).toMatchObject({ name: 'Resistor', props: { ohms: 220 } });
    expect(partKind('led')).toMatchObject({ name: 'LED', props: { color: 'red' } });
    expect(Object.keys(partKind('button').legs)).toEqual(['1a', '2a', '1b', '2b']);
    expect(Object.keys(partKind('potentiometer').legs)).toEqual(['1', '2', '3']);
  });
});
