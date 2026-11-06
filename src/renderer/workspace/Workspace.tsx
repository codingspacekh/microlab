import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { freeSpot, PART_KINDS, sceneOf, addPart } from '@lib/editor';
import type { BoardId } from '@lib/boards';
import type { ProjectDoc } from '@lib/project';
import { Divider } from '../ui/Divider';
import type { MicrolabApi } from '../app/api';
import { BOARD_ART, BOARD_NAMES } from '../app/boards';
import { Canvas } from './Canvas';
import { PartIcon } from './drawings';
import './workspace.css';

/**
 * The Workspace (screens 02, 03): the parts panel, the circuit canvas and the code side share the width as
 * proportions — parts ~17 %, the circuit the rest, code ~34 % — each within limits; the dividers between them are
 * draggable and where they were left is a setting (N-13, M4.1). Parts come from the panel (F-10, M4.3).
 */
export interface Layout {
  parts: number;
  side: number;
}

export const DEFAULT_LAYOUT: Layout = { parts: 0.17, side: 0.34 };
const LIMITS = { parts: [220, 360], side: [320, 0.5], canvas: 360 } as const;
export const FULL = 'The breadboard is full: there is no free place for that part.';

export interface WorkspaceProps {
  api: MicrolabApi;
  /** The window's width, for tests; measured in the app. */
  width?: number;
  doc: ProjectDoc;
  onChange: (doc: ProjectDoc) => void;
}

export function Workspace({ api, width: fixed, doc, onChange }: WorkspaceProps) {
  const { ref, width } = useWidth(fixed);
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
  const [drag, setDrag] = useState<Partial<Record<keyof Layout, number>>>({});
  const [placing, setPlacing] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

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

  const project = doc.project;
  const setProject = (p: typeof project) => onChange({ ...doc, project: p });
  const addFree = (type: string) => {
    const legs = freeSpot(sceneOf(project), type);
    if (!legs) { setHint(FULL); return; }
    setHint(null);
    setProject(addPart(project, type, legs).project);
  };

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
              <button key={k.type} type="button" className={placing === k.type ? 'pitem drag' : 'pitem'}
                title={`Drag ${k.name.toLowerCase()} onto the breadboard, or click to add it`}
                onMouseDown={(e) => { if (e.button === 0) { e.preventDefault(); setPlacing(k.type); } }}
                onClick={() => addFree(k.type)}>
                <span className="pic"><PartIcon type={k.type} /></span>
                <span className="nm">{k.name}<small>{k.detail}</small></span>
              </button>
            ))}
          </div>
          <p className="tiny muted howto">Drag a part onto the breadboard, or click it. Drag from a pin or a hole to another to add a wire.</p>
        </div>
      </section>
      <Divider label="Parts panel width" value={partsPx} min={LIMITS.parts[0]} max={partsMax}
        onChange={(v) => setDrag({ parts: v })} onCommit={commit('parts')} />
      <section className="canvas" aria-label="Circuit">
        <Canvas project={project} onChange={setProject} placing={placing} onPlacingEnd={() => setPlacing(null)} onHint={setHint} />
        {hint && <div className="canvas-hint" aria-live="polite">{hint}</div>}
      </section>
      <Divider label="Code panel width" value={sidePx} min={LIMITS.side[0]} max={sideMax} edge="right"
        onChange={(v) => setDrag({ side: v })} onCommit={commit('side')} />
      <section className="side" aria-label="Code" style={{ flexBasis: sidePx }}>
        <div className="head"><h3>main.py</h3></div>
        {/* The editor comes in M4.4; until then the code is shown as it is. */}
        <pre className="code-preview">{String(doc.files['main.py'] ?? '')}</pre>
      </section>
    </div>
  );
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
