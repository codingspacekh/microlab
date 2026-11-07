import type { ProjectDoc } from './format';
import { isTextFile } from './format';

/**
 * The project's files (F-21, §1.12): a folder tree like the board's — main.py, lib/ for libraries, www/ for web
 * pages — of text files. The micro:bit has no folders and about 20 KB for files. Every edit is a new doc.
 */
export const MICROBIT_SPACE = 20 * 1024;

const SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/;
const isMicrobit = (doc: ProjectDoc) => doc.project.board.startsWith('microbit');

/** Folders in the project: every folder some file is in. */
function folders(doc: ProjectDoc): Set<string> {
  const out = new Set<string>();
  for (const p of Object.keys(doc.files)) {
    const parts = p.split('/');
    for (let i = 1; i < parts.length; i++) out.add(parts.slice(0, i).join('/'));
  }
  return out;
}

/** Why a file can't be called `path` (or a file or folder renamed from `from`); null when it can. */
export function fileNameProblem(doc: ProjectDoc, path: string, from?: string): string | null {
  const name = path.trim();
  if (!name) return 'Type a name for the file.';
  const parts = name.split('/');
  if (parts.some((p) => !SEGMENT.test(p))) return 'Use letters, digits, _ and - in names (and / between folders), like led_test.py or lib/ssd1306.py.';
  const isFolder = from !== undefined && folders(doc).has(from);
  if (parts.length > 1 && isMicrobit(doc)) return `The micro:bit has no folders: its files sit next to main.py. Call it ${parts.at(-1)}.`;
  const taken = Object.keys(doc.files).find((p) => p.toLowerCase() === name.toLowerCase() && p !== from);
  if (taken) return `There is already a file called ${taken}.`;
  if (from !== name && folders(doc).has(name)) return `There is already a folder called ${name}.`;
  for (let i = 1; i < parts.length; i++) {
    const up = parts.slice(0, i).join('/');
    if (up in doc.files) return `${up} is a file, not a folder.`;
  }
  if (!isFolder && !isTextFile(name)) return 'MicroLab keeps text files: .py, .txt, .html, .css, .js, .json, .csv, .md …';
  return null;
}

export function addFile(doc: ProjectDoc, path: string, content = ''): ProjectDoc {
  return { ...doc, files: { ...doc.files, [path]: content } };
}

/** A file renamed, or a folder with everything in it; unchanged if there is no such file or folder. */
export function renamePath(doc: ProjectDoc, from: string, to: string): ProjectDoc {
  const prefix = `${from}/`;
  if (!(from in doc.files) && !Object.keys(doc.files).some((p) => p.startsWith(prefix))) return doc;
  const files: ProjectDoc['files'] = {};
  for (const [p, v] of Object.entries(doc.files)) {
    files[p === from ? to : p.startsWith(prefix) ? `${to}/${p.slice(prefix.length)}` : p] = v;
  }
  return { ...doc, files };
}

/** A file deleted, or a folder with everything in it. */
export function deletePath(doc: ProjectDoc, path: string): ProjectDoc {
  const prefix = `${path}/`;
  return { ...doc, files: Object.fromEntries(Object.entries(doc.files).filter(([p]) => p !== path && !p.startsWith(prefix))) };
}

/** The file Run runs (F-22, Q19): the open file if it is Python, else the last Python file run, else main.py. */
export function runTarget(files: ProjectDoc['files'], open: string, lastRun: string | undefined): string {
  if (/\.py$/i.test(open) && open in files) return open;
  if (lastRun && lastRun in files) return lastRun;
  return 'main.py';
}

const bytes = (v: string | Uint8Array) => (typeof v === 'string' ? new TextEncoder().encode(v).length : v.length);
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;

/** The micro:bit's space (§1.12): how much of about 20 KB the files take, and a warning when near or over;
 *  null on the boards with room. */
export function spaceNote(doc: ProjectDoc): { level: 'ok' | 'near' | 'over'; text: string } | null {
  if (!isMicrobit(doc)) return null;
  const used = Object.values(doc.files).reduce((s, v) => s + bytes(v), 0);
  const of = `${kb(used)} of about ${MICROBIT_SPACE / 1024} KB`;
  if (used > MICROBIT_SPACE) return { level: 'over', text: `${of}: the files won't fit on a micro:bit. Make them smaller, or take some out.` };
  if (used > MICROBIT_SPACE * 0.8) return { level: 'near', text: `${of}: the micro:bit is nearly full.` };
  return { level: 'ok', text: of };
}
