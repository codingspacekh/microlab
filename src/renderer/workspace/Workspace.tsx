import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { completeAt, EMPTY_HISTORY, PART_KINDS, record, type History } from '@lib/editor';
import { microbitAlone, onGpioBoard, spaceNote, type ProjectDoc } from '@lib/project';
import { Console, type BoardConsoleView } from '../console/Console';
import { CodeEditor } from '../editor/CodeEditor';
import { EditorPrefs, lookAttrs, useEditorLook } from '../editor/EditorPrefs';
import type { RunState } from '../app/useRun';
import { Divider } from '../ui/Divider';
import { Icon } from '../ui/Icon';
import { TextField } from '../ui/TextField';
import { MenuButton } from '../ui/Menu';
import { AddLibrary } from './AddLibrary';
import type { MicrolabApi } from '../app/api';
import { boardName, boardPicture } from '../app/boards';
import { BREADBOARD_TYPE, Canvas, GPIO_BOARD_TYPE, type Placing, type Selection } from './Canvas';
import { FilesPanel, type FilesAsk } from './FilesPanel';
import { Inspector } from './Inspector';
import { BreadboardIcon, PartIcon } from './drawings';
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
/** The rail the parts panel folds to (M6.8). */
const RAIL = 56;

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
  /** What the student types in the console to the simulated board (M9): input()'s answer, the REPL's lines, Ctrl+C. */
  onType?: (text: string) => void;
  /** Ctrl+D at the REPL: the program runs again. */
  onSoftReset?: () => void;
}

/** Edits of one value of one thing within this long are one undo step (a stepper held, a value typed). */
const MERGE_MS = 1000;

const IDLE_RUN: Pick<RunState, 'parts' | 'board'> = { parts: {}, board: { pins: {} } };

export function Workspace({
  api, width: fixed, doc, onChange, run, running, onInput, onClearConsole, board: realBoard, consoleTab, onConsoleTab, banner, onType, onSoftReset,
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
  const [libraries, setLibraries] = useState(false);
  // M6.8 (screens 23, 23b): the parts panel is folded to a rail until it is wanted; it slides out over the canvas
  const [partsOpen, setPartsOpen] = useState(false);
  /** What the canvas says of an edit made in the inspector (M6.9: the micro:bit taken out of its GPIO board). */
  const [notice, setNotice] = useState<{ text: string } | null>(null);
  const [look, setLook] = useEditorLook(api);
  const lookOf = lookAttrs(look);
  const shownTabs = [...tabs.filter((t) => t in doc.files), ...(tabs.includes(file) || !(file in doc.files) ? [] : [file])];
  const openFile = (p: string) => { setTabs((t) => (t.includes(p) ? t : [...t, p])); onFile?.(p); };
  const closeTab = (p: string) => {
    const rest = shownTabs.filter((t) => t !== p);
    setTabs(rest);
    if (p === file) onFile?.(rest[Math.max(0, shownTabs.indexOf(p) - 1)] ?? 'main.py');
  };
  const editing = file in doc.files ? file : 'main.py';
  // M9 (screen 05): the last run's error — its line marked in the editor, "Go to line" from the console, a note on the canvas
  const failed = !running && run.ended?.ended === 'error' ? run.ended.error : undefined;
  const [goTo, setGoTo] = useState<{ file: string; line: number }>();
  const [dismissed, setDismissed] = useState<unknown>(null);
  const goToLine = (f: string, line: number) => {
    if (f in doc.files) openFile(f);
    setGoTo({ file: f, line });
  };
  const errorBanner = failed && failed.file && failed.line && dismissed !== run.ended ? (
    <>
      <Icon name="alert" size={14} />
      <span>The program stopped: an error in <b>{failed.file}</b>, line {failed.line}.{run.ended!.faults.length === 0 ? ' The circuit is fine.' : ''}</span>
      <span className="spacer" />
      <button type="button" className="btn sm" onClick={() => goToLine(failed.file!, failed.line!)}>Go to line {failed.line}</button>
      <button type="button" className="btn ghost icon sm" aria-label="Close the note" onClick={() => setDismissed(run.ended)}><Icon name="x" size={14} /></button>
    </>
  ) : undefined;
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
  const sideMax = Math.max(LIMITS.side[0], Math.min(LIMITS.side[1] * width, width - RAIL - LIMITS.canvas));
  const partsMax = Math.max(LIMITS.parts[0], Math.min(LIMITS.parts[1], width - sidePx - RAIL - 120));

  // a running program owns the circuit: nothing is placed, moved or selected until it stops
  useEffect(() => {
    if (!running) return;
    setPlacing(null);
    setSelection([]);
    setPartsOpen(false);   // it folds away while a program runs (screen 23b)
  }, [running]);

  // the parts panel folds away by itself once the student works elsewhere (the teacher's request, M7): a press outside
  // it and its rail button — not while a part is being placed from it (that press puts it down), nor in a menu or a
  // dropdown it opened (drawn over everything)
  const placingRef = useRef(placing);
  placingRef.current = placing;
  useEffect(() => {
    if (!partsOpen) return;
    const down = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (placingRef.current || !t?.closest) return;
      if (t.closest('.drawer-wrap, .rail, [role="listbox"], [role="menu"], [role="dialog"]')) return;
      setPartsOpen(false);
    };
    window.addEventListener('mousedown', down, true);
    return () => window.removeEventListener('mousedown', down, true);
  }, [partsOpen]);

  // P opens and folds the parts panel — not while typing (the editor, a field)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'p' && e.key !== 'P') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.closest('input, textarea, [contenteditable="true"], .cm-editor') || t.isContentEditable)) return;
      e.preventDefault();
      setPartsOpen((o) => !o);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [running]);

  const project = doc.project;
  const keep = (h: History) => onHistory?.(h);
  // what was selected may be gone (an undo, a redo)
  useEffect(() => {
    setSelection((sel) => {
      const kept = sel.filter((x) => (x.kind === 'board' ? onGpioBoard(project)
        : (x.kind === 'part' ? project.parts : x.kind === 'wire' ? project.wires : project.breadboards).some((t) => t.id === x.id)));
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

  /** Put down from the parts panel: dragged (press), or picked up with Enter (keys). */
  // the parts panel's search (the teacher's request, M7): by name, what it is, its type and its group
  const [query, setQuery] = useState('');
  // as typed: 'i2c' finds I²C, '8x8' finds 8×8, 'ohm' finds Ω
  const plain = (t: string) => t.toLowerCase().replaceAll('²', '2').replaceAll('×', 'x').replaceAll('ω', 'ohm').replaceAll('–', '-');
  const words = plain(query).split(/\s+/).filter(Boolean);
  const matches = (...texts: string[]) => { const t = plain(texts.join(' ')); return words.every((w) => t.includes(w)); };
  const BREADBOARDS = [['mini', 'Mini breadboard', '170 holes · no rails'], ['half', 'Half breadboard', '400 holes · 30 columns'], ['full', 'Full breadboard', '830 holes · 63 columns']] as const;
  const total = PART_KINDS.filter((k) => !k.hidden).length + BREADBOARDS.length;
  const pick = (type: string) => ({
    onMouseDown: (e: React.MouseEvent) => {
      if (e.button !== 0 || running) return;
      e.preventDefault();
      setSelection([]);   // the inspector would cover the canvas
      setPlacing({ type, how: 'press', start: { x: e.clientX, y: e.clientY } });
    },
    onClick: (e: React.MouseEvent) => { if (e.detail === 0 && !running) { setSelection([]); setPlacing({ type, how: 'keys' }); } },
  });
  return (
    <div className="ws" ref={ref}>
      <nav className="rail" aria-label="Board and parts">
        <span className="rb static" title={boardName(project)}>
          <span className="pic"><img src={boardPicture(project)} alt="" draggable={false} /></span>Board
        </span>
        <button type="button" className={partsOpen ? 'rb on' : 'rb'} aria-expanded={partsOpen} title="Parts (P)"
          onClick={() => setPartsOpen((o) => !o)}>
          <Icon name="grid" size={20} />Parts
        </button>
      </nav>
      <section className={partsOpen ? 'canvas with-drawer' : 'canvas'} aria-label="Circuit" style={{ '--drawer': `${partsPx}px` } as React.CSSProperties}>
        <Canvas project={project} onChange={(p) => setProject(p)} placing={placing} onPlacing={setPlacing} selection={selection} onSelect={setSelection}
          running={running} outputs={running || run.ended ? run : IDLE_RUN} onInput={onInput}
          onUndo={onUndo} onRedo={onRedo} onOpenParts={() => setPartsOpen(true)} inset={partsOpen ? partsPx : 0} notice={notice} />
        {partsOpen && (
        <div className="drawer-wrap">
      <section className="parts" aria-label="Parts" style={{ width: partsPx }} onKeyDown={(e) => { if (e.key === 'Escape' && !placing) { e.stopPropagation(); setPartsOpen(false); } }}>
        <div className="head">
          <div className="ttl"><b>Parts</b><span className="tiny muted">drag onto the canvas</span><span className="spacer" />
            <button type="button" className="btn ghost sm icon" aria-label="Fold the parts away" title="Fold away (P)" onClick={() => setPartsOpen(false)}><Icon name="chevl" size={14} /></button>
          </div>
        </div>
        <div className="psearch">
          <TextField label="Search the parts" hideLabel icon="search" clearable value={query} onChange={setQuery} placeholder={`Search ${total} parts`} />
        </div>
        <div className="list">
          {microbitAlone(project) && matches('micro:bit GPIO board 30 pins 5V USB') && (
            // M6.9 (screen 24): the micro:bit's own group first — its GPIO board, for the pins it has no ring for
            <div className="pgroup" role="group" aria-label="micro:bit">
              <div className="gh">micro:bit<span className="n">1</span></div>
              <button type="button" className={placing?.type === GPIO_BOARD_TYPE ? 'pitem drag' : 'pitem'}
                title="Click or drag it in: the micro:bit goes into its GPIO board — 30 pins, and 5V from its own micro-USB. The wires stay on the same pins."
                aria-disabled={running || undefined} {...pick(GPIO_BOARD_TYPE)}>
                <span className="pic"><PartIcon type={GPIO_BOARD_TYPE} /></span>
                <span className="nm">GPIO board<small>30 pins · 5V from its USB</small></span>
              </button>
            </div>
          )}
          {(['Basics', 'Sensors', 'Modules', 'Chips', 'Actuators', 'Output modules', 'Communication', 'Displays'] as const).map((group) => {
            const kinds = PART_KINDS.filter((k) => k.group === group && !k.hidden && matches(k.name, k.detail, k.type, group));
            const boards = group === 'Basics' ? BREADBOARDS.filter(([, name, detail]) => matches(name, detail, group)) : [];
            if (!kinds.length && !boards.length) return null;
            return (
              <div key={group} className="pgroup" role="group" aria-label={group}>
                <div className="gh">{group}<span className="n">{kinds.length + boards.length}</span></div>
                {boards.map(([size, name, detail]) => {
                  const type = `${BREADBOARD_TYPE}${size}`;
                  return (
                    <button key={type} type="button" className={placing?.type === type ? 'pitem drag' : 'pitem'}
                      title={`Drag the ${name.toLowerCase()} onto the canvas, or click it and then click where it goes`}
                      aria-disabled={running || undefined} {...pick(type)}>
                      <span className="pic"><BreadboardIcon size={size} /></span>
                      <span className="nm">{name}<small>{detail}</small></span>
                    </button>
                  );
                })}
                {kinds.map((k) => (
                  <button key={k.type} type="button" className={placing?.type === k.type ? 'pitem drag' : 'pitem'}
                    title={k.free ? `Drag the ${inText(k.name)} onto the canvas beside the breadboard, or click it and then click where it goes`
                      : `Drag the ${inText(k.name)} onto the breadboard, or click it and then click where it goes`}
                    aria-disabled={running || undefined} {...pick(k.type)}>
                    <span className="pic"><PartIcon type={k.type} /></span>
                    <span className="nm">{k.name}<small>{k.detail}</small></span>
                  </button>
                ))}
              </div>
            );
          })}
          {words.length > 0 && !PART_KINDS.some((k) => !k.hidden && matches(k.name, k.detail, k.type, k.group)) && !BREADBOARDS.some(([, n, d]) => matches(n, d, 'Basics')) && (
            <p className="small muted no-match" role="status">No part matches “{query}”.</p>
          )}
          {running && <p className="small run-lock" role="note">Stop the program to change the circuit. While it runs, press a push button by holding the mouse on it, click a slide switch to slide it, drag a knob up or down to turn it, hold the mouse on a PIR to move in front of it, click a line sensor to slide it over the line, and set the light, the soil's moisture and the temperature on the Inputs card.</p>}
          <p className="tiny muted howto">Drag a part onto the breadboard, or click it and click where it goes. For a wire, drag from a pin or hole to another — or click it, click for each bend, and click where it ends.</p>
        </div>
      </section>
      <Divider label="Parts panel width" value={partsPx} min={LIMITS.parts[0]} max={partsMax}
        onChange={(v) => setDrag({ parts: v })} onCommit={commit('parts')} />
        </div>
        )}
        {(banner ?? errorBanner) && <div className={`cbanner${banner ? '' : ' error'}`} role={banner ? undefined : 'note'}>{banner ?? errorBanner}</div>}
        {selection.length === 1 && (
          <Inspector key={`${selection[0]!.kind}:${selection[0]!.id}`} project={project} selection={selection[0]!} onChange={setProject} onClose={() => setSelection([])} onSelect={setSelection}
            doc={doc} onDoc={onChange} onNotice={(text) => setNotice({ text })} />
        )}
      </section>
      <Divider label="Code panel width" value={sidePx} min={LIMITS.side[0]} max={sideMax} edge="right"
        onChange={(v) => setDrag({ side: v })} onCommit={commit('side')} />
      <section className="side" aria-label="Code" data-theme={lookOf['data-theme']} style={{ flexBasis: sidePx, ...lookOf.style }}>
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
            <EditorPrefs look={look} onLook={setLook} />
            <MenuButton label="Add a file or a library" icon="plus" alignRight items={[
              { label: 'New file…', icon: 'file', onSelect: () => setFiles({ ask: { kind: 'new' } }) },
              { label: 'Add a library…', icon: 'book', onSelect: () => setLibraries(true) },
            ]} />
            <button type="button" className="btn ghost sm icon" aria-label="Project files" title="Project files" aria-expanded={!!files}
              onClick={() => setFiles((f) => (f ? null : { ask: null }))}><Icon name="more" size={14} /></button>
          </span>
        </div>
        {(() => {
          const space = spaceNote(doc);
          return space && space.level !== 'ok' ? <p className={`space-warn ${space.level}`} role="alert"><Icon name="warn" size={14} /> {space.text}</p> : null;
        })()}
        {typeof doc.files[editing] === 'string' || !(editing in doc.files)
          ? <CodeEditor label={editing} board={project.board} size={look.size} value={text(doc.files[editing])} onChange={(code) => onChange({ ...doc, files: { ...doc.files, [editing]: code } })}
              errorLine={failed?.file === editing ? failed.line : undefined} goTo={goTo?.file === editing ? goTo : undefined} />
          : <p className="small muted not-text">{editing} isn't a text file, so it can't be shown here.</p>}
        {files && (
          <FilesPanel key={files.ask ? 'ask' : 'list'} doc={doc} ask={files.ask} onDoc={onChange} onOpen={openFile} onClose={() => setFiles(null)}
            onAddLibrary={() => setLibraries(true)}
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
        {libraries && <AddLibrary doc={doc} onDoc={onChange} onCopy={(t) => void api.app.copy(t)} onClose={() => setLibraries(false)} />}
        <Console chunks={run.console} running={running} entry={runFile} onClear={onClearConsole} board={realBoard} tab={consoleTab} onTab={onConsoleTab}
          repl={run.repl} onType={onType} onSoftReset={onSoftReset} onGoTo={goToLine}
          complete={(line, pos) => {
            // as the editor offers them, after main.py's code: its imports and names count
            const code = `${text(doc.files['main.py'])}\n`;
            const r = completeAt(project.board, code + line, code.length + pos);
            return r ? { from: r.from - code.length, options: r.options.map((o) => o.label) } : null;
          }} />
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
