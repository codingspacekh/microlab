import { describe, expect, it } from 'vitest';
import {
  addWire, allPoints, artOf, boardArt, boardData, MICROBIT_ALONE_ART, moveBoard, pointAt, putInGpioBoard, RING_LABELS, ringPins, sceneOf,
  takeOutOfGpioBoard,
} from '@lib/editor';
import { microbitAlone, onGpioBoard, parseProject, type Project } from '@lib/project';
import { newProject } from './with-breadboard';

/** M6.9 (screens 24, 24b): a new micro:bit project is the micro:bit alone, wired at its five rings; its GPIO board
 *  puts it into its slot (every pin), and takes it out again. */
const alone = () => newProject('microbit-v2').project;
const wire = (p: Project, a: string, b: string) => {
  const next = addWire(p, a, b);
  if (!next) throw new Error(`no wire ${a} → ${b}`);
  return next;
};
const boardPoints = (p: Project) => allPoints(sceneOf(p)).filter((q) => q.on === 'board').map((q) => q.ref).sort();
/** The middle of the board's bottom edge. */
const bottom = (p: Project) => {
  const s = sceneOf(p);
  return { x: s.view.board.x + s.art.width / 2, y: s.view.board.y + s.art.height };
};

describe('M6.9 the micro:bit alone', () => {
  it('a new micro:bit project is the micro:bit alone; one saved before M6.9 is in its GPIO board', () => {
    const p = alone();
    expect(p.gpioBoard).toBe(false);
    expect(microbitAlone(p)).toBe(true);
    expect(onGpioBoard(p)).toBe(false);
    const before = parseProject({ format: 1, board: 'microbit-v2', breadboards: [], parts: [], wires: [] });
    expect(onGpioBoard(before)).toBe(true);
    expect(artOf(before)).toBe(boardArt('microbit-v2'));
    // the other boards are neither
    const pico = newProject('pico-w').project;
    expect(microbitAlone(pico) || onGpioBoard(pico)).toBe(false);
    expect(artOf(pico)).toBe(boardArt('pico-w'));
  });

  it('its five rings are its only pins on the canvas: 0, 1, 2, 3V and GND, the same pins as the header\'s', () => {
    expect(boardPoints(alone())).toEqual(['board.3.3V', 'board.GND', 'board.P0', 'board.P1', 'board.P2']);
    expect([...ringPins()].sort()).toEqual(['board.3.3V', 'board.GND', 'board.P0', 'board.P1', 'board.P2']);
    expect(Object.keys(RING_LABELS).map((id) => `board.${id}`).sort()).toEqual([...ringPins()].sort());
    expect(sceneOf(alone()).art).toBe(MICROBIT_ALONE_ART);
    // a pin it has no ring for is nowhere on the canvas
    expect(pointAt(sceneOf(alone()), 'board.P8')).toBeUndefined();
    expect(pointAt(sceneOf(alone()), 'board.P0')).toBeDefined();
  });

  it('the rings are along its bottom edge, left to right: 0, 1, 2, 3V, GND', () => {
    const at = (id: string) => MICROBIT_ALONE_ART.pins[String(boardData('microbit-v2').pins.find((p) => p.id === id)!.number)]!;
    const xs = ['P0', 'P1', 'P2', '3.3V', 'GND'].map((id) => at(id)[0]);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    for (const id of ['P0', 'P1', 'P2', '3.3V', 'GND']) expect(at(id)[1]).toBeGreaterThan(MICROBIT_ALONE_ART.height * 0.7);
  });

  it('a wire goes straight to a ring, as a crocodile clip', () => {
    const p = wire(alone(), 'board.P0', 'bb1.e5');
    expect(p.wires).toEqual([{ id: 'w1', a: 'board.P0', b: 'bb1.e5' }]);
  });
});

describe('M6.9 into its GPIO board, and out', () => {
  it('in: every pin, the wires on the same pins, the board grown upwards from its bottom edge', () => {
    const p = wire(wire(alone(), 'board.P0', 'bb1.e5'), 'board.GND', 'bb1.e10');
    const bbBefore = sceneOf(p).view.breadboards.bb1;
    const q = putInGpioBoard(p);
    expect(onGpioBoard(q)).toBe(true);
    expect('gpioBoard' in q).toBe(false);   // as a project saved before M6.9
    expect(q.wires).toEqual(p.wires);
    expect(boardPoints(q)).toHaveLength(30);
    expect(sceneOf(q).view.breadboards.bb1).toEqual(bbBefore);   // nothing else moves, though the view wasn't set
    const [b0, b1] = [bottom(p), bottom(q)];
    expect(Math.abs(b1.x - b0.x)).toBeLessThanOrEqual(8);   // on the grid
    expect(Math.abs(b1.y - b0.y)).toBeLessThanOrEqual(8);
    expect(sceneOf(q).view.board.y).toBeLessThan(sceneOf(p).view.board.y);
    expect(putInGpioBoard(q)).toBe(q);   // in already
    const pico = newProject('pico-w').project;
    expect(putInGpioBoard(pico)).toBe(pico);
  });

  it('a moved board stays where it was put', () => {
    const p = moveBoard(alone(), { x: 400, y: -200 });
    const q = putInGpioBoard(p);
    expect(bottom(q).x).toBeCloseTo(bottom(p).x, -1);
    expect(Math.abs(bottom(q).y - bottom(p).y)).toBeLessThanOrEqual(8);
  });

  it('out: the wires on pins it has no ring for go with the GPIO board, and its plugs and micro-USB; the rest stay', () => {
    const inBoard = putInGpioBoard(alone());
    let p = wire(inBoard, 'board.P0', 'bb1.e5');
    p = wire(p, 'board.P8', 'bb1.e7');
    p = wire(p, 'board.5V', 'bb1.T+1');
    p = wire(p, 'board.GND', 'bb1.T-1');
    p = { ...p, usb: false, plugs: { P3: 'bb1.e20' } };
    const r = takeOutOfGpioBoard(p);
    expect(r.removed).toBe(2);
    expect(r.project.wires.map((w) => `${w.a} ${w.b}`)).toEqual(['board.P0 bb1.e5', 'board.GND bb1.T-1']);
    expect(r.project.gpioBoard).toBe(false);
    expect(r.project.usb).toBeUndefined();
    expect(r.project.plugs).toBeUndefined();
    expect(microbitAlone(r.project)).toBe(true);
    expect(parseProject(r.project)).toEqual(r.project);
    // and back in: the wires that stayed are on the same pins
    expect(putInGpioBoard(r.project).wires).toEqual(r.project.wires);
  });

  it('out with nothing to take off says none; the micro:bit alone, or any other board, is left as it is', () => {
    expect(takeOutOfGpioBoard(putInGpioBoard(alone())).removed).toBe(0);
    const a = alone();
    expect(takeOutOfGpioBoard(a)).toEqual({ project: a, removed: 0 });
    const pico = newProject('pico-w').project;
    expect(takeOutOfGpioBoard(pico).project).toBe(pico);
  });

  it('out keeps the board\'s bottom edge where it was, so in and out again lands it where it started', () => {
    const p = alone();
    const back = takeOutOfGpioBoard(putInGpioBoard(p)).project;
    expect(Math.abs(bottom(back).x - bottom(p).x)).toBeLessThanOrEqual(8);
    expect(Math.abs(bottom(back).y - bottom(p).y)).toBeLessThanOrEqual(8);
  });
});
