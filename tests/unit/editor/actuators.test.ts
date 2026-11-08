import { describe, expect, it } from 'vitest';
import {
  addPart, addWire, allPoints, deleteMany, duplicate, fitBox, freeSpot, holeCard, joined, joinsOf, legsCentre, moveParts, partKind, pointAt,
  rotateParts, sceneOf, setBreadboardSize, terminalsOf, usedPoints,
} from '@lib/editor';
import { connect } from '@lib/circuit';
import { parseProject, toCircuit, type Project } from '@lib/project';
import { boardData } from '@lib/editor';
import { newProject } from './with-breadboard';

/** M7 slice 1 (screens 25, 25b): terminals — a driver's screws, a motor's tabs, a socket — are points to wire, like a
 *  board's pins; a motor, a pump, an L298N and a stepper lie beside the breadboard; a ULN2003 brings its stepper. */
const empty = () => newProject('pico-w').project;
const at = (p: Project, ref: string) => pointAt(sceneOf(p), ref);
const wire = (p: Project, a: string, b: string) => {
  const next = addWire(p, a, b);
  if (!next) throw new Error(`no wire ${a} → ${b}`);
  return next;
};
const points = (p: Project) => allPoints(sceneOf(p));
const netOf = (p: Project, ref: string) => connect(toCircuit(p, boardData('pico-w'))).netOf(ref);

describe('M7 a part that lies beside the breadboard', () => {
  it('a motor lies where it is put (on the grid); its tabs are points to wire, where its picture has them', () => {
    const { project: p, id } = addPart(empty(), 'motor', {}, { x: 403, y: 101 });
    expect(id).toBe('motor1');
    expect(p.view?.parts).toEqual({ motor1: { x: 400, y: 104 } });
    expect(p.parts.at(-1)).toEqual({ id: 'motor1', type: 'motor', props: {}, legs: {} });
    expect(at(p, 'motor1.+')).toEqual({ x: 478, y: 96 });
    expect(at(p, 'motor1.-')).toEqual({ x: 478, y: 112 });
    expect(points(p).filter((q) => q.on === 'terminal').map((q) => q.ref)).toEqual(['motor1.+', 'motor1.-']);
    expect(at(p, 'motor1.x')).toBeUndefined();
    expect(parseProject(p)).toEqual(p);
  });

  it('a wire goes to a tab, and joins it to the hole', () => {
    let p = addPart(empty(), 'motor', {}, { x: 400, y: 100 }).project;
    p = wire(p, 'motor1.+', 'bb1.a5');
    expect(netOf(p, 'motor1.+')).toBe(netOf(p, 'bb1.e5'));
    expect(usedPoints(p).has('motor1.+')).toBe(true);
    expect(addWire(p, 'motor1.+', 'bb1.a7')).toBeUndefined();   // one wire a tab, as a hole
    expect(joined(p, 'bb1.e5').points).toContain('motor1.+');
  });

  it('it is held by its body\'s middle', () => {
    expect(legsCentre('motor')).toEqual([23, 4]);
  });

  it('moved alone: on the grid; with a part in holes: the same step as it; turned in place', () => {
    let p = addPart(empty(), 'motor', {}, { x: 400, y: 104 }).project;
    expect(moveParts(p, ['motor1'], { x: 13, y: 5 })!.view!.parts!.motor1).toEqual({ x: 416, y: 112 });
    p = addPart(p, 'resistor', { a: 'bb1.a3', b: 'bb1.a6' }).project;
    const q = moveParts(p, ['r1', 'motor1'], { x: 32, y: 0 })!;
    expect(q.parts.find((x) => x.id === 'r1')!.legs).toEqual({ a: 'bb1.a5', b: 'bb1.a8' });
    expect(q.view!.parts!.motor1).toEqual({ x: 432, y: 104 });
    expect(rotateParts(p, ['motor1'])!.view!.parts!.motor1).toEqual({ x: 400, y: 104, turns: 1 });   // turned where it lies (M7 slice 2)
  });

  it('copied to its right; deleted with the wires on its tabs and its place', () => {
    let p = addPart(empty(), 'motor', {}, { x: 400, y: 104 }).project;
    p = wire(p, 'motor1.+', 'bb1.a5');
    const c = duplicate(p, { parts: ['motor1'], wires: [] })!;
    expect(c.parts).toEqual(['motor2']);
    expect(c.project.view!.parts!.motor2!.x).toBeGreaterThan(400 + 118);
    const d = deleteMany(p, { parts: ['motor1'], wires: [] });
    expect(d.wires).toEqual([]);
    expect(d.view!.parts).toEqual({});
  });

  it('the fit takes it in', () => {
    const p = addPart(empty(), 'l298n', {}, { x: 2000, y: 104 }).project;
    const b = fitBox(sceneOf(p));
    expect(b.x + b.w).toBeGreaterThan(2150);
  });

  it('an L298N\'s screws and header pins, left to right, are all points', () => {
    const p = addPart(empty(), 'l298n', {}, { x: 400, y: 0 }).project;
    const refs = points(p).filter((q) => q.on === 'terminal').map((q) => q.ref.slice(7));
    expect(refs).toEqual(['out1', 'out2', 'out3', 'out4', '12v', 'gnd', '5v', 'ena', 'in1', 'in2', 'in3', 'in4', 'enb']);
    expect(holeCard(p, 'l298n1.12v').title).toBe('L298N1 · 12V (the motors\' supply, 5–12 V)');
  });
});

describe('M7 a driver in the breadboard: its screws on its far edge', () => {
  const l9110s = () => addPart(empty(), 'l9110s', freeSpot(sceneOf(empty()), 'l9110s')!).project;

  it('in row f, its header B-IA … A-IB; MOTOR A and B screws above it', () => {
    const p = l9110s();
    expect(p.parts[0]!.legs).toEqual({ 'b-ia': 'bb1.f1', 'b-ib': 'bb1.f2', gnd: 'bb1.f3', vcc: 'bb1.f4', 'a-ia': 'bb1.f5', 'a-ib': 'bb1.f6' });
    const f1 = at(p, 'bb1.f1')!;
    expect(at(p, 'drv1.a1')).toEqual({ x: f1.x + 55, y: f1.y - 78 });
    expect(Object.keys(terminalsOf(sceneOf(p), p.parts[0]!))).toEqual(['b1', 'b2', 'a1', 'a2']);
  });

  it('moved, its screws go with it, and the wires on them; a relay turned, its screws turn', () => {
    let p = wire(l9110s(), 'drv1.a1', 'bb1.a20');
    const before = at(p, 'drv1.a1')!;
    p = moveParts(p, ['drv1'], { x: 32, y: 0 })!;
    expect(at(p, 'drv1.a1')).toEqual({ x: before.x + 32, y: before.y });
    expect(p.wires[0]!.a).toBe('drv1.a1');
    const r = addPart(empty(), 'relay', { s: 'bb1.f10', vcc: 'bb1.f11', gnd: 'bb1.f12' }).project;
    const t = rotateParts(r, ['relay1'])!;
    const s = at(t, t.parts[0]!.legs.s!)!;
    expect(at(t, 'relay1.no')).toEqual({ x: s.x + 97, y: s.y + 3 });   // a quarter turn clockwise: (3, −97) → (97, 3)
  });

  it('a screw\'s card says what it is and what is on it; the inspector\'s joins count its screws', () => {
    let p = addPart(l9110s(), 'motor', {}, { x: 400, y: 0 }).project;
    p = wire(wire(p, 'drv1.a1', 'motor1.+'), 'drv1.a2', 'motor1.-');
    expect(holeCard(p, 'drv1.a1')).toEqual({ title: 'DRV1 · MOTOR A, screw 1', lines: [expect.stringMatching(/^A motor's two leads/), 'A wire joins it to MOTOR1 + tab.'] });
    expect(joinsOf(p, 'motor1')).toEqual(['DRV1', 'DRV1']);
  });

  it('a relay module\'s NO COM NC; deleted, the wires on them go too', () => {
    let p = addPart(empty(), 'relay', freeSpot(sceneOf(empty()), 'relay')!).project;
    p = wire(p, 'relay1.com', 'bb1.T+20');
    expect(holeCard(p, 'relay1.com').title).toBe('RELAY1 · COM (common)');
    expect(deleteMany(p, { parts: ['relay1'], wires: [] }).wires).toEqual([]);
  });
});

describe('M7 the ULN2003 brings its 28BYJ-48, its cable in the socket', () => {
  const uln = () => addPart(empty(), 'uln2003', freeSpot(sceneOf(empty()), 'uln2003')!);

  it('one edit: the ULN2003 in the breadboard, the stepper above it, plugged into its socket', () => {
    const { project: p, id } = uln();
    expect(id).toBe('uln1');
    expect(p.parts.map((x) => [x.id, x.type])).toEqual([['uln1', 'uln2003'], ['step1', 'stepper']]);
    expect(p.parts[1]!.legs).toEqual({ blue: 'uln1.a', pink: 'uln1.b', yellow: 'uln1.c', orange: 'uln1.d', red: 'uln1.m' });
    // it lies right of the breadboard, its place kept
    expect(p.view!.parts!.step1!.x).toBeGreaterThan(at(p, 'bb1.j30')!.x + 40);
    // the socket is taken by the cable; the cable's own plug isn't a point while it is in
    const refs = points(p).filter((q) => q.on === 'terminal').map((q) => q.ref);
    expect(refs).toEqual(['uln1.a', 'uln1.b', 'uln1.c', 'uln1.d', 'uln1.m']);
    for (const r of refs) expect(usedPoints(p).has(r)).toBe(true);
    expect(connect(toCircuit(p, boardData('pico-w'))).problems).toEqual([]);
  });

  it('deleting the ULN2003 unplugs the stepper: its plug\'s pins are points then', () => {
    const p = deleteMany(uln().project, { parts: ['uln1'], wires: [] });
    expect(p.parts).toEqual([{ id: 'step1', type: 'stepper', props: {}, legs: {} }]);
    expect(points(p).filter((q) => q.on === 'terminal').map((q) => q.ref)).toEqual(['step1.blue', 'step1.pink', 'step1.yellow', 'step1.orange', 'step1.red']);
  });

  it('copied together, the copy\'s cable is in the copy\'s socket; the stepper copied alone is unplugged', () => {
    const p = uln().project;
    const c = duplicate(p, { parts: ['uln1', 'step1'], wires: [] })!;
    expect(c.parts).toEqual(['uln2', 'step2']);
    expect(c.project.parts.find((x) => x.id === 'step2')!.legs).toEqual({ blue: 'uln2.a', pink: 'uln2.b', yellow: 'uln2.c', orange: 'uln2.d', red: 'uln2.m' });
    const s = duplicate(p, { parts: ['step1'], wires: [] })!;
    expect(s.project.parts.find((x) => x.id === 'step2')!.legs).toEqual({});
  });
});

describe('M7 the breadboard power supply on the rails', () => {
  it('its two pins in each rail, at the breadboard\'s left end; not on a mini breadboard', () => {
    const legs = freeSpot(sceneOf(empty()), 'power-supply')!;
    expect(legs).toEqual({ 't-1': 'bb1.T-1', 't-2': 'bb1.T-2', 't+1': 'bb1.T+1', 't+2': 'bb1.T+2', 'b+1': 'bb1.B+1', 'b+2': 'bb1.B+2', 'b-1': 'bb1.B-1', 'b-2': 'bb1.B-2' });
    expect(partKind('power-supply').props).toEqual({ top: 5, bottom: 3.3 });
    const mini = setBreadboardSize(empty(), 'bb1', 'mini')!;
    expect(freeSpot(sceneOf(mini), 'power-supply')).toBeUndefined();
  });
});
