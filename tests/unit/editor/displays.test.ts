import { describe, expect, it } from 'vitest';
import { addPart, addWire, deleteMany, duplicate, fitBox, freeBox, freeSpot, moveParts, pointAt, rotateParts, sceneOf, terminalsOf } from '@lib/editor';
import { connect } from '@lib/circuit';
import { boardData } from '@lib/editor';
import { parseProject, toCircuit, type Project } from '@lib/project';
import { newProject } from './with-breadboard';

/** M7 slice 2 (screens 26, 26b): the displays in the editor — and, as the teacher asked, the ones beside the
 *  breadboard turned a quarter at a time about their body's middle, their header pins and wires with them. */
const empty = () => newProject('pico-w').project;
const at = (p: Project, ref: string) => pointAt(sceneOf(p), ref);

describe('M7 the displays in the editor', () => {
  it('the OLED stands in row f by its four pins; the digit straddles the gap, its pins in rows h and d', () => {
    expect(freeSpot(sceneOf(empty()), 'ssd1306')).toEqual({ gnd: 'bb1.f1', vcc: 'bb1.f2', scl: 'bb1.f3', sda: 'bb1.f4' });
    const d = freeSpot(sceneOf(empty()), 'seven-segment')!;
    expect([d.e, d.dp, d.g, d.b]).toEqual(['bb1.h1', 'bb1.h5', 'bb1.d1', 'bb1.d5']);
  });

  it('the LCD, the TM1637 and the matrix lie beside it, their header pins points: the LCD\'s down its left end', () => {
    const p = addPart(empty(), 'lcd1602', {}, { x: 400, y: 104 }).project;
    expect(Object.entries(terminalsOf(sceneOf(p), p.parts[0]!))).toEqual([
      ['gnd', { x: 370, y: 138 }], ['vcc', { x: 370, y: 152 }], ['sda', { x: 370, y: 166 }], ['scl', { x: 370, y: 180 }],
    ]);
    const m = addPart(empty(), 'max7219', {}, { x: 400, y: 104 }).project;
    expect(Object.keys(terminalsOf(sceneOf(m), m.parts[0]!))).toEqual(['vcc', 'gnd', 'din', 'cs', 'clk', 'vcc2', 'gnd2', 'dout', 'cs2', 'clk2']);
  });
});

describe('M7 a display beside the breadboard turned (the teacher\'s request)', () => {
  const lcd = () => addPart(empty(), 'lcd1602', {}, { x: 400, y: 104 }).project;

  it('a quarter turn clockwise about its body\'s middle: its pins go from its left end to its top; four turns, back as it was', () => {
    let p = rotateParts(lcd(), ['lcd1'])!;
    expect(p.view!.parts!.lcd1).toEqual({ x: 400, y: 104, turns: 1 });
    // the body [−38, 0, 300, 108] is 338 × 108 about (131, 54): turned, 108 × 338
    expect(freeBox('lcd1602', 1)).toEqual([77, -115, 185, 223]);
    // GND at (−30, 34): (−161, −20) from the middle, turned (20, −161) → (151, −107)
    expect(at(p, 'lcd1.gnd')).toEqual({ x: 551, y: -3 });
    for (let i = 0; i < 3; i++) p = rotateParts(p, ['lcd1'])!;
    expect(p.view!.parts!.lcd1).toEqual({ x: 400, y: 104 });
    expect(at(p, 'lcd1.gnd')).toEqual({ x: 370, y: 138 });
  });

  it('its wires stay on its pins; moved and copied, it keeps its turns; the fit takes its turned body', () => {
    let p = addWire(rotateParts(lcd(), ['lcd1'])!, 'board.GP20', 'lcd1.sda')!;
    const net = (q: Project) => connect(toCircuit(q, boardData('pico-w'))).netOf('lcd1.sda');
    expect(net(p)).toBe(connect(toCircuit(p, boardData('pico-w'))).netOf('board.GP20'));
    p = moveParts(p, ['lcd1'], { x: 32, y: 16 })!;
    expect(p.view!.parts!.lcd1).toEqual({ x: 432, y: 120, turns: 1 });
    const c = duplicate(p, { parts: ['lcd1'], wires: [] })!;
    expect(c.project.view!.parts!.lcd2!.turns).toBe(1);
    const b = fitBox(sceneOf(p));
    expect(b.y).toBeLessThan(120 - 115);
    expect(parseProject(p)).toEqual(p);
    expect(deleteMany(p, { parts: ['lcd1'], wires: [] }).wires).toEqual([]);
  });

  it('turned with a part in the breadboard: the part in holes turns as before, the display where it lies', () => {
    const p = addPart(lcd(), 'ssd1306', { gnd: 'bb1.f10', vcc: 'bb1.f11', scl: 'bb1.f12', sda: 'bb1.f13' }).project;
    const q = rotateParts(p, ['lcd1', 'oled1'])!;
    expect(q.view!.parts!.lcd1!.turns).toBe(1);
    expect(new Set(Object.values(q.parts.find((x) => x.id === 'oled1')!.legs)).size).toBe(4);
    expect(q.parts.find((x) => x.id === 'oled1')!.legs).not.toEqual(p.parts.find((x) => x.id === 'oled1')!.legs);
  });

  it('put down turned (R while placing): it lies turned from the start', () => {
    const p = addPart(empty(), 'tm1637', {}, { x: 400, y: 104 }, 3).project;
    expect(p.view!.parts!.tm1).toEqual({ x: 400, y: 104, turns: 3 });
    expect(addPart(empty(), 'tm1637', {}, { x: 400, y: 104 }, 4).project.view!.parts!.tm1).toEqual({ x: 400, y: 104 });
  });
});
