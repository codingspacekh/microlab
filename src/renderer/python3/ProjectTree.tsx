import { useEffect, useMemo, useState } from 'react';
import type { MicrolabApi, TreeEntry } from '../app/api';
import { shortPath } from '../app/NewProject';
import { buildTree, Dialog, FileTree, Icon, MenuButton, TextField, type FileNode } from '../ui';

/**
 * A Python project's tree (M12 Rev 11, F-101, screen 31b), as PyCharm's Project view: its files and folders as they
 * are on disk (kept up to date by the main process's watch); a double-click or Enter opens a file in a tab; New file
 * and New folder (in the folder chosen), Rename, Delete (to the Recycle Bin / Bin), Show in Explorer / Finder — from
 * the buttons, the ⋯ menu, or a right-click (the computer's own menu).
 */
type Ask = { kind: 'file' | 'folder' } | { kind: 'rename'; path: string } | { kind: 'delete'; path: string };

const MAC = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent);
const BIN = MAC ? 'Bin' : 'Recycle Bin';
const SHOW = MAC ? 'Show in Finder' : 'Show in Explorer';
const parent = (p: string) => p.split('/').slice(0, -1).join('/');
const base = (p: string) => p.split('/').pop() ?? p;

export function ProjectTree({ api, root, name, entries, current, onOpen, onRenamed, onDeleted, onChanged }: {
  api: MicrolabApi;
  root: string;
  name: string;
  entries: TreeEntry[];
  /** The file shown in the editor (its path in the project): selected in the tree. */
  current?: string;
  onOpen: (rel: string) => void;
  onRenamed: (from: string, to: string) => void;
  onDeleted: (rel: string) => void;
  /** Something was made, renamed or deleted here: read the tree again. */
  onChanged: () => void;
}) {
  const nodes = useMemo(() => buildTree(entries.filter((e) => !e.dir).map((e) => ({ path: e.path, size: 0 })), entries.filter((e) => e.dir).map((e) => e.path)), [entries]);
  const [selected, setSelected] = useState<string | null>(current ?? null);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [ask, setAsk] = useState<Ask | null>(null);
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => { if (current) setSelected(current); }, [current]);
  const isDir = (p: string) => entries.some((e) => e.path === p && e.dir);
  /** Where something new goes: in the folder selected, or beside the file selected. */
  const here = () => (selected ? (isDir(selected) ? selected : parent(selected)) : '');

  const begin = (a: Ask) => {
    setAsk(a);
    setProblem(null);
    setText(a.kind === 'rename' ? base(a.path) : '');
  };
  const done = (then?: () => void) => { setAsk(null); setProblem(null); onChanged(); then?.(); };
  const commit = async () => {
    if (!ask || ask.kind === 'delete') return;
    const n = text.trim();
    if (!n) { setProblem('Give it a name.'); return; }
    if (ask.kind === 'rename') {
      const to = parent(ask.path) ? `${parent(ask.path)}/${n}` : n;
      if (to === ask.path) { setAsk(null); return; }
      const r = await api.projects.rename(root, ask.path, to);
      if (!r.ok) { setProblem(r.message); return; }
      done(() => { onRenamed(ask.path, to); setSelected(to); });
      return;
    }
    // a new file without a type is a Python file
    const file = ask.kind === 'file' && !n.includes('.') ? `${n}.py` : n;
    const rel = here() ? `${here()}/${file}` : file;
    const r = await api.projects.newEntry(root, rel, ask.kind);
    if (!r.ok) { setProblem(r.message); return; }
    if (here()) setOpened((o) => new Set(o).add(here()));
    done(() => { setSelected(rel); if (ask.kind === 'file') onOpen(rel); });
  };
  const trash = async (rel: string) => {
    const r = await api.projects.trash(root, rel);
    if (!r.ok) { setProblem(r.message); setAsk(null); return; }
    done(() => onDeleted(rel));
  };

  const act = (id: string, n: FileNode | null) => {
    if (id === 'open' && n && !n.dir) onOpen(n.path);
    else if (id === 'file' || id === 'folder') begin({ kind: id });
    else if (id === 'rename' && n) begin({ kind: 'rename', path: n.path });
    else if (id === 'delete' && n) begin({ kind: 'delete', path: n.path });
    else if (id === 'show') void api.projects.reveal(root, n?.path ?? '');
  };
  const onContext = async (n: FileNode) => {
    const id = await api.projects.context([
      ...(n.dir ? [] : [{ id: 'open', label: 'Open' }]),
      { id: 'file', label: 'New file…' }, { id: 'folder', label: 'New folder…' }, { id: '-', label: '' },
      { id: 'rename', label: 'Rename…' }, { id: 'delete', label: `Delete (to the ${BIN})` }, { id: '-', label: '' },
      { id: 'show', label: SHOW },
    ]);
    if (id) act(id, n);
  };
  const chosen = selected ? { name: base(selected), path: selected, dir: isDir(selected), children: [] } : null;

  return (
    <aside className="ptree" aria-label="Project">
      <div className="ph">
        <b title={root}><Icon name="folder" size={14} /> {name}</b>
        <span className="spacer" />
        <button type="button" className="btn ghost sm icon" aria-label="New file" title="New file" onClick={() => begin({ kind: 'file' })}><Icon name="fileplus" size={14} /></button>
        <button type="button" className="btn ghost sm icon" aria-label="New folder" title="New folder" onClick={() => begin({ kind: 'folder' })}><Icon name="folderplus" size={14} /></button>
        <MenuButton label="More for the file chosen" icon="more" alignRight items={[
          { label: 'Rename…', disabled: !chosen, onSelect: () => act('rename', chosen) },
          { label: `Delete (to the ${BIN})…`, disabled: !chosen, onSelect: () => act('delete', chosen) },
          { label: SHOW, onSelect: () => act('show', chosen) },
        ]} />
      </div>
      {ask && ask.kind !== 'delete' && (
        <div className="pask">
          <TextField label={ask.kind === 'rename' ? `New name for ${base(ask.path)}` : ask.kind === 'file' ? 'New file\'s name' : 'New folder\'s name'}
            hideLabel autoFocus mono value={text} onChange={(v) => { setText(v); setProblem(null); }} onEnter={() => void commit()}
            placeholder={ask.kind === 'file' ? 'game.py' : ask.kind === 'folder' ? 'data' : ''} error={problem ?? undefined} />
          <div className="row">
            <span className="tiny muted">{ask.kind === 'rename' ? '' : `In ${here() || name}`}</span>
            <span className="spacer" />
            <button type="button" className="btn sm" onClick={() => setAsk(null)}>Cancel</button>
            <button type="button" className="btn sm primary" onClick={() => void commit()}>{ask.kind === 'rename' ? 'Rename' : 'Create'}</button>
          </div>
        </div>
      )}
      {!ask && problem && <p className="small pbad" role="alert">{problem}</p>}
      <div className="pt">
        <FileTree label={`The files of ${name}`} nodes={nodes} sizes={false} selected={selected} onSelect={setSelected} opened={opened} onOpened={setOpened}
          onActivate={(n) => onOpen(n.path)} onContext={(n) => void onContext(n)} empty="No files yet: New file makes one." />
      </div>
      <div className="pf" title={root}>{shortPath(root)}</div>
      {ask?.kind === 'delete' && (
        <Dialog title={`Move “${base(ask.path)}” to the ${BIN}?`} onCancel={() => setAsk(null)} actions={[
          { label: 'Cancel', onClick: () => setAsk(null) },
          { label: `Move to the ${BIN}`, danger: true, primary: true, onClick: () => void trash(ask.path) },
        ]}>
          <p>{isDir(ask.path) ? 'The folder and everything in it go' : 'It goes'} to the computer's {BIN}: it can be put back from there.</p>
        </Dialog>
      )}
    </aside>
  );
}
