import { describe, expect, it } from 'vitest';
import { parseBoard } from '@lib/boards';
import { parseProject, toCircuit } from '@lib/project';
import { solve, toNetlist } from '@lib/circuit';
import picoJson from '../../../library/boards/pico-w/board.json';
import mbitJson from '../../../library/boards/microbit-v2/board.json';

describe('M3 project.json', () => {
  const ok = { format: 1, board: 'pico-w', breadboards: [{ id: 'bb1', size: 'half' }], parts: [], wires: [], plugs: { GP0: 'bb1.c1' }, jumpers: { V: 3.3 } };
  it('reads a project and makes its circuit on the board\'s data', () => {
    const c = toCircuit(parseProject(ok), parseBoard(picoJson));
    expect(c.board).toMatchObject({ plugs: { GP0: 'bb1.c1' }, jumpers: { V: 3.3 } });
    expect(c.breadboards).toEqual([{ id: 'bb1', size: 'half' }]);
    const plain = toCircuit(parseProject({ ...ok, plugs: undefined, jumpers: undefined }), parseBoard(picoJson));
    expect(Object.keys(plain.board!)).toEqual(['data']);
  });
  it('refuses a bad file, saying where', () => {
    expect(() => parseProject({ ...ok, breadboards: [{ id: 'bb1', size: 'huge' }] })).toThrow(/breadboards\.0\.size/);
  });
  it('refuses the wrong board', () => {
    expect(() => toCircuit(parseProject({ ...ok, board: 'microbit-v2' }), parseBoard(picoJson))).toThrow(/for microbit-v2, not pico-w/);
  });
});

describe('M6.1 the micro:bit GPIO board\'s own micro-USB (its 5V pins)', () => {
  // 5V → 220 Ω → red LED → GND, on the GPIO board's 2 × 13 header
  const project = (usb?: boolean) => parseProject({
    format: 1, board: 'microbit-v2', breadboards: [{ id: 'bb1', size: 'half' }],
    parts: [
      { id: 'r1', type: 'resistor', props: { ohms: 220 }, legs: { a: 'bb1.a5', b: 'bb1.a8' } },
      { id: 'led1', type: 'led', props: { color: 'red' }, legs: { a: 'bb1.b8', k: 'bb1.b10' } },
    ],
    wires: [{ id: 'w1', a: 'board.5V', b: 'bb1.e5' }, { id: 'w2', a: 'board.GND', b: 'bb1.e10' }],
    ...(usb === undefined ? {} : { usb }),
  });
  const amps = (usb?: boolean) => solve(toNetlist(toCircuit(project(usb), parseBoard(mbitJson))).netlist).amps.led1!;

  it('kept in project.json; plugged in, 5V gives (5 − 2.0) / 220', () => {
    expect(project(true).usb).toBe(true);
    expect(toCircuit(project(true), parseBoard(mbitJson)).board!.usb).toBe(true);
    expect(amps(true)).toBeCloseTo(3 / 220, 3);
  });
  it('not plugged in: the 5V pins give nothing, the LED stays dark', () => {
    expect(Math.abs(amps(false))).toBeLessThan(1e-6);
  });
  it('a project without it is as before: plugged in', () => {
    expect(project().usb).toBeUndefined();
    expect(amps()).toBeCloseTo(3 / 220, 3);
  });
});
