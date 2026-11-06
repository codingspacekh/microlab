import { COLUMNS } from '../circuit';
import type { Project } from '../project';
import { allPoints, nearestPoint, pointAt, type Point, type Scene } from './geometry';
import { partKind } from './parts';

/**
 * Where a part can go (F-10, F-11, F-12): every leg in a breadboard hole, and a hole holds one thing — a leg or a
 * wire end — as on a real breadboard.
 */
export type Legs = Record<string, string>;

/** Every point with a leg or a wire end in it; `except` leaves out one part (the one being moved). */
export function usedPoints(project: Project, except?: string): Set<string> {
  const used = new Set<string>();
  for (const p of project.parts) if (p.id !== except) for (const h of Object.values(p.legs)) used.add(h);
  for (const w of project.wires) { used.add(w.a); used.add(w.b); }
  return used;
}

/** The holes a part's legs go in when its first leg is dropped near `firstLeg`; undefined if it can't go there. */
export function snapPart(scene: Scene, type: string, firstLeg: Point, except?: string): Legs | undefined {
  const start = nearestPoint(scene, firstLeg, 12, 'breadboard');
  return start ? legsFrom(scene, type, start, usedPoints(scene.project, except)) : undefined;
}

function legsFrom(scene: Scene, type: string, start: string, used: Set<string>): Legs | undefined {
  const bb = start.slice(0, start.indexOf('.'));
  const origin = pointAt(scene, start)!;
  const holes = allPoints(scene).filter((q) => q.ref.startsWith(`${bb}.`));
  const legs: Legs = {};
  for (const [leg, [dx, dy]] of Object.entries(partKind(type).legs)) {
    const hit = holes.find((q) => Math.abs(q.x - origin.x - dx) < 0.5 && Math.abs(q.y - origin.y - dy) < 0.5);
    if (!hit || used.has(hit.ref)) return undefined;
    legs[leg] = hit.ref;
  }
  return legs;
}

/** The first place, column by column from the left, where the part fits (a part clicked in the parts panel). */
export function freeSpot(scene: Scene, type: string): Legs | undefined {
  const used = usedPoints(scene.project);
  const { rows } = partKind(type);
  for (const bb of scene.project.breadboards) {
    for (let c = 1; c <= COLUMNS[bb.size]; c++) {
      for (const r of rows) {
        const legs = legsFrom(scene, type, `${bb.id}.${r}${c}`, used);
        if (legs) return legs;
      }
    }
  }
  return undefined;
}
