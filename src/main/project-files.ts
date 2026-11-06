import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { MlabError, readMlab, type OpenResult } from '@lib/project';

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
