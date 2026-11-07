import { COLUMNS } from '../circuit';
import type { Project } from '../project';
import { allPoints, nearestPoint, pointAt, type Point, type Scene } from './geometry';
import { footprint, partKind } from './parts';

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

/** The holes a part's legs go in when its first leg is dropped near `firstLeg`, turned `turns` quarter turns;
 *  undefined if it can't go there. */
export function snapPart(scene: Scene, type: string, firstLeg: Point, except?: string, turns = 0): Legs | undefined {
  const start = nearestPoint(scene, firstLeg, 12, 'breadboard');
  return start ? legsFrom(scene, footprint(type, turns), start, usedPoints(scene.project, except), holeIndex(scene)) : undefined;
}

/** Every breadboard hole by where it is ('x,y' → 'bb1.a5'), so a footprint's legs are found at once. */
export type HoleIndex = Map<string, string>;
export const holeKey = (x: number, y: number) => `${Math.round(x)},${Math.round(y)}`;
const key = holeKey;

export function holeIndex(scene: Scene): HoleIndex {
  return new Map(allPoints(scene).filter((q) => q.on === 'breadboard').map((q) => [key(q.x, q.y), q.ref]));
}

function legsFrom(scene: Scene, offsets: Record<string, [number, number]>, start: string, used: Set<string>, holes: HoleIndex): Legs | undefined {
  const bb = start.slice(0, start.indexOf('.') + 1);
  const origin = pointAt(scene, start)!;
  const legs: Legs = {};
  for (const [leg, [dx, dy]] of Object.entries(offsets)) {
    const hit = holes.get(key(origin.x + dx, origin.y + dy));
    if (!hit || !hit.startsWith(bb) || used.has(hit)) return undefined;
    legs[leg] = hit;
  }
  return legs;
}

/** The first place, column by column from the left, where the part fits (a part picked up with the keyboard). */
export function freeSpot(scene: Scene, type: string): Legs | undefined {
  const used = usedPoints(scene.project);
  const holes = holeIndex(scene);
  const { rows } = partKind(type);
  for (const bb of scene.project.breadboards) {
    for (let c = 1; c <= COLUMNS[bb.size]; c++) {
      for (const r of rows) {
        const legs = legsFrom(scene, partKind(type).legs, `${bb.id}.${r}${c}`, used, holes);
        if (legs) return legs;
      }
    }
  }
  return undefined;
}
