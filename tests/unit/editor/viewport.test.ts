import { describe, expect, it } from 'vitest';
import { addPart, addWire, BREADBOARD, fitBox, joined, panBy, pointAt, sceneOf, zoomAt, ZOOM, type Box } from '@lib/editor';
import { newProject } from '@lib/project';

/** M5.2 F-17 zoom, pan, fit; F-12 hovering a hole lights everything joined to it. */
const empty = () => newProject('pico-w').project;

describe('M5.2 fit', () => {
  it('the board and the breadboard with room around them', () => {
    const s = sceneOf(empty());
    const b = fitBox(s);
    const bb = s.view.breadboards.bb1!;
    expect(b.x).toBe(Math.min(s.view.board.x, bb.x) - 48);
    expect(b.y).toBe(s.view.board.y - 48);
    expect(b.y + b.h).toBe(bb.y + BREADBOARD.size('half').height + 48);
  });

  it('a wire bent far outside is in the fit too', () => {
    const p = addWire(empty(), 'board.GP15', 'bb1.a5', [{ x: -400, y: 1000 }])!;
    const b = fitBox(sceneOf(p));
    expect(b.x).toBe(-400 - 48);
    expect(b.y + b.h).toBe(1000 + 48);
  });
});

describe('M5.2 zoom and pan', () => {
  const vb: Box = { x: 0, y: 0, w: 800, h: 600 };

  it('zooming in at a point keeps that point where it was and shows less', () => {
    const z = zoomAt(vb, { x: 200, y: 150 }, 2, 1);
    expect(z).toEqual({ x: 100, y: 75, w: 400, h: 300 });
    // the point is the same fraction across the view before and after
    expect((200 - z.x) / z.w).toBeCloseTo((200 - vb.x) / vb.w);
  });

  it('zoom stays within 25 % and 400 % of real size (scale = screen px per drawing unit)', () => {
    expect(zoomAt(vb, { x: 400, y: 300 }, 10, 1).w).toBeCloseTo(800 / ZOOM.max);
    expect(zoomAt(vb, { x: 400, y: 300 }, 0.01, 1).w).toBeCloseTo(800 / ZOOM.min);
    expect(zoomAt(vb, { x: 400, y: 300 }, 2, ZOOM.max)).toEqual(vb);   // already at the most
  });

  it('panning moves the view by screen pixels, whatever the zoom', () => {
    expect(panBy(vb, 30, -10, 2)).toEqual({ x: -15, y: 5, w: 800, h: 600 });
  });
});

describe('M5.2 F-12 everything joined to a hole', () => {
  it('a hole lights its five holes in the column half, no more', () => {
    const j = joined(empty(), 'bb1.c5');
    expect(j.points.filter((p) => p.startsWith('bb1.')).sort()).toEqual(['bb1.a5', 'bb1.b5', 'bb1.c5', 'bb1.d5', 'bb1.e5']);
    expect(j.strips).toEqual([{ from: 'bb1.a5', to: 'bb1.e5' }]);
  });

  it('a rail lights the whole rail', () => {
    const j = joined(empty(), 'bb1.T-7');
    expect(j.strips).toEqual([{ from: 'bb1.T-1', to: 'bb1.T-29' }]);
    expect(j.points).toHaveLength(25);
  });

  it('through wires (and a board pin), never through a resistor', () => {
    let p = addWire(empty(), 'board.GP15', 'bb1.a5')!;
    p = addWire(p, 'bb1.e5', 'bb1.f20')!;
    p = addPart(p, 'resistor', { a: 'bb1.g20', b: 'bb1.g23' }).project;
    const j = joined(p, 'bb1.c5');
    expect(j.points).toContain('board.GP15');
    expect(j.points).toContain('bb1.j20');
    expect(j.points).not.toContain('bb1.a23');
    expect(j.strips).toEqual([{ from: 'bb1.a5', to: 'bb1.e5' }, { from: 'bb1.f20', to: 'bb1.j20' }]);
    expect(j.points.every((r) => !/^r1\./.test(r))).toBe(true);   // legs are not points on the canvas
  });

  it('all the board\'s GND pins are one: hovering one lights the others', () => {
    const j = joined(empty(), 'board.GND@3');
    expect(j.points.filter((r) => r.startsWith('board.GND')).length).toBeGreaterThan(5);
    expect(j.strips).toEqual([]);
  });

  it('every point it gives is on the canvas', () => {
    const p = addWire(empty(), 'bb1.a1', 'bb1.T+2')!;
    for (const r of joined(p, 'bb1.a1').points) expect(pointAt(sceneOf(p), r)).toBeDefined();
  });
});
