import { useRef, type KeyboardEvent } from 'react';
import { Icon } from './Icon';
import './file-tree.css';

/**
 * A file tree (ARIA tree), as the board's and the project's files are shown (F-21, F-53; screen 15): folders open and
 * close (the arrow, → ←, Enter), ↑ ↓ Home End move, a file is opened with Enter or a double-click. Each row has the
 * file's size, or what a folder holds, and a status the caller gives (Board files: same, differs …).
 */
export interface FileNode {
  name: string;
  path: string;
  dir: boolean;
  size?: number;
  children: FileNode[];
}

export function fileSize(n: number): string {
  return n < 100 ? `${n} byte${n === 1 ? '' : 's'}` : `${(n / 1024).toFixed(1)} KB`;
}

/** Files and folders as a tree: main.py first, then folders, then files, each alphabetical. */
export function buildTree(files: { path: string; size: number }[], dirs: string[]): FileNode[] {
  const root: FileNode = { name: '', path: '', dir: true, children: [] };
  const at = (path: string): FileNode => {
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
  const order = (a: FileNode, b: FileNode) => Number(b.path === 'main.py') - Number(a.path === 'main.py') || Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name);
  const sort = (n: FileNode) => { n.children.sort(order); n.children.forEach(sort); };
  sort(root);
  return root.children;
}

/** "1 folder · 3 files": what a folder holds, directly. */
export function holds(n: FileNode): string {
  const d = n.children.filter((c) => c.dir).length;
  const f = n.children.length - d;
  const say = (k: number, one: string) => `${k} ${one}${k === 1 ? '' : 's'}`;
  return [d ? say(d, 'folder') : '', f ? say(f, 'file') : ''].filter(Boolean).join(' · ') || 'empty';
}

export interface FileTreeProps {
  label: string;
  nodes: FileNode[];
  /** A word or two after each row's size (Board files: "same", "differs" …). */
  status?: (n: FileNode) => string;
  selected: string | null;
  onSelect: (path: string) => void;
  opened: Set<string>;
  onOpened: (o: Set<string>) => void;
  /** A file opened: Enter or a double-click. */
  onActivate?: (n: FileNode) => void;
  /** Said when there are no files. */
  empty?: string;
}

export function FileTree({ label, nodes, status = () => '', selected, onSelect, opened, onOpened, onActivate, empty = 'No files.' }: FileTreeProps) {
  const rows: { n: FileNode; level: number }[] = [];
  const walk = (ns: FileNode[], level: number) => {
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
    else if (e.key === 'Enter' && onActivate) { e.preventDefault(); onActivate(n); }
  };
  const focusable = selected && rows.some((r) => r.n.path === selected) ? selected : rows[0]?.n.path;
  return (
    <div className="tree" role="tree" aria-label={label}>
      {rows.length === 0 && <p className="small muted pad">{empty}</p>}
      {rows.map(({ n, level }, i) => {
        const st = status(n);
        const open = opened.has(n.path);
        return (
          <div key={n.path} ref={(el) => { if (el) refs.current.set(n.path, el); else refs.current.delete(n.path); }}
            role="treeitem" aria-label={`${n.name}${st ? `, ${st}` : ''}`} aria-level={level} aria-selected={selected === n.path}
            aria-expanded={n.dir ? open : undefined} tabIndex={n.path === focusable ? 0 : -1}
            className={`r${selected === n.path ? ' sel' : ''}`} style={{ paddingLeft: 6 + (level - 1) * 16 }}
            onClick={() => onSelect(n.path)} onDoubleClick={() => (n.dir ? toggle(n.path) : onActivate?.(n))} onKeyDown={(e) => onKey(e, i)}>
            {n.dir
              ? <button type="button" className="tw" tabIndex={-1} aria-label={`${open ? 'Close' : 'Open'} ${n.name}`} onClick={(e) => { e.stopPropagation(); toggle(n.path); }}>
                  <Icon name={open ? 'chevd' : 'chevr'} size={12} />
                </button>
              : <span className="tw" />}
            <span className="nm"><Icon name={n.dir ? 'folder' : 'file'} size={14} />{n.name}</span>
            <span className="sz">{n.dir ? holds(n) : fileSize(n.size ?? 0)}</span>
            <span className={`diff ${st.replace(/ /g, '-')}`}>{st}</span>
          </div>
        );
      })}
    </div>
  );
}
