import { findPin, isBoardId, type BoardId } from '../boards';
import { COLUMNS, hasRails, railHole, type BreadboardSize } from '../circuit';
import type { Project } from '../project';
import { artOf, boardData, type Art } from './library';
import { freeTurn, kindBox, kindTerminals, PART_KINDS, turnsOf, type PartKind } from './parts';

/**
 * Where everything is on the canvas (F-12, F-13), in the approved drawing's units: one pitch (0.1 in) = 16. A
 * breadboard's place is its top-left corner; its holes are as in design/svgparts.py. A board's place is its
 * picture's top-left corner; its pins are where art.json puts them. Parts and wires are placed by the holes and
 * pins they use, so they always land on real ones.
 */
export interface Point { x: number; y: number }
/** Where things are: the board, each breadboard, and each part beside the breadboard (M7), with its quarter turns. */
export interface View { board: Point; breadboards: Record<string, Point>; parts?: Record<string, Point & { turns?: number }>; boardTurns?: number }

/** A point of the board's picture ([x, y] on it) on the canvas: turned `view.boardTurns` quarters clockwise about the
 *  picture's middle (M7, the teacher's request). */
export function boardAt(scene: Scene, [x, y]: [number, number]): Point {
  const { width: w, height: h } = scene.art;
  let [dx, dy] = [x - w / 2, y - h / 2];
  for (let i = 0; i < (scene.view.boardTurns ?? 0); i++) [dx, dy] = [-dy || 0, dx];
  return { x: scene.view.board.x + w / 2 + dx, y: scene.view.board.y + h / 2 + dy };
}

/** The board's box on the canvas, turned. */
export function boardBox(scene: Scene): { x: number; y: number; w: number; h: number } {
  const { width, height } = scene.art;
  const [w, h] = (scene.view.boardTurns ?? 0) % 2 ? [height, width] : [width, height];
  return { x: scene.view.board.x + (width - w) / 2, y: scene.view.board.y + (height - h) / 2, w, h };
}

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

/** What the canvas needs: the project, its board's data and picture (the micro:bit's alone or in its GPIO board,
 *  M6.9), and where things are. */
export interface Scene {
  project: Project;
  boardId: BoardId;
  art: Art;
  view: View;
}

export function sceneOf(project: Project): Scene {
  if (!isBoardId(project.board)) throw new Error(`there is no board "${project.board}"`);
  const scene = { project, boardId: project.board, art: artOf(project), view: project.view ?? defaultView(project) };
  return lyingDefaults(scene);
}

/**
 * M7: a part beside the breadboard with no place yet (an example, a project written by hand) lies right of the
 * board and breadboards, one under another.
 */
function lyingDefaults(scene: Scene): Scene {
  const missing = scene.project.parts.filter((p) => kindOf(p.type)?.free && !scene.view.parts?.[p.id]);
  if (!missing.length) return scene;
  const parts = { ...scene.view.parts };
  const view = { ...scene.view, parts };
  const box = boardBox(scene);
  let right = box.x + box.w;
  let y = box.y;
  for (const bb of scene.project.breadboards) {
    const c = view.breadboards[bb.id];
    if (c) { right = Math.max(right, c.x + BREADBOARD.size(bb.size).width); y = Math.min(y, c.y); }
    if (c && bb === scene.project.breadboards[0]) y = c.y;
  }
  for (const part of missing) {
    const [x0, y0, , y1] = kindBox(part.type, part.props);
    parts[part.id] = snapToGrid({ x: right + 40 - x0, y: y - y0 });
    y += y1 - y0 + 24;
  }
  return { ...scene, view };
}

const GAP = 40;

/** The half-hole grid (8 units) things are put on, so holes line up and wire bends look tidy. */
export const GRID = 8;
export function snapToGrid(p: Point): Point {
  return { x: Math.round(p.x / GRID) * GRID || 0, y: Math.round(p.y / GRID) * GRID || 0 };
}

/** The board above the breadboards, centred on the first; the breadboards one under another. */
export function defaultView(project: Project): View {
  const art = artOf(project);
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
    // by its id, or by its label as an example may name it (board.GND: the first GND)
    const pin = boardData(scene.boardId).pins.find((p) => p.id === name) ?? findPin(boardData(scene.boardId), name);
    const xy = pin && scene.art.pins[String(pin.number)];
    return xy ? boardAt(scene, xy) : undefined;
  }
  const bb = scene.project.breadboards.find((b) => b.id === owner);
  if (!bb) {
    const part = scene.project.parts.find((p) => p.id === owner);
    return part ? terminalAt(scene, part, name) : undefined;
  }
  const at = scene.view.breadboards[owner];
  const off = at ? holeOffset(name, bb.size) : undefined;
  return off && at ? { x: at.x + off.x, y: at.y + off.y } : undefined;
}

const kindOf = (type: string): PartKind | undefined => PART_KINDS.find((k) => k.type === type);

/** Where a part's terminal is (M7): a screw, a tab, a socket's pin — from where a free part lies, or from its first
 *  leg's hole, turned with it. Undefined for a leg that is no terminal, or a part not placed. */
export function terminalAt(scene: Scene, part: Project['parts'][number], leg: string): Point | undefined {
  const kind = kindOf(part.type);
  const off = kind ? kindTerminals(part.type, part.props)[leg] : undefined;
  if (!kind || !off) return undefined;
  if (kind.free) {
    const at = scene.view.parts?.[part.id];
    if (!at) return undefined;
    const [x, y] = freeTurn(part.type, off, at.turns, false, part.props);
    return { x: at.x + x, y: at.y + y };
  }
  const [k0, k1] = Object.keys(kind.legs);
  const a = pointAt(scene, part.legs[k0!] ?? '');
  const b = pointAt(scene, part.legs[k1!] ?? '');
  if (!a || !b) return undefined;
  let [x, y] = off;
  for (let i = 0; i < turnsOf(part.type, { [k0!]: a, [k1!]: b }); i++) [x, y] = [-y || 0, x];
  return { x: a.x + x, y: a.y + y };
}

/** Each of a part's terminals, where it is (M7); not those plugged into something (a stepper's cable in its socket). */
export function terminalsOf(scene: Scene, part: Project['parts'][number]): Record<string, Point> {
  const out: Record<string, Point> = {};
  for (const leg of Object.keys(kindOf(part.type) ? kindTerminals(part.type, part.props) : {})) {
    if (part.legs[leg]) continue;
    const at = terminalAt(scene, part, leg);
    if (at) out[leg] = at;
  }
  return out;
}

export interface PlacedPoint extends Point {
  ref: string;
  /** A breadboard's hole, a board's pin, or a part's terminal (M7: a screw, a tab). */
  on: 'breadboard' | 'board' | 'terminal';
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
  const art = scene.art;
  for (const pin of boardData(scene.boardId).pins) {
    const xy = art.pins[String(pin.number)];
    if (xy) out.push({ ref: `board.${pin.id}`, on: 'board', ...boardAt(scene, xy) });
  }
  for (const bb of scene.project.breadboards) {
    const at = scene.view.breadboards[bb.id];
    if (!at) continue;
    for (const h of HOLE_NAMES(bb.size)) {
      const off = holeOffset(h, bb.size)!;
      out.push({ ref: `${bb.id}.${h}`, on: 'breadboard', x: at.x + off.x, y: at.y + off.y });
    }
  }
  for (const part of scene.project.parts) {
    for (const [leg, at] of Object.entries(terminalsOf(scene, part))) out.push({ ref: `${part.id}.${leg}`, on: 'terminal', ...at });
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
