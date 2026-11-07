import { useEffect, useRef, useState, type ReactNode } from 'react';
import { isTextFile, type ProjectDoc } from '@lib/project';
import type { BoardListing } from '@lib/repl';
import type { MicrolabApi } from '../app/api';
import { buildTree, Checkbox, Dialog, FileTree, Icon, TextField, type FileNode } from '../ui';
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


type Ask =
  | { kind: 'to-board'; files: string[]; replaces: string[] }
  | { kind: 'to-project'; paths: string[]; replaces: string[] }
  | { kind: 'delete'; path: string; dir: boolean }
  | { kind: 'folder' };

const bytes = (v: string | Uint8Array) => (typeof v === 'string' ? new TextEncoder().encode(v).length : v.length);
const KB = (n: number) => `${Math.round(n / 1024)} KB`;
const under = (dir: string) => (p: string) => p.startsWith(`${dir}/`);

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

  const status = (side: Side, n: FileNode): Status => {
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
            <FileTree label="This project" nodes={buildTree(projFiles, projDirs)} status={(n) => status('project', n)} selected={sel.project}
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
              <FileTree label={`On the ${name}`} nodes={buildTree(listing.files, listing.dirs)} status={(n) => status('board', n)} selected={sel.board}
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

