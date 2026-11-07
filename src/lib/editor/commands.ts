import { COLUMNS, type BreadboardSize } from '../circuit';
import type { Project } from '../project';
import { sceneOf, snapToGrid, type Point } from './geometry';
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

/** Half or full; undefined when a smaller one would leave a leg or a wire end off its end. */
export function setBreadboardSize(project: Project, id: string, size: BreadboardSize): Project | undefined {
  const prefix = `${id}.`;
  const ends = [...project.parts.flatMap((p) => Object.values(p.legs)), ...project.wires.flatMap((w) => [w.a, w.b])];
  const tooFar = ends.some((e) => e.startsWith(prefix) && Number(/\d+$/.exec(e)?.[0] ?? 0) > COLUMNS[size]);
  if (tooFar) return undefined;
  return { ...project, breadboards: project.breadboards.map((b) => (b.id === id ? { ...b, size } : b)) };
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
