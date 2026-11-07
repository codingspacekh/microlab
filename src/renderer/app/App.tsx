import { useEffect, useRef, useState } from 'react';
import type { NewProjectBoard } from '@lib/boards';
import { newProject, type ProjectDoc } from '@lib/project';
import { EMPTY_HISTORY, redo, undo, type History } from '@lib/editor';
import { Icon, Logo } from '../ui/Icon';
import { Dialog } from '../ui/Dialog';
import { MenuButton } from '../ui/Menu';
import type { MicrolabApi } from './api';
import { BOARD_NAMES } from './boards';
import { ControlsPage } from './ControlsPage';
import { StartPage } from './StartPage';
import { Workspace } from '../workspace/Workspace';
import { BoardChip, plugMessage } from '../board/BoardChip';
import { BoardFiles } from '../board/BoardFiles';
import { ConnectionHelper } from '../board/ConnectionHelper';
import { InstallMicroPython } from '../board/InstallMicroPython';
import { SendToBoard, sendMessage } from '../board/SendToBoard';
import { boardShort, useBoardConsole } from '../board/useBoardConsole';
import type { BoardId } from '@lib/boards';
import type { ConsoleAction, SendRequest } from '@lib/repl';
import { kindOf, type Detection, type FoundBoard } from '@lib/usb';
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
  /** The project as it was last saved or opened: anything else is an unsaved change (M4.6). */
  saved: ProjectDoc;
  /** "Saved “Blink.mlab”", until the next change. */
  savedNote?: string;
  /** The circuit's undo / redo (M5.1, F-16): while the project is open, through Learn and back. */
  history?: History;
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

  const dirty = !!open && open.doc !== open.saved;
  const [ask, setAsk] = useState<{ name: string; then: () => void } | null>(null);

  const show = (o: Omit<OpenProject, 'key' | 'saved'>) => {
    sim.reset();
    setOpen({ ...o, key: ++opened, saved: o.doc });
    setNotice(null);
    setMode('workspace');
  };
  const start = (board: NewProjectBoard) => show({ doc: newProject(board), name: 'Untitled project' });
  const openFile = async () => {
    const r = await api.project.open();
    if (r.ok) show({ doc: r.doc, name: r.name, path: r.path });
    else if ('message' in r) setNotice(r.message);
  };

  /** Save (to its file, or asking where when it has none or `asNew`); true when it was saved. */
  const save = async (asNew = false): Promise<boolean> => {
    const o = latest.current;
    if (!o) return false;
    const doc = o.doc;
    const r = await api.project.save(doc, asNew || !o.path ? { name: o.name } : { path: o.path, name: o.name });
    if (!r.ok) {
      if ('message' in r) setNotice(r.message);
      return false;
    }
    setNotice(null);
    const file = r.path.split(/[\\/]/).pop()!;
    setOpen((cur) => (cur && cur.key === o.key ? { ...cur, path: r.path, name: r.name, saved: doc, savedNote: `Saved “${file}”` } : cur));
    return true;
  };

  /** Before the project is closed: if it has changes, ask; then go on. */
  const guard = (then: () => void) => {
    const o = latest.current;
    if (!o || o.doc === o.saved) { then(); return; }
    setAsk({ name: o.name, then });
  };

  // the main process asks before the window closes with changes (M4.6)
  const guardRef = useRef(guard);
  guardRef.current = guard;
  useEffect(() => api.app.onCloseRequest(() => guardRef.current(() => api.app.close())), [api]);
  useEffect(() => { api.app.setDirty(dirty); }, [api, dirty]);
  useEffect(() => { document.title = open ? `${open.name}${dirty ? ' •' : ''} — MicroLab` : 'MicroLab'; }, [open, dirty]);

  // the circuit's undo / redo (M5.1): the top bar's buttons (screen 02b) and ⌘Z / Ctrl+Z on the canvas
  const step = (go: typeof undo) => setOpen((cur) => {
    const r = cur && go(cur.history ?? EMPTY_HISTORY, cur.doc.project);
    return r ? { ...cur!, history: r.history, doc: { ...cur!.doc, project: r.project }, savedNote: undefined } : cur;
  });

  // ⌘S / Ctrl+S save, ⇧ for Save as; ⌘O / Ctrl+O open
  const keysRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keysRef.current = (e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 's' && latest.current) { e.preventDefault(); void save(e.shiftKey); }
    else if (k === 'o') { e.preventDefault(); guard(() => void openFile()); }
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => keysRef.current(e);
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  // real boards on USB (F-55): what the main process sees, the one chosen last, a short message on plug and unplug
  const [boards, setBoards] = useState<Detection>({ boards: [], drives: [] });
  const [chosen, setChosen] = useState<string | undefined>();
  // the last plug or unplug; its message is worked out again as the board answers ("checking…", then its version)
  const [plugged, setPlugged] = useState<{ plugged: FoundBoard[]; unplugged: FoundBoard[] } | null>(null);
  useEffect(() => {
    let live = true;
    void api.boards.get().then((d) => { if (live) setBoards(d); });
    void api.settings.get('board.chosen').then((c) => { if (live && typeof c === 'string') setChosen(c); });
    const off = api.boards.onChange((now, changes) => {
      setBoards(now);
      if (changes.plugged.length || changes.unplugged.length) setPlugged(changes);
    });
    return () => { live = false; off(); };
  }, [api]);
  const plugNote = plugged ? plugMessage(plugged, latest.current?.doc.project.board as BoardId | undefined, boards.checks) : null;
  useEffect(() => {
    if (!plugNote) return;
    const t = setTimeout(() => setPlugged(null), 5000);
    return () => clearTimeout(t);
  }, [plugNote]);
  // Send to board (F-50): the result's lines for 10 s, or what went wrong until dismissed
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string[] | null>(null);
  useEffect(() => {
    if (!sent) return;
    const t = setTimeout(() => setSent(null), 10_000);
    return () => clearTimeout(t);
  }, [sent]);
  const bc = useBoardConsole(api, boards);
  const nameOf = (id: string) => { const b = boards.boards.find((x) => x.id === id); return b ? boardShort(b, boards) : 'board'; };
  const send = async (id: string, req: SendRequest) => {
    if (!open) return;
    setNotice(null);
    setSent(null);
    setSending(true);
    // the real board runs it now: the simulator stops (screen 16)
    if (req.run && running) sim.stop();
    try {
      const r = await api.boards.send(id, open.doc.files, req);
      if (r.ok) {
        const lines = sendMessage(r, req);
        setSent(lines);
        bc.note(id, [{ kind: 'sent', text: `${lines[0]}\n` }, ...lines.slice(1).map((l) => ({ kind: 'sys' as const, text: `${l}\n` }))]);
      } else setNotice(r.message);
    } finally {
      setSending(false);
    }
  };
  /** Opens the board's console (the port held): its tab shows; false (and why) if it can't be opened. */
  const openConsole = async (id: string) => {
    setNotice(null);
    bc.show(id, nameOf(id));
    const r = await api.boards.console.open(id);
    if (!r.ok) setNotice(r.message);
    return r.ok;
  };
  /** Run this file on the board (F-50 Rev 7): it runs there now, not saved as main.py — as Thonny does. */
  const runOnBoard = async (id: string) => {
    if (!open) return;
    if (running) sim.stop();
    if (!await openConsole(id)) return;
    const code = open.doc.files[ENTRY];
    bc.note(id, [{ kind: 'sys', text: `Running ${ENTRY} from the editor on the board — its own main.py is unchanged.\n` }]);
    await api.boards.console.do(id, { do: 'run', name: ENTRY, code: typeof code === 'string' ? code : new TextDecoder().decode(code) });
  };
  // the connection helper (F-56), installing MicroPython (F-52): while open
  const [helping, setHelping] = useState(false);
  const [installing, setInstalling] = useState<'pico' | 'microbit' | null>(null);
  // Board files (F-53): the board whose files are shown, while the panel is open
  const [filesOf, setFilesOf] = useState<{ id: string; name: string } | null>(null);
  const consoleDo = (a: ConsoleAction) => { if (bc.shown) void api.boards.console.do(bc.shown.id, a); };
  const boardRuns = bc.shown && bc.state && !bc.state.prompt ? `${bc.shown.name} (USB): running ${bc.state.running ?? 'main.py'}` : undefined;
  const chip = open ? (
    <>
      <BoardChip detection={boards} project={open.doc.project.board as BoardId} chosen={chosen}
        onChoose={(id) => { setChosen(id); void api.settings.set('board.chosen', id); }} onCheck={(id) => void api.boards.check(id)}
        onHelp={() => setHelping(true)} onInstall={setInstalling} />
      <SendToBoard detection={boards} project={open.doc.project.board as BoardId} chosen={chosen} files={open.doc.files}
        entry={ENTRY} busy={sending} onSend={(id, req) => void send(id, req)}
        onRunFile={(id) => void runOnBoard(id)} onOpenConsole={(id) => void openConsole(id)}
        onBoardFiles={(id) => { if (running) sim.stop(); setFilesOf({ id, name: nameOf(id) }); }}
        onHelp={() => setHelping(true)} />
    </>
  ) : null;

  const actions = {
    onNewProject: () => guard(() => { sim.reset(); setOpen(null); setMode('workspace'); }),
    onOpen: () => guard(() => void openFile()),
    onSave: () => void save(),
    onSaveAs: () => void save(true),
  };

  const page = controls ? <ControlsPage />
    : mode !== 'workspace' ? <Later mode={mode} />
    : open ? <Workspace key={open.key} api={api} width={width} doc={open.doc} onChange={(doc) => setOpen((cur) => (cur ? { ...cur, doc, savedNote: undefined } : cur))}
        history={open.history ?? EMPTY_HISTORY} onHistory={(h) => setOpen((cur) => (cur ? { ...cur, history: h } : cur))}
        onUndo={() => step(undo)} onRedo={() => step(redo)}
        run={sim.state} running={running} onInput={sim.setInput} onClearConsole={sim.clear}
        consoleTab={bc.tab} onConsoleTab={bc.setTab}
        board={bc.shown ? {
          label: `${bc.shown.name} (USB)`, name: bc.shown.name, chunks: bc.chunks, ...(bc.state ? { state: bc.state } : {}),
          onType: (text) => consoleDo({ do: 'type', text }),
          onStop: () => consoleDo({ do: 'interrupt' }),
          onRestart: () => consoleDo({ do: 'restart' }),
          onOpen: () => { if (bc.there) void openConsole(bc.shown!.id); else setNotice(`The ${bc.shown!.name} is not plugged in.`); },
          onClose: () => void api.boards.console.close(bc.shown!.id),
          onClear: bc.clear,
        } : undefined}
        banner={boardRuns ? (
          <>
            <Icon name="usb" size={14} />
            <span><b>Running on the real {bc.shown!.name}.</b> The simulator is stopped — the real board must be wired like this picture.</span>
            <span className="spacer" />
            <button type="button" className="btn sm" onClick={() => consoleDo({ do: 'interrupt' })}><Icon name="stop" size={14} /> Stop the board</button>
          </>
        ) : undefined} />
    : <StartPage onNew={start} onOpen={actions.onOpen} onLearn={() => setMode('learn')} onExamples={() => setMode('examples')} />;

  return (
    <div className="app">
      <TopBar mode={open || mode !== 'workspace' ? mode : undefined} onMode={setMode} project={open} dirty={dirty} run={runControls} chip={chip} {...actions}
        edit={open && mode === 'workspace' ? {
          canUndo: !running && (open.history?.past.length ?? 0) > 0, canRedo: !running && (open.history?.future.length ?? 0) > 0,
          onUndo: () => step(undo), onRedo: () => step(redo),
        } : undefined} />
      {notice && <Notice text={notice} onDismiss={() => setNotice(null)} />}
      {page}
      <StatusBar project={open && mode === 'workspace' ? open : null} run={sim.state} board={boardRuns} />
      <div className="toasts">
        {sent && (
          <div className="toast sent" role="status" aria-live="polite">
            <Icon name="check" />
            <span className="lines">{sent.map((l) => <span key={l}>{l}</span>)}</span>
            <button type="button" className="btn ghost sm icon" aria-label="Dismiss" onClick={() => setSent(null)}><Icon name="x" size={14} /></button>
          </div>
        )}
        {plugNote && (
          <div className="toast" role="status" aria-live="polite">
            <Icon name="usb" /><span>{plugNote}</span>
            <button type="button" className="btn ghost sm icon" aria-label="Dismiss" onClick={() => setPlugged(null)}><Icon name="x" size={14} /></button>
          </div>
        )}
      </div>
      {helping && open && (
        <ConnectionHelper api={api} detection={boards} kind={kindOf(open.doc.project.board as BoardId)}
          projectBoard={boardName(open)} chosen={chosen} onClose={() => setHelping(false)}
          onInstall={(k) => { setHelping(false); setInstalling(k); }} />
      )}
      {installing && (
        <InstallMicroPython api={api} kind={installing} detection={boards} onClose={() => setInstalling(null)} />
      )}
      {filesOf && open && (
        <BoardFiles api={api} id={filesOf.id} name={nameOf(filesOf.id)} doc={open.doc}
          onDoc={(doc) => setOpen((cur) => (cur ? { ...cur, doc, savedNote: undefined } : cur))}
          onClose={() => { void api.boards.files.done(filesOf.id); setFilesOf(null); }} />
      )}
      {ask && (
        <Dialog title={`Save your changes to “${ask.name}”?`} onCancel={() => setAsk(null)} actions={[
          { label: 'Save', primary: true, onClick: () => { const then = ask.then; setAsk(null); void save().then((ok) => ok && then()); } },
          { label: "Don't save", danger: true, onClick: () => { const then = ask.then; setAsk(null); then(); } },
          { label: 'Cancel', onClick: () => setAsk(null) },
        ]}>
          Your changes will be lost if you don't save them.
        </Dialog>
      )}
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
  dirty: boolean;
  run: RunControls;
  onNewProject: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  /** The real board's chip (F-55) and Send to board (F-50). */
  chip: React.ReactNode;
  /** Undo / redo of the circuit (screen 02b), in the workspace. */
  edit?: { canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void };
}

interface RunControls {
  state: RunState;
  onRun: () => void;
  onStop: () => void;
  onRestart: () => void;
}

const MOD = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl+';

function TopBar({ mode, onMode, project, dirty, run, chip, edit, onNewProject, onOpen, onSave, onSaveAs }: TopBarProps) {
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
            <b>{project.name}{dirty && <span className="unsaved" title="Not saved" />}</b>
            <span>{BOARD_NAMES[project.doc.project.board as keyof typeof BOARD_NAMES] ?? project.doc.project.board}{project.path ? '' : ' · not saved'}</span>
          </div>
          <MenuButton label="Project menu" items={[
            { label: 'New project…', icon: 'plus', onSelect: onNewProject },
            { label: 'Open a project…', icon: 'folder', hint: `${MOD}O`, keys: 'Meta+O Control+O', onSelect: onOpen },
            { label: 'Save', icon: 'file', hint: `${MOD}S`, keys: 'Meta+S Control+S', onSelect: onSave },
            { label: 'Save as…', icon: 'copy', hint: MOD === '⌘' ? '⇧⌘S' : 'Ctrl+Shift+S', keys: 'Shift+Meta+S Shift+Control+S', onSelect: onSaveAs },
          ]} />
          <span className="spacer" />
          {edit && (
            <div className="undo" role="group" aria-label="Undo and redo">
              <button type="button" className="btn ghost icon" aria-label="Undo" title={`Undo (${MOD}Z)`} disabled={!edit.canUndo} onClick={edit.onUndo}><Icon name="undo" size={16} /></button>
              <button type="button" className="btn ghost icon" aria-label="Redo" title={`Redo (${MOD === '⌘' ? '⇧⌘Z' : 'Ctrl+Y'})`} disabled={!edit.canRedo} onClick={edit.onRedo}><Icon name="redo" size={16} /></button>
            </div>
          )}
          <div className="vsep" />
          <RunBox run={run} />
          <div className="vsep" />
          {chip}
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

function StatusBar({ project, run, board }: { project: OpenProject | null; run: RunState; board?: string }) {
  const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
  const p = project?.doc.project;
  const e = run.ended;
  const left = run.status === 'running' ? <span className="st running"><span className="dot" />Running at real speed</span>
    : run.status === 'stopping' ? <span className="st">Stopping…</span>
    : e?.ended === 'error' ? <span className="st bad">Stopped: an error{e.error?.line ? ` on line ${e.error.line}` : ''}</span>
    : e?.ended === 'fault' ? <span className="st bad">Stopped: the circuit was damaged</span>
    : board ? <span className="st running"><span className="dot" />{board}</span>
    : project?.savedNote ? <span className="st saved">{project.savedNote}</span>
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
