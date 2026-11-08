import { describe, expect, it } from 'vitest';
import { parseBoard } from '@lib/boards';
import { connect } from '@lib/circuit';
import { addPart, addWire, deletePart, deleteWire, moveBoard, moveBreadboard, movePart, sceneOf, setBreadboardSize, setPartProp, setWireColour, snapToGrid } from '@lib/editor';
import { parseProject, toCircuit } from '@lib/project';
import { newProject } from './with-breadboard';
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

  it('moving the board or the breadboard keeps the whole view in the project, on the half-hole grid (8 units)', () => {
    const p0 = empty();
    const v = sceneOf(p0).view;
    const p1 = moveBoard(p0, { x: 10.6, y: -3.9 });
    expect(p1.view).toEqual({ ...v, board: { x: 8, y: 0 } });
    const p2 = moveBreadboard(p1, 'bb1', { x: 3, y: 500 });
    expect(p2.view).toEqual({ board: { x: 8, y: 0 }, breadboards: { bb1: { x: 0, y: 504 } } });
    expect(parseProject(p2)).toEqual(p2);
  });

  it('the grid: 8 units, never -0', () => {
    expect(snapToGrid({ x: 11.9, y: -3.9 })).toEqual({ x: 8, y: 0 });
    expect(Object.is(snapToGrid({ x: -1, y: 0 }).x, 0)).toBe(true);
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

describe('M4.3b F-11, F-13, F-14: bends, colours, values, delete, the breadboard\'s size', () => {
  it('a wire keeps its bend points, on the grid', () => {
    const p = addWire(empty(), 'board.GP15', 'bb1.a5', [{ x: 101, y: 47 }, { x: 101, y: 230 }])!;
    expect(p.wires[0]).toEqual({ id: 'w1', a: 'board.GP15', b: 'bb1.a5', via: [{ x: 104, y: 48 }, { x: 104, y: 232 }] });
    expect(parseProject(p)).toEqual(p);
    expect(addWire(empty(), 'board.GP15', 'bb1.a5', [])!.wires[0]).toEqual({ id: 'w1', a: 'board.GP15', b: 'bb1.a5' });
  });

  it('moving a breadboard moves the bends of wires that start and end on it, not of wires to the board', () => {
    let p = addWire(empty(), 'bb1.a1', 'bb1.a20', [{ x: 40, y: 296 }])!;
    p = addWire(p, 'board.GP15', 'bb1.a5', [{ x: 40, y: 200 }])!;
    const at = sceneOf(p).view.breadboards.bb1!;
    p = moveBreadboard(p, 'bb1', { x: at.x + 16, y: at.y + 32 });
    expect(p.wires.map((w) => w.via)).toEqual([[{ x: 56, y: 328 }], [{ x: 40, y: 200 }]]);
    p = moveBoard(addWire(p, 'board.GND@3', 'board.GND@8', [{ x: 0, y: 0 }])!, { x: 16, y: 8 });
    expect(p.wires[2]!.via).toEqual([{ x: 16 - sceneOf(empty()).view.board.x, y: 8 }]);
  });

  it('a wire\'s colour is chosen', () => {
    const p = setWireColour(addWire(empty(), 'board.GP15', 'bb1.a5')!, 'w1', 'purple');
    expect(p.wires[0]!.color).toBe('purple');
    expect(parseProject(p)).toEqual(p);
  });

  it('a part\'s value or colour is set; the others stay', () => {
    const { project } = addPart(empty(), 'resistor', { a: 'bb1.a1', b: 'bb1.a4' });
    expect(setPartProp(project, 'r1', 'ohms', 1000).parts[0]!.props).toEqual({ ohms: 1000 });
    expect(project.parts[0]!.props).toEqual({ ohms: 220 });
  });

  it('delete a part, or a wire', () => {
    let p = addPart(empty(), 'resistor', { a: 'bb1.a1', b: 'bb1.a4' }).project;
    p = addWire(p, 'board.GP15', 'bb1.c1')!;
    expect(deletePart(p, 'r1').parts).toEqual([]);
    expect(deleteWire(p, 'w1').wires).toEqual([]);
    expect(deletePart(p, 'r1').wires).toHaveLength(1);
  });

  it('a half breadboard becomes full; a full one becomes half only when nothing uses columns 31–63', () => {
    let p = setBreadboardSize(empty(), 'bb1', 'full')!;
    expect(p.breadboards).toEqual([{ id: 'bb1', size: 'full' }]);
    p = addPart(p, 'resistor', { a: 'bb1.a40', b: 'bb1.a43' }).project;
    expect(setBreadboardSize(p, 'bb1', 'half')).toBeUndefined();
    p = addWire(deletePart(p, 'r1'), 'board.GP15', 'bb1.T-55')!;
    expect(setBreadboardSize(p, 'bb1', 'half')).toBeUndefined();
    expect(setBreadboardSize(deleteWire(p, 'w1'), 'bb1', 'half')!.breadboards[0]!.size).toBe('half');
  });
});

describe('M6.1 the micro:bit GPIO board\'s micro-USB (screen 17b)', () => {
  it('taken out: usb false; plugged back in: not set, as a new project', async () => {
    const { setUsb } = await import('@lib/editor');
    const { newProject } = await import('@lib/project');
    const p = newProject('microbit-v2').project;
    expect(p.usb).toBeUndefined();
    const out = setUsb(p, false);
    expect(out.usb).toBe(false);
    expect('usb' in setUsb(out, true)).toBe(false);
    expect(setUsb(p, true)).toBe(p);   // nothing changed: no undo step
  });
});
