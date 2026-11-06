import { describe, expect, it } from 'vitest';
import { BOARD_IDS } from '@lib/boards';
import { BREADBOARD, boardArt, boardData, defaultView, holeOffset, nearestPoint, pointAt, sceneOf } from '@lib/editor';
import { newProject } from '@lib/project';

/** M4.3 F-12, F-13: where every hole and pin is on the canvas, as in the approved drawing (16 units = 0.1 in). */
describe('M4.3 the breadboard\'s holes', () => {
  it.each([
    ['a1', 24, 62], ['e1', 24, 126], ['f1', 24, 174], ['j30', 24 + 29 * 16, 238],
    ['T-1', 24, 18], ['T+2', 40, 34], ['B+1', 24, 264], ['B-29', 24 + 28 * 16, 280],
  ])('%s is at (%d, %d) from the breadboard\'s corner', (hole, x, y) => {
    expect(holeOffset(hole, 'half')).toEqual({ x, y });
  });

  it.each(['T-6', 'B+12', 'B-30', 'k1', 'a31', 'a0', 'x', ''])('%j is not a hole on a half breadboard', (hole) => {
    expect(holeOffset(hole, 'half')).toBeUndefined();
  });

  it('a full breadboard has 63 columns; a half one is 512 × 298', () => {
    expect(holeOffset('a63', 'full')).toEqual({ x: 24 + 62 * 16, y: 62 });
    expect(BREADBOARD.size('half')).toEqual({ width: 512, height: 298 });
  });
});

describe('M4.3 points on the canvas', () => {
  const scene = sceneOf(newProject('pico-w').project);

  it('a hole is where its breadboard is, plus its place on it', () => {
    const bb = scene.view.breadboards.bb1!;
    expect(pointAt(scene, 'bb1.a5')).toEqual({ x: bb.x + 24 + 64, y: bb.y + 62 });
  });

  it('a board pin is where the board is, plus the pin on its picture (GP15 is pin 20 on the Pico)', () => {
    const [px, py] = boardArt('pico-w').pins['20']!;
    expect(pointAt(scene, 'board.GP15')).toEqual({ x: scene.view.board.x + px, y: scene.view.board.y + py });
    expect(pointAt(scene, 'board.GND@38')).toBeDefined();
  });

  it.each(['board.NOPE', 'bb2.a1', 'bb1.z9', 'nonsense'])('%s is nowhere', (ref) => {
    expect(pointAt(scene, ref)).toBeUndefined();
  });

  it('the nearest point within reach, or none', () => {
    const p = pointAt(scene, 'bb1.c7')!;
    expect(nearestPoint(scene, { x: p.x + 4, y: p.y - 3 })).toBe('bb1.c7');
    expect(nearestPoint(scene, { x: -500, y: -500 })).toBeUndefined();
  });

  it.each(BOARD_IDS)('on %s every pin of board.json has a place on the picture, so a wire can reach it', (id) => {
    const s = sceneOf({ ...newProject('pico-w').project, board: id });
    for (const pin of boardData(id).pins) expect(pointAt(s, `board.${pin.id}`), pin.id).toBeDefined();
  });

  it.each(BOARD_IDS)('on %s the board starts above the breadboard, the two not overlapping, centred on each other', (id) => {
    const v = defaultView({ ...newProject('pico-w').project, board: id });
    const art = boardArt(id);
    const bb = v.breadboards.bb1!;
    expect(v.board.y + art.height).toBeLessThan(bb.y);
    expect(Math.abs((v.board.x + art.width / 2) - (bb.x + 256))).toBeLessThanOrEqual(1);
  });

  it('a saved view is used as it is', () => {
    const project = { ...newProject('pico-w').project, view: { board: { x: 5, y: 6 }, breadboards: { bb1: { x: 7, y: 400 } } } };
    expect(sceneOf(project).view).toEqual(project.view);
  });
});
