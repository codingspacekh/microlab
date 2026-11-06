import type { Project } from '../project';
import { sceneOf, type Point } from './geometry';
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

/** A wire between two free points; undefined if they are the same point or one is in use. */
export function addWire(project: Project, a: string, b: string): Project | undefined {
  const used = usedPoints(project);
  if (a === b || used.has(a) || used.has(b)) return undefined;
  const id = nextId('w', project.wires.map((w) => w.id));
  return { ...project, wires: [...project.wires, { id, a, b }] };
}

const whole = (p: Point): Point => ({ x: Math.round(p.x), y: Math.round(p.y) });

export function moveBoard(project: Project, to: Point): Project {
  const view = sceneOf(project).view;
  return { ...project, view: { ...view, board: whole(to) } };
}

export function moveBreadboard(project: Project, id: string, to: Point): Project {
  const view = sceneOf(project).view;
  return { ...project, view: { ...view, breadboards: { ...view.breadboards, [id]: whole(to) } } };
}
