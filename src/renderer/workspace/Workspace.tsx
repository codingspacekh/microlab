import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { EMPTY_HISTORY, PART_KINDS, record, type History } from '@lib/editor';
import type { BoardId } from '@lib/boards';
import { spaceNote, type ProjectDoc } from '@lib/project';
import { Console, type BoardConsoleView } from '../console/Console';
import { CodeEditor } from '../editor/CodeEditor';
import type { RunState } from '../app/useRun';
import { Divider } from '../ui/Divider';
import { Icon } from '../ui/Icon';
import type { MicrolabApi } from '../app/api';
import { BOARD_ART, BOARD_NAMES } from '../app/boards';
import { Canvas, type Placing, type Selection } from './Canvas';
import { FilesPanel, type FilesAsk } from './FilesPanel';
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
  /** The circuit's undo / redo (M5.1, F-16), kept by the app with the open project (its top bar has the buttons). */
  history?: History;
  onHistory?: (h: History) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  /** The file in the editor (M5.6, F-21) and the file Run runs or is running (Q19), named in the console. */
  file?: string;
  onFile?: (path: string) => void;
  runFile?: string;
}

/** Edits of one value of one thing within this long are one undo step (a stepper held, a value typed). */
const MERGE_MS = 1000;

const IDLE_RUN: Pick<RunState, 'parts' | 'board'> = { parts: {}, board: { pins: {} } };

export function Workspace({
  api, width: fixed, doc, onChange, run, running, onInput, onClearConsole, board: realBoard, consoleTab, onConsoleTab, banner,
  history = EMPTY_HISTORY, onHistory, onUndo, onRedo, file = 'main.py', onFile, runFile = file,
}: WorkspaceProps) {
  const { ref, width } = useWidth(fixed);
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
  const [drag, setDrag] = useState<Partial<Record<keyof Layout, number>>>({});
  const [placing, setPlacing] = useState<Placing | null>(null);
  const [selection, setSelection] = useState<Selection[]>([]);
  // the files open in tabs (F-21): main.py, then each one opened, until it is closed
  const [tabs, setTabs] = useState<string[]>(() => [file]);
  const [files, setFiles] = useState<{ ask: FilesAsk | null } | null>(null);
  const shownTabs = [...tabs.filter((t) => t in doc.files), ...(tabs.includes(file) || !(file in doc.files) ? [] : [file])];
  const openFile = (p: string) => { setTabs((t) => (t.includes(p) ? t : [...t, p])); onFile?.(p); };
  const closeTab = (p: string) => {
    const rest = shownTabs.filter((t) => t !== p);
    setTabs(rest);
    if (p === file) onFile?.(rest[Math.max(0, shownTabs.indexOf(p) - 1)] ?? 'main.py');
  };
  const editing = file in doc.files ? file : 'main.py';
  const merging = useRef<{ key: string; at: number; n: number }>({ key: '', at: 0, n: 0 });

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
    setSelection([]);
  }, [running]);

  const project = doc.project;
  const keep = (h: History) => onHistory?.(h);
  // what was selected may be gone (an undo, a redo)
  useEffect(() => {
    setSelection((sel) => {
      const kept = sel.filter((x) => (x.kind === 'part' ? project.parts : x.kind === 'wire' ? project.wires : project.breadboards).some((t) => t.id === x.id));
      return kept.length === sel.length ? sel : kept;
    });
    if (project !== recorded.current) merging.current = { ...merging.current, key: '' };
  }, [project]);
  const recorded = useRef(project);
  /** Every circuit edit is one undo step; `merge` names an edit of one value, so a run of them is one step. */
  const setProject = (p: typeof project, merge?: string) => {
    if (p === project) return;
    let token: string | undefined;
    if (merge) {
      const m = merging.current;
      const now = Date.now();
      if (m.key !== merge || now - m.at > MERGE_MS) merging.current = { key: merge, at: now, n: m.n + 1 };
      else m.at = now;
      token = `${merge}#${merging.current.n}`;
    } else merging.current = { ...merging.current, key: '' };
    keep(record(history, project, token));
    recorded.current = p;
    onChange({ ...doc, project: p });
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
          {(['Basics', 'Sensors', 'Modules'] as const).map((group) => {
            const kinds = PART_KINDS.filter((k) => k.group === group);
            return (
              <div key={group} className="pgroup" role="group" aria-label={group}>
                <div className="gh">{group}<span className="n">{kinds.length}</span></div>
                {kinds.map((k) => (
                  <button key={k.type} type="button" className={placing?.type === k.type ? 'pitem drag' : 'pitem'}
                    title={`Drag the ${inText(k.name)} onto the breadboard, or click it and then click where it goes`}
                    aria-disabled={running || undefined}
                    onMouseDown={(e) => {
                      if (e.button !== 0 || running) return;
                      e.preventDefault();
                      setSelection([]);   // the inspector would cover the canvas
                      setPlacing({ type: k.type, how: 'press', start: { x: e.clientX, y: e.clientY } });
                    }}
                    onClick={(e) => { if (e.detail === 0 && !running) { setSelection([]); setPlacing({ type: k.type, how: 'keys' }); } }}>
                    <span className="pic"><PartIcon type={k.type} /></span>
                    <span className="nm">{k.name}<small>{k.detail}</small></span>
                  </button>
                ))}
              </div>
            );
          })}
          {running && <p className="small run-lock" role="note">Stop the program to change the circuit. While it runs, press a push button by holding the mouse on it, click a slide switch to slide it, drag a knob up or down to turn it, hold the mouse on a PIR to move in front of it, click a line sensor to slide it over the line, and set the light, the soil's moisture and the temperature on the Inputs card.</p>}
          <p className="tiny muted howto">Drag a part onto the breadboard, or click it and click where it goes. For a wire, drag from a pin or hole to another — or click it, click for each bend, and click where it ends.</p>
        </div>
      </section>
      <Divider label="Parts panel width" value={partsPx} min={LIMITS.parts[0]} max={partsMax}
        onChange={(v) => setDrag({ parts: v })} onCommit={commit('parts')} />
      <section className="canvas" aria-label="Circuit">
        <Canvas project={project} onChange={(p) => setProject(p)} placing={placing} onPlacing={setPlacing} selection={selection} onSelect={setSelection}
          running={running} outputs={running || run.ended ? run : IDLE_RUN} onInput={onInput}
          onUndo={onUndo} onRedo={onRedo} />
        {banner && <div className="cbanner">{banner}</div>}
        {selection.length === 1 && (
          <Inspector key={`${selection[0]!.kind}:${selection[0]!.id}`} project={project} selection={selection[0]!} onChange={setProject} onClose={() => setSelection([])} onSelect={setSelection} />
        )}
      </section>
      <Divider label="Code panel width" value={sidePx} min={LIMITS.side[0]} max={sideMax} edge="right"
        onChange={(v) => setDrag({ side: v })} onCommit={commit('side')} />
      <section className="side" aria-label="Code" style={{ flexBasis: sidePx }}>
        <div className="ftabs">
          <div className="tabs" role="tablist" aria-label="Files">
            {shownTabs.map((p) => (
              <span key={p} className={p === editing ? 'ftab on' : 'ftab'}>
                <button type="button" role="tab" aria-selected={p === editing} title={p} onClick={() => onFile?.(p)}
                  ref={p === editing ? (el) => el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }) : undefined}>
                  <Icon name="file" size={14} /> <span className="fname">{p.split('/').pop()}</span>{p.startsWith('lib/') && <>{' '}<span className="libtag">library</span></>}
                </button>
                {shownTabs.length > 1 && (
                  <button type="button" className="x" aria-label={`Close ${p}`} title="Close" onClick={() => closeTab(p)}><Icon name="x" size={12} /></button>
                )}
              </span>
            ))}
          </div>
          <span className="r">
            <button type="button" className="btn ghost sm icon" aria-label="Add a new file" title="New file" onClick={() => setFiles({ ask: { kind: 'new' } })}><Icon name="plus" size={14} /></button>
            <button type="button" className="btn ghost sm icon" aria-label="Project files" title="Project files" aria-expanded={!!files}
              onClick={() => setFiles((f) => (f ? null : { ask: null }))}><Icon name="more" size={14} /></button>
          </span>
        </div>
        {(() => {
          const space = spaceNote(doc);
          return space && space.level !== 'ok' ? <p className={`space-warn ${space.level}`} role="alert"><Icon name="warn" size={14} /> {space.text}</p> : null;
        })()}
        {typeof doc.files[editing] === 'string' || !(editing in doc.files)
          ? <CodeEditor label={editing} board={project.board} value={text(doc.files[editing])} onChange={(code) => onChange({ ...doc, files: { ...doc.files, [editing]: code } })} />
          : <p className="small muted not-text">{editing} isn't a text file, so it can't be shown here.</p>}
        {files && (
          <FilesPanel key={files.ask ? 'ask' : 'list'} doc={doc} ask={files.ask} onDoc={onChange} onOpen={openFile} onClose={() => setFiles(null)}
            onRenamed={(from, to) => {
              const move = (p: string) => (p === from ? to : p.startsWith(`${from}/`) ? `${to}/${p.slice(from.length + 1)}` : p);
              setTabs((t) => t.map(move));
              onFile?.(move(editing));
            }}
            onDeleted={(p) => {
              const gone = (t: string) => t === p || t.startsWith(`${p}/`);
              setTabs((t) => t.filter((x) => !gone(x)));
              if (gone(editing)) onFile?.('main.py' in doc.files && !gone('main.py') ? 'main.py' : shownTabs.find((t) => !gone(t)) ?? 'main.py');
            }} />
        )}
        <Console chunks={run.console} running={running} entry={runFile} onClear={onClearConsole} board={realBoard} tab={consoleTab} onTab={onConsoleTab} />
      </section>
    </div>
  );
}

/** A part's name inside a sentence: 'push button', but 'LED', 'RGB LED'. */
function inText(name: string): string {
  return /^[A-Z]{2}/.test(name) ? name : name[0]!.toLowerCase() + name.slice(1);
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
