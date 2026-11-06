import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { PART_KINDS } from '@lib/editor';
import type { BoardId } from '@lib/boards';
import type { ProjectDoc } from '@lib/project';
import { Console, type BoardConsoleView } from '../console/Console';
import { CodeEditor } from '../editor/CodeEditor';
import type { RunState } from '../app/useRun';
import { Divider } from '../ui/Divider';
import { Icon } from '../ui/Icon';
import type { MicrolabApi } from '../app/api';
import { BOARD_ART, BOARD_NAMES } from '../app/boards';
import { Canvas, type Placing, type Selection } from './Canvas';
import { Inspector } from './Inspector';
import { PartIcon } from './drawings';
import './workspace.css';

/**
 * The Workspace (screens 02, 03): the parts panel, the circuit canvas and the code side share the width as
 * proportions — parts ~17 %, the circuit the rest, code ~34 % — each within limits; the dividers between them are
 * draggable and where they were left is a setting (N-13, M4.1). Parts come from the panel (F-10, M4.3): dragged,
 * or clicked and placed with a click, or picked up with Enter (M4.3b); a selected thing shows the inspector.
 */
export interface Layout {
  parts: number;
  side: number;
}

export const DEFAULT_LAYOUT: Layout = { parts: 0.17, side: 0.34 };
const LIMITS = { parts: [220, 360], side: [320, 0.5], canvas: 360 } as const;

export interface WorkspaceProps {
  api: MicrolabApi;
  /** The window's width, for tests; measured in the app. */
  width?: number;
  doc: ProjectDoc;
  onChange: (doc: ProjectDoc) => void;
  /** The run (M4.5): its console and what the parts and the board show. */
  run: RunState;
  running: boolean;
  /** A part's live input while running: 'pressed:btn1' → 1 / 0. */
  onInput: (name: string, value: number) => void;
  onClearConsole: () => void;
  /** The real board's console (M10.4, screen 16), its tab chosen or not. */
  board?: BoardConsoleView;
  consoleTab?: 'sim' | 'board';
  onConsoleTab?: (tab: 'sim' | 'board') => void;
  /** Over the canvas while the real board runs: the simulator is stopped, the board must be wired like this. */
  banner?: ReactNode;
}

const IDLE_RUN: Pick<RunState, 'parts' | 'board'> = { parts: {}, board: { pins: {} } };

export function Workspace({ api, width: fixed, doc, onChange, run, running, onInput, onClearConsole, board: realBoard, consoleTab, onConsoleTab, banner }: WorkspaceProps) {
  const { ref, width } = useWidth(fixed);
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
  const [drag, setDrag] = useState<Partial<Record<keyof Layout, number>>>({});
  const [placing, setPlacing] = useState<Placing | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);

  useEffect(() => {
    let live = true;
    void api.settings.get('layout').then((saved) => {
      const s = saved as Partial<Layout> | undefined;
      if (live && s && typeof s.parts === 'number' && typeof s.side === 'number') setLayout({ parts: s.parts, side: s.side });
    });
    return () => { live = false; };
  }, [api]);

  const partsPx = drag.parts ?? px(layout.parts, width, LIMITS.parts);
  const sidePx = drag.side ?? px(layout.side, width, LIMITS.side);
  const commit = (key: keyof Layout) => (value: number) => {
    const next = { ...layout, [key]: value / width };
    setLayout(next);
    setDrag({});
    void api.settings.set('layout', next);
  };
  const sideMax = Math.max(LIMITS.side[0], Math.min(LIMITS.side[1] * width, width - partsPx - LIMITS.canvas));
  const partsMax = Math.max(LIMITS.parts[0], Math.min(LIMITS.parts[1], width - sidePx - LIMITS.canvas));

  // a running program owns the circuit: nothing is placed, moved or selected until it stops
  useEffect(() => {
    if (!running) return;
    setPlacing(null);
    setSelection(null);
  }, [running]);

  const project = doc.project;
  const setProject = (p: typeof project) => onChange({ ...doc, project: p });

  const board = project.board as BoardId;
  return (
    <div className="ws" ref={ref}>
      <section className="parts" aria-label="Parts" style={{ flexBasis: partsPx }}>
        <div className="head">
          <div className="boardrow">
            <span className="pic"><img src={BOARD_ART[board]} alt="" draggable={false} /></span>
            <div><span className="tiny muted">Board</span><b>{BOARD_NAMES[board] ?? board}</b></div>
          </div>
        </div>
        <div className="list">
          <div className="pgroup">
            <div className="gh">Basics<span className="n">{PART_KINDS.length}</span></div>
            {PART_KINDS.map((k) => (
              <button key={k.type} type="button" className={placing?.type === k.type ? 'pitem drag' : 'pitem'}
                title={`Drag ${k.name.toLowerCase()} onto the breadboard, or click it and then click where it goes`}
                aria-disabled={running || undefined}
                onMouseDown={(e) => {
                  if (e.button !== 0 || running) return;
                  e.preventDefault();
                  setSelection(null);   // the inspector would cover the canvas
                  setPlacing({ type: k.type, how: 'press', start: { x: e.clientX, y: e.clientY } });
                }}
                onClick={(e) => { if (e.detail === 0 && !running) { setSelection(null); setPlacing({ type: k.type, how: 'keys' }); } }}>
                <span className="pic"><PartIcon type={k.type} /></span>
                <span className="nm">{k.name}<small>{k.detail}</small></span>
              </button>
            ))}
          </div>
          {running && <p className="small run-lock" role="note">Stop the program to change the circuit. While it runs, press a push button by holding the mouse on it.</p>}
          <p className="tiny muted howto">Drag a part onto the breadboard, or click it and click where it goes. For a wire, drag from a pin or hole to another — or click it, click for each bend, and click where it ends.</p>
        </div>
      </section>
      <Divider label="Parts panel width" value={partsPx} min={LIMITS.parts[0]} max={partsMax}
        onChange={(v) => setDrag({ parts: v })} onCommit={commit('parts')} />
      <section className="canvas" aria-label="Circuit">
        <Canvas project={project} onChange={setProject} placing={placing} onPlacing={setPlacing} selection={selection} onSelect={setSelection}
          running={running} outputs={running || run.ended ? run : IDLE_RUN} onInput={onInput} />
        {banner && <div className="cbanner">{banner}</div>}
        {selection && (
          <Inspector key={`${selection.kind}:${selection.id}`} project={project} selection={selection} onChange={setProject} onClose={() => setSelection(null)} />
        )}
      </section>
      <Divider label="Code panel width" value={sidePx} min={LIMITS.side[0]} max={sideMax} edge="right"
        onChange={(v) => setDrag({ side: v })} onCommit={commit('side')} />
      <section className="side" aria-label="Code" style={{ flexBasis: sidePx }}>
        <div className="ftabs" role="tablist" aria-label="Files">
          <button type="button" role="tab" aria-selected="true"><Icon name="file" size={14} /> main.py</button>
        </div>
        <CodeEditor label="main.py" value={text(doc.files['main.py'])} onChange={(code) => onChange({ ...doc, files: { ...doc.files, 'main.py': code } })} />
        <Console chunks={run.console} running={running} entry="main.py" onClear={onClearConsole} board={realBoard} tab={consoleTab} onTab={onConsoleTab} />
      </section>
    </div>
  );
}

/** A file's text; a file that isn't text (bytes) is shown empty until the file tree can say so (M5). */
function text(file: string | Uint8Array | undefined): string {
  return typeof file === 'string' ? file : '';
}

/** px from a proportion of the width, within [min, max]; max may itself be a proportion. */
function px(fraction: number, total: number, [min, max]: readonly [number, number]): number {
  const hi = max <= 1 ? max * total : max;
  return Math.round(Math.min(hi, Math.max(min, fraction * total)));
}

function useWidth(fixed: number | undefined) {
  const ref = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(() => fixed ?? window.innerWidth);
  useLayoutEffect(() => {
    if (fixed !== undefined || !ref.current) return;
    const el = ref.current;
    const update = () => setMeasured(el.getBoundingClientRect().width || window.innerWidth);
    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : undefined;
    ro?.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [fixed]);
  return { ref, width: fixed ?? measured };
}
