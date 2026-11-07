import { strips } from '../circuit';
import type { Project } from '../project';
import { allPoints, pointAt, PITCH, sceneOf, type Point, type Scene } from './geometry';
import { partKind } from './parts';
import { holeIndex, holeKey, usedPoints, type HoleIndex } from './place';

/**
 * Several things at once (M5.1, F-11): parts moved, turned and copied as one rigid group, and deleted together.
 * A group is a shape — every leg (and, when copying, every wire end) as an offset from the first — put down where
 * its first point lands on a free hole and every other point lands exactly on a free hole of the same breadboard.
 * So a part keeps its shape and its legs stay a whole number of holes apart, as a real part's do.
 * Wires follow the parts (the M5 gate, the teacher's choice, as in Tinkercad): a wire end in the strip of a moved or
 * turned leg goes with that leg — the same way from it if that is a free hole of the leg's new strip, otherwise the
 * nearest free hole of that strip — unless a part that stays also has a leg in the strip (the wire is joined to it
 * too) or the strip is a rail (a rail is everyone's). No free hole for it: the parts don't move.
 */
export interface Chosen { parts: string[]; wires: string[] }

interface Pin { owner: 'part' | 'wire'; id: string; leg: string; at: Point; ref?: string }

const NEAR_MOVE = 12;          // as snapPart: a drop lands on the hole under it
const NEAR_TURN = 3 * PITCH;   // a turned part goes in the nearest place it fits

/** The holes for each point of the shape, its first point as near `ideal` as fits; undefined when nothing fits. */
function fitShape(scene: Scene, pins: Pin[], ideal: Point, used: Set<string>, radius: number, holes: HoleIndex): string[] | undefined {
  const [first, ...rest] = pins;
  if (!first) return undefined;
  const candidates = allPoints(scene)
    .filter((q) => q.on === 'breadboard' && !used.has(q.ref))
    .map((q) => ({ q, d: (q.x - ideal.x) ** 2 + (q.y - ideal.y) ** 2 }))
    .filter(({ d }) => d <= radius * radius)
    .sort((a, b) => a.d - b.d);
  for (const { q } of candidates) {
    const bb = q.ref.slice(0, q.ref.indexOf('.') + 1);
    const out = [q.ref];
    for (const p of rest) {
      const hit = holes.get(holeKey(q.x + p.at.x - first.at.x, q.y + p.at.y - first.at.y));
      if (!hit || !hit.startsWith(bb) || used.has(hit)) break;
      out.push(hit);
    }
    if (out.length === pins.length) return out;
  }
  return undefined;
}

function partPins(scene: Scene, ids: string[]): Pin[] | undefined {
  const out: Pin[] = [];
  for (const id of ids) {
    const part = scene.project.parts.find((p) => p.id === id);
    if (!part) return undefined;
    for (const [leg, ref] of Object.entries(part.legs)) {
      const at = pointAt(scene, ref);
      if (!at) return undefined;
      out.push({ owner: 'part', id, leg, at, ref });
    }
  }
  return out;
}

/** The project with the pins in their new holes (and the wire ends that follow them, by `ends`). */
function placePins(project: Project, pins: Pin[], holes: string[], ends: Ends = new Map()): Project {
  const legs = new Map<string, Record<string, string>>();
  pins.forEach((p, i) => {
    if (p.owner !== 'part') return;
    legs.set(p.id, { ...(legs.get(p.id) ?? {}), [p.leg]: holes[i]! });
  });
  return {
    ...project,
    parts: project.parts.map((p) => (legs.has(p.id) ? { ...p, legs: { ...p.legs, ...legs.get(p.id) } } : p)),
    wires: project.wires.map((w) => {
      const a = ends.get(`${w.id}:a`);
      const b = ends.get(`${w.id}:b`);
      if (!a && !b) return w;
      // both ends moved the same way: the bends go with them
      const same = a && b && a.dx === b.dx && a.dy === b.dy;
      return {
        ...w,
        ...(a ? { a: a.to } : {}),
        ...(b ? { b: b.to } : {}),
        ...(same && w.via ? { via: w.via.map((q) => ({ x: q.x + a.dx, y: q.y + a.dy })) } : {}),
      };
    }),
  };
}

/** Each breadboard hole's strip — the holes joined to it inside the breadboard — and whether it is a rail. */
interface Strip { holes: string[]; rail: boolean }
function stripMap(project: Project): Map<string, Strip> {
  const out = new Map<string, Strip>();
  for (const bb of project.breadboards) {
    for (const s of strips(bb.size)) {
      const strip = { holes: s.map((h) => `${bb.id}.${h}`), rail: /^[TB][+-]/.test(s[0]!) };
      for (const h of strip.holes) out.set(h, strip);
    }
  }
  return out;
}

/** A wire end that goes with a leg: the wire's end ('w1:b'), the hole it is in, the pin (by index) it follows. */
interface Follower { key: string; ref: string; pin: number }
function followers(project: Project, ids: string[], pins: Pin[], map: Map<string, Strip>): Follower[] {
  const out: Follower[] = [];
  for (const w of project.wires) {
    for (const end of ['a', 'b'] as const) {
      const strip = map.get(w[end]);
      if (!strip || strip.rail) continue;
      const others = project.parts.some((p) => !ids.includes(p.id) && Object.values(p.legs).some((h) => strip.holes.includes(h)));
      if (others) continue;
      const pin = pins.findIndex((p) => p.ref !== undefined && strip.holes.includes(p.ref));
      if (pin >= 0) out.push({ key: `${w.id}:${end}`, ref: w[end], pin });
    }
  }
  return out;
}

type Ends = Map<string, { to: string; dx: number; dy: number }>;

/** Where each following wire end goes once the legs are in `holes` (the legs were at `from`); undefined if one has
 *  no free hole in its leg's new strip. */
function placeEnds(scene: Scene, from: Point[], holes: string[], follow: Follower[], used: Set<string>, map: Map<string, Strip>, index: HoleIndex): Ends | undefined {
  const taken = new Set([...used, ...holes]);
  const ends: Ends = new Map();
  for (const f of follow) {
    const old = pointAt(scene, f.ref)!;
    const leg = pointAt(scene, holes[f.pin]!)!;
    const want = { x: old.x + leg.x - from[f.pin]!.x, y: old.y + leg.y - from[f.pin]!.y };
    const strip = map.get(holes[f.pin]!);
    if (!strip) return undefined;
    const exact = index.get(holeKey(want.x, want.y));
    const to = exact && strip.holes.includes(exact) && !taken.has(exact)
      ? exact
      : strip.holes
        .filter((h) => !taken.has(h))
        .map((h) => ({ h, q: pointAt(scene, h)! }))
        .sort((u, v) => (u.q.x - want.x) ** 2 + (u.q.y - want.y) ** 2 - ((v.q.x - want.x) ** 2 + (v.q.y - want.y) ** 2))[0]?.h;
    if (!to) return undefined;
    taken.add(to);
    const at = pointAt(scene, to)!;
    ends.set(f.key, { to, dx: at.x - old.x, dy: at.y - old.y });
  }
  return ends;
}

/** Every used point but the group's own legs and the wire ends that follow them. */
function usedExcept(project: Project, ids: string[], follow: Follower[] = []): Set<string> {
  const used = usedPoints(project);
  for (const p of project.parts) if (ids.includes(p.id)) for (const h of Object.values(p.legs)) used.delete(h);
  for (const f of follow) used.delete(f.ref);
  return used;
}

/** The pins put in `holes`, with the wires that follow them; undefined if a wire end has no room. */
function settle(project: Project, scene: Scene, pins: Pin[], from: Point[], holes: string[] | undefined, follow: Follower[], used: Set<string>, map: Map<string, Strip>, index: HoleIndex): Project | undefined {
  if (!holes) return undefined;
  const ends = placeEnds(scene, from, holes, follow, used, map, index);
  return ends ? placePins(project, pins, holes, ends) : undefined;
}

/** The parts moved together by `delta` (snapped to whole holes), the wires into their strips with them; undefined
 *  if any leg would land on a used hole or off the breadboard, or a following wire end finds no room. */
export function moveParts(project: Project, ids: string[], delta: Point): Project | undefined {
  const scene = sceneOf(project);
  const pins = partPins(scene, ids);
  if (!pins?.length) return undefined;
  const map = stripMap(project);
  const follow = followers(project, ids, pins, map);
  const used = usedExcept(project, ids, follow);
  const index = holeIndex(scene);
  const ideal = { x: pins[0]!.at.x + delta.x, y: pins[0]!.at.y + delta.y };
  const holes = fitShape(scene, pins, ideal, used, NEAR_MOVE, index);
  return settle(project, scene, pins, pins.map((p) => p.at), holes, follow, used, map, index);
}

/** The parts turned a quarter clockwise, together, about their legs' middle, then put in the nearest free holes
 *  where the turned shape fits, the wires into their strips with them; undefined if there is no room near. */
export function rotateParts(project: Project, ids: string[]): Project | undefined {
  const scene = sceneOf(project);
  const pins = partPins(scene, ids);
  if (!pins?.length) return undefined;
  const map = stripMap(project);
  const follow = followers(project, ids, pins, map);
  const used = usedExcept(project, ids, follow);
  const index = holeIndex(scene);
  const cx = pins.reduce((s, p) => s + p.at.x, 0) / pins.length;
  const cy = pins.reduce((s, p) => s + p.at.y, 0) / pins.length;
  const turned = pins.map((p) => ({ ...p, at: { x: cx - (p.at.y - cy), y: cy + (p.at.x - cx) } }));
  const holes = fitShape(scene, turned, turned[0]!.at, used, NEAR_TURN, index);
  return settle(project, scene, turned, pins.map((p) => p.at), holes, follow, used, map, index);
}

function nextIds(prefix: string, taken: string[], n: number): string[] {
  const re = new RegExp(`^${prefix}(\\d+)$`);
  const top = taken.reduce((m, id) => Math.max(m, Number(re.exec(id)?.[1] ?? 0)), 0);
  return Array.from({ length: n }, (_, i) => `${prefix}${top + 1 + i}`);
}

/** Copies of the parts — and of the wires with both ends in breadboard holes — as one group, in the nearest free
 *  place to the right of them; the copies' ids, to select them. Undefined if there is no room anywhere. */
export function duplicate(project: Project, chosen: Chosen): { project: Project; parts: string[]; wires: string[] } | undefined {
  const scene = sceneOf(project);
  const pins = partPins(scene, chosen.parts);
  if (!pins) return undefined;
  const wires = project.wires.filter((w) => chosen.wires.includes(w.id) && !w.a.startsWith('board.') && !w.b.startsWith('board.'));
  for (const w of wires) {
    const a = pointAt(scene, w.a);
    const b = pointAt(scene, w.b);
    if (!a || !b) return undefined;
    pins.push({ owner: 'wire', id: w.id, leg: 'a', at: a }, { owner: 'wire', id: w.id, leg: 'b', at: b });
  }
  if (!pins.length) return undefined;
  const xs = pins.map((p) => p.at.x);
  const shift = Math.max(...xs) - Math.min(...xs) + 2 * PITCH;
  const ideal = { x: pins[0]!.at.x + shift, y: pins[0]!.at.y };
  const holes = fitShape(scene, pins, ideal, usedPoints(project), Infinity, holeIndex(scene));
  if (!holes) return undefined;
  const first = pointAt(scene, holes[0]!)!;
  const dx = first.x - pins[0]!.at.x;
  const dy = first.y - pins[0]!.at.y;
  const where = new Map(pins.map((p, i) => [`${p.owner}:${p.id}:${p.leg}`, holes[i]!]));

  const sources = chosen.parts.map((id) => project.parts.find((p) => p.id === id)!);
  const partIds: string[] = [];
  const parts = [...project.parts];
  for (const src of sources) {
    const [id] = nextIds(partKind(src.type).prefix, parts.map((p) => p.id), 1);
    partIds.push(id!);
    const legs = Object.fromEntries(Object.keys(src.legs).map((leg) => [leg, where.get(`part:${src.id}:${leg}`)!]));
    parts.push({ ...structuredClone(src), id: id!, legs });
  }
  const wireIds = nextIds('w', project.wires.map((w) => w.id), wires.length);
  const copies = wires.map((w, i) => ({
    ...structuredClone(w),
    id: wireIds[i]!,
    a: where.get(`wire:${w.id}:a`)!,
    b: where.get(`wire:${w.id}:b`)!,
    ...(w.via ? { via: w.via.map((p) => ({ x: p.x + dx, y: p.y + dy })) } : {}),
  }));
  return { project: { ...project, parts, wires: [...project.wires, ...copies] }, parts: partIds, wires: wireIds };
}

/** The chosen parts and wires removed. */
export function deleteMany(project: Project, chosen: Chosen): Project {
  return {
    ...project,
    parts: project.parts.filter((p) => !chosen.parts.includes(p.id)),
    wires: project.wires.filter((w) => !chosen.wires.includes(w.id)),
  };
}
