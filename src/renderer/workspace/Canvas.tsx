import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import {
  addPart, addWire, allPoints, boardArt, boardData, BREADBOARD, deleteBend, deleteMany, duplicate, fitBox, footprint, freeSpot, holeCard,
  insertBend, joined, moveBend, pinCard, type HoleCard, type PinCard,
  legsCentre, moveBoard, moveBreadboard, moveParts, nearestPoint, panBy, partKind, PITCH, pointAt, rotateParts, sceneOf,
  snapPart, snapToGrid, usedPoints, zoomAt, ZOOM, type Box, type Legs, type Point, type Scene,
} from '@lib/editor';
import type { Project } from '@lib/project';
import { BOARD_ART, BOARD_NAMES } from '../app/boards';
import type { PartView } from '../../sim/circuit';
import type { BoardOutputs } from '../app/useRun';
import { Icon } from '../ui/Icon';
import { BoardLed, Breadboard, Defs, MicrobitDisplay, PartDrawing, partTurns, polyline, Wire } from './drawings';

/**
 * The circuit canvas (screens 02, 02b, 03; F-10–F-14). Everything is drawn from the project: the board's picture and
 * the breadboards where the view puts them, parts and wires from the holes and pins they use. As in Tinkercad:
 *  - a part is dragged in from the parts panel, or clicked there and placed with a click (Esc cancels); from the
 *    keyboard, Enter picks it up, the arrows move it hole by hole and Enter places it;
 *  - a part moves by whole holes, the board and a breadboard on the grid, a click selects (the inspector);
 *  - a wire is dragged from a free pin or hole to another (straight), or clicked: then each click on the canvas is a
 *    bend and a click on a pin or hole ends it (Backspace takes back a bend, Esc cancels);
 *  - Delete removes the selected part or wire.
 * M5.1: shift-click adds to (or takes from) the selection, a drag on the empty canvas draws a box that selects what is
 * inside it; the selected parts move together, R turns them a quarter (or the part being placed), ⌘D / Ctrl+D copies
 * them, Delete removes them; ⌘Z / Ctrl+Z undoes any edit, ⇧⌘Z / Ctrl+Y redoes it (the top bar has the buttons).
 * While a program runs (M4.5) the circuit can't be changed: LEDs glow by their current, the board's own LED and the
 * micro:bit's display light up, and a push button is pressed by holding the mouse on it.
 * M5.2 (F-17): the wheel or a pinch zooms at the pointer (as in Tinkercad: the M5 gate), Shift + wheel pans, and so
 * does a drag with the middle or right button or with Space held; the toolbar zooms out, in, to 100 % and fits; + − 0 do the same.
 * The drawing is fitted when it opens and when a breadboard changes size. Hovering a free hole or pin lights every hole
 * and pin joined to it — its strip, and through wires further (F-12); while a wire is drawn, where it would end.
 * M5.3: a hovered pin shows its card — its name and what it can do (F-15) — and a hole its strip and what is in it;
 * the selected wire's bends can be dragged (on the grid) or double-clicked away, and a dot in the middle of each
 * stretch dragged out to add one (F-13).
 */
export const MESSAGES = {
  noRoom: 'No room there: every leg needs an empty hole on the breadboard.',
  wireEnd: 'A wire must end on a hole or a pin.',
  used: 'That hole is in use: each hole holds one leg or one wire.',
  full: 'The breadboard is full: there is no free place for that part.',
  carry: 'Click on the breadboard to place it. Esc cancels.',
  keys: 'Arrow keys move it, Enter places it, Esc cancels.',
  bending: 'Click to bend the wire, click a pin or hole to end it. Backspace takes back a bend, Esc cancels.',
  noTurn: 'No room to turn it here: move it where there are more free holes first.',
  noCopy: 'No free place on the breadboard for a copy.',
  several: (n: number, mod: string) => `${n} selected. Drag one to move them all, R turns them, ${mod}D copies them, Delete removes them. Shift-click adds or takes away.`,
} as const;

const MOD = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl+';

export type Placing = (
  | { type: string; how: 'press'; start: Point }   // mouse down on the panel: a drag, or a click when let go there
  | { type: string; how: 'carry' }                 // clicked: follows the mouse until a click on the canvas
  | { type: string; how: 'keys' }                  // Enter: moved with the arrows
) & { /** Quarter turns clockwise, R while placing (M5.1). */ turns?: number };

export type Selection = { kind: 'part' | 'wire' | 'breadboard'; id: string };

type Gesture =
  | { kind: 'parts'; id: string; ids: string[]; start: Point; at: Point }   // `id` was pressed; `ids` move together
  | { kind: 'marquee'; add: boolean; start: Point; at: Point }
  | { kind: 'pan'; last: { x: number; y: number } }   // screen pixels
  | { kind: 'bend'; wire: string; index: number; insert: boolean; start: Point; at: Point }
  | { kind: 'board'; start: Point; at: Point }
  | { kind: 'breadboard'; id: string; start: Point; at: Point }
  | { kind: 'wire'; from: string; via: Point[]; start: Point; at: Point; mode: 'press' | 'click' };

export interface CanvasProps {
  project: Project;
  onChange: (project: Project) => void;
  placing: Placing | null;
  onPlacing: (p: Placing | null) => void;
  /** What is selected: one thing (the inspector shows it) or several parts and wires (M5.1). */
  selection: Selection[];
  onSelect: (s: Selection[]) => void;
  /** Undo / redo (M5.1, F-16) by key; the buttons are in the top bar (screen 02b). */
  onUndo?: () => void;
  onRedo?: () => void;
  /** A program is running: nothing can be changed; buttons can be pressed. */
  running?: boolean;
  /** What the run shows: each part's state, the board's own outputs. */
  outputs?: { parts: Record<string, PartView>; board: BoardOutputs };
  onInput?: (name: string, value: number) => void;
}

const MOVED = 4;   // a smaller drag is a click
const PALETTE = ['green', 'yellow', 'blue', 'orange', 'purple'];

const NO_OUTPUTS = { parts: {}, board: { pins: {} } };

export function Canvas({
  project, onChange, placing, onPlacing, selection, onSelect, running = false, outputs = NO_OUTPUTS, onInput,
  onUndo, onRedo,
}: CanvasProps) {
  const svg = useRef<SVGSVGElement>(null);
  const [pressed, setPressed] = useState<string | null>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [placeAt, setPlaceAt] = useState<Point | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const sizes = project.breadboards.map((b) => b.size).join();
  const [viewBox, setViewBox] = useState<Box>(() => fitBox(sceneOf(project)));
  const fitted = useRef(sizes);
  useEffect(() => {
    if (fitted.current === sizes) return;
    fitted.current = sizes;
    setViewBox(fitBox(sceneOf(project)));
  }, [sizes, project]);
  // screen pixels per drawing unit (1 = 100 %), measured after each change and when the panel is resized
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = svg.current;
    if (!el) return;
    const measure = () => {
      const ctm = typeof el.getScreenCTM === 'function' ? el.getScreenCTM() : null;
      const r = el.getBoundingClientRect();
      const s = ctm?.a || Math.min(r.width / viewBox.w, r.height / viewBox.h) || 1;
      setScale(s);
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : undefined;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [viewBox]);
  const [hover, setHover] = useState<string | null>(null);
  const space = useRef(false);

  const toWorld = (e: { clientX: number; clientY: number }): Point => {
    const el = svg.current!;
    const ctm = typeof el.getScreenCTM === 'function' ? el.getScreenCTM() : null;
    if (ctm) {
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
      return { x: p.x, y: p.y };
    }
    const r = el.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale + viewBox.x, y: (e.clientY - r.top) / scale + viewBox.y };
  };
  const panelSize = () => {
    const r = svg.current?.parentElement?.getBoundingClientRect();
    return { w: r?.width ?? 0, h: r?.height ?? 0 };
  };
  /** Where a drawing point is on screen, from the canvas panel's corner (for the cards over it). */
  const screenOf = (p: Point): Point => {
    const el = svg.current;
    const ctm = el && typeof el.getScreenCTM === 'function' ? el.getScreenCTM() : null;
    const box = el?.parentElement?.getBoundingClientRect();
    if (ctm && box) {
      const q = new DOMPoint(p.x, p.y).matrixTransform(ctm);
      return { x: q.x - box.left, y: q.y - box.top };
    }
    return { x: (p.x - viewBox.x) * scale, y: (p.y - viewBox.y) * scale };
  };
  const inside = (e: Event) => !!svg.current && svg.current.contains(e.target as Node);

  const preview = useMemo(() => previewOf(project, gesture), [project, gesture]);
  const shown = preview.project;
  const scene = sceneOf(shown);

  const say = (text: string | null) => setProblem(text);
  const endPlacing = () => { setPlaceAt(null); onPlacing(null); };

  /** Put the part with its legs' middle at `at`; false (and why) if it can't go there. */
  const drop = (proj: Project, type: string, at: Point, turns = 0): boolean => {
    const [cx, cy] = legsCentre(type, turns);
    const legs = snapPart(sceneOf(proj), type, { x: at.x - cx, y: at.y - cy }, undefined, turns);
    if (!legs) { say(MESSAGES.noRoom); return false; }
    say(null);
    const r = addPart(proj, type, legs);
    onChange(r.project);
    onSelect([{ kind: 'part', id: r.id }]);
    return true;
  };

  const chosen = (sel: Selection[]) => ({
    parts: sel.filter((x) => x.kind === 'part').map((x) => x.id),
    wires: sel.filter((x) => x.kind === 'wire').map((x) => x.id),
  });
  const isOn = (kind: Selection['kind'], id: string) => selection.some((x) => x.kind === kind && x.id === id);
  /** Shift-click: in or out of the selection (parts and wires only; a breadboard is selected alone). */
  const toggle = (kind: 'part' | 'wire', id: string) => {
    const rest = selection.filter((x) => x.kind !== 'breadboard');
    onSelect(isOn(kind, id) ? rest.filter((x) => !(x.kind === kind && x.id === id)) : [...rest, { kind, id }]);
  };

  // the commands on what is selected (keys and toolbar)
  const commands = {
    rotate(proj: Project, sel: Selection[]) {
      const { parts } = chosen(sel);
      if (!parts.length) return;
      const next = rotateParts(proj, parts);
      if (!next) { say(MESSAGES.noTurn); return; }
      say(null);
      onChange(next);
    },
    duplicate(proj: Project, sel: Selection[]) {
      const c = chosen(sel);
      if (!c.parts.length && !c.wires.length) return;
      const r = duplicate(proj, c);
      if (!r) { say(MESSAGES.noCopy); return; }
      say(null);
      onChange(r.project);
      onSelect([...r.parts.map((id) => ({ kind: 'part' as const, id })), ...r.wires.map((id) => ({ kind: 'wire' as const, id }))]);
    },
    remove(proj: Project, sel: Selection[]) {
      const c = chosen(sel);
      if (!c.parts.length && !c.wires.length) return;
      say(null);
      onChange(deleteMany(proj, c));
      onSelect([]);
    },
  };

  const endWire = (proj: Project, from: string, to: string | undefined, via: Point[]) => {
    if (!to) { say(MESSAGES.wireEnd); return; }
    if (to === from) return;
    const next = addWire(proj, from, to, via);
    if (!next) { say(MESSAGES.used); return; }
    say(null);
    onChange(next);
    onSelect([{ kind: 'wire', id: next.wires[next.wires.length - 1]!.id }]);
  };

  const finish = (proj: Project, g: Gesture) => {
    if (g.kind === 'pan') return;
    if (g.kind === 'bend') {
      if (Math.hypot(g.at.x - g.start.x, g.at.y - g.start.y) < MOVED) return;
      onChange(previewOf(proj, g).project);
      return;
    }
    if (g.kind === 'wire') {
      endWire(proj, g.from, nearestPoint(sceneOf(proj), g.at), []);
      return;
    }
    const still = Math.hypot(g.at.x - g.start.x, g.at.y - g.start.y) < MOVED;
    if (g.kind === 'marquee') {
      say(null);
      if (still) { if (!g.add) onSelect([]); return; }
      const inBox = boxed(sceneOf(proj), g.start, g.at);
      const keep = g.add ? latest.current.selection.filter((x) => x.kind !== 'breadboard') : [];
      onSelect([...keep, ...inBox.filter((x) => !keep.some((k) => k.kind === x.kind && k.id === x.id))]);
      return;
    }
    const select = (): Selection[] => (g.kind === 'board' ? [] : g.kind === 'breadboard' ? [{ kind: 'breadboard', id: g.id }]
      : g.ids.length > 1 && !still ? g.ids.map((id) => ({ kind: 'part' as const, id })) : [{ kind: 'part', id: g.id }]);
    if (still) { say(null); onSelect(select()); return; }
    const p = previewOf(proj, g);
    if (p.blocked) { say(MESSAGES.noRoom); return; }
    say(null);
    onChange(p.project);
    if (g.kind === 'parts' && g.ids.length > 1) {
      // the wires chosen with them stay chosen
      onSelect([...g.ids.map((id) => ({ kind: 'part' as const, id })), ...latest.current.selection.filter((x) => x.kind === 'wire')]);
    } else onSelect(select());
  };

  // The latest values, for the window's listeners.
  const latest = useRef({ project, gesture, placing, placeAt, selection, pressed, scale, viewBox });
  latest.current = { project, gesture, placing, placeAt, selection, pressed, scale, viewBox };

  const zoomBy = (k: number, at?: Point) => {
    const vb = latest.current.viewBox;
    setViewBox(zoomAt(vb, at ?? { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 }, k, latest.current.scale));
  };
  const fitView = () => setViewBox(fitBox(sceneOf(latest.current.project)));

  // the wheel (and a pinch) zooms at the pointer, as in Tinkercad (the M5 gate); Shift + wheel pans
  // (a native listener: React's is passive)
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.shiftKey) setViewBox((vb) => panBy(vb, -e.deltaX, -e.deltaY, latest.current.scale));
      else zoomBy(Math.exp(-(e.deltaY || e.deltaX) * 0.0015), toWorldRef.current(e));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);
  const toWorldRef = useRef(toWorld);
  toWorldRef.current = toWorld;

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
      if (g?.kind === 'pan') {
        const { scale: s } = latest.current;
        setViewBox((vb) => panBy(vb, e.clientX - g.last.x, e.clientY - g.last.y, s));
        setGesture({ ...g, last: { x: e.clientX, y: e.clientY } });
      } else if (p && p.how !== 'keys') setPlaceAt(inside(e) ? toWorld(e) : null);
      else if (g) setGesture({ ...g, at: toWorld(e) } as Gesture);
    };
    const up = (e: MouseEvent) => {
      const { project: proj, gesture: g, placing: p, pressed: held } = latest.current;
      if (held) { onInput?.(`pressed:${held}`, 0); setPressed(null); return; }
      if (p?.how === 'press') {
        if (Math.hypot(e.clientX - p.start.x, e.clientY - p.start.y) < MOVED && !inside(e)) {
          onPlacing({ type: p.type, how: 'carry', turns: p.turns });   // a click on the panel: the part follows the mouse
          return;
        }
        if (inside(e)) drop(proj, p.type, toWorld(e), p.turns);
        endPlacing();
        return;
      }
      if (!g) return;
      if (g.kind === 'pan') { setGesture(null); return; }
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
        if (p) { endPlacing(); say(null); } else if (g) { setGesture(null); say(null); } else if (s.length) onSelect([]);
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      // the view's keys, when nothing else has the keyboard (the page, the canvas or its toolbar)
      const free = !(t instanceof Element) || t === document.body || !!t.closest('svg.scene, .ctools');
      if (free && !mod && !e.altKey) {
        if (e.key === ' ' && p?.how !== 'keys' && !t?.closest?.('button')) { space.current = true; e.preventDefault(); return; }
        if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomBy(ZOOM.step); return; }
        if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomBy(1 / ZOOM.step); return; }
        if (e.key === '0') { e.preventDefault(); fitView(); return; }
        const arrow = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
        if (arrow && p?.how !== 'keys') { e.preventDefault(); setViewBox((vb) => panBy(vb, arrow[0]! * 48, arrow[1]! * 48, latest.current.scale)); return; }
      }
      if (running || e.altKey) return;
      if (mod && !g && !p && (e.key.toLowerCase() === 'z' || (e.ctrlKey && e.key.toLowerCase() === 'y'))) {
        e.preventDefault();
        say(null);
        if (e.key.toLowerCase() === 'y' || e.shiftKey) onRedo?.(); else onUndo?.();
        return;
      }
      if (mod && e.key.toLowerCase() === 'd' && !g && !p) { e.preventDefault(); commands.duplicate(proj, s); return; }
      if (!mod && (e.key === 'r' || e.key === 'R')) {
        if (p) { e.preventDefault(); onPlacing({ ...p, turns: (p.turns ?? 0) + 1 }); return; }
        if (!g) { e.preventDefault(); commands.rotate(proj, s); }
        return;
      }
      if (g?.kind === 'wire' && g.mode === 'click' && e.key === 'Backspace') {
        e.preventDefault();
        setGesture({ ...g, via: g.via.slice(0, -1) });
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !g && !p && s.some((x) => x.kind !== 'breadboard')) {
        e.preventDefault();
        commands.remove(proj, s);
      }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('mousedown', downOutside, true);
    window.addEventListener('keydown', key);
    const keyUp = (e: KeyboardEvent) => { if (e.key === ' ') space.current = false; };
    window.addEventListener('keyup', keyUp);
    return () => {
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('mousedown', downOutside, true);
      window.removeEventListener('keydown', key);
    };
  });

  /** While a part is carried or a wire is being bent, a click on the canvas is theirs. */
  const onDownCapture = (e: ReactMouseEvent) => {
    // a drag with the middle or right button, or with Space held, moves the view (F-17)
    if (e.button === 1 || e.button === 2 || (e.button === 0 && space.current && !(placing && placing.how !== 'press'))) {
      e.stopPropagation();
      e.preventDefault();
      setGesture({ kind: 'pan', last: { x: e.clientX, y: e.clientY } });
      return;
    }
    if (e.button !== 0) return;
    const at = toWorld(e);
    if (placing && placing.how !== 'press') {
      e.stopPropagation();
      e.preventDefault();
      if (drop(project, placing.type, at, placing.turns)) endPlacing();
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
      if (drop(project, placing.type, placeAt, placing.turns)) endPlacing();
    }
  };

  const begin = (make: (at: Point) => Gesture) => (e: ReactMouseEvent) => {
    if (e.button !== 0 || running) return;
    e.preventDefault();
    e.stopPropagation();
    setGesture(make(toWorld(e)));
  };

  const used = usedPoints(shown);
  const art = boardArt(scene.boardId);
  const roles = new Map(boardData(scene.boardId).pins.map((p) => [`board.${p.id}`, p]));
  const press = (id: string) => (e: ReactMouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setPressed(id);
    onInput?.(`pressed:${id}`, 1);
  };
  const ledOf = (id: string) => {
    const v = outputs.parts[id];
    return v?.kind === 'led' ? v.brightness : 0;
  };
  const busy = gesture ? gesture.kind === 'wire' ? 'wire' : gesture.kind === 'marquee' ? 'choosing' : gesture.kind === 'pan' ? 'panning' : 'moving' : placing ? 'placing' : '';
  // F-12: what is joined to the hole under the pointer — or, while a wire is drawn, to where it would end
  // a hovered point that has just been used (a wire ended there) is gone from under the pointer
  const hovered = hover && !usedPoints(shown).has(hover) ? hover : null;
  const litFrom = running ? null : gesture?.kind === 'wire' ? nearestPoint(scene, gesture.at) ?? gesture.from : gesture ? null : hovered;
  const lit = useMemo(() => (litFrom ? joined(shown, litFrom) : null), [shown, litFrom]);
  const hint = problem ?? (placing?.how === 'carry' ? MESSAGES.carry : placing?.how === 'keys' ? MESSAGES.keys
    : gesture?.kind === 'wire' && gesture.mode === 'click' ? MESSAGES.bending
    : selection.length > 1 && !gesture ? MESSAGES.several(selection.length, MOD) : null);
  const some = chosen(selection);
  const canEdit = !running && !placing && !gesture;

  return (
    <>
      <svg
        ref={svg}
        role="application"
        aria-label="Circuit canvas"
        tabIndex={0}
        className={['scene', busy && `busy ${busy}`, running && 'running'].filter(Boolean).join(' ')}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        preserveAspectRatio="xMidYMid meet"
        onMouseDownCapture={onDownCapture}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={onKey}
      >
        <Defs />
        <rect className="bg" x={-1e4} y={-1e4} width={2e4} height={2e4} fill="transparent"
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            say(null);
            if (running) { onSelect([]); return; }
            const add = e.shiftKey;
            if (!add) onSelect([]);
            begin((at) => ({ kind: 'marquee', add, start: at, at }))(e);
          }} />
        {shown.breadboards.map((bb) => {
          const at = scene.view.breadboards[bb.id]!;
          const s = BREADBOARD.size(bb.size);
          return (
            <g key={bb.id}>
              <Breadboard id={bb.id} size={bb.size} at={at} onMouseDown={begin((p) => ({ kind: 'breadboard', id: bb.id, start: p, at: p }))} />
              {isOn('breadboard', bb.id) && (
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
        <BoardOutputsLayer boardId={scene.boardId} at={scene.view.board} pins={outputs.board.pins} display={outputs.board.display} led={ledOf('board.LED')} />
        {lit && <Joined scene={scene} strips={lit.strips} points={lit.points} />}
        {shown.wires.map((w) => {
          const a = pointAt(scene, w.a);
          const b = pointAt(scene, w.b);
          if (!a || !b) return null;
          const colour = w.color ?? wireColour(w.id, roles.get(w.a)?.role ?? roles.get(w.b)?.role);
          const pts = [a, ...(w.via ?? []), b];
          const on = isOn('wire', w.id);
          return (
            <g key={w.id} data-wire={w.id} data-ends={`${w.a} ${w.b}`} data-via={(w.via ?? []).map((p) => `${p.x},${p.y}`).join(' ')}
              data-colour={colour} className={on ? 'wirepick on' : 'wirepick'} aria-selected={on || undefined}
              onMouseDown={(e) => {
                if (e.button !== 0 || running) return;
                e.stopPropagation();
                say(null);
                if (e.shiftKey) toggle('wire', w.id); else onSelect([{ kind: 'wire', id: w.id }]);
              }}>
              <path className="hit" d={polyline(pts)} />
              <Wire points={pts} colour={colour} />
            </g>
          );
        })}
        {!running && selection.length === 1 && selection[0]!.kind === 'wire' && (() => {
          const w = shown.wires.find((x) => x.id === selection[0]!.id);
          const a = w && pointAt(scene, w.a);
          const b = w && pointAt(scene, w.b);
          if (!w || !a || !b) return null;
          const pts = [a, ...(w.via ?? []), b];
          return (
            <g className="bends" data-bends={w.id}>
              {pts.slice(1).map((q, i) => {
                const p = pts[i]!;
                const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
                if (Math.hypot(q.x - p.x, q.y - p.y) < 3 * PITCH) return null;
                return <circle key={`m${i}`} data-insert={i} className="bend-add" cx={mid.x} cy={mid.y} r={4}
                  onMouseDown={begin((at) => ({ kind: 'bend', wire: w.id, index: i, insert: true, start: at, at }))}><title>Drag to add a bend</title></circle>;
              })}
              {(w.via ?? []).map((p, i) => (
                <circle key={`b${i}`} data-bend={i} className="bend" cx={p.x} cy={p.y} r={5.5}
                  onMouseDown={begin((at) => ({ kind: 'bend', wire: w.id, index: i, insert: false, start: at, at }))}
                  onDoubleClick={(e) => { e.stopPropagation(); onChange(deleteBend(project, w.id, i)); }}>
                  <title>Drag to move this bend; double-click to take it away</title>
                </circle>
              ))}
            </g>
          );
        })()}
        <g className="points" display={running ? 'none' : undefined}>
          {allPoints(scene).filter((q) => !used.has(q.ref)).map((q) => (
            <circle key={q.ref} data-point={q.ref} className="pt" cx={q.x} cy={q.y} r={5.5}
              onMouseEnter={() => setHover(q.ref)} onMouseLeave={() => setHover((h) => (h === q.ref ? null : h))}
              onMouseDown={(e) => { if (e.button === 0) onSelect([]); begin((at) => ({ kind: 'wire', from: q.ref, via: [], start: at, at, mode: 'press' }))(e); }}>
              <title>{q.on === 'board' ? roles.get(q.ref)?.label : q.ref.slice(q.ref.indexOf('.') + 1)}</title>
            </circle>
          ))}
        </g>
        {shown.parts.map((p) => {
          const legs = placed(scene, p.legs);
          if (!legs) return null;
          const moving = gesture?.kind === 'parts' && gesture.ids.includes(p.id);
          const on = isOn('part', p.id);
          const glow = p.type === 'led' ? ledOf(p.id) : undefined;
          return (
            <g key={p.id} data-part={p.id} data-legs={Object.values(p.legs).join(' ')} data-props={JSON.stringify(p.props ?? {})} role="img"
              {...(glow !== undefined ? { 'data-lit': glow > 0.01 ? '1' : '0' } : {})}
              {...(p.type === 'button' ? { 'data-pressed': pressed === p.id ? '1' : '0' } : {})}
              aria-label={`${safeName(p.type)} ${p.id}`} className={['part', p.type, moving && preview.blocked && 'blocked'].filter(Boolean).join(' ')}
              aria-selected={on || undefined}
              onMouseDown={running ? (p.type === 'button' ? press(p.id) : undefined) : (e) => {
                if (e.button !== 0) return;
                if (e.shiftKey) { e.preventDefault(); e.stopPropagation(); say(null); toggle('part', p.id); return; }
                const group = on ? chosen(selection).parts : [p.id];
                begin((at) => ({ kind: 'parts', id: p.id, ids: group, start: at, at }))(e);
              }}>
              <PartDrawing type={p.type} legs={legs} props={p.props} look={{ glow, pressed: pressed === p.id }} />
              {on && <SelectBox type={p.type} legs={legs} />}
            </g>
          );
        })}
        {placing && placeAt && <Ghost scene={sceneOf(project)} type={placing.type} at={placeAt} turns={placing.turns ?? 0} />}
        {gesture?.kind === 'marquee' && Math.hypot(gesture.at.x - gesture.start.x, gesture.at.y - gesture.start.y) >= MOVED && (
          <rect className="marquee" data-marquee="" x={Math.min(gesture.start.x, gesture.at.x)} y={Math.min(gesture.start.y, gesture.at.y)}
            width={Math.abs(gesture.at.x - gesture.start.x)} height={Math.abs(gesture.at.y - gesture.start.y)} />
        )}
        {gesture?.kind === 'wire' && (
          <g data-drawing-wire="">
            <Wire points={[pointAt(scene, gesture.from)!, ...gesture.via, gesture.at]} colour={wireColour('w0', roles.get(gesture.from)?.role)} drawing />
          </g>
        )}
      </svg>
      {hint && <div className={problem ? 'canvas-hint warn' : 'canvas-hint'} aria-live="polite">{hint}</div>}
      {!running && !placing && (!gesture || gesture.kind === 'wire') && (
        <>
          {gesture?.kind === 'wire' && gesture.from.startsWith('board.') && gesture.from !== litFrom && (
            <Card room={panelSize()} at={screenOf(pointAt(scene, gesture.from)!)} pin={pinCard(boardData(scene.boardId), gesture.from.slice(6))} starts />
          )}
          {litFrom && (litFrom.startsWith('board.')
            ? <Card room={panelSize()} at={screenOf(pointAt(scene, litFrom)!)} pin={pinCard(boardData(scene.boardId), litFrom.slice(6))} starts={gesture?.kind === 'wire' && gesture.from === litFrom} />
            : <Card room={panelSize()} at={screenOf(pointAt(scene, litFrom)!)} hole={holeCard(shown, litFrom)} />)}
        </>
      )}
      <div className="ctools" role="toolbar" aria-label="Circuit tools">
        <ToolButton icon="zoomout" label="Zoom out" keys="−" disabled={scale <= ZOOM.min + 1e-6} onClick={() => zoomBy(1 / ZOOM.step)} />
        <button type="button" className="btn ghost sm zoom" aria-label="Zoom to 100 %" title="Zoom to 100 %" onMouseDown={(e) => e.preventDefault()}
          onClick={() => zoomBy(1 / scale)}>{Math.round(scale * 100)}%</button>
        <ToolButton icon="zoomin" label="Zoom in" keys="+" disabled={scale >= ZOOM.max - 1e-6} onClick={() => zoomBy(ZOOM.step)} />
        <ToolButton icon="fit" label="Fit" keys="0" disabled={false} onClick={fitView} />
        <span className="vsep" />
        <ToolButton icon="rotate" label="Rotate" keys="R" disabled={!canEdit || !some.parts.length} onClick={() => commands.rotate(project, selection)} />
        <ToolButton icon="copy" label="Duplicate" keys={`${MOD}D`} disabled={!canEdit || (!some.parts.length && !some.wires.length)} onClick={() => commands.duplicate(project, selection)} />
        <ToolButton icon="trash" label="Delete" keys="Delete" disabled={!canEdit || (!some.parts.length && !some.wires.length)} onClick={() => commands.remove(project, selection)} />
      </div>
    </>
  );
}

/** The board's own outputs where its picture has them: the Pico W's LED (its 'LED' pin), the ESP32's blue LED (a
 *  circuit part, board.LED), the micro:bit's display. */
function BoardOutputsLayer({ boardId, at, pins, display, led }: { boardId: Scene['boardId']; at: Point; pins: Record<string, number>; display?: string; led: number }) {
  const art = boardArt(boardId);
  const ledAt = art.leds?.LED;
  const place = ([x, y]: [number, number]) => ({ x: at.x + x, y: at.y + y });
  return (
    <>
      {ledAt && boardId === 'pico-w' && pins.LED === 1 && <BoardLed at={place(ledAt)} colour="green" />}
      {ledAt && boardId !== 'pico-w' && led > 0.01 && <BoardLed at={place(ledAt)} colour="blue" />}
      {art.display && display && <MicrobitDisplay at={art.display.map(place)} pixels={display} />}
    </>
  );
}

function ToolButton({ icon, label, keys, disabled, onClick }: { icon: string; label: string; keys: string; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" className="btn ghost sm icon" aria-label={label} title={`${label} (${keys})`} aria-keyshortcuts={keys}
      disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      <Icon name={icon} size={14} />
    </button>
  );
}

/** What a box drawn from a to b holds: parts with every leg in it, wires with both ends and every bend in it. */
function boxed(scene: Scene, a: Point, b: Point): Selection[] {
  const x0 = Math.min(a.x, b.x); const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y); const y1 = Math.max(a.y, b.y);
  const inside = (p: Point | undefined) => !!p && p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
  const out: Selection[] = [];
  for (const p of scene.project.parts) if (Object.values(p.legs).every((r) => inside(pointAt(scene, r)))) out.push({ kind: 'part', id: p.id });
  for (const w of scene.project.wires) {
    if (inside(pointAt(scene, w.a)) && inside(pointAt(scene, w.b)) && (w.via ?? []).every(inside)) out.push({ kind: 'wire', id: w.id });
  }
  return out;
}

/** The dashed box around a selected part (screen 02b), around its legs and its body — turned with the part. */
const PAD: Record<string, [number, number, number, number]> = {
  resistor: [10, 12, 10, 12], led: [20, 8, 20, 40], button: [26, 26, 26, 26], potentiometer: [28, 54, 28, 10],
};
function SelectBox({ type, legs: placedLegs }: { type: string; legs: Record<string, Point> }) {
  const legs = Object.values(placedLegs);
  let [l, t, r, b] = PAD[type] ?? [12, 12, 12, 12];
  // a quarter turn clockwise brings what was on the left to the top
  for (let i = 0; i < partTurns(type, placedLegs); i++) [l, t, r, b] = [b, l, t, r];
  const x0 = Math.min(...legs.map((p) => p.x)) - l;
  const y0 = Math.min(...legs.map((p) => p.y)) - t;
  const x1 = Math.max(...legs.map((p) => p.x)) + r;
  const y1 = Math.max(...legs.map((p) => p.y)) + b;
  return <rect className="sel" x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={6} />;
}

/** The part being placed, where it would go — or, faded, where the pointer is when it can't go there. */
function Ghost({ scene, type, at, turns }: { scene: Scene; type: string; at: Point; turns: number }) {
  const [cx, cy] = legsCentre(type, turns);
  const first = { x: at.x - cx, y: at.y - cy };
  const legs = snapPart(scene, type, first, undefined, turns);
  const where = legs ? placed(scene, legs)! : Object.fromEntries(Object.entries(footprint(type, turns)).map(([k, [dx, dy]]) => [k, { x: first.x + dx, y: first.y + dy }]));
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
  if (!g || g.kind === 'wire' || g.kind === 'marquee' || g.kind === 'pan') return { project, blocked: false };
  if (g.kind === 'bend') {
    return { project: g.insert ? insertBend(project, g.wire, g.index, g.at) : moveBend(project, g.wire, g.index, g.at), blocked: false };
  }
  const dx = g.at.x - g.start.x;
  const dy = g.at.y - g.start.y;
  const scene = sceneOf(project);
  if (g.kind === 'board') return { project: moveBoard(project, { x: scene.view.board.x + dx, y: scene.view.board.y + dy }), blocked: false };
  if (g.kind === 'breadboard') {
    const at = scene.view.breadboards[g.id]!;
    return { project: moveBreadboard(project, g.id, { x: at.x + dx, y: at.y + dy }), blocked: false };
  }
  if (g.kind !== 'parts') return { project, blocked: false };
  const moved = moveParts(project, g.ids, { x: dx, y: dy });
  return moved ? { project: moved, blocked: false } : { project, blocked: true };
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


/** Everything joined to a hole (F-12, as design/svgparts.py): a green band along each lit strip, a ring on every
 *  joined hole and board pin. */
function Joined({ scene, strips, points }: { scene: Scene; strips: { from: string; to: string }[]; points: string[] }) {
  return (
    <g className="joined" pointerEvents="none">
      {strips.map(({ from, to }) => {
        const a = pointAt(scene, from);
        const b = pointAt(scene, to);
        if (!a || !b) return null;
        return <rect key={from} data-lit-strip={`${from} ${to}`} x={Math.min(a.x, b.x) - 7} y={Math.min(a.y, b.y) - 7}
          width={Math.abs(b.x - a.x) + 14} height={Math.abs(b.y - a.y) + 14} rx={7} fill="#2fb56a" fillOpacity={0.16} stroke="#2fb56a" strokeWidth={1.2} />;
      })}
      {points.map((r) => {
        const p = pointAt(scene, r);
        return p ? <circle key={r} data-lit-point={r} cx={p.x} cy={p.y} r={4.6} fill="none" stroke="#1f9d55" strokeWidth={1.6} /> : null;
      })}
    </g>
  );
}

/** A pin's card (dark, F-15) or a hole's (light, F-12), beside the point (screen 02). */
const CARD = { w: 260, h: 150, gap: 14 };
function Card({ at, pin, hole, starts = false, room }: { at: Point; pin?: PinCard; hole?: HoleCard; starts?: boolean; room: { w: number; h: number } }) {
  // beside the point, turned to its left or above it where the panel has no room
  const style: CSSProperties = {};
  if (room.w && at.x + CARD.gap + CARD.w > room.w) style.right = Math.round(room.w - at.x + CARD.gap); else style.left = Math.round(at.x + CARD.gap);
  if (room.h && at.y + CARD.gap + CARD.h > room.h) style.bottom = Math.round(room.h - at.y + CARD.gap); else style.top = Math.round(at.y + CARD.gap);
  if (pin) {
    return (
      <div className="tip pin-card" role="tooltip" style={style}>
        <b>{pin.title}</b> <span className="sub">· {pin.detail}{starts ? ' · wire starts here' : ''}</span>
        {pin.chips.length > 0 && <div className="fx">{pin.chips.map((c) => <span key={c.text} className={`fn ${c.kind}`}>{c.text}</span>)}</div>}
        {pin.lines.map((l) => <div key={l} className="ln">{l}</div>)}
      </div>
    );
  }
  return (
    <div className="tip hole-card" role="tooltip" style={style}>
      <b>{hole!.title}</b>
      {hole!.lines.map((l) => <div key={l} className="small">{l}</div>)}
    </div>
  );
}
