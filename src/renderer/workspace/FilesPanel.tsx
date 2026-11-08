import { useState } from 'react';
import { addFile, deletePath, fileNameProblem, renamePath, spaceNote, type ProjectDoc } from '@lib/project';
import { buildTree, FileTree, Icon, TextField } from '../ui';

/**
 * The project's files (F-21, §1.12): the folder tree that goes to the board — main.py, lib/ for libraries, www/ for
 * pages — with New file, Rename and Delete; a file is opened with a double-click or Enter. On the micro:bit there
 * are no folders and the space is small: the panel says how much is used, and warns when near or over.
 */
export type FilesAsk = { kind: 'new' } | { kind: 'rename'; path: string } | { kind: 'delete'; path: string };

export interface FilesPanelProps {
  doc: ProjectDoc;
  onDoc: (doc: ProjectDoc) => void;
  /** Open a file in the editor. */
  onOpen: (path: string) => void;
  /** A file or folder renamed (the tabs follow it) or deleted (its tabs close). */
  onRenamed: (from: string, to: string) => void;
  onDeleted: (path: string) => void;
  onClose: () => void;
  /** Opened by the + button: asking for a new file's name at once — and closed once it is made. */
  ask?: FilesAsk | null;
  /** Add a library (M6.7, screen 22b): opens the library pack's dialog. */
  onAddLibrary?: () => void;
}

const bytes = (v: string | Uint8Array) => (typeof v === 'string' ? new TextEncoder().encode(v).length : v.length);

export function FilesPanel({ doc, onDoc, onOpen, onRenamed, onDeleted, onClose, ask: first = null, onAddLibrary }: FilesPanelProps) {
  const [sel, setSel] = useState<string | null>(null);
  const [opened, setOpened] = useState<Set<string>>(() => new Set(Object.keys(doc.files).filter((p) => p.includes('/')).map((p) => p.split('/')[0]!)));
  const [ask, setAsk] = useState<FilesAsk | null>(first);
  const [name, setName] = useState(first?.kind === 'rename' ? first.path : '');
  const [tried, setTried] = useState(false);
  const microbit = doc.project.board.startsWith('microbit');
  const paths = Object.keys(doc.files);
  const isDir = (p: string) => !(p in doc.files) && paths.some((f) => f.startsWith(`${p}/`));
  const space = spaceNote(doc);

  const begin = (a: FilesAsk) => {
    setAsk(a);
    setTried(false);
    setName(a.kind === 'rename' ? a.path : a.kind === 'new' && sel && isDir(sel) ? `${sel}/` : '');
  };
  const problem = ask && ask.kind !== 'delete' ? fileNameProblem(doc, name, ask.kind === 'rename' ? ask.path : undefined) : null;
  const confirm = () => {
    if (!ask) return;
    if (ask.kind === 'delete') {
      onDoc(deletePath(doc, ask.path));
      onDeleted(ask.path);
      setSel(null);
      setAsk(null);
      return;
    }
    setTried(true);
    if (problem) return;
    const to = name.trim();
    if (ask.kind === 'new') {
      onDoc(addFile(doc, to));
      onOpen(to);
      if (first?.kind === 'new') { onClose(); return; }
    } else if (to !== ask.path) {
      onDoc(renamePath(doc, ask.path, to));
      onRenamed(ask.path, to);
    }
    setSel(to);
    setAsk(null);
  };

  const inside = ask?.kind === 'delete' && isDir(ask.path) ? paths.filter((p) => p.startsWith(`${ask.path}/`)).length : 0;
  return (
    <aside className="float files-panel" aria-label="Project files">
      <div className="fh">
        <b>Files</b>
        <span className="tiny muted">{microbit ? 'next to main.py — the micro:bit has no folders' : 'as on the board — lib/ for libraries'}</span>
        <span className="spacer" />
        <button type="button" className="btn ghost sm icon" aria-label="Close the files" title="Close (Esc)" onClick={onClose}><Icon name="x" size={14} /></button>
      </div>
      <div className="fbar">
        <button type="button" className="btn sm" onClick={() => begin({ kind: 'new' })}><Icon name="plus" size={14} /> New file</button>
        {onAddLibrary && <button type="button" className="btn sm" onClick={onAddLibrary}><Icon name="book" size={14} /> Add library</button>}
        <button type="button" className="btn sm" disabled={!sel} onClick={() => sel && begin({ kind: 'rename', path: sel })}>Rename</button>
        <button type="button" className="btn sm icon danger" aria-label="Delete" title="Delete" disabled={!sel} onClick={() => sel && begin({ kind: 'delete', path: sel })}><Icon name="trash" size={14} /></button>
      </div>
      <FileTree label="Files in this project" nodes={buildTree(paths.map((p) => ({ path: p, size: bytes(doc.files[p]!) })), [])}
        selected={sel} onSelect={setSel} opened={opened} onOpened={setOpened} onActivate={(n) => onOpen(n.path)} />
      {ask && ask.kind !== 'delete' && (
        <div className="fask" role="group" aria-label={ask.kind === 'new' ? 'New file' : `Rename ${ask.path}`}>
          <TextField label={ask.kind === 'new' ? 'New file' : `Rename ${ask.path}`} value={name} onChange={(v) => { setName(v); setTried(false); }} mono autoFocus
            placeholder={microbit ? 'led_test.py' : 'led_test.py or lib/helper.py'} onEnter={confirm}
            error={tried && problem ? problem : undefined}
            help={microbit ? 'A .py file can be imported, or run with Run.' : 'A folder is made when a file goes in it: lib/helper.py.'} />
          <span className="row">
            <button type="button" className="btn sm" onClick={() => setAsk(null)}>Cancel</button>
            <button type="button" className="btn sm primary" onClick={confirm}>{ask.kind === 'new' ? 'Make it' : 'Rename it'}</button>
          </span>
        </div>
      )}
      {ask?.kind === 'delete' && (
        <div className="fask" role="group" aria-label={`Delete ${ask.path}`}>
          <p className="small">
            Delete <b>{ask.path}</b>{inside ? ` and the ${inside} file${inside === 1 ? '' : 's'} in it` : ''}?
            {ask.path === 'main.py' ? ' A board runs main.py by itself when it is switched on.' : ''} This can't be undone.
          </p>
          <span className="row">
            <button type="button" className="btn sm" onClick={() => setAsk(null)}>Cancel</button>
            <button type="button" className="btn sm danger" onClick={confirm}>Delete</button>
          </span>
        </div>
      )}
      {space && <p className={`small fspace ${space.level}`} role={space.level === 'ok' ? undefined : 'alert'}>{space.text}</p>}
    </aside>
  );
}
