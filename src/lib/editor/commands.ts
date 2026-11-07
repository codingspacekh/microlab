import { COLUMNS, hasRails, type BreadboardSize } from '../circuit';
import type { Project } from '../project';
import { boardArt } from './library';
import { BREADBOARD, sceneOf, snapToGrid, type Point } from './geometry';
import { partKind } from './parts';
import { usedPoints, type Legs } from './place';

/**
 * The edits of M4.3 (F-10, F-11, F-13), each a pure function from one project to the next — undo / redo (F-16, M5)
 * keeps these. The caller has checked where a part goes (snapPart, freeSpot).
 */
function nextId(prefix: string, taken: string[]): string {
  const re = new RegExp(`^${prefix}(\\d+)$`);
  const top = taken.reduce((n, id) => Math.max(n, Number(re.exec(id)?.[1] ?? 0)), 0);
  return `${prefix}${top + 1}`;
}

export function addPart(project: Project, type: string, legs: Legs): { project: Project; id: string } {
  const kind = partKind(type);
  const id = nextId(kind.prefix, project.parts.map((p) => p.id));
  return { id, project: { ...project, parts: [...project.parts, { id, type, props: { ...kind.props }, legs: { ...legs } }] } };
}

export function movePart(project: Project, id: string, legs: Legs): Project {
  return { ...project, parts: project.parts.map((p) => (p.id === id ? { ...p, legs: { ...legs } } : p)) };
}

/** A wire between two free points, through its bends (on the grid); undefined if the ends are the same point or one
 *  is in use. */
export function addWire(project: Project, a: string, b: string, via: Point[] = []): Project | undefined {
  const used = usedPoints(project);
  if (a === b || used.has(a) || used.has(b)) return undefined;
  const id = nextId('w', project.wires.map((w) => w.id));
  return { ...project, wires: [...project.wires, { id, a, b, ...(via.length ? { via: via.map(snapToGrid) } : {}) }] };
}

export function deleteWire(project: Project, id: string): Project {
  return { ...project, wires: project.wires.filter((w) => w.id !== id) };
}

export function deletePart(project: Project, id: string): Project {
  return { ...project, parts: project.parts.filter((p) => p.id !== id) };
}

export function setWireColour(project: Project, id: string, color: string): Project {
  return { ...project, wires: project.wires.map((w) => (w.id === id ? { ...w, color } : w)) };
}

export function setPartProp(project: Project, id: string, key: string, value: number | string | boolean): Project {
  return { ...project, parts: project.parts.map((p) => (p.id === id ? { ...p, props: { ...p.props, [key]: value } } : p)) };
}

/** Mini, half or full; undefined when a smaller one would leave a leg or a wire end off its end (or on a rail a
 *  mini breadboard hasn't got). */
export function setBreadboardSize(project: Project, id: string, size: BreadboardSize): Project | undefined {
  const prefix = `${id}.`;
  const ends = [...project.parts.flatMap((p) => Object.values(p.legs)), ...project.wires.flatMap((w) => [w.a, w.b])];
  const tooFar = ends.some((e) => e.startsWith(prefix) && (Number(/\d+$/.exec(e)?.[0] ?? 0) > COLUMNS[size]
    || (!hasRails(size) && /^[TB][+-]/.test(e.slice(prefix.length)))));
  if (tooFar) return undefined;
  return { ...project, breadboards: project.breadboards.map((b) => (b.id === id ? { ...b, size } : b)) };
}

const GAP = 40;

/**
 * M6.8 (screen 23b): a breadboard from the parts panel. The first goes under the board (where a new project used to
 * have it: the board centred over it); another one at `at` (its middle), or under the last one.
 */
export function addBreadboard(project: Project, size: BreadboardSize, at?: Point): { project: Project; id: string } {
  const id = nextId('bb', project.breadboards.map((b) => b.id));
  const breadboards = [...project.breadboards, { id, size }];
  if (!project.breadboards.length && !project.view) return { id, project: { ...project, breadboards } };   // laid out as a new project's
  const view = sceneOf(project).view;
  const s = BREADBOARD.size(size);
  let corner: Point;
  if (at) corner = { x: at.x - s.width / 2, y: at.y - s.top - s.height / 2 };
  else if (!project.breadboards.length) {
    const art = boardArt(sceneOf(project).boardId);
    corner = { x: view.board.x + (art.width - s.width) / 2, y: view.board.y + art.height + GAP - s.top };
  } else {
    const last = project.breadboards.at(-1)!;
    const ls = BREADBOARD.size(last.size);
    const l = view.breadboards[last.id]!;
    corner = { x: l.x, y: l.y + ls.top + ls.height + GAP - s.top };
  }
  return { id, project: { ...project, breadboards, view: { ...view, breadboards: { ...view.breadboards, [id]: snapToGrid(corner) } } } };
}

/** Wires with both ends on `owner` ('board' or a breadboard) move their bends with it. */
function shiftBends(project: Project, owner: string, dx: number, dy: number): Project['wires'] {
  const on = (ref: string) => ref.startsWith(`${owner}.`);
  return project.wires.map((w) => (w.via && on(w.a) && on(w.b) ? { ...w, via: w.via.map((p) => ({ x: p.x + dx, y: p.y + dy })) } : w));
}

export function moveBoard(project: Project, to: Point): Project {
  const view = sceneOf(project).view;
  const at = snapToGrid(to);
  return { ...project, wires: shiftBends(project, 'board', at.x - view.board.x, at.y - view.board.y), view: { ...view, board: at } };
}

export function moveBreadboard(project: Project, id: string, to: Point): Project {
  const view = sceneOf(project).view;
  const at = snapToGrid(to);
  const from = view.breadboards[id]!;
  return {
    ...project,
    wires: shiftBends(project, id, at.x - from.x, at.y - from.y),
    view: { ...view, breadboards: { ...view.breadboards, [id]: at } },
  };
}

/** M5.3 (F-13): a wire's bends after it is drawn — moved, added in a segment (`index` = the segment, from a), taken
 *  away — always on the grid; a wire with no bends has no `via`. */
function setVia(project: Project, id: string, change: (via: Point[]) => Point[]): Project {
  return {
    ...project,
    wires: project.wires.map((w) => {
      if (w.id !== id) return w;
      const via = change([...(w.via ?? [])]);
      const rest = { ...w };
      delete rest.via;
      return via.length ? { ...rest, via } : rest;
    }),
  };
}

export function moveBend(project: Project, id: string, index: number, to: Point): Project {
  return setVia(project, id, (via) => via.map((p, i) => (i === index ? snapToGrid(to) : p)));
}

export function insertBend(project: Project, id: string, index: number, at: Point): Project {
  if (!project.wires.some((w) => w.id === id)) return project;
  return setVia(project, id, (via) => [...via.slice(0, index), snapToGrid(at), ...via.slice(index)]);
}

export function deleteBend(project: Project, id: string, index: number): Project {
  return setVia(project, id, (via) => via.filter((_, i) => i !== index));
}

export function straighten(project: Project, id: string): Project {
  return setVia(project, id, () => []);
}

/** The micro:bit GPIO board's own micro-USB plugged in (not set, as a new project) or taken out (M6.1, screen 17b):
 *  without it the board's 5V pins give nothing. The same project back when nothing changes. */
export function setUsb(project: Project, plugged: boolean): Project {
  if ((project.usb !== false) === plugged) return project;
  if (!plugged) return { ...project, usb: false };
  const next = { ...project };
  delete next.usb;
  return next;
}
