import { describe, expect, it } from 'vitest';
import { parseBoard } from '@lib/boards';
import { connect } from '@lib/circuit';
import { addPart, addWire, moveBoard, moveBreadboard, movePart, sceneOf } from '@lib/editor';
import { newProject, parseProject, toCircuit } from '@lib/project';
import picoJson from '../../../library/boards/pico-w/board.json';

/** M4.3 F-10, F-11, F-13: the edits, as pure functions on the project (undo comes in M5). */
const empty = () => newProject('pico-w').project;

describe('M4.3 editing the circuit', () => {
  it('adding parts names them by kind (r1, r2, led1, btn1, pot1) with their first props; the old project is unchanged', () => {
    const p0 = empty();
    const a = addPart(p0, 'resistor', { a: 'bb1.a1', b: 'bb1.a4' });
    const b = addPart(a.project, 'resistor', { a: 'bb1.b1', b: 'bb1.b4' });
    const c = addPart(b.project, 'led', { a: 'bb1.c1', k: 'bb1.c3' });
    expect([a.id, b.id, c.id]).toEqual(['r1', 'r2', 'led1']);
    expect(c.project.parts[2]).toEqual({ id: 'led1', type: 'led', props: { color: 'red' }, legs: { a: 'bb1.c1', k: 'bb1.c3' } });
    expect(p0.parts).toEqual([]);
    expect(addPart(p0, 'button', { '1a': 'bb1.e1', '2a': 'bb1.e3', '1b': 'bb1.f1', '2b': 'bb1.f3' }).id).toBe('btn1');
    expect(addPart(p0, 'potentiometer', { 1: 'bb1.a1', 2: 'bb1.a3', 3: 'bb1.a5' }).id).toBe('pot1');
  });

  it('a removed name is not used twice: after r1 and r3, the next is r4', () => {
    const p = { ...empty(), parts: [{ id: 'r1', type: 'resistor', legs: { a: 'bb1.a1', b: 'bb1.a4' } }, { id: 'r3', type: 'resistor', legs: { a: 'bb1.b1', b: 'bb1.b4' } }] };
    expect(addPart(p, 'resistor', { a: 'bb1.c1', b: 'bb1.c4' }).id).toBe('r4');
  });

  it('moving a part changes only its legs', () => {
    const { project } = addPart(empty(), 'resistor', { a: 'bb1.a1', b: 'bb1.a4' });
    const moved = movePart(project, 'r1', { a: 'bb1.c10', b: 'bb1.c13' });
    expect(moved.parts[0]).toEqual({ ...project.parts[0], legs: { a: 'bb1.c10', b: 'bb1.c13' } });
  });

  it('a wire joins two free points; not a point to itself, nor a point in use', () => {
    const p = addWire(empty(), 'board.GP15', 'bb1.a5')!;
    expect(p.wires).toEqual([{ id: 'w1', a: 'board.GP15', b: 'bb1.a5' }]);
    expect(addWire(p, 'bb1.a6', 'bb1.a6')).toBeUndefined();
    expect(addWire(p, 'board.GP15', 'bb1.a9')).toBeUndefined();
    expect(addWire(p, 'bb1.a9', 'bb1.a5')).toBeUndefined();
    expect(addWire(p, 'board.GND@3', 'bb1.T-1')!.wires[1]!.id).toBe('w2');
  });

  it('moving the board or the breadboard keeps the whole view in the project, on whole units', () => {
    const p0 = empty();
    const v = sceneOf(p0).view;
    const p1 = moveBoard(p0, { x: 10.6, y: -4.2 });
    expect(p1.view).toEqual({ ...v, board: { x: 11, y: -4 } });
    const p2 = moveBreadboard(p1, 'bb1', { x: 3, y: 500 });
    expect(p2.view).toEqual({ board: { x: 11, y: -4 }, breadboards: { bb1: { x: 3, y: 500 } } });
    expect(parseProject(p2)).toEqual(p2);
  });

  it('Blink built by these edits is the circuit the engine expects: GP15 → resistor → LED → GND', () => {
    let p = empty();
    p = addPart(p, 'resistor', { a: 'bb1.a5', b: 'bb1.a8' }).project;
    p = addPart(p, 'led', { a: 'bb1.b8', k: 'bb1.b10' }).project;
    p = addWire(p, 'board.GP15', 'bb1.e5')!;
    p = addWire(p, 'board.GND@38', 'bb1.e10')!;
    const nets = connect(toCircuit(parseProject(p), parseBoard(picoJson)));
    expect(nets.netOf('bb1.c5')).toBe(nets.netOf('board.GP15'));
    expect(nets.netOf('bb1.d10')).toBe(nets.netOf('board.GND@3'));
  });
});
