import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import {
  addPart, addWire, allPoints, boardArt, boardData, BREADBOARD, legsCentre, moveBoard, moveBreadboard, movePart, nearestPoint,
  partKind, pointAt, sceneOf, snapPart, usedPoints, type Legs, type Point, type Scene,
} from '@lib/editor';
import type { Project } from '@lib/project';
import { BOARD_ART, BOARD_NAMES } from '../app/boards';
import { Breadboard, Defs, PartDrawing, Wire } from './drawings';

/**
 * The circuit canvas (screens 02, 03; F-10, F-11, F-12, F-13 basic). Everything is drawn from the project: the board's
 * picture and the breadboards where the view puts them, parts and wires from the holes and pins they use. Gestures:
 * a part dragged in from the parts panel snaps to holes; a part, the board or a breadboard dragged moves (parts by
 * whole holes); a drag from a free hole or pin to another makes a wire. Until zoom and pan (F-17, M5) the drawing is
 * fitted to the panel when the project opens.
 */
export const MESSAGES = {
  noRoom: 'No room there: every leg needs an empty hole on the breadboard.',
  wireEnd: 'A wire must end on a hole or a pin.',
  used: 'That hole is in use: each hole holds one leg or one wire.',
} as const;

type Gesture =
  | { kind: 'part'; id: string; type: string; start: Point; at: Point }
  | { kind: 'board'; start: Point; at: Point }
  | { kind: 'breadboard'; id: string; start: Point; at: Point }
  | { kind: 'wire'; from: string; at: Point };

export interface CanvasProps {
  project: Project;
  onChange: (project: Project) => void;
  /** A part being dragged in from the parts panel. */
  placing: string | null;
  onPlacingEnd: () => void;
  onHint: (text: string | null) => void;
}

const MOVED = 4;   // a smaller drag is a click
const PALETTE = ['green', 'yellow', 'blue', 'orange', 'purple'];

export function Canvas({ project, onChange, placing, onPlacingEnd, onHint }: CanvasProps) {
  const svg = useRef<SVGSVGElement>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [placeAt, setPlaceAt] = useState<Point | null>(null);
  const [viewBox] = useState(() => fit(sceneOf(project)));

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
  const inside = (e: MouseEvent) => !!svg.current && svg.current.contains(e.target as Node);

  // What is drawn: the project, or the project as the gesture would leave it.
  const preview = useMemo(() => previewOf(project, gesture), [project, gesture]);
  const shown = preview.project;
  const scene = sceneOf(shown);

  const latest = useRef({ project, gesture, placing, placeAt });
  latest.current = { project, gesture, placing, placeAt };

  useEffect(() => {
    if (!gesture && !placing) return;
    const move = (e: MouseEvent) => {
      const { gesture: g, placing: p } = latest.current;
      if (p) setPlaceAt(inside(e) ? toWorld(e) : null);
      else if (g) setGesture({ ...g, at: toWorld(e) });
    };
    const up = (e: MouseEvent) => {
      const { project: proj, gesture: g, placing: p } = latest.current;
      if (p) {
        if (inside(e)) drop(proj, p, toWorld(e));
        setPlaceAt(null);
        onPlacingEnd();
        return;
      }
      if (g) finish(proj, { ...g, at: toWorld(e) });
      setGesture(null);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  });

  const drop = (proj: Project, type: string, at: Point) => {
    const [cx, cy] = legsCentre(type);
    const legs = snapPart(sceneOf(proj), type, { x: at.x - cx, y: at.y - cy });
    if (!legs) { onHint(MESSAGES.noRoom); return; }
    onHint(null);
    onChange(addPart(proj, type, legs).project);
  };

  const finish = (proj: Project, g: Gesture) => {
    if (g.kind === 'wire') {
      const to = nearestPoint(sceneOf(proj), g.at);
      if (!to) { onHint(MESSAGES.wireEnd); return; }
      if (to === g.from) return;
      const next = addWire(proj, g.from, to);
      if (!next) { onHint(MESSAGES.used); return; }
      onHint(null);
      onChange(next);
      return;
    }
    if (Math.hypot(g.at.x - g.start.x, g.at.y - g.start.y) < MOVED) return;
    const p = previewOf(proj, g);
    if (p.blocked) { onHint(MESSAGES.noRoom); return; }
    onHint(null);
    onChange(p.project);
  };

  const begin = (make: (at: Point) => Gesture) => (e: ReactMouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const at = toWorld(e);
    setGesture(make(at));
  };

  const used = usedPoints(shown);
  const art = boardArt(scene.boardId);
  const roles = new Map(boardData(scene.boardId).pins.map((p) => [`board.${p.id}`, p]));

  return (
    <svg
      ref={svg}
      role="application"
      aria-label="Circuit canvas"
      className={gesture || placing ? `scene busy ${gesture?.kind ?? 'placing'}` : 'scene'}
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <Defs />
      {shown.breadboards.map((bb) => (
        <Breadboard key={bb.id} id={bb.id} size={bb.size} at={scene.view.breadboards[bb.id]!}
          onMouseDown={begin((at) => ({ kind: 'breadboard', id: bb.id, start: at, at }))} />
      ))}
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
      <g className="points">
        {allPoints(scene).filter((q) => !used.has(q.ref)).map((q) => (
          <circle key={q.ref} data-point={q.ref} className="pt" cx={q.x} cy={q.y} r={5.5}
            onMouseDown={begin((at) => ({ kind: 'wire', from: q.ref, at }))}>
            <title>{q.on === 'board' ? roles.get(q.ref)?.label : q.ref.slice(q.ref.indexOf('.') + 1)}</title>
          </circle>
        ))}
      </g>
      {shown.wires.map((w) => {
        const a = pointAt(scene, w.a);
        const b = pointAt(scene, w.b);
        if (!a || !b) return null;
        const colour = wireColour(w.id, roles.get(w.a)?.role ?? roles.get(w.b)?.role);
        return <g key={w.id} data-wire={w.id} data-ends={`${w.a} ${w.b}`} data-colour={colour}><Wire a={a} b={b} colour={colour} /></g>;
      })}
      {shown.parts.map((p) => {
        const legs = placed(scene, p.legs);
        if (!legs) return null;
        const moving = gesture?.kind === 'part' && gesture.id === p.id;
        return (
          <g key={p.id} data-part={p.id} data-legs={Object.values(p.legs).join(' ')} role="img"
            aria-label={`${safeName(p.type)} ${p.id}`} className={moving && preview.blocked ? 'part blocked' : 'part'}
            onMouseDown={begin((at) => ({ kind: 'part', id: p.id, type: p.type, start: at, at }))}>
            <PartDrawing type={p.type} legs={legs} props={p.props} />
          </g>
        );
      })}
      {placing && placeAt && <Ghost scene={sceneOf(project)} type={placing} at={placeAt} />}
      {gesture?.kind === 'wire' && (
        <g data-drawing-wire="">
          <Wire a={pointAt(scene, gesture.from)!} b={gesture.at} colour={wireColour('w0', roles.get(gesture.from)?.role)} drawing />
        </g>
      )}
    </svg>
  );
}

/** The part being dragged in, where it would go — or, faded, where the pointer is when it can't go there. */
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

/** Ground black, a supply red, the others by turns (wire colours become a choice in M5, F-13). */
function wireColour(id: string, role: string | undefined): string {
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
