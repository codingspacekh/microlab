// Builds MicroLab's installers for this computer (or with --dir an unpacked app), with the Python for its platform
// and chip, then starts the packaged app with MICROLAB_SELF_CHECK: its Python runs, its runner and Jedi, its pages
// and its updater are there. (M11, Rev 13; as OneEditor's scripts/package.ts.)
//
//   npm run build && npm run package [-- --dir] [-- --arch x64] [-- --no-check]
//
// --arch: another chip of this platform (an Apple-chip Mac builds the Intel installer too; a build for another chip
// can't be started here, so it isn't checked); --no-check: no self-check.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { builderArgs, macFeedName, oversized, packagedProgram, updateConfig } from './lib/package.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = process.argv.includes('--dir');
const at = process.argv.indexOf('--arch');
const arch = at > 0 && process.argv[at + 1] ? process.argv[at + 1]! : process.arch;
const builder = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder');

// the Python for this platform and chip (and Jedi), checked by hash; already there: left as it is
execFileSync(process.execPath, [join(root, 'scripts', 'fetch-python.mjs'), '--target', `${process.platform}-${arch}`], { cwd: root, stdio: 'inherit' });

// the update address the installed app looks at (none: updates are off)
const updates = updateConfig(process.env, process.platform);
mkdirSync(join(root, 'build-info'), { recursive: true });
writeFileSync(join(root, 'build-info', 'updates.json'), `${JSON.stringify(updates, null, 2)}\n`);
console.log(updates.url
  ? `Updates from ${updates.url}${process.platform === 'darwin' ? (updates.macSigned ? `, signed as ${process.env.CSC_NAME}` : ', NOT signed with the certificate: a Mac will be offered the .dmg instead') : ''}.`
  : 'No MICROLAB_UPDATE_URL: this build will not look for updates.');

execFileSync(builder, builderArgs(process.platform, arch, { dir }), { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });

// each Mac build writes latest-mac.yml for its own chip: kept apart, then merged (scripts/release-mac.ts)
const feed = join(root, 'release', 'latest-mac.yml');
if (process.platform === 'darwin' && !dir && existsSync(feed)) renameSync(feed, join(root, 'release', macFeedName(arch)));

if (process.argv.includes('--no-check')) {
  console.log('Not started to check itself (--no-check).');
} else if (arch === process.arch) {
  const report = join(mkdtempSync(join(tmpdir(), 'microlab-self-check-')), 'self-check.json');
  try {
    execFileSync(join(root, packagedProgram(process.platform, arch)), [], { env: { ...process.env, MICROLAB_SELF_CHECK: report }, stdio: 'inherit', timeout: 120_000 });
  } finally {
    if (existsSync(report)) console.log(readFileSync(report, 'utf8'));
  }
  const r = JSON.parse(readFileSync(report, 'utf8')) as { ok: boolean };
  if (!r.ok) throw new Error('The packaged app is missing something (above).');
  console.log('The packaged app checked itself: everything is in place.');
} else {
  console.log(`Built for ${arch}: this ${process.arch} computer can't start it to check it.`);
}

if (!dir) {
  const release = join(root, 'release');
  const installers = readdirSync(release).filter((f) => /\.(exe|zip|dmg)$/.test(f)).map((name) => ({ name, bytes: statSync(join(release, name)).size }));
  for (const f of installers) console.log(`${f.name}: ${Math.round(f.bytes / 1e6)} MB`);
  const tooBig = oversized(installers);
  if (tooBig.length) throw new Error(tooBig.join('\n'));
}
