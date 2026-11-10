// M11.4 (N-11): THIRD_PARTY_LICENSES — everything the installers carry that CodingSpaceKH did not write, with its
// licence: Electron, the bundled Python and what it is built with, pip, Jedi, MicroPython (the simulation's and the
// boards' firmware), the library pack, the fonts and every npm package in the app. Pure: scripts/licences.ts reads
// the inputs from disk. (As OneEditor's scripts/lib/licences.ts, with MicroLab's parts.)

export interface Text { name: string; text: string }
export interface Package { name: string; version: string; licence: string; text: string }

export interface LicenceInputs {
  appVersion: string;
  electron: { version: string; licence: string };
  /** CPython and the libraries it is built with (licences/python, from python-build-standalone's full build). */
  python: { version: string; texts: readonly Text[] };
  /** Python packages shipped with it: pip (in the bundled Python), Jedi and parso (the help while typing). */
  pythonPackages: readonly (Omit<Package, 'text'> & { texts: readonly Text[] })[];
  /** The MicroPython that runs programs in the simulation (WebAssembly). */
  micropython: { version: string; licence: string };
  /** The firmware Install MicroPython copies onto a board, each with the licences of what it is built from. */
  firmware: readonly { name: string; version: string; source: string; texts: readonly Text[] }[];
  /** The library pack's drivers (library/lib-pack): each with its own licence. */
  libraries: readonly { id: string; licence: string; text: string }[];
  /** The npm packages in the app: bundled into its pages and main process, or shipped in node_modules. */
  packages: readonly Package[];
}

const RULE = '='.repeat(78);
const section = (title: string, body: string) => `${RULE}\n${title}\n${RULE}\n\n${body.trim()}\n`;
const texts = (list: readonly Text[]) => list.map((t) => `--- ${t.name} ---\n\n${t.text.trim()}`).join('\n\n');

/**
 * A licence MicroLab can't ship in a closed app: the GPL family (GPL, LGPL, AGPL). A choice of licences ("MIT OR
 * GPL-3.0") is fine when one of them isn't. Read from the licence's name as the package declares it, never from its
 * text (CPython's own says it is "GPL-compatible").
 */
export function copyleft(licence: string): boolean {
  const gpl = /\b(A|L)?GPL\b|GNU (Lesser |Library |Affero )?General Public/i;
  const choices = licence.replace(/[()]/g, ' ').split(/\s+OR\s+/i);
  return choices.every((c) => gpl.test(c));
}

/** Stops the list (and the release) at anything without a licence text, or under a copyleft licence. */
function check(name: string, licence: string, text: string): void {
  if (!text.trim()) throw new Error(`${name} has no licence text: MicroLab can't ship it without one.`);
  if (copyleft(licence)) throw new Error(`${name} is under ${licence}: a copyleft licence MicroLab can't ship (N-11).`);
}

export const TRADEMARKS = `"Python" and the Python logo are trademarks or registered trademarks of the Python Software Foundation. MicroLab marks Python files with the logo; MicroLab is not made or endorsed by the Python Software Foundation.
"micro:bit" is a trademark of the Micro:bit Educational Foundation. "Raspberry Pi" and "Pico" are trademarks of Raspberry Pi Ltd. "ESP32" is a trademark of Espressif Systems. MicroLab is not made or endorsed by them; its boards and parts are drawn for MicroLab.`;

export function thirdPartyLicences(i: LicenceInputs): string {
  check(`Electron ${i.electron.version}`, 'MIT', i.electron.licence);
  if (!i.python.texts.length) throw new Error('The bundled Python has no licence texts (licences/python).');
  for (const t of i.python.texts) check(`Python: ${t.name}`, '', t.text);
  for (const p of i.pythonPackages) {
    check(`${p.name} ${p.version}`, p.licence, p.texts.map((t) => t.text).join(''));
  }
  check(`MicroPython ${i.micropython.version}`, 'MIT', i.micropython.licence);
  for (const f of i.firmware) {
    if (!f.texts.length) throw new Error(`The firmware ${f.name} has no licence texts.`);
    for (const t of f.texts) check(`${f.name}: ${t.name}`, '', t.text);
  }
  for (const l of i.libraries) check(`The library ${l.id}`, l.licence, l.text);
  for (const p of i.packages) check(`${p.name} ${p.version}`, p.licence, p.text);

  return [
    `MicroLab ${i.appVersion} — third-party components\n\nMicroLab is © 2026 CodingSpaceKH. All rights reserved. It is built with these components made by others, each under its own licence.\n`,
    section(
      `Electron ${i.electron.version} — MIT License`,
      `${i.electron.licence}\n\nElectron includes Chromium and other components; their licences are in LICENSES.chromium.html, in the same folder as this file.`,
    ),
    section(
      `Python ${i.python.version} — Python Software Foundation License`,
      `The Python 3 that runs Python programs in MicroLab: CPython, as built by python-build-standalone (https://github.com/astral-sh/python-build-standalone). Below, CPython's licence, then those of the libraries it is built with.\n\n${texts(i.python.texts)}`,
    ),
    section(
      'Python packages shipped with it',
      i.pythonPackages.map((p) => `--- ${p.name} ${p.version} (${p.licence}) ---\n\n${texts(p.texts)}`).join('\n\n'),
    ),
    section(
      `MicroPython ${i.micropython.version} — MIT License`,
      `The MicroPython that runs programs in the simulation: its WebAssembly port (https://github.com/micropython/micropython), built for MicroLab with a small patch.\n\n${i.micropython.licence}`,
    ),
    section(
      'Board firmware (Install MicroPython)',
      i.firmware.map((f) => `--- ${f.name} ${f.version} ---\n\nCopied onto the board, unchanged, from ${f.source}\n\n${texts(f.texts)}`).join('\n\n'),
    ),
    section(
      'The library pack (MicroPython drivers for the parts)',
      i.libraries.map((l) => `--- ${l.id} (${l.licence}) ---\n\n${l.text.trim()}`).join('\n\n'),
    ),
    section(
      'Packages built into the app (with the fonts)',
      i.packages.map((p) => `--- ${p.name} ${p.version} (${p.licence}) ---\n\n${p.text.trim()}`).join('\n\n'),
    ),
    section('Trademarks', TRADEMARKS),
  ].join('\n');
}

/** The npm packages of a build's module ids (paths under node_modules), sorted. */
export function bundledPackages(moduleIds: readonly string[]): string[] {
  const names = new Set<string>();
  for (const id of moduleIds) {
    const parts = id.split(/[\\/]/);
    const at = parts.lastIndexOf('node_modules');
    if (at < 0 || !parts[at + 1]) continue;
    const first = parts[at + 1]!;
    names.add(first.startsWith('@') ? `${first}/${parts[at + 2]}` : first);
  }
  return [...names].sort();
}

/** The package names in build-info's lists; its other files (updates.json) are not lists. */
export function packageLists(files: readonly unknown[]): string[] {
  const names = files.filter(Array.isArray).flat() as unknown[];
  return [...new Set(names.filter((n): n is string => typeof n === 'string'))].sort();
}

interface PackageJson {
  version: string;
  dependencies?: Record<string, string>;
}

/**
 * The packages the installers carry in node_modules (the main process's: serialport, electron-updater, fflate, zod),
 * with every package they depend on. A dependency is found as Node finds it: in the package's own node_modules
 * first, then in the folders above. `read` gives a folder's package.json, or null.
 */
export function shippedPackages(
  dependencies: Record<string, string>,
  read: (dir: string) => PackageJson | null,
): { name: string; version: string; dir: string }[] {
  const found = new Map<string, { name: string; version: string; dir: string }>();
  const locate = (name: string, from: string): string | null => {
    for (let dir = from; ;) {
      const candidate = dir ? `${dir}/node_modules/${name}` : `node_modules/${name}`;
      if (read(candidate)) return candidate;
      if (!dir) return null;
      const above = dir.lastIndexOf('/node_modules/');
      dir = above < 0 ? '' : dir.slice(0, above);
    }
  };
  const visit = (deps: Record<string, string> | undefined, from: string) => {
    for (const name of Object.keys(deps ?? {})) {
      const dir = locate(name, from);
      if (!dir || found.has(dir)) continue;
      const pkg = read(dir)!;
      found.set(dir, { name, version: pkg.version, dir });
      visit(pkg.dependencies, dir);
    }
  };
  visit(dependencies, '');
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name) || a.dir.localeCompare(b.dir));
}

const MIT = `Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

/**
 * A package's licence text: its licence file; for an MIT package without one, the standard MIT text with its
 * author, as its package.json declares; otherwise none (refused).
 */
export function licenceTextOf(pkg: { license?: string; author?: string | { name?: string } }, fileText: string): string {
  if (fileText.trim()) return fileText;
  if (pkg.license !== 'MIT') return '';
  const author = typeof pkg.author === 'string' ? pkg.author : pkg.author?.name;
  return `MIT License (declared in its package.json; the package has no licence file, so this is the standard MIT text)\n\nCopyright (c) ${author ?? 'its authors'}\n\n${MIT}`;
}

/** A Python package's licence as its METADATA declares it: License-Expression, else License, else its classifiers. */
export function pythonLicence(metadata: string): string {
  const field = (name: string) => new RegExp(`^${name}: (.+)$`, 'm').exec(metadata)?.[1]?.trim();
  const expression = field('License-Expression');
  if (expression) return expression;
  const license = field('License');
  if (license && license.length < 60 && !/\n/.test(license)) return license;
  const classifiers = [...metadata.matchAll(/^Classifier: License :: (?:OSI Approved :: )?(.+)$/gm)].map((m) => m[1]!.trim());
  return classifiers.join(' OR ') || 'see text';
}

/** A file that holds a licence: LICENSE, LICENCE, COPYING, NOTICE (any extension: LICENSE.txt, LICENSE.APACHE). */
export const isLicenceFile = (name: string) => /^(licen[cs]e|copying|notice)([.-].*)?$/i.test(name);
