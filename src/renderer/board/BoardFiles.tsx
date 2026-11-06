import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { isTextFile, type ProjectDoc } from '@lib/project';
import type { BoardListing } from '@lib/repl';
import type { MicrolabApi } from '../app/api';
import { Checkbox, Dialog, Icon, TextField } from '../ui';
import { size } from './SendToBoard';

/**
 * Board files (F-53, screen 15): the real board's files beside the project's, as on the board (§1.12) — sizes, the
 * space, which files are the same, differ or are only on one side; copy either way, open read-only, make a folder,
 * delete; a question, and a copy kept on the laptop, before anything on the board is replaced or deleted. The board's
 * program waits while the panel is open and runs again when it is closed (the main process: board-check.ts).
 */
export interface BoardFilesProps {
  api: MicrolabApi;
  /** The board's id, and its name in sentences ("Pico W"). */
  id: string;
  name: string;
  doc: ProjectDoc;
  onDoc: (doc: ProjectDoc) => void;
  onClose: () => void;
}

type Side = 'project' | 'board';
type Status = 'same' | 'differs' | 'not on the board' | 'only on the board' | '';

interface Node {
  name: string;
  path: string;
  dir: boolean;
  size?: number;
  children: Node[];
}

type Ask =
  | { kind: 'to-board'; files: string[]; replaces: string[] }
  | { kind: 'to-project'; paths: string[]; replaces: string[] }
  | { kind: 'delete'; path: string; dir: boolean }
  | { kind: 'folder' };

const bytes = (v: string | Uint8Array) => (typeof v === 'string' ? new TextEncoder().encode(v).length : v.length);
const KB = (n: number) => `${Math.round(n / 1024)} KB`;
const under = (dir: string) => (p: string) => p.startsWith(`${dir}/`);

/** Files and folders as a tree: main.py first, then folders, then files, each alphabetical. */
function tree(files: { path: string; size: number }[], dirs: string[]): Node[] {
  const root: Node = { name: '', path: '', dir: true, children: [] };
  const at = (path: string): Node => {
    if (!path) return root;
    const parts = path.split('/');
    let n = root;
    for (let i = 0; i < parts.length; i++) {
      const p = parts.slice(0, i + 1).join('/');
      let c = n.children.find((x) => x.path === p);
      if (!c) { c = { name: parts[i]!, path: p, dir: true, children: [] }; n.children.push(c); }
      n = c;
    }
    return n;
  };
  for (const d of dirs) at(d);
  for (const f of files) {
    const parent = at(f.path.split('/').slice(0, -1).join('/'));
    parent.children.push({ name: f.path.split('/').at(-1)!, path: f.path, dir: false, size: f.size, children: [] });
  }
  const order = (a: Node, b: Node) => Number(b.path === 'main.py') - Number(a.path === 'main.py') || Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name);
  const sort = (n: Node) => { n.children.sort(order); n.children.forEach(sort); };
  sort(root);
  return root.children;
}

/** "1 folder · 3 files": what a folder holds, directly. */
function holds(n: Node): string {
  const d = n.children.filter((c) => c.dir).length;
  const f = n.children.length - d;
  const say = (k: number, one: string) => `${k} ${one}${k === 1 ? '' : 's'}`;
  return [d ? say(d, 'folder') : '', f ? say(f, 'file') : ''].filter(Boolean).join(' · ') || 'empty';
}

export function BoardFiles({ api, id, name, doc, onDoc, onClose }: BoardFilesProps) {
  const [listing, setListing] = useState<BoardListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<Record<Side, string | null>>({ project: null, board: null });
  const [opened, setOpened] = useState<Record<Side, Set<string>>>({ project: new Set(), board: new Set() });
  const [ask, setAsk] = useState<Ask | null>(null);
  const [keep, setKeep] = useState(true);
  const [folder, setFolder] = useState('');
  const [view, setView] = useState<{ path: string; text: string | null; size: number } | null>(null);
  const docRef = useRef(doc);
  docRef.current = doc;

  const run = async <T,>(job: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await job();
    } finally {
      setBusy(false);
    }
  };

  const load = (files: ProjectDoc['files'] = docRef.current.files) => run(async () => {
    const r = await api.boards.files.list(id, files);
    if (r.ok) {
      setListing(r.listing);
      // the project's folders open at first; the board's stay closed (it may hold many)
      setOpened((o) => (o.project.size ? o : { ...o, project: new Set(Object.keys(files).flatMap((p) => p.split('/').slice(0, -1).map((_, i, a) => a.slice(0, i + 1).join('/')))) }));
    } else setError(r.message);
  });
  // read once when the panel opens; Refresh reads again
  useEffect(() => { void load(); }, []);

  const projFiles = Object.keys(doc.files).sort().map((p) => ({ path: p, size: bytes(doc.files[p]!) }));
  const projDirs = [...new Set(projFiles.flatMap((f) => f.path.split('/').slice(0, -1).map((_, i, a) => a.slice(0, i + 1).join('/'))))];
  const onBoard = new Map(listing?.files.map((f) => [f.path, f.size]) ?? []);
  const boardDirs = new Set(listing?.dirs ?? []);

  const status = (side: Side, n: Node): Status => {
    if (!listing) return '';
    if (n.dir) {
      if (side === 'board') return projFiles.some((f) => under(n.path)(f.path)) ? '' : 'only on the board';
      return [...onBoard.keys()].some(under(n.path)) || boardDirs.has(n.path) ? '' : 'not on the board';
    }
    if (side === 'project') return onBoard.has(n.path) ? (listing.same[n.path] ? 'same' : 'differs') : 'not on the board';
    return doc.files[n.path] !== undefined ? (listing.same[n.path] ? 'same' : 'differs') : 'only on the board';
  };

  const filesIn = (side: Side, path: string): string[] => {
    const all = side === 'project' ? projFiles.map((f) => f.path) : [...onBoard.keys()];
    return all.includes(path) ? [path] : all.filter(under(path));
  };

  // ---- the actions ----
  const toBoard = () => {
    const p = sel.project;
    if (!p) return;
    const files = filesIn('project', p);
    const replaces = files.filter((f) => onBoard.has(f) && !listing?.same[f]);
    if (replaces.length) { setKeep(true); setAsk({ kind: 'to-board', files, replaces }); } else void copyToBoard(files);
  };
  const copyToBoard = (files: string[]) => run(async () => {
    setAsk(null);
    const r = await api.boards.files.copy(id, Object.fromEntries(files.map((f) => [f, doc.files[f]!])), keep);
    if (!r.ok) { setError(r.message); return; }
    const sent = r.sent.map((x) => x.path);
    setNote([
      sent.length ? `Copied ${sent.join(', ')} to the ${name}.` : `Nothing to copy: ${files.join(', ')} ${files.length > 1 ? 'were' : 'was'} already on the ${name}.`,
      r.keptIn ? `The board's old ${r.sent.length > 1 ? 'files are' : 'file is'} kept in “${r.keptIn.split(/[\\/]/).pop()}”.` : '',
    ].filter(Boolean).join(' '));
    await load();
  });

  const toProject = () => {
    const p = sel.board;
    if (!p) return;
    const paths = filesIn('board', p);
    const replaces = paths.filter((f) => doc.files[f] !== undefined && !listing?.same[f]);
    if (replaces.length) setAsk({ kind: 'to-project', paths: [p], replaces }); else void copyToProject([p]);
  };
  const copyToProject = (paths: string[]) => run(async () => {
    setAsk(null);
    const r = await api.boards.files.read(id, paths);
    if (!r.ok) { setError(r.message); return; }
    const files = { ...docRef.current.files };
    for (const [p, data] of Object.entries(r.files)) files[p] = isTextFile(p) ? new TextDecoder().decode(data) : data;
    const next = { ...docRef.current, files };
    onDoc(next);
    setNote(`Copied ${Object.keys(r.files).join(', ')} into this project.`);
    await load(files);
  });

  const openFile = () => run(async () => {
    const p = sel.board;
    if (!p || boardDirs.has(p)) return;
    const r = await api.boards.files.read(id, [p]);
    if (!r.ok) { setError(r.message); return; }
    const data = r.files[p] ?? new Uint8Array();
    let text: string | null;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(data); } catch { text = null; }
    setView({ path: p, text, size: data.length });
  });

  const makeFolder = () => run(async () => {
    const leaf = folder.trim().replace(/^\/+|\/+$/g, '');
    if (!leaf) return;
    const s = sel.board;
    const base = s ? (boardDirs.has(s) ? s : s.split('/').slice(0, -1).join('/')) : '';
    const path = base ? `${base}/${leaf}` : leaf;
    setAsk(null);
    setFolder('');
    const r = await api.boards.files.mkdir(id, path);
    if (!r.ok) { setError(r.message); return; }
    setNote(`Made the folder ${path} on the ${name}.`);
    await load();
  });

  const remove = (path: string) => run(async () => {
    setAsk(null);
    const r = await api.boards.files.delete(id, [path], keep);
    if (!r.ok) { setError(r.message); return; }
    setSel((x) => ({ ...x, board: null }));
    setNote(`Deleted ${path} from the ${name}.${r.keptIn ? ` A copy is kept in “${r.keptIn.split(/[\\/]/).pop()}”.` : ''}`);
    await load();
  });

  const boardSel = sel.board;
  const boardSelDir = !!boardSel && boardDirs.has(boardSel);
  const projUsed = projFiles.reduce((n, f) => n + f.size, 0);

  return (
    <Dialog title="Board files" role="dialog" width={1000} icon={<Icon name="folder" size={20} />} onCancel={onClose}
      note={<>Read with MicroPython's own commands over USB — no extra software on the board. Its program waits while this is open.</>}
      actions={[
        { label: 'Refresh', onClick: () => void load() },
        { label: 'Done', primary: true, onClick: onClose },
      ]}>
      <div className="bfiles">
        {error && <div className="say bad" role="alert"><Icon name="warn" size={16} /><span>{error}</span></div>}
        {note && !error && <div className="say ok" role="status"><Icon name="check" size={16} /><span>{note}</span></div>}
        <div className="panes">
          <section className="pane">
            <div className="ph"><Icon name="file" size={14} /><b>This project</b><span className="spacer" /><span className="small muted">{projFiles.length} file{projFiles.length === 1 ? '' : 's'} · {size(projUsed)}</span></div>
            <div className="tb">
              <button type="button" className="btn sm" disabled={!sel.project || busy || !listing} onClick={toBoard}>Copy to the board <Icon name="chevr" size={12} /></button>
            </div>
            <Tree label="This project" side="project" nodes={tree(projFiles, projDirs)} status={status} selected={sel.project}
              onSelect={(p) => setSel((x) => ({ ...x, project: p }))} opened={opened.project}
              onOpened={(o) => setOpened((x) => ({ ...x, project: o }))} />
          </section>
          <section className="pane">
            <div className="ph">
              <Icon name="cpu" size={14} /><b>On the {name}</b><span className="spacer" />
              <span className="small muted">
                {busy ? 'Working…' : listing ? (listing.space ? `${KB(listing.space.total - listing.space.free)} used of ${KB(listing.space.total)}` : `${size(listing.files.reduce((n, f) => n + f.size, 0))} of files`) : 'Reading…'}
              </span>
            </div>
            <div className="tb">
              <button type="button" className="btn sm" disabled={!boardSel || busy} onClick={toProject}><Icon name="chevl" size={12} /> Copy to this laptop</button>
              <button type="button" className="btn sm" disabled={!boardSel || boardSelDir || busy} onClick={() => void openFile()}>Open</button>
              <button type="button" className="btn sm" aria-label="New folder" disabled={busy || !listing || listing.flat}
                title={listing?.flat ? `The ${name} has no folders` : 'A new folder on the board'} onClick={() => { setFolder(''); setAsk({ kind: 'folder' }); }}>
                <Icon name="plus" size={12} /> Folder
              </button>
              <span className="spacer" />
              <button type="button" className="btn sm danger" disabled={!boardSel || busy} onClick={() => { setKeep(true); setAsk({ kind: 'delete', path: boardSel!, dir: boardSelDir }); }}>
                <Icon name="trash" size={12} /> Delete
              </button>
            </div>
            {view ? (
              <section className="viewer" aria-label={`${view.path} on the ${name} (read-only)`}>
                <div className="vh"><b className="mono">{view.path}</b><span className="small muted">read-only · {size(view.size)}</span><span className="spacer" />
                  <button type="button" className="btn sm" onClick={() => setView(null)}><Icon name="chevl" size={12} /> Back to the files</button></div>
                {view.text === null ? <p className="small muted">This file isn't text ({view.size} bytes).</p> : <pre className="mono">{view.text}</pre>}
              </section>
            ) : listing ? (
              <Tree label={`On the ${name}`} side="board" nodes={tree(listing.files, listing.dirs)} status={status} selected={sel.board}
                onSelect={(p) => setSel((x) => ({ ...x, board: p }))} opened={opened.board}
                onOpened={(o) => setOpened((x) => ({ ...x, board: o }))} />
            ) : <p className="small muted pad">{error ? '' : `Reading the ${name}'s files…`}</p>}
          </section>
        </div>
        {ask && <Question ask={ask} name={name} keep={keep} onKeep={setKeep} folder={folder} onFolder={setFolder}
          sizeOnBoard={(p) => onBoard.get(p)} sizeInProject={(p) => (doc.files[p] !== undefined ? bytes(doc.files[p]!) : undefined)}
          count={(p) => filesIn('board', p).length}
          onCancel={() => setAsk(null)}
          onYes={() => {
            if (ask.kind === 'to-board') void copyToBoard(ask.files);
            else if (ask.kind === 'to-project') void copyToProject(ask.paths);
            else if (ask.kind === 'delete') void remove(ask.path);
            else void makeFolder();
          }} />}
      </div>
    </Dialog>
  );
}

interface QuestionProps {
  ask: Ask;
  name: string;
  keep: boolean;
  onKeep: (v: boolean) => void;
  folder: string;
  onFolder: (v: string) => void;
  sizeOnBoard: (p: string) => number | undefined;
  sizeInProject: (p: string) => number | undefined;
  count: (p: string) => number;
  onCancel: () => void;
  onYes: () => void;
}

/** The question before anything is replaced or deleted (screen 15's warning), or a new folder's name. */
function Question({ ask, name, keep, onKeep, folder, onFolder, sizeOnBoard, sizeInProject, count, onCancel, onYes }: QuestionProps) {
  const list = (xs: string[]) => xs.join(', ');
  let title: string;
  let body: ReactNode;
  let yes: string;
  let danger = false;
  let keeps: string | null = null;
  if (ask.kind === 'to-board') {
    const one = ask.replaces.length === 1 ? ask.replaces[0]! : null;
    title = `Replace ${list(ask.replaces)} on the ${name}?`;
    body = one
      ? <>The board's own <span className="mono">{one}</span> ({size(sizeOnBoard(one) ?? 0)}) is replaced by this project's ({size(sizeInProject(one) ?? 0)}). Files only on the board are left alone.</>
      : <>{ask.replaces.length} files on the board are replaced by this project's. Files only on the board are left alone.</>;
    yes = 'Replace';
    keeps = one ? `Keep a copy of the board's ${one} on this laptop` : 'Keep a copy of the board\'s files on this laptop';
  } else if (ask.kind === 'to-project') {
    title = `Replace ${list(ask.replaces)} in this project?`;
    body = <>This project's {list(ask.replaces)} {ask.replaces.length > 1 ? 'are' : 'is'} replaced by the board's. Save the project to keep the change.</>;
    yes = 'Replace';
  } else if (ask.kind === 'delete') {
    const leaf = ask.path;
    title = `Delete ${leaf} from the ${name}?`;
    body = ask.dir
      ? <>Its {count(leaf)} file{count(leaf) === 1 ? '' : 's'} {count(leaf) === 1 ? 'is' : 'are'} deleted from the board.</>
      : <><span className="mono">{leaf}</span> ({size(sizeOnBoard(leaf) ?? 0)}) is deleted from the board.</>;
    yes = 'Delete';
    danger = true;
    keeps = `Keep a copy on this laptop`;
  } else {
    title = `A new folder on the ${name}`;
    body = <TextField label="Folder name" value={folder} onChange={onFolder} onEnter={onYes} mono autoFocus placeholder="lib" />;
    yes = 'Make it';
  }
  return (
    <div className={`confirm${ask.kind === 'folder' ? ' plain' : ''}`} role="group" aria-label={title}>
      <Icon name={ask.kind === 'folder' ? 'folder' : 'warn'} size={20} />
      <div className="col">
        <b>{title}</b>
        <span className="body">{body}</span>
        {keeps && <Checkbox label={keeps} hint="In Documents › MicroLab › Board backups" value={keep} onChange={onKeep} />}
      </div>
      <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      <button type="button" className={`btn ${danger ? 'danger' : 'primary'}`} onClick={onYes}>{yes}</button>
    </div>
  );
}

interface TreeProps {
  label: string;
  side: Side;
  nodes: Node[];
  status: (side: Side, n: Node) => Status;
  selected: string | null;
  onSelect: (path: string) => void;
  opened: Set<string>;
  onOpened: (o: Set<string>) => void;
}

/** A file tree (ARIA tree): ↑ ↓ move, → opens a folder, ← closes it (or goes to its folder), Enter opens or closes. */
function Tree({ label, side, nodes, status, selected, onSelect, opened, onOpened }: TreeProps) {
  const rows: { n: Node; level: number }[] = [];
  const walk = (ns: Node[], level: number) => {
    for (const n of ns) {
      rows.push({ n, level });
      if (n.dir && opened.has(n.path)) walk(n.children, level + 1);
    }
  };
  walk(nodes, 1);
  const refs = useRef(new Map<string, HTMLDivElement>());
  const toggle = (p: string, open?: boolean) => {
    const o = new Set(opened);
    if (open ?? !o.has(p)) o.add(p); else o.delete(p);
    onOpened(o);
  };
  const go = (p: string) => { onSelect(p); refs.current.get(p)?.focus(); };
  const onKey = (e: KeyboardEvent, i: number) => {
    const { n } = rows[i]!;
    const to = (j: number) => { const r = rows[j]; if (r) { e.preventDefault(); go(r.n.path); } };
    if (e.key === 'ArrowDown') to(i + 1);
    else if (e.key === 'ArrowUp') to(i - 1);
    else if (e.key === 'Home') to(0);
    else if (e.key === 'End') to(rows.length - 1);
    else if (e.key === 'ArrowRight' && n.dir) { e.preventDefault(); toggle(n.path, true); }
    else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (n.dir && opened.has(n.path)) toggle(n.path, false);
      else { const up = n.path.split('/').slice(0, -1).join('/'); if (up) go(up); }
    } else if (e.key === 'Enter' && n.dir) { e.preventDefault(); toggle(n.path); }
  };
  const focusable = selected && rows.some((r) => r.n.path === selected) ? selected : rows[0]?.n.path;
  return (
    <div className="tree" role="tree" aria-label={label}>
      {rows.length === 0 && <p className="small muted pad">No files.</p>}
      {rows.map(({ n, level }, i) => {
        const st = status(side, n);
        const open = opened.has(n.path);
        return (
          <div key={n.path} ref={(el) => { if (el) refs.current.set(n.path, el); else refs.current.delete(n.path); }}
            role="treeitem" aria-label={`${n.name}${st ? `, ${st}` : ''}`} aria-level={level} aria-selected={selected === n.path}
            aria-expanded={n.dir ? open : undefined} tabIndex={n.path === focusable ? 0 : -1}
            className={`r${selected === n.path ? ' sel' : ''}`} style={{ paddingLeft: 6 + (level - 1) * 16 }}
            onClick={() => onSelect(n.path)} onDoubleClick={() => n.dir && toggle(n.path)} onKeyDown={(e) => onKey(e, i)}>
            {n.dir
              ? <button type="button" className="tw" tabIndex={-1} aria-label={`${open ? 'Close' : 'Open'} ${n.name}`} onClick={(e) => { e.stopPropagation(); toggle(n.path); }}>
                  <Icon name={open ? 'chevd' : 'chevr'} size={12} />
                </button>
              : <span className="tw" />}
            <span className="nm"><Icon name={n.dir ? 'folder' : 'file'} size={14} />{n.name}</span>
            <span className="sz">{n.dir ? holds(n) : size(n.size ?? 0)}</span>
            <span className={`diff ${st.replace(/ /g, '-')}`}>{st}</span>
          </div>
        );
      })}
    </div>
  );
}
