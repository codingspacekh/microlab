// Writes build-info/THIRD_PARTY_LICENSES.txt for the installers (M11.4, N-11): everything MicroLab ships that
// CodingSpaceKH did not write, with its licence — from what the build actually bundled (build-info/packages-*.json,
// written by `npm run build`), what the installers carry in node_modules, the Python for this platform and chip (and
// pip in it), Jedi, the boards' firmware and the library pack. It stops at anything without a licence text or under
// a copyleft licence. About ▸ Licences shows it. (As OneEditor's scripts/licences.ts.)
//
//   npm run build && npm run licences [-- --target darwin-arm64]
//
// scripts/package.ts runs it before every installer.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isLicenceFile, licenceTextOf, packageLists, pythonLicence, shippedPackages, thirdPartyLicences, type Text,
} from './lib/licences.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const at = process.argv.indexOf('--target');
const target = at > 0 && process.argv[at + 1] ? process.argv[at + 1]! : `${process.platform}-${process.arch}`;
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const json = (path: string) => JSON.parse(read(path));
const slash = (p: string) => p.split(sep).join('/');

/** Every licence file under a folder, by its path from `base` (sorted). */
function licenceFiles(dir: string, base = dir): Text[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return licenceFiles(path, base);
    return isLicenceFile(e.name) ? [{ name: slash(relative(base, path)), text: readFileSync(path, 'utf8') }] : [];
  });
}

/** The texts of the files in a folder (licences/…), each by its name. */
const folderTexts = (dir: string): Text[] => readdirSync(join(root, dir)).filter((f) => statSync(join(root, dir, f)).isFile() && f !== 'README.md').sort()
  .map((f) => ({ name: f, text: read(join(dir, f)) }));

// --- npm: what each build bundled, and what the installers carry in node_modules ---
const infos = existsSync(join(root, 'build-info')) ? readdirSync(join(root, 'build-info')).filter((f) => /^packages-.+\.json$/.test(f)) : [];
if (!infos.length) throw new Error('Run "npm run build" first: it records which packages go into the app (build-info/).');
const bundled = packageLists(infos.map((f) => json(`build-info/${f}`)));
const readPackage = (dir: string) => { try { return JSON.parse(read(join(dir, 'package.json'))); } catch { return null; } };
const shipped = shippedPackages(json('package.json').dependencies ?? {}, readPackage);
const npmLicence = (dir: string) => {
  const file = readdirSync(join(root, dir)).find((f) => /^licen[cs]e(\.(md|txt))?$/i.test(f));
  return file ? read(join(dir, file)) : '';
};
const packages = [
  ...bundled.map((name) => ({ name, dir: `node_modules/${name}` })),
  ...shipped.filter((p) => !bundled.includes(p.name)),
].map(({ name, dir }) => {
  const pkg = json(`${dir}/package.json`);
  const licence = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type ?? 'see text';
  return { name, version: pkg.version as string, licence, text: licenceTextOf(pkg, npmLicence(dir)) };
});

// --- Python: CPython's licences (licences/python), and the packages shipped with it ---
const python = join(root, 'vendor', 'python', target, 'python');
const sitePackages = [join(python, 'lib', 'python3.13', 'site-packages'), join(python, 'Lib', 'site-packages')].find(existsSync);
if (!sitePackages) throw new Error(`No Python for ${target} in vendor/python: run "npm run fetch:python -- --target ${target}" first.`);
const tools = join(root, 'vendor', 'python-tools');
if (!existsSync(tools)) throw new Error('No Jedi in vendor/python-tools: run "npm run fetch:python" first.');

/** A Python package from its .dist-info: its licence files (License-File, PEP 639's licenses/), and those in its folder. */
function pythonPackage(folder: string, distInfo: string) {
  const dist = join(folder, distInfo);
  const metadata = readFileSync(join(dist, 'METADATA'), 'utf8');
  const name = /^Name: (.+)$/m.exec(metadata)![1]!.trim();
  const version = /^Version: (.+)$/m.exec(metadata)![1]!.trim();
  const declared = [...metadata.matchAll(/^License-File: (.+)$/gm)].map((m) => m[1]!.trim());
  const texts: Text[] = declared.map((file) => {
    const path = [join(dist, 'licenses', file), join(dist, file)].find(existsSync);
    if (!path) throw new Error(`${name} ${version} names ${file} as a licence file, but it isn't there.`);
    return { name: file, text: readFileSync(path, 'utf8') };
  });
  // licences kept inside the package itself (Jedi's typeshed and django-stubs), unless already listed
  const seen = new Set(texts.map((t) => t.text.trim()));
  for (const t of licenceFiles(join(folder, name.toLowerCase()), folder)) {
    if (!seen.has(t.text.trim())) { texts.push(t); seen.add(t.text.trim()); }
  }
  return { name, version, licence: pythonLicence(metadata), texts };
}
const distInfos = (folder: string) => readdirSync(folder).filter((f) => f.endsWith('.dist-info')).sort();
const pythonPackages = [
  ...distInfos(sitePackages).map((d) => pythonPackage(sitePackages, d)),
  ...distInfos(tools).map((d) => pythonPackage(tools, d)),
];

// --- the boards' firmware: each with the licences of what it is built from (licences/…) ---
const FIRMWARE_LICENCES: Record<string, string[]> = {
  'pico-w': ['licences/micropython', 'licences/pico-w-firmware'],
  'microbit-v2': ['licences/micropython-microbit', 'licences/micropython-microbit/codal'],
};
const firmwareJson = json('library/firmware/firmware.json') as Record<string, { file?: string; version: string; source: string }>;
const firmware = Object.entries(firmwareJson).filter(([, f]) => typeof f === 'object' && f.file).map(([board, f]) => {
  const dirs = FIRMWARE_LICENCES[board];
  if (!dirs) throw new Error(`The firmware for ${board} has no licences listed: add them to licences/ and to FIRMWARE_LICENCES.`);
  const boardName = json(`library/boards/${board}/board.json`).name as string;
  return {
    name: `MicroPython for the ${boardName}`, version: f.version, source: f.source,
    texts: dirs.flatMap((d) => folderTexts(d).map((t) => ({ ...t, name: `${d.split('/').slice(1).join('/')}/${t.name}` }))),
  };
});

// --- the library pack: each driver someone else wrote, with its licence (MicroLab's own aren't listed) ---
const pack = json('library/lib-pack/pack.json') as { libraries: { id: string; builds: { licence: string; authors: string }[] }[] };
const libraries = pack.libraries.flatMap((l) => {
  const theirs = l.builds.find((b) => b.authors !== 'MicroLab');
  return theirs ? [{ id: l.id, licence: theirs.licence, text: read(`library/lib-pack/${l.id}/LICENSE`) }] : [];
});

const text = thirdPartyLicences({
  appVersion: json('package.json').version,
  electron: { version: json('node_modules/electron/package.json').version, licence: read('node_modules/electron/LICENSE') },
  python: {
    version: /CPYTHON = '([^']+)'/.exec(read('scripts/fetch-python.mjs'))![1]!,
    texts: folderTexts('licences/python'),
  },
  pythonPackages,
  micropython: { version: /MICROPYTHON = '([^']+)'/.exec(read('src/renderer/app/useRun.ts'))![1]!, licence: read('licences/micropython/LICENSE') },
  firmware,
  libraries,
  packages,
});
writeFileSync(join(root, 'build-info', 'THIRD_PARTY_LICENSES.txt'), text);
console.log(`build-info/THIRD_PARTY_LICENSES.txt (${Math.round(text.length / 1024)} KB): Electron, Python (${folderTexts('licences/python').length} licences), ` +
  `${pythonPackages.map((p) => `${p.name} ${p.version}`).join(', ')}, MicroPython, ${firmware.length} firmware, ${libraries.length} libraries, ${packages.length} npm packages.`);
