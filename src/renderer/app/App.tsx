import { useEffect, useMemo, useRef, useState } from 'react';
import type { NewProjectBoard } from '@lib/boards';
import { checkBeforeRun, onGpioBoard, runTarget, type ProjectDoc } from '@lib/project';
import { boardData, EMPTY_HISTORY, redo, undo, type History } from '@lib/editor';
import { faultCards, faultSummary, stoppedBy } from '@lib/circuit';
import { Icon, Logo } from '../ui/Icon';
import { Dialog } from '../ui/Dialog';
import { MenuButton } from '../ui/Menu';
import type { MicrolabApi, PyProjectOpen, RecentItem, Recovered, TreeEntry } from './api';
import { BOARD_CARDS, BOARD_NAMES, boardName } from './boards';
import { ControlsPage } from './ControlsPage';
import { PYTHON3, StartPage } from './StartPage';
import { fileName, PythonScreen, type PyTab } from '../python3/PythonScreen';
import { ProjectTree } from '../python3/ProjectTree';
import { NewProject, shortPath, type NewKind } from './NewProject';
import { ZoomControl } from './Zoom';
import { usePython, type PyRunState } from '../python3/usePython';
import { Libraries } from '../python3/Libraries';
import '../python3/python3.css';
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
import { useSound } from './useSound';
import { neopixelCount } from '@lib/circuit/neopixel';
import type { PartView } from '../../sim/circuit';
import type { AudioLike } from '../audio';

/**
 * The window (M4.1, screens 01–03): the top bar with the three modes, the page, the status bar. With no project open
 * the Workspace is the Start screen (01, M4.2): a new project from a board, or a .mlab opened. In the Workspace the
 * panels share the width as proportions — parts ~17 %, the circuit the rest, code ~34 % — each within limits, and
 * the dividers between them are draggable; where they were left is a setting (N-13).
 */
type Mode = 'workspace' | 'python' | 'learn';

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
  /** The file in the editor (M5.6, F-21): main.py when a project opens. */
  file?: string;
  /** The last Python file run, for Run while a file that isn't Python is open (Q19). */
  lastRun?: string;
}

let opened = 0;
/** The recovery copy is written this long after the last change (F-03). */
const AUTOSAVE_MS = 3000;

export interface AppProps {
  api: MicrolabApi;
  /** The window's width, for tests; measured in the app. */
  width?: number;
  /** Starts a run; tests give a fake one (the real one starts the simulation worker). */
  startRun?: StartRun;
  /** Makes the AudioContext the run's sound plays on (M6.2); tests give a fake one. */
  audio?: () => AudioLike | null;
}


export function App({ api, width, startRun, audio }: AppProps) {
  const [mode, setMode] = useState<Mode>('workspace');
  const [open, setOpen] = useState<OpenProject | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const controls = useHash() === '#controls';
  const sim = useRun(startRun);
  const sound = useSound(api, sim.state, audio);
  const latest = useRef(open);
  latest.current = open;
  const boardOf = (o: OpenProject) => BOARD_NAMES[o.doc.project.board as keyof typeof BOARD_NAMES] ?? o.doc.project.board;
  const running = sim.state.status !== 'idle';
  // the REPL runs in the circuit the program started with (M9): a changed circuit ends it
  const circuit = open?.doc.project;
  const atRepl = sim.state.repl;
  const { endRepl } = sim;
  const replCircuit = useRef(circuit);
  useEffect(() => {
    if (!atRepl) { replCircuit.current = circuit; return; }
    if (circuit !== replCircuit.current) endRepl('The circuit changed, so the REPL has ended: press Run to run the program in it.');
  }, [circuit, atRepl, endRepl]);
  // what Run runs (F-22, Q19): the file in the editor, as Thonny does; main.py from its menu
  const target = open ? runTarget(open.doc.files, open.file ?? 'main.py', open.lastRun) : 'main.py';
  // M9 slice 3 (F-18, screen 29b): Run first looks over the circuit and the code — unless the student turned it off
  const [checkOn, setCheckOn] = useState(true);
  useEffect(() => {
    let live = true;
    void api.settings.get('check.beforeRun').then((v) => { if (live && v === false) setCheckOn(false); });
    return () => { live = false; };
  }, [api]);
  const turnCheck = (on: boolean) => { setCheckOn(on); void api.settings.set('check.beforeRun', on); };
  /** The check's card is open before running this file; `checked`: it found something, listed until it is fixed. */
  const [checking, setChecking] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const checkOf = (o: OpenProject, entry: string) => {
    try { return checkBeforeRun(o.doc.project, boardData(o.doc.project.board as BoardId), o.doc.files, entry); } catch { return []; }
  };
  const checkItems = useMemo(() => (open && (checked || checking) ? checkOf(open, checking ?? target) : []),
    [open?.doc, checked, checking, target]);
  useEffect(() => {
    if (checked && checkItems.length === 0) { setChecked(false); setChecking(null); }
  }, [checked, checkItems]);
  const runNow = (entry: string) => {
    if (!open) return;
    setChecking(null);
    setOpen((cur) => (cur ? { ...cur, lastRun: entry } : cur));
    if (open.doc !== open.saved) keepCopy(open);   // a run is a moment worth keeping (F-03)
    sim.run(open.doc, entry, boardOf(open));
  };
  const runFile = (entry: string) => {
    if (!open) return;
    if (checkOn && checkOf(open, entry).length > 0) {
      setChecking(entry);
      setChecked(true);
      return;
    }
    runNow(entry);
  };
  const runControls: RunControls = {
    state: sim.state,
    target,
    onRun: () => runFile(target),
    onRunMain: () => runFile('main.py'),
    checkOn,
    onCheckOn: turnCheck,
    onStop: sim.stop,
    onRestart: () => sim.restart(() => latest.current!.doc),
  };

  const dirty = !!open && open.doc !== open.saved;
  /** "Save your changes?": `save` saves what it is about (the project when not given). */
  const [ask, setAsk] = useState<{ name: string; then: () => void; save?: () => Promise<boolean> } | null>(null);

  const show = (o: Omit<OpenProject, 'key' | 'saved'>) => {
    sim.reset();
    setOpen({ ...o, key: ++opened, saved: o.doc });
    setNotice(null);
    setMode('workspace');
  };
  /** A new board project (Rev 11, screen 31e): its name and place asked first; it is saved from the start. */
  const start = (board: NewProjectBoard) => setNewKind({ board, title: BOARD_CARDS.find((b) => b.id === board)?.short ?? 'board' });
  const openFile = async () => {
    const r = await api.project.open();
    if (r.ok) show({ doc: r.doc, name: r.name, path: r.path });
    else if ('message' in r) setNotice(r.message);
  };

  // recent projects (F-05): fresh each time the Start screen shows
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const onStart = !open && mode === 'workspace';
  useEffect(() => {
    if (!onStart) return;
    let live = true;
    void api.project.recent().then((r) => { if (live) setRecent(r); });
    return () => { live = false; };
  }, [api, onStart]);
  /** Open… on the Start page (screen 31): a project or a .py file. */
  const openAny = async () => {
    const r = await api.file.open();
    if (!r.ok) { if ('message' in r) setNotice(r.message); return; }
    if ('kind' in r && r.kind === 'py') pyProjectOpened(r);
    else if ('doc' in r) show({ doc: r.doc, name: r.name, path: r.path });
  };
  const openRecent = async (item: RecentItem) => {
    if (item.board === PYTHON3) { pyProjectOpened(await api.projects.openPython(item.path)); return; }
    const r = await api.project.openPath(item.path);
    if (r.ok) show({ doc: r.doc, name: r.name, path: r.path });
    else if ('message' in r) { setNotice(r.message); setRecent(await api.project.recent()); }
  };

  // the recovery copy (F-03): written a few seconds after each change and on every run while there are unsaved
  // changes; removed once they are saved or given up. Found at start, it is offered back on the Start screen.
  const [recovered, setRecovered] = useState<Recovered | null>(null);
  useEffect(() => {
    let live = true;
    void api.recovery.get().then((r) => { if (live && r) setRecovered(r); });
    return () => { live = false; };
  }, [api]);
  const copyKept = useRef(false);
  const keepCopy = (o: OpenProject) => {
    copyKept.current = true;
    void api.recovery.write(o.doc, { name: o.name, ...(o.path ? { path: o.path } : {}) });
  };
  const dropCopy = () => {
    copyKept.current = false;
    return api.recovery.clear();
  };
  useEffect(() => {
    if (!open) return;
    if (open.doc === open.saved) {
      if (copyKept.current) void dropCopy();
      return;
    }
    const t = setTimeout(() => keepCopy(open), AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [open?.doc, open?.saved]);
  const recover = () => {
    if (!recovered) return;
    // shown with its changes not saved: Save writes it to its own file again (or asks where)
    sim.reset();
    copyKept.current = true;
    setOpen({ doc: recovered.doc, name: recovered.name, ...(recovered.path ? { path: recovered.path } : {}), key: ++opened, saved: { ...recovered.doc } });
    setRecovered(null);
    setNotice(null);
    setMode('workspace');
  };
  const discard = () => { setRecovered(null); void dropCopy(); };

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

  // Python 3 (M12, F-90–F-92, screens 31, 31b): a project's files open in tabs, run with the bundled CPython.
  // Rev 11 (F-100, F-101): a Python project is a folder, chosen or made first; its tree is beside the editor.
  const pyRun = usePython(api);
  const [py, setPy] = useState<{ tabs: PyTab[]; at: number }>({ tabs: [], at: 0 });
  const pyLatest = useRef(py);
  pyLatest.current = py;
  const pyTab = py.tabs[py.at];
  const pyRunning = pyRun.state.status !== 'idle';
  const pyDirtyTabs = py.tabs.filter((t) => t.text !== t.saved);
  const [pyProject, setPyProject] = useState<{ root: string; name: string } | null>(null);
  const projectRef = useRef(pyProject);
  projectRef.current = pyProject;
  const [pyTree, setPyTree] = useState<TreeEntry[]>([]);
  /** New project (screen 31e): Python, or a board — asked before it opens. */
  const [newKind, setNewKind] = useState<NewKind | null>(null);
  const relOf = (path: string) => (pyProject ? path.slice(pyProject.root.length + 1).replace(/\\/g, '/') : path);
  const readTree = async (root = projectRef.current?.root) => {
    if (!root) return;
    const entries = await api.projects.tree(root);
    if (projectRef.current?.root === root) setPyTree(entries);
  };
  useEffect(() => api.projects.onChanged((root) => { if (root === projectRef.current?.root) void readTree(root); }), [api]);
  const refreshRecent = async () => setRecent(await api.project.recent());
  /** A Python project opened or made: its tree, and the file to show (main.py, or the .py file chosen). */
  const pyProjectOpened = (r: PyProjectOpen) => {
    if (!r.ok) { setNotice(r.message); return; }
    projectRef.current = { root: r.root, name: r.name };
    setPyProject(projectRef.current);
    setPy({ tabs: r.file ? [{ key: ++pyKeys, path: r.file.path, text: r.file.text, saved: r.file.text }] : [], at: 0 });
    setPyTree([]);
    void readTree(r.root);
    setNotice(null);
    setMode('python');
    void refreshRecent();
  };
  /** Before another Python project replaces this one: its files' changes. */
  const guardPy = (then: () => void) => {
    const dirtyTab = pyLatest.current.tabs.findIndex((t) => t.text !== t.saved);
    if (dirtyTab < 0) { then(); return; }
    const t = pyLatest.current.tabs[dirtyTab]!;
    setAsk({ name: fileName(t), save: () => savePy(false, dirtyTab), then: () => {
      setPy((cur) => ({ ...cur, tabs: cur.tabs.map((x) => (x.key === t.key ? { ...x, saved: x.text } : x)) }));
      setTimeout(() => guardPyRef.current(then), 0);
    } });
  };
  const guardPyRef = useRef(guardPy);
  guardPyRef.current = guardPy;
  const newPython = () => setNewKind({ python: true });
  /** A file of the project opened in a tab (or shown, if it is open). */
  const openInProject = async (rel: string) => {
    const p = projectRef.current;
    if (!p) return;
    const r = await api.projects.read(p.root, rel);
    if (!r.ok) { if ('message' in r) setNotice(r.message); return; }
    setPy((cur) => {
      const i = cur.tabs.findIndex((x) => x.path === r.path);
      return i >= 0 ? { ...cur, at: i } : { tabs: [...cur.tabs, { key: ++pyKeys, path: r.path, text: r.text, saved: r.text }], at: cur.tabs.length };
    });
  };
  /** Saves a tab (the one shown) to its file — or, Save as, where the student chooses; true when it was saved. */
  const savePy = async (asNew = false, i = pyLatest.current.at): Promise<boolean> => {
    const t = pyLatest.current.tabs[i];
    if (!t) return false;
    const text = t.text;
    const r = await api.pyfile.save(text, asNew ? { name: fileName(t), from: t.path.replace(/[\\/][^\\/]*$/, '') } : { path: t.path, name: fileName(t) });
    if (!r.ok) { if ('message' in r) setNotice(r.message); return false; }
    setNotice(null);
    setPy((cur) => ({ ...cur, tabs: cur.tabs.map((x) => (x.key === t.key ? { ...x, path: r.path, saved: text } : x)) }));
    void readTree();
    return true;
  };
  const closePy = (i: number) => {
    const t = pyLatest.current.tabs[i];
    if (!t) return;
    const close = () => setPy((cur) => {
      const tabs = cur.tabs.filter((x) => x.key !== t.key);
      return { tabs, at: Math.max(0, Math.min(cur.at > i ? cur.at - 1 : cur.at, tabs.length - 1)) };
    });
    if (t.text === t.saved) close();
    else setAsk({ name: fileName(t), then: close, save: () => savePy(false, i) });
  };
  /** A file or folder renamed in the tree: its open tabs follow it. */
  const pyRenamed = (from: string, to: string) => {
    const p = projectRef.current;
    if (!p) return;
    const sep = p.root.includes('\\') ? '\\' : '/';
    const a = p.root + sep + from.split('/').join(sep);
    const b = p.root + sep + to.split('/').join(sep);
    setPy((cur) => ({ ...cur, tabs: cur.tabs.map((t) => (t.path === a || t.path.startsWith(a + sep) ? { ...t, path: b + t.path.slice(a.length) } : t)) }));
  };
  /** Deleted in the tree (to the Bin): its tabs close. */
  const pyDeleted = (rel: string) => {
    const p = projectRef.current;
    if (!p) return;
    const sep = p.root.includes('\\') ? '\\' : '/';
    const a = p.root + sep + rel.split('/').join(sep);
    setPy((cur) => {
      const tabs = cur.tabs.filter((t) => !(t.path === a || t.path.startsWith(a + sep)));
      return { tabs, at: Math.max(0, Math.min(cur.at, tabs.length - 1)) };
    });
  };
  /** Runs the file shown; `again` (Restart, Ctrl+D) replaces a run still going — the main process ends it. */
  const runPy = (again = false) => {
    const t = pyLatest.current.tabs[pyLatest.current.at];
    if (!t || (!again && pyRun.state.status !== 'idle')) return;
    pyRun.run(t.text, t.path, fileName(t));
  };
  // Libraries (screen 31d): the window, and how many are installed (the status bar)
  const [libsOpen, setLibsOpen] = useState(false);
  const [libCount, setLibCount] = useState<number | null>(null);
  useEffect(() => {
    if (mode !== 'python') return;
    let live = true;
    void api.python3.libs.list().then((l) => { if (live) setLibCount(l.length); });
    return () => { live = false; };
  }, [api, mode]);
  /** Before the window closes: the project's changes, then each Python file's. */
  const guardAll = (then: () => void) => guard(() => {
    const dirtyTab = pyLatest.current.tabs.findIndex((t) => t.text !== t.saved);
    if (dirtyTab < 0) { then(); return; }
    const t = pyLatest.current.tabs[dirtyTab]!;
    setAsk({ name: fileName(t), save: () => savePy(false, dirtyTab), then: () => {
      // given up or saved: on to the next one
      setPy((cur) => ({ ...cur, tabs: cur.tabs.map((x) => (x.key === t.key ? { ...x, saved: x.text } : x)) }));
      setTimeout(() => guardAllRef.current(then), 0);
    } });
  });
  const guardAllRef = useRef(guardAll);
  guardAllRef.current = guardAll;

  // the main process asks before the window closes with changes (M4.6)
  const guardRef = useRef(guardAll);
  guardRef.current = guardAll;
  // closing with the changes given up (Don't save) or saved: no copy is left to offer back
  useEffect(() => api.app.onCloseRequest(() => guardRef.current(() => { void api.recovery.clear().finally(() => api.app.close()); })), [api]);
  useEffect(() => { api.app.setDirty(dirty || pyDirtyTabs.length > 0); }, [api, dirty, pyDirtyTabs.length]);
  useEffect(() => {
    document.title = mode === 'python' && pyProject ? `${pyProject.name}${pyTab ? ` · ${fileName(pyTab)}${pyTab.text !== pyTab.saved ? ' •' : ''}` : ''} — MicroLab`
      : open ? `${open.name}${dirty ? ' •' : ''} — MicroLab` : 'MicroLab';
  }, [open, dirty, mode, pyTab, pyProject]);

  // the circuit's undo / redo (M5.1): the top bar's buttons (screen 02b) and ⌘Z / Ctrl+Z on the canvas
  const step = (go: typeof undo) => setOpen((cur) => {
    const r = cur && go(cur.history ?? EMPTY_HISTORY, cur.doc.project);
    return r ? { ...cur!, history: r.history, doc: { ...cur!.doc, project: r.project }, savedNote: undefined } : cur;
  });

  // ⌘S / Ctrl+S save, ⇧ for Save as; ⌘O / Ctrl+O open
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const keysRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keysRef.current = (e: KeyboardEvent) => {
    // Python 3 (M12): F5 runs the file shown, as in IDLE; ⌘S / ⌘O are for .py files there
    if (modeRef.current === 'python') {
      if (e.key === 'F5' && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); runPy(); return; }
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 's') { e.preventDefault(); void savePy(e.shiftKey); }
      else if (k === 'o') { e.preventDefault(); guardPy(() => void openAny()); }
      return;
    }
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
    const code = open.doc.files[target];
    bc.note(id, [{ kind: 'sys', text: `Running ${target} from the editor on the board — its own main.py is unchanged.\n` }]);
    await api.boards.console.do(id, { do: 'run', name: target, code: typeof code === 'string' ? code : new TextDecoder().decode(code ?? new Uint8Array()) });
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
        entry={target} busy={sending} onSend={(id, req) => void send(id, req)}
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
    : mode === 'python' ? (pyProject ? (
      <PythonScreen api={api} tabs={py.tabs} at={py.at} onAt={(i) => setPy((cur) => ({ ...cur, at: i }))}
        side={(hide) => <ProjectTree api={api} root={pyProject.root} name={pyProject.name} entries={pyTree} current={pyTab ? relOf(pyTab.path) : undefined}
          onOpen={(rel) => void openInProject(rel)} onRenamed={pyRenamed} onDeleted={pyDeleted} onChanged={() => void readTree()} onHide={hide} />}
        onText={(text) => setPy((cur) => ({ ...cur, tabs: cur.tabs.map((t, i) => (i === cur.at ? { ...t, text } : t)) }))}
        onClose={closePy} run={pyRun.state} running={pyRunning} onType={pyRun.type}
        onRerun={() => runPy(true)} onClear={pyRun.clear} onClearPlot={pyRun.clearPlot} />
    ) : <NoPythonProject onNew={newPython} onOpen={() => void openAny()} />)
    : mode !== 'workspace' ? <Later />
    : open ? <Workspace key={open.key} api={api} width={width} doc={open.doc} onChange={(doc) => setOpen((cur) => (cur ? { ...cur, doc, savedNote: undefined } : cur))}
        history={open.history ?? EMPTY_HISTORY} onHistory={(h) => setOpen((cur) => (cur ? { ...cur, history: h } : cur))}
        onUndo={() => step(undo)} onRedo={() => step(redo)}
        file={open.file ?? 'main.py'} onFile={(p) => setOpen((cur) => (cur ? { ...cur, file: p } : cur))}
        runFile={running ? open.lastRun ?? target : target}
        run={sim.state} running={running} onInput={sim.setInput} onClearConsole={sim.clear}
        onType={sim.type} onSoftReset={() => sim.restart(() => latest.current!.doc)}
        onReplace={sim.replace} onClearFaults={sim.clearFaults} onClearPlot={sim.clearPlot}
        check={{ items: checkItems, open: !!checking && !running, enabled: checkOn, onEnabled: turnCheck,
          onRunAnyway: () => runNow(checking ?? target), onCancel: () => setChecking(null) }}
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
    : <StartPage onNew={(b) => guard(() => start(b))} onNewPython={() => guardPy(newPython)} onOpen={() => guard(() => void openAny())}
        recent={recent} onOpenRecent={(r) => guard(() => void openRecent(r))}
        onForget={(r) => void api.project.forget(r.path).then(async () => setRecent(await api.project.recent()))}
        recovered={recovered} onRecover={recover} onDiscard={discard} />;

  return (
    <div className="app">
      <TopBar mode={open || mode !== 'workspace' ? mode : undefined} onMode={setMode} project={open} dirty={dirty} run={runControls} chip={chip} {...actions}
        onOpenAny={() => guard(() => void openAny())}
        py={pyProject ? {
          project: pyProject, ...(pyTab ? { tab: pyTab } : {}),
          onNew: () => guardPy(newPython), onOpen: () => guardPy(() => void openAny()), onSave: () => void savePy(), onSaveAs: () => void savePy(true),
          onShow: () => void api.projects.reveal(pyProject.root, ''), onLibraries: () => setLibsOpen(true),
          ...(pyTab ? { run: { state: pyRun.state, target: fileName(pyTab), keys: 'F5', onRun: () => runPy(), onStop: pyRun.stop, onRestart: () => runPy(true) } } : {}),
        } : undefined}
        edit={open && mode === 'workspace' ? {
          canUndo: !running && (open.history?.past.length ?? 0) > 0, canRedo: !running && (open.history?.future.length ?? 0) > 0,
          onUndo: () => step(undo), onRedo: () => step(redo),
        } : undefined} />
      {notice && <Notice text={notice} onDismiss={() => setNotice(null)} />}
      {page}
      {mode === 'python' ? <PyStatusBar api={api} run={pyRun.state} libraries={libCount} /> : <StatusBar api={api} project={open && mode === 'workspace' ? open : null} run={sim.state} board={boardRuns} sound={sound}
        check={{ count: checkItems.length, asking: !!checking && !running }} />}
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
          projectBoard={boardOf(open)} chosen={chosen} onClose={() => setHelping(false)}
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
      {libsOpen && <Libraries api={api} onClose={() => setLibsOpen(false)} onChanged={(l) => setLibCount(l.length)} />}
      {newKind && (
        <NewProject api={api} kind={newKind} onCancel={() => setNewKind(null)}
          onPython={(r) => { setNewKind(null); pyProjectOpened(r); }}
          onBoard={({ doc, path, name }) => { setNewKind(null); show({ doc, name, path }); void refreshRecent(); }} />
      )}
      {ask && (
        <Dialog title={`Save your changes to “${ask.name}”?`} onCancel={() => setAsk(null)} actions={[
          { label: 'Save', primary: true, onClick: () => { const then = ask.then; const saving = ask.save ?? (() => save()); setAsk(null); void saving().then((ok) => ok && then()); } },
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

/** A new .py file's text (screen 31's card). */
let pyKeys = 0;

const MODES: { id: Mode; label: string; icon: string }[] = [
  { id: 'workspace', label: 'Workspace', icon: 'grid' },
  { id: 'python', label: 'Python 3', icon: 'term' },
  { id: 'learn', label: 'Learn', icon: 'book' },
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
  /** Open… with nothing open (screen 31): a project or a .py file. */
  onOpenAny: () => void;
  /** The Python 3 mode (M12, screen 31b): the file shown, its menu, its Run. */
  py?: { project: { root: string; name: string }; tab?: PyTab; run?: RunControls; onNew: () => void; onOpen: () => void; onSave: () => void; onSaveAs: () => void; onShow: () => void; onLibraries: () => void };
}

interface RunControls {
  /** How the run is: the simulator's (RunState) or Python 3's — only its status and start are read here. */
  state: { status: RunState['status']; startedAt?: number };
  /** The file Run runs: its name is on the button. */
  target: string;
  onRun: () => void;
  /** Run main.py, as the board does when switched on (Run's ⌄ menu); Python 3 has no ⌄ menu. */
  onRunMain?: () => void;
  onStop: () => void;
  onRestart: () => void;
  /** The check before running is on (M9 slice 3): Run's ⌄ menu turns it on and off. */
  checkOn?: boolean;
  onCheckOn?: (on: boolean) => void;
  /** Shown on Run's button beside the file's name (Python 3: F5). */
  keys?: string;
}

const MOD = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl+';

function TopBar({ mode, onMode, project, dirty, run, chip, edit, onNewProject, onOpen, onSave, onSaveAs, onOpenAny, py }: TopBarProps) {
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
      {mode === 'python' && py ? (
        <>
          <div className="vsep" />
          <div className="pyfile" role="group" aria-label="Python project">
            <b>{py.project.name}{py.tab && <> · {fileName(py.tab)}</>}{py.tab && py.tab.text !== py.tab.saved && <span className="unsaved" title="Not saved" />}</b>
            <span title={py.project.root}>{shortPath(py.project.root)}{py.tab ? ` · ${py.tab.text === py.tab.saved ? 'saved' : 'not saved'}` : ''}</span>
          </div>
          <MenuButton label="Python project menu" items={[
            { label: 'New Python project…', icon: 'plus', onSelect: py.onNew },
            { label: 'Open a project…', icon: 'folder', hint: `${MOD}O`, keys: 'Meta+O Control+O', onSelect: py.onOpen },
            { label: 'Save', icon: 'file', hint: `${MOD}S`, keys: 'Meta+S Control+S', disabled: !py.tab, onSelect: py.onSave },
            { label: 'Save as…', icon: 'copy', hint: MOD === '⌘' ? '⇧⌘S' : 'Ctrl+Shift+S', keys: 'Shift+Meta+S Shift+Control+S', disabled: !py.tab, onSelect: py.onSaveAs },
            { label: MOD === '⌘' ? 'Show the project in Finder' : 'Show the project in Explorer', icon: 'folder', onSelect: py.onShow },
          ]} />
          <span className="spacer" />
          {py.run && <RunBox run={py.run} />}
          <button type="button" className="btn" onClick={py.onLibraries} title="Libraries for Python 3: install from PyPI, or a .whl file"><Icon name="grid" size={14} /> Libraries</button>
        </>
      ) : project && mode !== 'python' ? (
        <>
          <div className="vsep" />
          <div className="proj" role="group" aria-label="Project">
            <b>{project.name}{dirty && <span className="unsaved" title="Not saved" />}</b>
            <span>{boardName(project.doc.project)}{project.path ? '' : ' · not saved'}</span>
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
          <button type="button" className="btn" onClick={onOpenAny}><Icon name="folder" size={14} /> Open…</button>
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
        <span className={run.onRunMain ? 'runsplit' : 'runsplit single'}>
          <button type="button" className="btn run" onClick={run.onRun} title={run.onRunMain ? `Run ${run.target} on the simulated board` : `Run ${run.target} with Python 3${run.keys ? ` (${run.keys})` : ''}`}>
            <Icon name="play" size={14} /> Run <span className="runfile">{run.target.split('/').pop()}</span>{run.keys && <span className="runkeys">{run.keys}</span>}
          </button>
          {run.onRunMain && (
            <MenuButton label="More ways to run" className="split" items={[
              { label: 'Run main.py', icon: 'play', description: 'As when the board is switched on: main.py is the file a board runs by itself.', onSelect: run.onRunMain },
              { label: 'Check before running', checked: !!run.checkOn, onSelect: () => run.onCheckOn?.(!run.checkOn),
                description: 'Run first looks for a leg alone in its column, a wire that ends where nothing is, a pin the code uses with nothing on it.' },
            ]} />
          )}
        </span>
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

function StatusBar({ api, project, run, board, sound, check }: { api: MicrolabApi; project: OpenProject | null; run: RunState; board?: string; sound: { muted: boolean; toggle: () => void }; check?: { count: number; asking: boolean } }) {
  const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
  const p = project?.doc.project;
  const e = run.ended;
  // M9 slice 2 (screens 04, 25c, 27c): the run's faults counted; a damage says what stopped it
  const cards = (() => {
    if (!p || (!run.faults?.length && !run.burnt?.length)) return [];
    let board;
    try { board = boardData(p.board as BoardId); } catch { board = undefined; }
    return faultCards(run.faults ?? [], run.burnt, { board, parts: p.parts });
  })();
  const damage = e?.ended === 'fault' && e.fault ? cards.find((c) => c.key === `${e.fault!.kind}:${e.fault!.on}`) : undefined;
  const summary = faultSummary(cards);
  const hurt = cards.some((c) => c.severity === 'damage');
  const things = (n: number) => `${n} thing${n === 1 ? '' : 's'} to look at`;
  const left = check?.asking && check.count ? <span className="st warn">Checked before running: {things(check.count)}</span>
    : run.status === 'running' ? <span className="st running"><span className="dot" />Running at real speed</span>
    : run.status === 'stopping' ? <span className="st">Stopping…</span>
    : e?.ended === 'error' ? <span className="st bad">Stopped: an error{e.error?.line ? ` on line ${e.error.line}` : ''}</span>
    : e?.ended === 'fault' ? <span className="st bad">{damage ? stoppedBy(damage) : 'Stopped: the circuit was damaged'}</span>
    : board ? <span className="st running"><span className="dot" />{board}</span>
    : project?.savedNote ? <span className="st saved">{project.savedNote}</span>
    : <span>Ready</span>;
  // screen 27 (M7 slice 3): while running, what the NeoPixels draw, against what their supply gives
  const pixels = run.status === 'running' ? Object.values(run.parts).filter((v): v is Extract<PartView, { kind: 'pixels' }> => v.kind === 'pixels') : [];
  const leds = p ? p.parts.filter((x) => x.type === 'neopixel').reduce((n, x) => n + neopixelCount(x.props), 0) : 0;
  const drawn = pixels.reduce((a, v) => a + v.amps, 0);
  const from = pixels.find((v) => v.from);
  const over = !!from?.limitA && drawn > from.limitA;
  const neo = pixels.length > 0 && (
    <span className={over ? 'st warn' : undefined}>
      NeoPixels: {leds} LEDs {over ? 'ask' : 'draw'} {drawn >= 1 ? `${drawn.toFixed(2)} A` : `${Math.round(drawn * 1000)} mA`}{from ? ` of ${from.from === 'VBUS' || from.from === '5V' || from.from === 'VIN' ? 'USB' : from.from}'s ${Math.round((from.limitA ?? 0) * 1000)} mA` : ''}
    </span>
  );
  // screen 28 (M7 slice 5): what the terminals have got from the board and sent it
  const serial = run.status === 'running' ? Object.entries(run.parts).filter((e): e is [string, Extract<PartView, { kind: 'serial' }>] => e[1].kind === 'serial') : [];
  const uart = serial.length > 0 && (
    <span>{serial.map(([id, v]) => `${id.toUpperCase()} ${v.baud} baud: got ${v.received} bytes · sent ${v.sent}`).join(' · ')}</span>
  );
  // screen 06: while running, what can be heard says so, and a click turns it off (M6.2)
  const audible = run.status !== 'idle' && !!p && (p.board === 'microbit-v2' || p.parts.some((x) => x.type === 'buzzer'));
  return (
    <footer className="statusbar">
      <div className="sbtext" role="status">
      {left}
      {neo}
      {uart}
      {audible && (
        <button type="button" className="btn ghost sm sound" aria-pressed={!sound.muted} onClick={sound.toggle}
          title={sound.muted ? 'Turn the sound on' : 'Turn the sound off'}>
          <Icon name={sound.muted ? 'soundoff' : 'sound'} size={12} /> {sound.muted ? 'Sound off' : 'Sound on (from the laptop)'}
        </button>
      )}
      <span className="r">
        {!!check?.count && <span className="st warn"><Icon name="warn" size={12} /> Wiring check: {check.count} to look at</span>}
        {summary && <span className={hurt ? 'st bad faults' : 'st warn faults'}><Icon name={hurt ? 'alert' : 'warn'} size={12} /> {summary}</span>}
        <span>{p ? `${BOARD_NAMES[p.board as keyof typeof BOARD_NAMES] ?? p.board}${onGpioBoard(p) ? ' + GPIO board' : ''} + ${count(p.parts.length, 'part')} · ${count(p.wires.length, 'wire')}` : 'MicroLab'}</span>
      </span>
      </div>
      <ZoomControl api={api} />
    </footer>
  );
}

/** Learn, until M8 builds it. */
/** The status bar in Python 3 (screen 31b): how the run is, and which Python runs it. */
function PyStatusBar({ api, run, libraries }: { api: MicrolabApi; run: PyRunState; libraries: number | null }) {
  const e = run.ended;
  const left = run.status === 'running' ? <span className="st running"><span className="dot" />Running {run.file}</span>
    : run.status === 'stopping' ? <span className="st">Stopping…</span>
    : run.repl ? <span className="st"><span className="dot" />{run.file} ended — its names are at &gt;&gt;&gt;</span>
    : e?.ended === 'error' ? <span className="st bad">Stopped: an error{e.error?.line ? ` on line ${e.error.line}` : ''}</span>
    : <span>Ready</span>;
  return (
    <footer className="statusbar">
      <div className="sbtext" role="status">
      {left}
      <span className="r">
        {libraries !== null && <span>{libraries === 0 ? 'No libraries installed' : `${libraries} ${libraries === 1 ? 'library' : 'libraries'} installed`}</span>}
        <span>{run.version ? `Python ${run.version} (MicroLab)` : 'Python 3 (MicroLab)'}</span>
      </span>
      </div>
      <ZoomControl api={api} />
    </footer>
  );
}

/** The Python 3 mode with no project open (Rev 11): a project is made, or opened, first. */
function NoPythonProject({ onNew, onOpen }: { onNew: () => void; onOpen: () => void }) {
  return (
    <main className="pynone" aria-label="Python 3">
      <div>
        <h2>No Python project is open</h2>
        <p className="muted">Each program lives in a project: a folder with its files, as in PyCharm. Make one — MicroLab asks its name and where it goes — or open one.</p>
        <div className="row">
          <button type="button" className="btn primary" onClick={onNew}><Icon name="plus" size={14} /> New Python project</button>
          <button type="button" className="btn" onClick={onOpen}><Icon name="folder" size={14} /> Open a project…</button>
        </div>
      </div>
    </main>
  );
}

function Later() {
  return (
    <main className="later">
      <h1>Learn</h1>
      <p className="muted">How each part works inside, the idea behind it and how to connect it — coming in M8.</p>
    </main>
  );
}
