import { readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';

/**
 * `.py` files (M12, F-91), as IDLE has them: opened as text — a Notepad BOM and Windows line endings taken off —
 * and saved whole (to a temporary file, then put in place), so a crash or a full disk never leaves half a program.
 */
export type PyOpen = { ok: true; path: string; name: string; text: string } | { ok: false; message: string };
export type PySave = { ok: true; path: string; name: string } | { ok: false; message: string };

const MAX_BYTES = 2 * 1024 * 1024;

export async function openPyFile(path: string): Promise<PyOpen> {
  const file = basename(path);
  const no = (why: string): PyOpen => ({ ok: false, message: `“${file}” can't be opened: ${why}` });
  let bytes: Buffer;
  try {
    if ((await stat(path)).size > MAX_BYTES) return no('it is larger than 2 MB.');
    bytes = await readFile(path);
  } catch (e) {
    return no((e as NodeJS.ErrnoException).code === 'ENOENT' ? "the file isn't there any more." : "it can't be read.");
  }
  if (bytes.includes(0)) return no("it isn't a text file.");
  const text = new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  return { ok: true, path, name: basename(path, extname(path)), text };
}

export interface SaveFs { writeFile: typeof writeFile; rename: typeof rename; rm: typeof rm }

export async function savePyFile(path: string, text: string, fs: SaveFs = { writeFile, rename, rm }): Promise<PySave> {
  const target = extname(path).toLowerCase() === '.py' ? path : `${path}.py`;
  const tmp = `${target}.saving`;
  try {
    await fs.writeFile(tmp, text, 'utf8');
    await fs.rename(tmp, target);
    return { ok: true, path: target, name: basename(target, extname(target)) };
  } catch (e) {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    const code = (e as NodeJS.ErrnoException).code;
    const why = code === 'ENOENT' ? "its folder isn't there any more."
      : code === 'EACCES' || code === 'EPERM' || code === 'EROFS' ? "MicroLab isn't allowed to write in that folder. Choose another one with Save as."
      : code === 'ENOSPC' ? 'the disk is full.'
      : `${(e as Error).message}.`;
    return { ok: false, message: `“${basename(target)}” can't be saved: ${why}` };
  }
}
