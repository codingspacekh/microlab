import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { NewProjectBoard } from '@lib/boards';
import { newProject, type ProjectDoc } from '@lib/project';
import { Divider } from '../ui/Divider';
import { Icon, Logo } from '../ui/Icon';
import { MenuButton } from '../ui/Menu';
import type { MicrolabApi } from './api';
import { BOARD_NAMES } from './boards';
import { ControlsPage } from './ControlsPage';
import { StartPage } from './StartPage';

/**
 * The window (M4.1, screens 01–03): the top bar with the three modes, the page, the status bar. With no project open
 * the Workspace is the Start screen (01, M4.2): a new project from a board, or a .mlab opened. In the Workspace the
 * panels share the width as proportions — parts ~17 %, the circuit the rest, code ~34 % — each within limits, and
 * the dividers between them are draggable; where they were left is a setting (N-13).
 */
type Mode = 'workspace' | 'learn' | 'examples';

export interface Layout {
  parts: number;
  side: number;
}

export const DEFAULT_LAYOUT: Layout = { parts: 0.17, side: 0.34 };
const LIMITS = { parts: [220, 360], side: [320, 0.5], canvas: 360 } as const;

/** The project in the window: what it is, and where it came from (no path: not saved yet). */
export interface OpenProject {
  doc: ProjectDoc;
  name: string;
  path?: string;
}

export interface AppProps {
  api: MicrolabApi;
  /** The window's width, for tests; measured in the app. */
  width?: number;
}

export function App({ api, width }: AppProps) {
  const [mode, setMode] = useState<Mode>('workspace');
  const [open, setOpen] = useState<OpenProject | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const controls = useHash() === '#controls';

  const start = (board: NewProjectBoard) => {
    setOpen({ doc: newProject(board), name: 'Untitled project' });
    setNotice(null);
    setMode('workspace');
  };
  const openFile = async () => {
    const r = await api.project.open();
    if (r.ok) {
      setOpen({ doc: r.doc, name: r.name, path: r.path });
      setNotice(null);
      setMode('workspace');
    } else if ('message' in r) {
      setNotice(r.message);
    }
  };
  const actions = { onNewProject: () => { setOpen(null); setMode('workspace'); }, onOpen: () => void openFile() };

  const page = controls ? <ControlsPage />
    : mode !== 'workspace' ? <Later mode={mode} />
    : open ? <Workspace api={api} width={width} project={open} />
    : <StartPage onNew={start} onOpen={actions.onOpen} onLearn={() => setMode('learn')} onExamples={() => setMode('examples')} />;

  return (
    <div className="app">
      <TopBar mode={open || mode !== 'workspace' ? mode : undefined} onMode={setMode} project={open} {...actions} />
      {notice && <Notice text={notice} onDismiss={() => setNotice(null)} />}
      {page}
      <StatusBar />
    </div>
  );
}

/** The page's #hash: #controls opens the design system's controls page (screen 12b). */
function useHash() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  return hash;
}

const MODES: { id: Mode; label: string; icon: string }[] = [
  { id: 'workspace', label: 'Workspace', icon: 'grid' },
  { id: 'learn', label: 'Learn', icon: 'book' },
  { id: 'examples', label: 'Examples', icon: 'bulb' },
];

interface TopBarProps {
  /** The chosen mode; none on the Start screen. */
  mode: Mode | undefined;
  onMode: (m: Mode) => void;
  project: OpenProject | null;
  onNewProject: () => void;
  onOpen: () => void;
}

function TopBar({ mode, onMode, project, onNewProject, onOpen }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="brand"><Logo /><b>Micro<span>Lab</span></b></div>
      <div className="seg modes" role="tablist" aria-label="Mode">
        {MODES.map((m) => (
          <button key={m.id} type="button" role="tab" aria-selected={mode === m.id} className={mode === m.id ? 'on' : ''} onClick={() => onMode(m.id)}>
            <Icon name={m.icon} size={14} /> {m.label}
          </button>
        ))}
      </div>
      {project ? (
        <>
          <div className="vsep" />
          <div className="proj" role="group" aria-label="Project">
            <b>{project.name}</b><span>{BOARD_NAMES[project.doc.project.board as keyof typeof BOARD_NAMES] ?? project.doc.project.board}</span>
          </div>
          <MenuButton label="Project menu" items={[
            { label: 'New project…', icon: 'plus', onSelect: onNewProject },
            { label: 'Open a project…', icon: 'folder', onSelect: onOpen },
          ]} />
          <span className="spacer" />
          <div className="vsep" />
          <button type="button" className="btn run" disabled title="Run (M4.5)"><Icon name="play" size={14} /> Run</button>
          <div className="vsep" />
          <button type="button" className="btn" disabled title="Send to board (M10)"><Icon name="usb" /> Send to board</button>
        </>
      ) : (
        <>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onOpen}><Icon name="folder" size={14} /> Open a project…</button>
        </>
      )}
    </header>
  );
}

/** A message for the student (a file that can't be opened), until it is dismissed. */
function Notice({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  return (
    <div className="notice" role="alert">
      <Icon name="alert" />
      <span>{text}</span>
      <button type="button" className="btn ghost sm icon" aria-label="Dismiss" title="Dismiss" onClick={onDismiss}><Icon name="x" size={14} /></button>
    </div>
  );
}

function StatusBar() {
  return (
    <footer className="statusbar" role="status">
      <span>Ready</span>
      <span className="r">MicroLab</span>
    </footer>
  );
}

function Later({ mode }: { mode: Mode }) {
  return (
    <main className="later">
      <h1>{mode === 'learn' ? 'Learn' : 'Examples'}</h1>
      <p className="muted">{mode === 'learn' ? 'The part and board pages come in M8.' : 'The examples page comes in M5.'}</p>
    </main>
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

function Workspace({ api, width: fixed, project }: { api: MicrolabApi; width?: number; project: OpenProject }) {
  const { ref, width } = useWidth(fixed);
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
  const [drag, setDrag] = useState<Partial<Record<keyof Layout, number>>>({});

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

  return (
    <div className="ws" ref={ref}>
      <section className="parts" aria-label="Parts" style={{ flexBasis: partsPx }}>
        <div className="head"><h3>Parts</h3></div>
      </section>
      <Divider label="Parts panel width" value={partsPx} min={LIMITS.parts[0]} max={partsMax}
        onChange={(v) => setDrag({ parts: v })} onCommit={commit('parts')} />
      <section className="canvas" aria-label="Circuit" />
      <Divider label="Code panel width" value={sidePx} min={LIMITS.side[0]} max={sideMax} edge="right"
        onChange={(v) => setDrag({ side: v })} onCommit={commit('side')} />
      <section className="side" aria-label="Code" style={{ flexBasis: sidePx }}>
        <div className="head"><h3>main.py</h3></div>
        {/* The editor comes in M4.4; until then the code is shown as it is. */}
        <pre className="code-preview">{String(project.doc.files['main.py'] ?? '')}</pre>
      </section>
    </div>
  );
}
