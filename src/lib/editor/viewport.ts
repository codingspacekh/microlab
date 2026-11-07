import { strips, connect } from '../circuit';
import { toCircuit, type Project } from '../project';
import { BREADBOARD, type Point, type Scene } from './geometry';
import { boardArt, boardData } from './library';

/**
 * What the canvas shows (M5.2, F-17) and what lights up under the pointer (F-12). The canvas's viewBox is a box in
 * drawing units; `scale` is how many screen pixels one drawing unit takes (1 = 100 %).
 */
export interface Box { x: number; y: number; w: number; h: number }

export const ZOOM = { min: 0.25, max: 4, step: 1.25 } as const;
const PAD = 48;

/** The board, the breadboards and every wire bend, with room around them. */
export function fitBox(scene: Scene, pad = PAD): Box {
  const art = boardArt(scene.boardId);
  const boxes: Box[] = [{ x: scene.view.board.x, y: scene.view.board.y, w: art.width, h: art.height }];
  for (const bb of scene.project.breadboards) {
    const at = scene.view.breadboards[bb.id];
    if (!at) continue;
    const s = BREADBOARD.size(bb.size);
    boxes.push({ x: at.x, y: at.y, w: s.width, h: s.height });
  }
  for (const w of scene.project.wires) for (const p of w.via ?? []) boxes.push({ x: p.x, y: p.y, w: 0, h: 0 });
  const x0 = Math.min(...boxes.map((b) => b.x)) - pad;
  const y0 = Math.min(...boxes.map((b) => b.y)) - pad;
  const x1 = Math.max(...boxes.map((b) => b.x + b.w)) + pad;
  const y1 = Math.max(...boxes.map((b) => b.y + b.h)) + pad;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Zoomed by `k` about `at` (a drawing point that stays where it is on screen), within 25–400 % of real size. */
export function zoomAt(box: Box, at: Point, k: number, scale: number): Box {
  const to = Math.min(ZOOM.max, Math.max(ZOOM.min, scale * k));
  const f = to / scale;
  if (!Number.isFinite(f) || Math.abs(f - 1) < 1e-9) return box;
  return { x: at.x - (at.x - box.x) / f, y: at.y - (at.y - box.y) / f, w: box.w / f, h: box.h / f };
}

/** Moved so the drawing follows the pointer by (dx, dy) screen pixels. */
export function panBy(box: Box, dx: number, dy: number, scale: number): Box {
  return { ...box, x: box.x - dx / scale, y: box.y - dy / scale };
}

/** A breadboard strip that is lit, by its first and last hole (its holes run between them). */
export interface LitStrip { from: string; to: string }

/** Every hole and board pin joined to `ref` by the breadboard, wires and the board's own links — not through parts —
 *  and the strips among them (F-12). Part legs are left out: they are not points on the canvas. */
export function joined(project: Project, ref: string): { points: string[]; strips: LitStrip[] } {
  const net = connect(toCircuit(project, boardData(project.board as Scene['boardId'])));
  const points = net.pointsInNet(ref).filter((p) => p.startsWith('board.') || project.breadboards.some((b) => p.startsWith(`${b.id}.`)));
  const set = new Set(points);
  const lit: LitStrip[] = [];
  for (const bb of project.breadboards) {
    for (const strip of strips(bb.size)) {
      if (set.has(`${bb.id}.${strip[0]}`)) lit.push({ from: `${bb.id}.${strip[0]}`, to: `${bb.id}.${strip[strip.length - 1]}` });
    }
  }
  return { points, strips: lit };
}
