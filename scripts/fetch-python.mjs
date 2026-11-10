#!/usr/bin/env node
/**
 * M12 (Q22, architecture §2.11): fetches what MicroLab's Python 3 ships with, each checked by its SHA-256 before it
 * is unpacked — into vendor/ (not in git), from where the build copies it into the app's resources:
 *
 *   vendor/python/<platform>-<arch>/python/   CPython 3.13 with Tcl/Tk (python-build-standalone, install_only)
 *   vendor/python-tools/                      Jedi and parso, for the editor's completions (F-97): the helper's
 *                                             path only — never on a student program's
 *
 *   node scripts/fetch-python.mjs              this computer's platform and processor, and the tools
 *   node scripts/fetch-python.mjs --tools      the tools only (development with the computer's own Python)
 *   node scripts/fetch-python.mjs --all        every platform the app is built for (a build machine)
 *   node scripts/fetch-python.mjs --target darwin-x64   one platform and chip (what scripts/package.ts builds)
 *
 * A part already there with the same hash is left as it is. A new release is a change here: its URL and hash.
 */
/* global fetch */
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = join(ROOT, 'vendor');

const RELEASE = '20261026';
const CPYTHON = '3.13.18';
/** python-build-standalone's SHA256SUMS for the release, for the platforms MicroLab is built for. */
const PYTHONS = {
  'darwin-x64': ['x86_64-apple-darwin', '708be9e7df297f68bdae589ea9e62a621db5abe7708f79e851c41410347452d1'],
  'darwin-arm64': ['aarch64-apple-darwin', 'e5af2fde6a937a0e0c795a0c595c4efb70578d57463a2657c819992b9b9acbac'],
  'win32-x64': ['x86_64-pc-windows-msvc', 'ebe90cc1dce2dd2d7afa1f0aa9b6c269c7c0174aeabdc6a801381602b7283424'],
  'win32-arm64': ['aarch64-pc-windows-msvc', '13f8bb6ff296a826dd903ea732255ca02fc3a4db4287c2b0ebe0781360b6028d'],
  'linux-x64': ['x86_64-unknown-linux-gnu', '126343c54daff4068efc1ac269518d0cc202d57857794948103dd1454e8881be'],
  'linux-arm64': ['aarch64-unknown-linux-gnu', 'b48451865bde9a39e2f3e71d7fdcbf1f32615f50f24d78dc50d04ede6501cf81'],
};
/** Pure-Python wheels from PyPI (MIT licences, kept in their .dist-info). */
const TOOLS = [
  ['https://files.pythonhosted.org/packages/be/c7/71eb0d51cdcbb63b857c931aa4e9218b078b5d9f8ecd383b234f28fe7b0f/jedi-0.20.1-py2.py3-none-any.whl',
    '0fb16d86c4a4c73c37ba518c77419975e30fcc620658a8d14fbb5720cdd34142'],
  ['https://files.pythonhosted.org/packages/99/5d/8268b644392ee874ee82a635cd0df1773de230bde356c38de28e298392cc/parso-0.8.7-py2.py3-none-any.whl',
    'a8926eb2a1b915486941fdbd31e86a4baf88fe8c210f25f2f35ecec5b574ca1c'],
];

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function download(url, hash) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const got = sha256(bytes);
  if (got !== hash) throw new Error(`${url}: its SHA-256 is ${got}, not ${hash} — not unpacked`);
  return bytes;
}

/** A part's folder, unpacked beside it then moved into place, with a stamp of what it is. */
function done(dir, stamp) {
  return existsSync(join(dir, '.fetched')) && readFileSync(join(dir, '.fetched'), 'utf8') === stamp;
}

async function fetchPython(target) {
  const entry = PYTHONS[target];
  if (!entry) throw new Error(`No Python for ${target}: one of ${Object.keys(PYTHONS).join(', ')}`);
  const [triple, hash] = entry;
  const dir = join(VENDOR, 'python', target);
  if (done(dir, hash)) { console.log(`python ${target}: there`); return; }
  const name = `cpython-${CPYTHON}+${RELEASE}-${triple}-install_only.tar.gz`;
  const url = `https://github.com/astral-sh/python-build-standalone/releases/download/${RELEASE}/${encodeURIComponent(name)}`;
  console.log(`python ${target}: ${name}`);
  const bytes = await download(url, hash);
  const tmp = `${dir}.part`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const archive = join(tmp, 'python.tar.gz');
  writeFileSync(archive, bytes);
  execFileSync('tar', ['-xzf', archive, '-C', tmp]);   // tar is on macOS, Linux and Windows 10+
  rmSync(archive);
  writeFileSync(join(tmp, '.fetched'), hash);
  rmSync(dir, { recursive: true, force: true });
  renameSync(tmp, dir);
}

async function fetchTools() {
  const dir = join(VENDOR, 'python-tools');
  const stamp = TOOLS.map(([, h]) => h).join('\n');
  if (done(dir, stamp)) { console.log('python-tools: there'); return; }
  const tmp = `${dir}.part`;
  rmSync(tmp, { recursive: true, force: true });
  for (const [url, hash] of TOOLS) {
    console.log(`python-tools: ${url.split('/').pop()}`);
    const files = unzipSync(new Uint8Array(await download(url, hash)));
    for (const [path, data] of Object.entries(files)) {
      if (path.endsWith('/')) continue;
      const out = resolve(tmp, path);
      if (!out.startsWith(tmp)) throw new Error(`${url}: ${path} leads outside the folder`);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, data);
    }
  }
  writeFileSync(join(tmp, '.fetched'), stamp);
  rmSync(dir, { recursive: true, force: true });
  renameSync(tmp, dir);
}

const args = process.argv.slice(2);
try {
  if (!args.includes('--tools')) {
    const at = args.indexOf('--target');
    const targets = args.includes('--all') ? Object.keys(PYTHONS) : at >= 0 && args[at + 1] ? [args[at + 1]] : [`${process.platform}-${process.arch}`];
    for (const target of targets) await fetchPython(target);
  }
  await fetchTools();
} catch (e) {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
}
