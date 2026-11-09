import { existsSync, mkdirSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { projectNameProblem } from '@lib/project';

export { projectNameProblem };

/**
 * Projects as folders (M12 Rev 11, F-100, F-101; screens 31e, 31b) — as PyCharm keeps them, "not a single file
 * everywhere" (the teacher): a new project is made where the student chose, under its name — a Python project a
 * folder with main.py, a board project one .mlab file; a Python project's files and folders shown as a tree; files
 * and folders made and renamed in it. Nothing here ever reaches outside the project's folder.
 */
export const STARTER_PY = 'print("Hello!")\n';
/** Left out of the tree: what Python and tools make for themselves. */
const HIDDEN = new Set(['__pycache__', '.venv', 'venv', 'node_modules', '.git', '.idea', '.vscode']);
const TEXT = new Set(['.py', '.pyw', '.txt', '.csv', '.tsv', '.json', '.md', '.html', '.htm', '.css', '.js', '.xml', '.toml', '.cfg', '.ini', '.yaml', '.yml', '.log', '.svg', '']);
const TREE_MAX = 2000;

export type Made = { ok: true; path: string } | { ok: false; message: string };
export type NewPython = { ok: true; root: string; name: string; main: string } | { ok: false; message: string };
export interface TreeEntry { path: string; dir: boolean }

const taken = (name: string) => `There is already a project called “${name}” there: choose another name.`;

/** A new Python project: `location/name/main.py`. The location is made if it isn't there; a name there is never overwritten. */
export function newPythonProject(location: string, name: string): NewPython {
  const problem = projectNameProblem(name);
  if (problem) return { ok: false, message: problem };
  const root = join(location, name);
  if (existsSync(root)) return { ok: false, message: taken(name) };
  try {
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'main.py'), STARTER_PY, { flag: 'wx' });
  } catch (e) {
    return { ok: false, message: `The project couldn't be made there: ${(e as Error).message}` };
  }
  return { ok: true, root, name, main: join(root, 'main.py') };
}

/** Where a new board project goes: `location/name.mlab` — refused if one is there. */
export function newBoardProjectPath(location: string, name: string): Made {
  const problem = projectNameProblem(name);
  if (problem) return { ok: false, message: problem };
  const path = join(location, `${name}.mlab`);
  return existsSync(path) ? { ok: false, message: taken(name) } : { ok: true, path };
}

/** A path in the project (forward slashes) as a path on disk — or null if it would be outside it, or is the folder itself. */
export function insideProject(root: string, rel: string): string | null {
  if (!rel || rel.includes('\\') || rel.startsWith('/') || /^[A-Za-z]:/.test(rel)) return null;
  const top = resolve(root);
  const full = resolve(top, ...rel.split('/'));
  return full.startsWith(top + sep) ? full : null;
}

/** A file or folder name as the computers allow (Windows the strictest): no \ / : * ? " < > |, not ending in a dot or space. */
const fileNameOk = (rel: string) => rel.split('/').every((p) => p && p !== '.' && p !== '..' && !/[\\/:*?"<>|]/.test(p)
  && ![...p].some((c) => c.charCodeAt(0) < 32) && !/[. ]$/.test(p));

/** The project's files and folders: each folder, then what is in it; folders before files, main.py first, by name. */
export function projectTree(root: string): TreeEntry[] {
  const out: TreeEntry[] = [];
  const walk = (dir: string, rel: string) => {
    let names: string[];
    try { names = readdirSync(dir); } catch { return; }
    const entries = names.filter((n) => !n.startsWith('.') && !HIDDEN.has(n)).map((n) => {
      let isDir = false;
      try { isDir = statSync(join(dir, n)).isDirectory(); } catch { /* gone meanwhile */ }
      return { n, isDir };
    });
    entries.sort((a, b) => Number(b.isDir) - Number(a.isDir) || Number(b.n === 'main.py') - Number(a.n === 'main.py') || a.n.localeCompare(b.n));
    for (const { n, isDir } of entries) {
      if (out.length >= TREE_MAX) return;
      const path = rel ? `${rel}/${n}` : n;
      out.push({ path, dir: isDir });
      if (isDir) walk(join(dir, n), path);
    }
  };
  if (existsSync(root)) walk(root, '');
  return out;
}

/** A new empty file, or a folder, at `rel` in the project. */
export function newEntry(root: string, rel: string, kind: 'file' | 'folder'): Made {
  const full = insideProject(root, rel);
  if (!full || !fileNameOk(rel)) return { ok: false, message: `“${rel}” can't be a name for a ${kind}: no \\ / : * ? " < > |.` };
  if (existsSync(full)) return { ok: false, message: `“${basename(rel)}” is already there.` };
  try {
    if (kind === 'folder') mkdirSync(full, { recursive: true });
    else { mkdirSync(dirname(full), { recursive: true }); writeFileSync(full, '', { flag: 'wx' }); }
  } catch (e) {
    return { ok: false, message: `It couldn't be made: ${(e as Error).message}` };
  }
  return { ok: true, path: rel };
}

/** A file or folder renamed (or moved) within the project. */
export function renameEntry(root: string, from: string, to: string): Made {
  const a = insideProject(root, from);
  const b = insideProject(root, to);
  if (!a || !b || !fileNameOk(to)) return { ok: false, message: `“${to}” can't be a name: no \\ / : * ? " < > |.` };
  if (!existsSync(a)) return { ok: false, message: `“${basename(from)}” isn't there any more.` };
  if (existsSync(b) && a.toLowerCase() !== b.toLowerCase()) return { ok: false, message: `“${basename(to)}” is already there.` };
  try {
    mkdirSync(dirname(b), { recursive: true });
    renameSync(a, b);
  } catch (e) {
    return { ok: false, message: `It couldn't be renamed: ${(e as Error).message}` };
  }
  return { ok: true, path: to };
}

/** What opening a path opens: a folder is the project; a file opens its folder, the file shown — else main.py, if there. */
export function projectOf(path: string): { root: string; file?: string } {
  let isDir = false;
  try { isDir = statSync(path).isDirectory(); } catch { /* not there */ }
  if (!isDir) return { root: dirname(path), file: path };
  const main = join(path, 'main.py');
  return existsSync(main) ? { root: path, file: main } : { root: path };
}

/** Opens in a tab as text (a program's code, its data); a picture or a .pyc doesn't. */
export const textFile = (name: string) => TEXT.has(extname(name).toLowerCase());
