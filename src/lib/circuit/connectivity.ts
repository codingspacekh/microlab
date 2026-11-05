import { findPin } from '../boards';
import { holes, strips } from './breadboard';
import { MODELS } from './models';
import type { CircuitSpec, PointRef, Problem } from './spec';
import { UnionFind } from './union-find';

export interface Net {
  /** A board pin's label if the net has one (GND, 3V3, GP15), else its first breadboard hole, else its first point. */
  id: string;
  points: PointRef[];
}

export interface Connectivity {
  nets: Net[];
  /** The net a point is in (board pins may be named by label); undefined for a point that doesn't exist. */
  netOf(point: PointRef): string | undefined;
  /** Every point joined to this one, itself included (the hover highlight, F-12). */
  pointsInNet(point: PointRef): PointRef[];
  problems: Problem[];
}

/** Joins breadboard strips, the board's internal links, part legs and wires into nets (F-12). */
export function connect(spec: CircuitSpec): Connectivity {
  const uf = new UnionFind();
  const problems: Problem[] = [];
  const boardOrder = new Map<string, number>();

  for (const bb of spec.breadboards) {
    for (const h of holes(bb.size)) uf.add(`${bb.id}.${h}`);
    for (const strip of strips(bb.size)) {
      for (const h of strip.slice(1)) uf.union(`${bb.id}.${strip[0]}`, `${bb.id}.${h}`);
    }
  }

  const board = spec.board?.data;
  if (board) {
    board.pins.forEach((p, i) => {
      uf.add(`board.${p.id}`);
      boardOrder.set(`board.${p.id}`, i);
    });
    const grounds = board.pins.filter((p) => p.role === 'ground');
    for (const g of grounds.slice(1)) uf.union(`board.${grounds[0]!.id}`, `board.${g.id}`);
  }

  /** The canonical name of a point, or undefined if there is no such point. */
  const resolve = (point: PointRef): string | undefined => {
    if (point.startsWith('board.')) {
      const pin = board && findPin(board, point.slice(6));
      return pin ? `board.${pin.id}` : undefined;
    }
    return uf.has(point) ? point : undefined;
  };
  const join = (a: PointRef, b: PointRef, by: string) => {
    const ra = resolve(a);
    const rb = resolve(b);
    if (!ra) problems.push({ kind: 'unknown-point', point: a, by });
    if (!rb) problems.push({ kind: 'unknown-point', point: b, by });
    if (ra && rb) uf.union(ra, rb);
  };

  for (const [pin, hole] of Object.entries(spec.board?.plugs ?? {})) join(`board.${pin}`, hole, 'board');

  // Every leg exists before any is plugged in, so a leg can go into another part's leg in any order.
  for (const part of spec.parts) for (const leg of MODELS[part.type]?.legs ?? []) uf.add(`${part.id}.${leg}`);
  for (const part of spec.parts) {
    const model = MODELS[part.type];
    if (!model) {
      problems.push({ kind: 'unknown-part-type', part: part.id, type: part.type });
      continue;
    }
    for (const leg of Object.keys(part.legs)) {
      if (!model.legs.includes(leg)) problems.push({ kind: 'unknown-leg', part: part.id, leg });
    }
    for (const leg of model.legs) {
      const at = part.legs[leg];
      if (at === undefined) problems.push({ kind: 'leg-not-placed', part: part.id, leg });
      else join(`${part.id}.${leg}`, at, part.id);
    }
    for (const [a, b] of model.internal ?? []) uf.union(`${part.id}.${a}`, `${part.id}.${b}`);
  }

  for (const w of spec.wires) join(w.a, w.b, w.id);

  const labels = new Map(board?.pins.map((p) => [`board.${p.id}`, p.label]));
  const nets: Net[] = uf.groups().map((points) => ({ id: netName(points, boardOrder, labels), points }));
  const byPoint = new Map<string, Net>();
  for (const n of nets) for (const p of n.points) byPoint.set(p, n);

  return {
    nets,
    problems,
    netOf: (point) => {
      const r = resolve(point);
      return r ? byPoint.get(r)?.id : undefined;
    },
    pointsInNet: (point) => {
      const r = resolve(point);
      return r ? [...byPoint.get(r)!.points] : [];   // every point that resolves is in a net
    },
  };
}

function netName(points: string[], boardOrder: Map<string, number>, labels: Map<string, string>): string {
  const pins = points.filter((p) => boardOrder.has(p)).sort((a, b) => boardOrder.get(a)! - boardOrder.get(b)!);
  if (pins.length) return labels.get(pins[0]!)!;
  const inHoles = points.filter((p) => /^[^.]+\.(?:[a-j]|[TB][+-])\d+$/.test(p));
  return [...(inHoles.length ? inHoles : points)].sort(byHole)[0]!;
}

/** bb1.a3 before bb1.a10 before bb1.b1: owner, then column number, then row. */
function byHole(a: string, b: string): number {
  const ka = holeKey(a);
  const kb = holeKey(b);
  return ka.owner.localeCompare(kb.owner) || ka.col - kb.col || ka.row.localeCompare(kb.row);
}

/** Points always have an owner: bb1.a10 → (bb1, a, 10); r1.a → (r1, a, 0). */
function holeKey(p: string) {
  const dot = p.indexOf('.');
  const name = p.slice(dot + 1);
  const m = /^(.*?)(\d+)$/.exec(name);
  return { owner: p.slice(0, dot), row: m ? m[1]! : name, col: m ? Number(m[2]) : 0 };
}
