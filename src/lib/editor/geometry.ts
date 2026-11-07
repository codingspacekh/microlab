import { isBoardId, type BoardId } from '../boards';
import { COLUMNS, hasRails, railHole, type BreadboardSize } from '../circuit';
import type { Project } from '../project';
import { boardArt, boardData } from './library';

/**
 * Where everything is on the canvas (F-12, F-13), in the approved drawing's units: one pitch (0.1 in) = 16. A
 * breadboard's place is its top-left corner; its holes are as in design/svgparts.py. A board's place is its
 * picture's top-left corner; its pins are where art.json puts them. Parts and wires are placed by the holes and
 * pins they use, so they always land on real ones.
 */
export interface Point { x: number; y: number }
export interface View { board: Point; breadboards: Record<string, Point> }

export const PITCH = 16;
const ROWS: Record<string, number> = { 'T-': 18, 'T+': 34, 'B+': 264, 'B-': 280 };
'abcde'.split('').forEach((r, i) => { ROWS[r] = 62 + i * PITCH; });
'fghij'.split('').forEach((r, i) => { ROWS[r] = 174 + i * PITCH; });
const EDGE = 24;   // from the corner to column 1
const HOLE = /^(T-|T\+|B\+|B-|[a-j])(\d+)$/;

export const BREADBOARD = {
  rows: ROWS,
  edge: EDGE,
  /** Its body: a mini breadboard (no rails) is the rows a–j only, `top` below the corner its holes are measured from. */
  size: (size: BreadboardSize) => ({ width: (COLUMNS[size] - 1) * PITCH + 2 * EDGE, ...(hasRails(size) ? { top: 0, height: 298 } : { top: 44, height: 212 }) }),
};

/** A hole's place from its breadboard's corner: a1, j30, T-1, B+5; undefined if there is no such hole. */
export function holeOffset(hole: string, size: BreadboardSize): Point | undefined {
  const m = HOLE.exec(hole);
  if (!m) return undefined;
  const row = m[1]!;
  const col = Number(m[2]);
  if (col < 1 || col > COLUMNS[size]) return undefined;
  if (row.length === 2 && (!railHole(col) || !hasRails(size))) return undefined;
  return { x: EDGE + (col - 1) * PITCH, y: ROWS[row]! };
}

/** What the canvas needs: the project, its board's data and picture, and where things are. */
export interface Scene {
  project: Project;
  boardId: BoardId;
  view: View;
}

export function sceneOf(project: Project): Scene {
  if (!isBoardId(project.board)) throw new Error(`there is no board "${project.board}"`);
  return { project, boardId: project.board, view: project.view ?? defaultView(project) };
}

const GAP = 40;

/** The half-hole grid (8 units) things are put on, so holes line up and wire bends look tidy. */
export const GRID = 8;
export function snapToGrid(p: Point): Point {
  return { x: Math.round(p.x / GRID) * GRID || 0, y: Math.round(p.y / GRID) * GRID || 0 };
}

/** The board above the breadboards, centred on the first; the breadboards one under another. */
export function defaultView(project: Project): View {
  const art = boardArt(project.board as BoardId);
  const first = project.breadboards[0];
  const bbWidth = first ? BREADBOARD.size(first.size).width : art.width;
  const breadboards: Record<string, Point> = {};
  let y = art.height + GAP;
  for (const bb of project.breadboards) {
    breadboards[bb.id] = snapToGrid({ x: 0, y });
    const s = BREADBOARD.size(bb.size);
    y = breadboards[bb.id]!.y + s.top + s.height + GAP;
  }
  return { board: snapToGrid({ x: (bbWidth - art.width) / 2, y: 0 }), breadboards };
}

/** Where a point is: 'bb1.a5' or 'board.GP15' (a pin id); undefined if there is no such point. */
export function pointAt(scene: Scene, ref: string): Point | undefined {
  const dot = ref.indexOf('.');
  if (dot < 0) return undefined;
  const owner = ref.slice(0, dot);
  const name = ref.slice(dot + 1);
  if (owner === 'board') {
    const pin = boardData(scene.boardId).pins.find((p) => p.id === name);
    const xy = pin && boardArt(scene.boardId).pins[String(pin.number)];
    return xy ? { x: scene.view.board.x + xy[0], y: scene.view.board.y + xy[1] } : undefined;
  }
  const bb = scene.project.breadboards.find((b) => b.id === owner);
  const at = scene.view.breadboards[owner];
  const off = bb && at ? holeOffset(name, bb.size) : undefined;
  return off && at ? { x: at.x + off.x, y: at.y + off.y } : undefined;
}

export interface PlacedPoint extends Point {
  ref: string;
  /** A breadboard's hole, or a board's pin. */
  on: 'breadboard' | 'board';
}

const HOLE_NAMES = (size: BreadboardSize): string[] => {
  const out: string[] = [];
  for (let c = 1; c <= COLUMNS[size]; c++) {
    for (const r of Object.keys(ROWS)) if (r.length === 1 || (railHole(c) && hasRails(size))) out.push(`${r}${c}`);
  }
  return out;
};

/** Every hole and board pin, where it is. */
export function allPoints(scene: Scene): PlacedPoint[] {
  const out: PlacedPoint[] = [];
  const art = boardArt(scene.boardId);
  for (const pin of boardData(scene.boardId).pins) {
    const xy = art.pins[String(pin.number)];
    if (xy) out.push({ ref: `board.${pin.id}`, on: 'board', x: scene.view.board.x + xy[0], y: scene.view.board.y + xy[1] });
  }
  for (const bb of scene.project.breadboards) {
    const at = scene.view.breadboards[bb.id];
    if (!at) continue;
    for (const h of HOLE_NAMES(bb.size)) {
      const off = holeOffset(h, bb.size)!;
      out.push({ ref: `${bb.id}.${h}`, on: 'breadboard', x: at.x + off.x, y: at.y + off.y });
    }
  }
  return out;
}

/** The point nearest to p within `radius`, if any; `only` keeps to holes or to board pins. */
export function nearestPoint(scene: Scene, p: Point, radius = 10, only?: PlacedPoint['on']): string | undefined {
  let best: string | undefined;
  let bestD = radius * radius;
  for (const q of allPoints(scene)) {
    if (only && q.on !== only) continue;
    const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
    if (d <= bestD) { bestD = d; best = q.ref; }
  }
  return best;
}
