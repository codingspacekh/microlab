import { COLUMNS, hasRails, type BreadboardSize } from '../circuit';
import { microbitAlone, onGpioBoard, type Project } from '../project';
import { artOf, boardData, MICROBIT_ALONE_ART } from './library';
import { BREADBOARD, boardBox, sceneOf, snapToGrid, type Point } from './geometry';
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

/** A part with its legs in these holes — or, a part that lies beside the breadboard (M7), lying `at`. A part that
 *  brings another (the ULN2003 its stepper) adds it too, plugged into it, in the same edit. */
export function addPart(project: Project, type: string, legs: Legs, at?: Point, turns = 0): { project: Project; id: string } {
  const kind = partKind(type);
  const id = nextId(kind.prefix, project.parts.map((p) => p.id));
  let next: Project = { ...project, parts: [...project.parts, { id, type, props: { ...kind.props }, legs: { ...legs } }] };
  if (kind.free) next = lay(next, id, at ?? { x: 0, y: 0 }, turns);
  if (kind.brings) {
    const b = partKind(kind.brings.type);
    const bid = nextId(b.prefix, next.parts.map((p) => p.id));
    const plug = Object.fromEntries(Object.entries(kind.brings.legs).map(([leg, t]) => [leg, `${id}.${t}`]));
    next = { ...next, parts: [...next.parts, { id: bid, type: b.type, props: { ...b.props }, legs: plug }] };
    next = { ...next, view: sceneOf(next).view };   // where it lies by default, kept
  }
  return { id, project: next };
}

/** A part that lies beside the breadboard put `at` (on the grid), turned `turns` quarters clockwise. */
export function lay(project: Project, id: string, at: Point, turns = 0): Project {
  const view = sceneOf(project).view;
  const t = ((turns % 4) + 4) % 4;
  return { ...project, view: { ...view, parts: { ...view.parts, [id]: { ...snapToGrid(at), ...(t ? { turns: t } : {}) } } } };
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

/** What goes with deleted parts (M7): the wires on their terminals, where the free ones lay; a part plugged into one
 *  (a stepper's cable in its ULN2003) is unplugged and stays. */
export function withoutParts(project: Project, ids: string[]): Project {
  const gone = (ref: string) => ids.includes(ref.slice(0, ref.indexOf('.')));
  const next: Project = {
    ...project,
    parts: project.parts.filter((p) => !ids.includes(p.id)).map((p) => (Object.values(p.legs).some(gone)
      ? { ...p, legs: Object.fromEntries(Object.entries(p.legs).filter(([, ref]) => !gone(ref))) } : p)),
    wires: project.wires.filter((w) => !gone(w.a) && !gone(w.b)),
  };
  const lying = project.view?.parts;
  if (lying && ids.some((id) => id in lying)) {
    next.view = { ...project.view!, parts: Object.fromEntries(Object.entries(lying).filter(([id]) => !ids.includes(id))) };
  }
  return next;
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
    const art = sceneOf(project).art;
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

/** The board a quarter turn more, clockwise (M7, the teacher's request): the wires stay on its pins; it keeps its
 *  bottom-left corner where it was, so it grows up and right, away from the breadboard below it. */
export function rotateBoard(project: Project): Project {
  const scene = sceneOf(project);
  const view = scene.view;
  const turns = ((view.boardTurns ?? 0) + 1) % 4;
  const rest = { board: view.board, breadboards: view.breadboards, ...(view.parts ? { parts: view.parts } : {}) };
  const turned = { ...project, view: turns ? { ...rest, boardTurns: turns } : rest };
  const before = boardBox(scene);
  const after = boardBox(sceneOf(turned));
  return moveBoard(turned, { x: view.board.x + before.x - after.x, y: view.board.y + before.y + before.h - (after.y + after.h) });
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

/**
 * M6.9 (screen 24b): the micro:bit into its GPIO board. The wires stay on the same pins — ring 0 and the header's P0
 * are one pin — and the board keeps the middle of its bottom edge where it was: it grows upwards, clear of the
 * breadboard under it. The same project back when it is in already.
 */
export function putInGpioBoard(project: Project): Project {
  if (!microbitAlone(project)) return project;
  const next = { ...project };
  delete next.gpioBoard;
  return reboard(project, next);
}

/** The micro:bit's pins it has a ring for (P0, P1, P2, 3.3V, GND), as 'board.P0'. */
export function ringPins(): Set<string> {
  return new Set(boardData('microbit-v2').pins.filter((p) => MICROBIT_ALONE_ART.pins[String(p.number)]).map((p) => `board.${p.id}`));
}

/** M6.9 (screen 24b): the micro:bit out of its GPIO board, alone again. The wires on pins it has no ring for (P3–P20,
 *  5V, the I²C header) go with the GPIO board, and so do its plugs in a breadboard and its micro-USB; `removed` says
 *  how many wires. One edit, so one undo brings them all back. */
export function takeOutOfGpioBoard(project: Project): { project: Project; removed: number } {
  if (!onGpioBoard(project)) return { project, removed: 0 };
  const rings = ringPins();
  const off = (ref: string) => ref.startsWith('board.') && !rings.has(ref);
  const wires = project.wires.filter((w) => !off(w.a) && !off(w.b));
  const next: Project = { ...project, gpioBoard: false, wires };
  delete next.plugs;
  delete next.usb;
  return { project: reboard(project, next), removed: project.wires.length - wires.length };
}

/** `after` drawn with its board where `before`'s was: the middle of its bottom edge kept, the rest as it was. */
function reboard(before: Project, after: Project): Project {
  const view = sceneOf(before).view;
  const from = artOf(before);
  const to = artOf(after);
  const board = snapToGrid({ x: view.board.x + (from.width - to.width) / 2, y: view.board.y + from.height - to.height });
  return { ...after, view: { ...view, board } };
}
