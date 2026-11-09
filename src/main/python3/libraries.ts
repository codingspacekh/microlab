import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

/**
 * Libraries for Python 3 (M12, F-95, screen 31d), in MicroLab's own folder — never in a Python installed on the
 * computer. What is there is read from what pip wrote (each library's .dist-info); a library is looked up by its name
 * on PyPI (its JSON page: PyPI has no search for programs); installed with the bundled Python's pip (`--target`
 * MicroLab's folder), from PyPI or from a .whl file; removed by the list of files pip wrote for it (pip can't
 * uninstall from a target folder).
 */
export interface Library { name: string; version: string; summary: string }
export type LookUp = { ok: true; name: string; version: string; summary: string } | { ok: false; message: string; offline?: true };

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
/** A library's name as PyPI has them: letters, digits, - _ . — and never starting with "-" (pip would take it as an option). */
export const validName = (name: string) => NAME.test(name);
/** PEP 503: names compare without case, and - _ . the same. */
const same = (a: string, b: string) => a.toLowerCase().replace(/[-_.]+/g, '-') === b.toLowerCase().replace(/[-_.]+/g, '-');

function metadata(file: string): Record<string, string> {
  const head: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) break;   // the headers end at the first empty line; the long description follows
    const m = /^([A-Za-z-]+):\s?(.*)$/.exec(line);
    if (m && !(m[1]! in head)) head[m[1]!] = m[2]!;
  }
  return head;
}

function infos(libs: string): { dir: string; meta: Record<string, string> }[] {
  if (!existsSync(libs)) return [];
  return readdirSync(libs).filter((d) => d.endsWith('.dist-info') && existsSync(join(libs, d, 'METADATA')))
    .map((d) => ({ dir: join(libs, d), meta: metadata(join(libs, d, 'METADATA')) }));
}

export function listLibraries(libs: string): Library[] {
  return infos(libs)
    .map(({ meta }) => ({ name: meta.Name ?? '', version: meta.Version ?? '', summary: meta.Summary ?? '' }))
    .filter((l) => l.name)
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

export async function lookUp(name: string, fetcher: typeof fetch = fetch): Promise<LookUp> {
  if (!validName(name)) return { ok: false, message: `“${name}” isn't a library's name: names have letters, digits, - _ and . only.` };
  let res: Response;
  try {
    res = await fetcher(`https://pypi.org/pypi/${name}/json`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
  } catch {
    return { ok: false, offline: true, message: "PyPI can't be reached: this computer seems to have no internet. A .whl file from your teacher installs without it." };
  }
  if (res.status === 404) return { ok: false, message: `There is no library called “${name}” on PyPI. Check its spelling.` };
  if (!res.ok) return { ok: false, message: `PyPI didn't answer as expected (${res.status}). Try again in a moment.` };
  const info = ((await res.json()) as { info?: { name?: string; version?: string; summary?: string } }).info ?? {};
  return { ok: true, name: info.name ?? name, version: info.version ?? '', summary: info.summary ?? '' };
}

/**
 * Installs a library by its name (the latest from PyPI) or from a .whl file, with its dependencies, into `libs`; a
 * version already there is replaced. What pip prints comes to `onOutput` as it works. `offline`: PyPI isn't asked
 * (a .whl file's dependencies must be there already).
 */
export function installLibrary(opts: { python: string; libs: string; what: string; offline?: boolean; onOutput?: (text: string) => void }): Promise<{ ok: true } | { ok: false; message: string }> {
  const { python, libs, what } = opts;
  const file = what.toLowerCase().endsWith('.whl') && existsSync(what);
  if (!file && !validName(what)) return Promise.resolve({ ok: false, message: `“${what}” isn't a library's name or a .whl file.` });
  const args = ['-I', '-m', 'pip', 'install', '--disable-pip-version-check', '--no-input', '--no-warn-script-location',
    '--upgrade', '--target', libs, ...(opts.offline ? ['--no-index'] : []), what];
  const before = new Set(infos(libs).map((i) => i.dir));
  return new Promise((done) => {
    const child = spawn(python, args, { windowsHide: true });
    const say = (b: Buffer) => opts.onOutput?.(b.toString('utf8'));
    child.stdout.on('data', say);
    child.stderr.on('data', say);
    child.on('error', (e) => done({ ok: false, message: `Python couldn't start pip: ${e.message}` }));
    child.on('close', (code) => {
      if (code !== 0) { done({ ok: false, message: `pip couldn't install ${file ? 'that .whl file' : what}: see what it said above.` }); return; }
      // pip --target replaces a package's files but keeps the older version's .dist-info: it goes, so each library
      // is listed once, at the version now there
      const now = infos(libs);
      const added = now.filter((i) => !before.has(i.dir));
      for (const old of now.filter((i) => before.has(i.dir))) {
        if (added.some((n) => n.meta.Name && old.meta.Name && same(n.meta.Name, old.meta.Name))) rmSync(old.dir, { recursive: true, force: true });
      }
      done({ ok: true });
    });
  });
}

/** Removes an installed library: every file pip wrote for it, its .dist-info, and the folders left empty. */
export function removeLibrary(libs: string, name: string): { ok: true } | { ok: false; message: string } {
  const found = infos(libs).find(({ meta }) => meta.Name && same(meta.Name, name));
  if (!found) return { ok: false, message: `${name} isn't installed in MicroLab.` };
  const root = resolve(libs);
  const inside = (p: string) => p.startsWith(root + sep);
  const record = join(found.dir, 'RECORD');
  const folders = new Set<string>();
  if (existsSync(record)) {
    for (const line of readFileSync(record, 'utf8').split(/\r?\n/)) {
      const rel = line.split(',')[0];
      if (!rel) continue;
      const path = resolve(root, rel);
      if (!inside(path)) continue;   // a RECORD pointing outside MicroLab's folder is never followed
      rmSync(path, { force: true });
      for (let d = dirname(path); inside(d); d = dirname(d)) folders.add(d);
    }
  }
  // the folders it used, deepest first: what Python wrote there (__pycache__) goes, then the folder if it is empty
  for (const d of [...folders].sort((a, b) => b.length - a.length)) {
    if (!existsSync(d) || !statSync(d).isDirectory()) continue;
    rmSync(join(d, '__pycache__'), { recursive: true, force: true });
    if (readdirSync(d).length === 0) rmSync(d, { recursive: true, force: true });
  }
  rmSync(found.dir, { recursive: true, force: true });
  return { ok: true };
}
