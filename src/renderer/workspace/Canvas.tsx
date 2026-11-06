import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import {
  addPart, addWire, allPoints, boardArt, boardData, BREADBOARD, deletePart, deleteWire, freeSpot, legsCentre, moveBoard,
  moveBreadboard, movePart, nearestPoint, partKind, PITCH, pointAt, sceneOf, snapPart, snapToGrid, usedPoints,
  type Legs, type Point, type Scene,
} from '@lib/editor';
import type { Project } from '@lib/project';
import { BOARD_ART, BOARD_NAMES } from '../app/boards';
import { Breadboard, Defs, PartDrawing, polyline, Wire } from './drawings';

/**
 * The circuit canvas (screens 02, 02b, 03; F-10–F-14). Everything is drawn from the project: the board's picture and
 * the breadboards where the view puts them, parts and wires from the holes and pins they use. As in Tinkercad:
 *  - a part is dragged in from the parts panel, or clicked there and placed with a click (Esc cancels); from the
 *    keyboard, Enter picks it up, the arrows move it hole by hole and Enter places it;
 *  - a part moves by whole holes, the board and a breadboard on the grid, a click selects (the inspector);
 *  - a wire is dragged from a free pin or hole to another (straight), or clicked: then each click on the canvas is a
 *    bend and a click on a pin or hole ends it (Backspace takes back a bend, Esc cancels);
 *  - Delete removes the selected part or wire.
 * Until zoom and pan (F-17, M5) the drawing is fitted to the panel when it opens and when a breadboard changes size.
 */
export const MESSAGES = {
  noRoom: 'No room there: every leg needs an empty hole on the breadboard.',
  wireEnd: 'A wire must end on a hole or a pin.',
  used: 'That hole is in use: each hole holds one leg or one wire.',
  full: 'The breadboard is full: there is no free place for that part.',
  carry: 'Click on the breadboard to place it. Esc cancels.',
  keys: 'Arrow keys move it, Enter places it, Esc cancels.',
  bending: 'Click to bend the wire, click a pin or hole to end it. Backspace takes back a bend, Esc cancels.',
} as const;

export type Placing =
  | { type: string; how: 'press'; start: Point }   // mouse down on the panel: a drag, or a click when let go there
  | { type: string; how: 'carry' }                 // clicked: follows the mouse until a click on the canvas
  | { type: string; how: 'keys' };                 // Enter: moved with the arrows

export type Selection = { kind: 'part' | 'wire' | 'breadboard'; id: string };

type Gesture =
  | { kind: 'part'; id: string; start: Point; at: Point }
  | { kind: 'board'; start: Point; at: Point }
  | { kind: 'breadboard'; id: string; start: Point; at: Point }
  | { kind: 'wire'; from: string; via: Point[]; start: Point; at: Point; mode: 'press' | 'click' };

export interface CanvasProps {
  project: Project;
  onChange: (project: Project) => void;
  placing: Placing | null;
  onPlacing: (p: Placing | null) => void;
  selection: Selection | null;
  onSelect: (s: Selection | null) => void;
}

const MOVED = 4;   // a smaller drag is a click
const PALETTE = ['green', 'yellow', 'blue', 'orange', 'purple'];

export function Canvas({ project, onChange, placing, onPlacing, selection, onSelect }: CanvasProps) {
  const svg = useRef<SVGSVGElement>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [placeAt, setPlaceAt] = useState<Point | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const sizes = project.breadboards.map((b) => b.size).join();
  const [viewBox, setViewBox] = useState(() => fit(sceneOf(project)));
  const fitted = useRef(sizes);
  useEffect(() => {
    if (fitted.current === sizes) return;
    fitted.current = sizes;
    setViewBox(fit(sceneOf(project)));
  }, [sizes, project]);

  const toWorld = (e: { clientX: number; clientY: number }): Point => {
    const el = svg.current!;
    const ctm = typeof el.getScreenCTM === 'function' ? el.getScreenCTM() : null;
    if (ctm) {
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
      return { x: p.x, y: p.y };
    }
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left + viewBox.x, y: e.clientY - r.top + viewBox.y };
  };
  const inside = (e: Event) => !!svg.current && svg.current.contains(e.target as Node);

  const preview = useMemo(() => previewOf(project, gesture), [project, gesture]);
  const shown = preview.project;
  const scene = sceneOf(shown);

  const say = (text: string | null) => setProblem(text);
  const endPlacing = () => { setPlaceAt(null); onPlacing(null); };

  /** Put the part with its legs' middle at `at`; false (and why) if it can't go there. */
  const drop = (proj: Project, type: string, at: Point): boolean => {
    const [cx, cy] = legsCentre(type);
    const legs = snapPart(sceneOf(proj), type, { x: at.x - cx, y: at.y - cy });
    if (!legs) { say(MESSAGES.noRoom); return false; }
    say(null);
    const r = addPart(proj, type, legs);
    onChange(r.project);
    onSelect({ kind: 'part', id: r.id });
    return true;
  };

  const endWire = (proj: Project, from: string, to: string | undefined, via: Point[]) => {
    if (!to) { say(MESSAGES.wireEnd); return; }
    if (to === from) return;
    const next = addWire(proj, from, to, via);
    if (!next) { say(MESSAGES.used); return; }
    say(null);
    onChange(next);
    onSelect({ kind: 'wire', id: next.wires[next.wires.length - 1]!.id });
  };

  const finish = (proj: Project, g: Gesture) => {
    if (g.kind === 'wire') {
      endWire(proj, g.from, nearestPoint(sceneOf(proj), g.at), []);
      return;
    }
    const select = (): Selection | null => (g.kind === 'board' ? null : { kind: g.kind, id: g.id });
    if (Math.hypot(g.at.x - g.start.x, g.at.y - g.start.y) < MOVED) { say(null); onSelect(select()); return; }
    const p = previewOf(proj, g);
    if (p.blocked) { say(MESSAGES.noRoom); return; }
    say(null);
    onChange(p.project);
    onSelect(select());
  };

  // The latest values, for the window's listeners.
  const latest = useRef({ project, gesture, placing, placeAt, selection });
  latest.current = { project, gesture, placing, placeAt, selection };

  // Keyboard placing starts where the part would go first.
  useEffect(() => {
    if (placing?.how !== 'keys' || placeAt) return;
    const legs = freeSpot(sceneOf(project), placing.type);
    if (!legs) { say(MESSAGES.full); endPlacing(); return; }
    const pts = Object.values(legs).map((ref) => pointAt(sceneOf(project), ref)!);
    setPlaceAt({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });
    svg.current?.focus();
  });

  useEffect(() => {
    const move = (e: MouseEvent) => {
      const { gesture: g, placing: p } = latest.current;
      if (p && p.how !== 'keys') setPlaceAt(inside(e) ? toWorld(e) : null);
      else if (g) setGesture({ ...g, at: toWorld(e) });
    };
    const up = (e: MouseEvent) => {
      const { project: proj, gesture: g, placing: p } = latest.current;
      if (p?.how === 'press') {
        if (Math.hypot(e.clientX - p.start.x, e.clientY - p.start.y) < MOVED && !inside(e)) {
          onPlacing({ type: p.type, how: 'carry' });   // a click on the panel: the part follows the mouse
          return;
        }
        if (inside(e)) drop(proj, p.type, toWorld(e));
        endPlacing();
        return;
      }
      if (!g) return;
      if (g.kind === 'wire' && g.mode === 'press' && Math.hypot(g.at.x - g.start.x, g.at.y - g.start.y) < MOVED) {
        setGesture({ ...g, mode: 'click' });   // clicked: now each click bends it
        return;
      }
      if (g.kind === 'wire' && g.mode === 'click') return;
      finish(proj, { ...g, at: toWorld(e) } as Gesture);
      setGesture(null);
    };
    // A click outside the canvas puts down what is carried, and drops a wire being drawn.
    const downOutside = (e: MouseEvent) => {
      const { gesture: g, placing: p } = latest.current;
      if (inside(e)) return;
      if (p && p.how !== 'press') endPlacing();
      if (g?.kind === 'wire' && g.mode === 'click') setGesture(null);
    };
    const key = (e: KeyboardEvent) => {
      const { project: proj, gesture: g, placing: p, selection: s } = latest.current;
      // keys typed in a field or the code editor are theirs
      const t = e.target as Element | null;
      if (t?.closest?.('input, textarea, [contenteditable="true"], [contenteditable=""], .cm-editor')) return;
      if (e.key === 'Escape') {
        if (p) { endPlacing(); say(null); } else if (g) { setGesture(null); say(null); } else if (s) onSelect(null);
        return;
      }
      if (g?.kind === 'wire' && g.mode === 'click' && e.key === 'Backspace') {
        e.preventDefault();
        setGesture({ ...g, via: g.via.slice(0, -1) });
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && s && !g && !p && (s.kind === 'part' || s.kind === 'wire')) {
        e.preventDefault();
        onChange(s.kind === 'part' ? deletePart(proj, s.id) : deleteWire(proj, s.id));
        onSelect(null);
      }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('mousedown', downOutside, true);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('mousedown', downOutside, true);
      window.removeEventListener('keydown', key);
    };
  });

  /** While a part is carried or a wire is being bent, a click on the canvas is theirs. */
  const onDownCapture = (e: ReactMouseEvent) => {
    if (e.button !== 0) return;
    const at = toWorld(e);
    if (placing && placing.how !== 'press') {
      e.stopPropagation();
      e.preventDefault();
      if (drop(project, placing.type, at)) endPlacing();
      return;
    }
    if (gesture?.kind === 'wire' && gesture.mode === 'click') {
      e.stopPropagation();
      e.preventDefault();
      const to = nearestPoint(sceneOf(project), at);
      if (to === gesture.from && gesture.via.length === 0) return;
      if (to) {
        endWire(project, gesture.from, to, gesture.via);
        setGesture(null);
      } else {
        setGesture({ ...gesture, via: [...gesture.via, snapToGrid(at)], at });
      }
    }
  };

  const onKey = (e: ReactKeyboardEvent) => {
    if (placing?.how !== 'keys' || !placeAt) return;
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (d) { e.preventDefault(); setPlaceAt({ x: placeAt.x + d[0]! * PITCH, y: placeAt.y + d[1]! * PITCH }); return; }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (drop(project, placing.type, placeAt)) endPlacing();
    }
  };

  const begin = (make: (at: Point) => Gesture) => (e: ReactMouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setGesture(make(toWorld(e)));
  };

  const used = usedPoints(shown);
  const art = boardArt(scene.boardId);
  const roles = new Map(boardData(scene.boardId).pins.map((p) => [`board.${p.id}`, p]));
  const busy = gesture ? gesture.kind === 'wire' ? 'wire' : 'moving' : placing ? 'placing' : '';
  const hint = problem ?? (placing?.how === 'carry' ? MESSAGES.carry : placing?.how === 'keys' ? MESSAGES.keys
    : gesture?.kind === 'wire' && gesture.mode === 'click' ? MESSAGES.bending : null);

  return (
    <>
      <svg
        ref={svg}
        role="application"
        aria-label="Circuit canvas"
        tabIndex={0}
        className={busy ? `scene busy ${busy}` : 'scene'}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        preserveAspectRatio="xMidYMid meet"
        onMouseDownCapture={onDownCapture}
        onKeyDown={onKey}
      >
        <Defs />
        <rect className="bg" x={-1e4} y={-1e4} width={2e4} height={2e4} fill="transparent"
          onMouseDown={(e) => { if (e.button === 0) { say(null); onSelect(null); } }} />
        {shown.breadboards.map((bb) => {
          const at = scene.view.breadboards[bb.id]!;
          const s = BREADBOARD.size(bb.size);
          return (
            <g key={bb.id}>
              <Breadboard id={bb.id} size={bb.size} at={at} onMouseDown={begin((p) => ({ kind: 'breadboard', id: bb.id, start: p, at: p }))} />
              {selection?.kind === 'breadboard' && selection.id === bb.id && (
                <rect className="sel" x={at.x - 5} y={at.y - 5} width={s.width + 10} height={s.height + 10} rx={10} />
              )}
            </g>
          );
        })}
        <image
          role="img"
          aria-label={BOARD_NAMES[scene.boardId]}
          className="board"
          href={BOARD_ART[scene.boardId]}
          x={scene.view.board.x}
          y={scene.view.board.y}
          width={art.width}
          height={art.height}
          onMouseDown={begin((at) => ({ kind: 'board', start: at, at }))}
        />
        {shown.wires.map((w) => {
          const a = pointAt(scene, w.a);
          const b = pointAt(scene, w.b);
          if (!a || !b) return null;
          const colour = w.color ?? wireColour(w.id, roles.get(w.a)?.role ?? roles.get(w.b)?.role);
          const pts = [a, ...(w.via ?? []), b];
          const on = selection?.kind === 'wire' && selection.id === w.id;
          return (
            <g key={w.id} data-wire={w.id} data-ends={`${w.a} ${w.b}`} data-via={(w.via ?? []).map((p) => `${p.x},${p.y}`).join(' ')}
              data-colour={colour} className={on ? 'wirepick on' : 'wirepick'}
              onMouseDown={(e) => { if (e.button === 0) { e.stopPropagation(); say(null); onSelect({ kind: 'wire', id: w.id }); } }}>
              <path className="hit" d={polyline(pts)} />
              <Wire points={pts} colour={colour} />
            </g>
          );
        })}
        <g className="points">
          {allPoints(scene).filter((q) => !used.has(q.ref)).map((q) => (
            <circle key={q.ref} data-point={q.ref} className="pt" cx={q.x} cy={q.y} r={5.5}
              onMouseDown={(e) => { if (e.button === 0) onSelect(null); begin((at) => ({ kind: 'wire', from: q.ref, via: [], start: at, at, mode: 'press' }))(e); }}>
              <title>{q.on === 'board' ? roles.get(q.ref)?.label : q.ref.slice(q.ref.indexOf('.') + 1)}</title>
            </circle>
          ))}
        </g>
        {shown.parts.map((p) => {
          const legs = placed(scene, p.legs);
          if (!legs) return null;
          const moving = gesture?.kind === 'part' && gesture.id === p.id;
          const on = selection?.kind === 'part' && selection.id === p.id;
          return (
            <g key={p.id} data-part={p.id} data-legs={Object.values(p.legs).join(' ')} data-props={JSON.stringify(p.props ?? {})} role="img"
              aria-label={`${safeName(p.type)} ${p.id}`} className={moving && preview.blocked ? 'part blocked' : 'part'}
              onMouseDown={begin((at) => ({ kind: 'part', id: p.id, start: at, at }))}>
              <PartDrawing type={p.type} legs={legs} props={p.props} />
              {on && <SelectBox type={p.type} legs={Object.values(legs)} />}
            </g>
          );
        })}
        {placing && placeAt && <Ghost scene={sceneOf(project)} type={placing.type} at={placeAt} />}
        {gesture?.kind === 'wire' && (
          <g data-drawing-wire="">
            <Wire points={[pointAt(scene, gesture.from)!, ...gesture.via, gesture.at]} colour={wireColour('w0', roles.get(gesture.from)?.role)} drawing />
          </g>
        )}
      </svg>
      {hint && <div className={problem ? 'canvas-hint warn' : 'canvas-hint'} aria-live="polite">{hint}</div>}
    </>
  );
}

/** The dashed box around a selected part (screen 02b), around its legs and its body. */
const PAD: Record<string, [number, number, number, number]> = {
  resistor: [10, 12, 10, 12], led: [20, 8, 20, 40], button: [26, 26, 26, 26], potentiometer: [28, 54, 28, 10],
};
function SelectBox({ type, legs }: { type: string; legs: Point[] }) {
  const [l, t, r, b] = PAD[type] ?? [12, 12, 12, 12];
  const x0 = Math.min(...legs.map((p) => p.x)) - l;
  const y0 = Math.min(...legs.map((p) => p.y)) - t;
  const x1 = Math.max(...legs.map((p) => p.x)) + r;
  const y1 = Math.max(...legs.map((p) => p.y)) + b;
  return <rect className="sel" x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={6} />;
}

/** The part being placed, where it would go — or, faded, where the pointer is when it can't go there. */
function Ghost({ scene, type, at }: { scene: Scene; type: string; at: Point }) {
  const [cx, cy] = legsCentre(type);
  const first = { x: at.x - cx, y: at.y - cy };
  const legs = snapPart(scene, type, first);
  const where = legs ? placed(scene, legs)! : Object.fromEntries(Object.entries(partKind(type).legs).map(([k, [dx, dy]]) => [k, { x: first.x + dx, y: first.y + dy }]));
  return (
    <g data-ghost={legs ? 'ok' : 'blocked'} className={legs ? 'ghost' : 'ghost blocked'} pointerEvents="none">
      <PartDrawing type={type} legs={where} props={partKind(type).props} />
    </g>
  );
}

function placed(scene: Scene, legs: Legs): Record<string, Point> | undefined {
  const out: Record<string, Point> = {};
  for (const [k, ref] of Object.entries(legs)) {
    const p = pointAt(scene, ref);
    if (!p) return undefined;
    out[k] = p;
  }
  return out;
}

function previewOf(project: Project, g: Gesture | null): { project: Project; blocked: boolean } {
  if (!g || g.kind === 'wire') return { project, blocked: false };
  const dx = g.at.x - g.start.x;
  const dy = g.at.y - g.start.y;
  const scene = sceneOf(project);
  if (g.kind === 'board') return { project: moveBoard(project, { x: scene.view.board.x + dx, y: scene.view.board.y + dy }), blocked: false };
  if (g.kind === 'breadboard') {
    const at = scene.view.breadboards[g.id]!;
    return { project: moveBreadboard(project, g.id, { x: at.x + dx, y: at.y + dy }), blocked: false };
  }
  const part = project.parts.find((p) => p.id === g.id)!;
  const first = pointAt(scene, Object.values(part.legs)[0]!)!;
  const legs = snapPart(scene, part.type, { x: first.x + dx, y: first.y + dy }, part.id);
  return legs ? { project: movePart(project, part.id, legs), blocked: false } : { project, blocked: true };
}

/** Ground black, a supply red, the others by turns, until a colour is chosen (the inspector). */
export function wireColour(id: string, role: string | undefined): string {
  if (role === 'ground') return 'black';
  if (role === 'power') return 'red';
  return PALETTE[(Number(/\d+/.exec(id)?.[0] ?? 0) + PALETTE.length - 1) % PALETTE.length]!;
}

function safeName(type: string): string {
  try { return partKind(type).name; } catch { return type; }
}

/** The board and breadboards with room around them. */
function fit(scene: Scene) {
  const art = boardArt(scene.boardId);
  const boxes = [{ x: scene.view.board.x, y: scene.view.board.y, w: art.width, h: art.height }];
  for (const bb of scene.project.breadboards) {
    const at = scene.view.breadboards[bb.id]!;
    const s = BREADBOARD.size(bb.size);
    boxes.push({ x: at.x, y: at.y, w: s.width, h: s.height });
  }
  const pad = 48;
  const x0 = Math.min(...boxes.map((b) => b.x)) - pad;
  const y0 = Math.min(...boxes.map((b) => b.y)) - pad;
  const x1 = Math.max(...boxes.map((b) => b.x + b.w)) + pad;
  const y1 = Math.max(...boxes.map((b) => b.y + b.h)) + pad;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
