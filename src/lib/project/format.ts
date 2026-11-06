import { strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { isBoardId } from '../boards';
import { projectSchema, type Project } from './project';

/**
 * The .mlab file (F-02, architecture §2.7): a zip of `project.json` and the `files/` tree, the folder tree as it is on
 * the board (F-21). Text files come back as text, anything else as bytes. Every way a file can be wrong is an
 * `MlabError` a student can read, never a crash; a file from a newer MicroLab says so (N-09).
 */
export const FORMAT = 1;

export interface ProjectDoc {
  project: Project;
  /** Path on the board ('main.py', 'lib/ssd1306.py') → its contents. */
  files: Record<string, string | Uint8Array>;
}

/** What opening a file gives the window (src/main/project-files.ts). */
export type OpenResult =
  | { ok: true; path: string; name: string; doc: ProjectDoc }
  | { ok: false; message: string }
  | { ok: false; canceled: true };

export class MlabError extends Error {
  /** The message after the file's name: “photo.mlab” isn't a MicroLab project … */
  readonly reason: string;
  constructor(reason: string) {
    super(`This file ${reason}`);
    this.name = 'MlabError';
    this.reason = reason;
  }
}

const PROJECT_JSON = 'project.json';
const FILES = 'files/';
const TEXT = /\.(py|txt|html?|css|js|mjs|json|md|csv|xml|svg|cfg|ini|toml)$/i;

export function writeMlab(doc: ProjectDoc): Uint8Array {
  const entries: Zippable = { [PROJECT_JSON]: strToU8(`${JSON.stringify(doc.project, null, 2)}\n`) };
  for (const [path, contents] of Object.entries(doc.files)) {
    checkPath(path);
    entries[FILES + path] = typeof contents === 'string' ? strToU8(contents) : contents;
  }
  return zipSync(entries);
}

export function readMlab(bytes: Uint8Array): ProjectDoc {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new MlabError("isn't a MicroLab project (it isn't a .mlab file).");
  }
  const raw = entries[PROJECT_JSON];
  if (!raw) throw new MlabError("isn't a MicroLab project: it has no project.json.");
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    throw new MlabError("is damaged: its project.json can't be read.");
  }
  const format = (json as { format?: unknown } | null)?.format;
  if (typeof format === 'number' && format > FORMAT) {
    throw new MlabError('was made with a newer version of MicroLab. Update MicroLab to open it.');
  }
  const parsed = projectSchema.safeParse(json);
  if (!parsed.success) {
    const where = parsed.error.issues.map((i) => `${i.path.join('.') || 'the file'}: ${i.message}`).join('; ');
    throw new MlabError(`is damaged: its project.json has problems (${where}).`);
  }
  if (!isBoardId(parsed.data.board)) {
    throw new MlabError(`is for the board "${parsed.data.board}", which isn't one MicroLab knows.`);
  }
  const files: ProjectDoc['files'] = {};
  for (const [name, data] of Object.entries(entries)) {
    if (!name.startsWith(FILES) || name.endsWith('/')) continue;
    const path = name.slice(FILES.length);
    checkPath(path);
    files[path] = TEXT.test(path) ? text(data) : data;
  }
  return { project: parsed.data, files };
}

/** A path inside the project: no '..', no absolute path, no backslashes, no empty parts. */
function checkPath(path: string): void {
  const parts = path.split('/');
  if (path.includes('\\') || parts.some((p) => p === '' || p === '.' || p === '..')) {
    throw new MlabError(`is damaged: it has an unsafe file name, "${path}".`);
  }
}

/** Text if it is UTF-8, else the bytes as they are. */
function text(data: Uint8Array): string | Uint8Array {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    return data;
  }
}
