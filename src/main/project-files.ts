import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { MlabError, readMlab, writeMlab, type OpenResult, type ProjectDoc, type SaveResult } from '@lib/project';

/**
 * Opening a .mlab the student chose (F-02): the project, or a message naming the file — never a crash. The project
 * is named after its file, as the student sees it in their folder.
 */
export async function openProjectFile(path: string): Promise<OpenResult> {
  const file = basename(path);
  let bytes: Uint8Array;
  try {
    bytes = await readFile(path);
  } catch (e) {
    const gone = (e as NodeJS.ErrnoException).code === 'ENOENT';
    return { ok: false, message: `“${file}” can't be opened: ${gone ? "the file isn't there any more." : 'it can\'t be read.'}` };
  }
  try {
    return { ok: true, path, name: basename(path, extname(path)), doc: readMlab(bytes) };
  } catch (e) {
    if (e instanceof MlabError) return { ok: false, message: `“${file}” ${e.reason}` };
    throw e;
  }
}

/**
 * Saving a project as a .mlab (F-02, M4.6): `.mlab` is added if the name hasn't it; the file is written whole to a
 * temporary file next to it, then put in its place, so a crash or a full disk mid-write never leaves half a project.
 */
export interface SaveFs { writeFile: typeof writeFile; rename: typeof rename; rm: typeof rm }

export async function saveProjectFile(path: string, doc: ProjectDoc, fs: SaveFs = { writeFile, rename, rm }): Promise<SaveResult> {
  const target = extname(path).toLowerCase() === '.mlab' ? path : `${path}.mlab`;
  const file = basename(target);
  const tmp = `${target}.saving`;
  try {
    await fs.writeFile(tmp, writeMlab(doc));
    await fs.rename(tmp, target);
    return { ok: true, path: target, name: basename(target, extname(target)) };
  } catch (e) {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    const code = (e as NodeJS.ErrnoException).code;
    const why = code === 'ENOENT' ? "its folder isn't there any more."
      : code === 'EACCES' || code === 'EPERM' || code === 'EROFS' ? "MicroLab isn't allowed to write in that folder. Choose another one with Save as."
      : code === 'ENOSPC' ? 'the disk is full.'
      : `${(e as Error).message}.`;
    return { ok: false, message: `“${file}” can't be saved: ${why}` };
  }
}
