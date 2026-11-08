import { describe, expect, it } from 'vitest';
import { addPart, addWire, boardData, freeBox, kindTerminals, legsCentre, pointAt, rotateParts, sceneOf, setNeoPixel, terminalsOf } from '@lib/editor';
import { connect } from '@lib/circuit';
import { toCircuit, type Project } from '@lib/project';
import { newProject } from './with-breadboard';

/** M7 slice 3 (screens 27, 27b, 27c): a NeoPixel in the editor — a stick or a ring beside the breadboard, its pads and
 *  body following its shape and LED count (the inspector's Shape and LEDs). */
const empty = () => newProject('pico-w').project;
const at = (p: Project, ref: string) => pointAt(sceneOf(p), ref);
const stick = () => addPart(empty(), 'neopixel', {}, { x: 400, y: 104 }).project;

describe('M7 a NeoPixel beside the breadboard', () => {
  it('a new one is a stick of 8 (NEO1): DIN 5V GND out of its left end, DOUT 5V GND out of its right, 22 an LED', () => {
    const p = stick();
    expect(p.parts[0]).toMatchObject({ id: 'neo1', type: 'neopixel', props: { shape: 'stick', leds: 8 } });
    expect(terminalsOf(sceneOf(p), p.parts[0]!)).toEqual({
      din: { x: 392, y: 114 }, vcc: { x: 392, y: 126 }, gnd: { x: 392, y: 138 },
      dout: { x: 624, y: 114 }, vcc2: { x: 624, y: 126 }, gnd2: { x: 624, y: 138 },   // 8 × 22 + 40 = 216 long
    });
    expect(freeBox('neopixel', 0, { shape: 'stick', leds: 30 })).toEqual([-12, 0, 712, 44]);
  });

  it('a ring has DIN GND 5V DOUT on a header below it, and no 5V or GND out; bigger rings are bigger', () => {
    expect(Object.keys(kindTerminals('neopixel', { shape: 'ring', leds: 12 }))).toEqual(['din', 'gnd', 'vcc', 'dout']);
    expect(kindTerminals('neopixel', { shape: 'ring', leds: 12 }).din).toEqual([-18, 76]);
    expect(freeBox('neopixel', 0, { shape: 'ring', leds: 24 })).toEqual([-90, -90, 90, 116]);
  });

  it('made a ring of 12, the middle of its body stays where it was (on the grid); wires on its 5V and GND out go, the others stay', () => {
    let p = stick();
    for (const [a, b] of [['board.GP0', 'neo1.din'], ['board.VBUS', 'neo1.vcc'], ['board.GND', 'neo1.gnd'], ['neo1.vcc2', 'bb1.T+1'], ['neo1.gnd2', 'bb1.T-1']] as const) p = addWire(p, a, b)!;
    const middle = (q: Project) => {
      const l = q.view!.parts!.neo1!;
      const [cx, cy] = legsCentre('neopixel', 0, q.parts[0]!.props);
      return { x: l.x + cx, y: l.y + cy };
    };
    const before = middle(p);
    const ring = setNeoPixel(p, 'neo1', 'ring', 12);
    expect(ring.parts[0]!.props).toEqual({ shape: 'ring', leds: 12 });
    // where it lies is on the canvas grid: the middle within half a step of where it was
    expect(Math.abs(middle(ring).x - before.x)).toBeLessThanOrEqual(4);
    expect(Math.abs(middle(ring).y - before.y)).toBeLessThanOrEqual(4);
    expect(ring.wires.map((w) => `${w.a}-${w.b}`)).toEqual(['board.GP0-neo1.din', 'board.VBUS-neo1.vcc', 'board.GND-neo1.gnd']);
    const lies = ring.view!.parts!.neo1!;
    expect(at(ring, 'neo1.din')).toEqual({ x: lies.x - 18, y: lies.y + 76 });
    const c = connect(toCircuit(ring, boardData('pico-w')));
    expect(c.problems).toEqual([]);
    expect(c.netOf('neo1.din')).toBe(c.netOf('board.GP0'));
  });

  it('turned a quarter, its pads turn about its body\'s middle and the wires stay on them', () => {
    const p = addWire(stick(), 'board.GP0', 'neo1.din')!;
    const q = rotateParts(p, ['neo1'])!;
    // the body [−12, 0, 228, 44] about (108, 22): DIN (−8, 10) is (−116, −12) from it, turned (12, −116) → (120, −94)
    expect(at(q, 'neo1.din')).toEqual({ x: 520, y: 10 });
    expect(q.wires[0]).toMatchObject({ a: 'board.GP0', b: 'neo1.din' });
  });
});
