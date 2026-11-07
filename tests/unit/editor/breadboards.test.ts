import { describe, expect, it } from 'vitest';
import { holes, strips } from '@lib/circuit';
import { addBreadboard, BREADBOARD, holeOffset, moveBoard, pointAt, sceneOf, setBreadboardSize } from '@lib/editor';
import { newProject } from '@lib/project';

/** M6.8 (screens 23, 23b, approved 2026-11-08): a new project is the board alone; breadboards — mini, half, full —
 *  come from the parts panel. */
const bare = () => newProject('pico-w').project;

describe('M6.8 breadboards from the parts panel', () => {
  it('a new project has the board and no breadboard', () => {
    expect(bare().breadboards).toEqual([]);
  });

  it('a mini breadboard: 17 columns, rows a–j, no rails — 170 holes; its body is the rows only', () => {
    expect(holes('mini')).toHaveLength(170);
    expect(holes('half')).toHaveLength(300 + 4 * 25);   // 400, with the rails
    expect(strips('mini')).toHaveLength(34);
    expect(holeOffset('T+1', 'mini')).toBeUndefined();
    expect(holeOffset('a17', 'mini')).toBeDefined();
    expect(holeOffset('a18', 'mini')).toBeUndefined();
    expect(BREADBOARD.size('mini')).toEqual({ width: 16 * 16 + 48, top: 44, height: 212 });
  });

  it('the first goes where a new project used to have it (the board centred over it); the next under it', () => {
    const one = addBreadboard(bare(), 'half');
    expect(one.id).toBe('bb1');
    expect(one.project.breadboards).toEqual([{ id: 'bb1', size: 'half' }]);
    expect(one.project.view).toBeUndefined();   // laid out as before: tests and old projects keep their geometry
    const two = addBreadboard(one.project, 'mini');
    expect(two.id).toBe('bb2');
    const v = two.project.view!;
    expect(v.breadboards.bb2!.x).toBe(v.breadboards.bb1!.x);
    expect(Math.abs(v.breadboards.bb2!.y + BREADBOARD.size('mini').top - (v.breadboards.bb1!.y + 298 + 40))).toBeLessThanOrEqual(8);   // on the grid
  });

  it('one dropped at a point is centred on it; after the board was moved, the first goes under the board', () => {
    const one = addBreadboard(bare(), 'half').project;
    const three = addBreadboard(one, 'full', { x: 1000, y: 800 });
    const at = three.project.view!.breadboards.bb2!;
    const s = BREADBOARD.size('full');
    expect(Math.abs(at.x + s.width / 2 - 1000)).toBeLessThanOrEqual(4);
    const moved = moveBoard(bare(), { x: 400, y: 0 });
    const under = addBreadboard(moved, 'half').project;
    expect(pointAt(sceneOf(under), 'bb1.a1')!.y).toBeGreaterThan(sceneOf(under).view.board.y + 100);
  });

  it('a breadboard turned mini cannot keep a leg on a rail or past column 17', () => {
    const p = addBreadboard(bare(), 'half').project;
    const onRail = { ...p, wires: [{ id: 'w1', a: 'board.GND@38', b: 'bb1.T-1' }] };
    expect(setBreadboardSize(onRail, 'bb1', 'mini')).toBeUndefined();
    const far = { ...p, parts: [{ id: 'r1', type: 'resistor', legs: { a: 'bb1.a20', b: 'bb1.a23' } }] };
    expect(setBreadboardSize(far, 'bb1', 'mini')).toBeUndefined();
    expect(setBreadboardSize(p, 'bb1', 'mini')!.breadboards[0]!.size).toBe('mini');
  });
});
