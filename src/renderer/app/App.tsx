import { useEffect, useRef, useState } from 'react';
import type { NewProjectBoard } from '@lib/boards';
import { newProject, type ProjectDoc } from '@lib/project';
import { Icon, Logo } from '../ui/Icon';
import { MenuButton } from '../ui/Menu';
import type { MicrolabApi } from './api';
import { BOARD_NAMES } from './boards';
import { ControlsPage } from './ControlsPage';
import { StartPage } from './StartPage';
import { Workspace } from '../workspace/Workspace';
import { useRun, type RunState, type StartRun } from './useRun';

/**
 * The window (M4.1, screens 01–03): the top bar with the three modes, the page, the status bar. With no project open
 * the Workspace is the Start screen (01, M4.2): a new project from a board, or a .mlab opened. In the Workspace the
 * panels share the width as proportions — parts ~17 %, the circuit the rest, code ~34 % — each within limits, and
 * the dividers between them are draggable; where they were left is a setting (N-13).
 */
type Mode = 'workspace' | 'learn' | 'examples';

/** The project in the window: what it is, and where it came from (no path: not saved yet). */
export interface OpenProject {
  doc: ProjectDoc;
  name: string;
  path?: string;
  /** A new one each time a project is opened: the workspace starts afresh (its fitted view, its gestures). */
  key: number;
}

let opened = 0;

export interface AppProps {
  api: MicrolabApi;
  /** The window's width, for tests; measured in the app. */
  width?: number;
  /** Starts a run; tests give a fake one (the real one starts the simulation worker). */
  startRun?: StartRun;
}

/** The file Run runs (requirements Rev 7, Q19): the open file — main.py while a project has only that (M5.6). */
const ENTRY = 'main.py';

export function App({ api, width, startRun }: AppProps) {
  const [mode, setMode] = useState<Mode>('workspace');
  const [open, setOpen] = useState<OpenProject | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const controls = useHash() === '#controls';
  const sim = useRun(startRun);
  const latest = useRef(open);
  latest.current = open;
  const boardName = (o: OpenProject) => BOARD_NAMES[o.doc.project.board as keyof typeof BOARD_NAMES] ?? o.doc.project.board;
  const running = sim.state.status !== 'idle';
  const runControls: RunControls = {
    state: sim.state,
    onRun: () => { if (open) sim.run(open.doc, ENTRY, boardName(open)); },
    onStop: sim.stop,
    onRestart: () => sim.restart(() => latest.current!.doc),
  };

  const start = (board: NewProjectBoard) => {
    sim.reset();
    setOpen({ doc: newProject(board), name: 'Untitled project', key: ++opened });
    setNotice(null);
    setMode('workspace');
  };
  const openFile = async () => {
    const r = await api.project.open();
    if (r.ok) {
      sim.reset();
      setOpen({ doc: r.doc, name: r.name, path: r.path, key: ++opened });
      setNotice(null);
      setMode('workspace');
    } else if ('message' in r) {
      setNotice(r.message);
    }
  };
  const actions = { onNewProject: () => { sim.reset(); setOpen(null); setMode('workspace'); }, onOpen: () => void openFile() };

  const page = controls ? <ControlsPage />
    : mode !== 'workspace' ? <Later mode={mode} />
    : open ? <Workspace key={open.key} api={api} width={width} doc={open.doc} onChange={(doc) => setOpen({ ...open, doc })}
        run={sim.state} running={running} onInput={sim.setInput} onClearConsole={sim.clear} />
    : <StartPage onNew={start} onOpen={actions.onOpen} onLearn={() => setMode('learn')} onExamples={() => setMode('examples')} />;

  return (
    <div className="app">
      <TopBar mode={open || mode !== 'workspace' ? mode : undefined} onMode={setMode} project={open} run={runControls} {...actions} />
      {notice && <Notice text={notice} onDismiss={() => setNotice(null)} />}
      {page}
      <StatusBar project={open && mode === 'workspace' ? open : null} run={sim.state} />
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
  run: RunControls;
  onNewProject: () => void;
  onOpen: () => void;
}

interface RunControls {
  state: RunState;
  onRun: () => void;
  onStop: () => void;
  onRestart: () => void;
}

function TopBar({ mode, onMode, project, run, onNewProject, onOpen }: TopBarProps) {
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
          <RunBox run={run} />
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

/** Run, or — while running — how long it has run, Stop and Restart (screen 03, F-22). */
function RunBox({ run }: { run: RunControls }) {
  const { status, startedAt } = run.state;
  const seconds = useSeconds(status !== 'idle' ? startedAt : undefined);
  if (status === 'idle') {
    return (
      <div className="runbox">
        <button type="button" className="btn run" onClick={run.onRun} title="Run main.py"><Icon name="play" size={14} /> Run</button>
        <button type="button" className="btn icon" disabled title="Stop" aria-label="Stop"><Icon name="stop" size={14} /></button>
      </div>
    );
  }
  return (
    <div className="runbox">
      <span className="timer" role="timer" aria-label="Running for"><span className="dot" />Running {clock(seconds)}</span>
      <button type="button" className="btn stop" onClick={run.onStop} disabled={status === 'stopping'}><Icon name="stop" size={14} /> Stop</button>
      <button type="button" className="btn icon" onClick={run.onRestart} disabled={status === 'stopping'} title="Restart" aria-label="Restart"><Icon name="restart" /></button>
    </div>
  );
}

/** Whole seconds since `from`, ticking. */
function useSeconds(from: number | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (from === undefined) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [from]);
  return from === undefined ? 0 : Math.max(0, Math.floor((now - from) / 1000));
}

const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

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

function StatusBar({ project, run }: { project: OpenProject | null; run: RunState }) {
  const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
  const p = project?.doc.project;
  const e = run.ended;
  const left = run.status === 'running' ? <span className="st running"><span className="dot" />Running at real speed</span>
    : run.status === 'stopping' ? <span className="st">Stopping…</span>
    : e?.ended === 'error' ? <span className="st bad">Stopped: an error{e.error?.line ? ` on line ${e.error.line}` : ''}</span>
    : e?.ended === 'fault' ? <span className="st bad">Stopped: the circuit was damaged</span>
    : <span>Ready</span>;
  return (
    <footer className="statusbar" role="status">
      {left}
      <span className="r">{p ? `${BOARD_NAMES[p.board as keyof typeof BOARD_NAMES] ?? p.board} + ${count(p.parts.length, 'part')} · ${count(p.wires.length, 'wire')}` : 'MicroLab'}</span>
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
