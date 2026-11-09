// The two Mac installers of a release, built on the teacher's Mac and signed with their own certificate (CSC_NAME,
// the one the gradebook and OneEditor use), so every installed MicroLab on a Mac takes the next version by itself.
// Windows is built by the Release workflow. (M11, Rev 13; as OneEditor's scripts/release-mac.ts.)
//
//   npm run release:mac            build both Macs here and add them to the draft release
//   npm run release:mac -- --dry   build only, and list what would be added
//
// First push the tag (vX.Y.Z on the merge into main): the Release workflow makes the draft in the releases repo
// (codingspacekh/microlab-releases: installers only — the code stays private) and adds Windows. This adds the Mac
// installers, their zips (what the updater downloads) and one latest-mac.yml for both chips. Nothing reaches a laptop
// until the draft is published. Settings are read from ~/.microlab/release.env when it is there (CSC_NAME=…;
// MICROLAB_RELEASES_REPO=… to use another repo); kept on this Mac, never in the project; anything already set wins.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dump, load } from 'js-yaml';   // js-yaml 5: named exports only (its default went)
import { mergeMacFeeds, type Feed } from '../src/lib/updates/index.ts';
import { feedUrl, macFeedName, RELEASES_REPO } from './lib/package.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const dry = process.argv.includes('--dry');
const stop = (message: string): never => {
  console.error(`\n${message}`);
  process.exit(1);
};
const run = (file: string, args: string[]) => execFileSync(file, args, { cwd: root, stdio: 'inherit', env: process.env });
const read = (file: string, args: string[]) => execFileSync(file, args, { cwd: root, encoding: 'utf8' }).trim();

if (process.platform !== 'darwin') stop('Run this on the Mac that has the certificate.');

const settings = join(homedir(), '.microlab', 'release.env');
if (existsSync(settings)) {
  for (const line of readFileSync(settings, 'utf8').split('\n')) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!;
  }
}
if (!process.env.CSC_NAME) stop(`CSC_NAME is not set: name the certificate (e.g. CSC_NAME=ZISPP Gradebook in ${settings}).`);

const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };
const tag = `v${version}`;
const repo = process.env.MICROLAB_RELEASES_REPO || RELEASES_REPO;
process.env.MICROLAB_UPDATE_URL ||= feedUrl(repo);

// files git doesn't track (a screenshot in issues/) are never in a build: only changes to tracked ones stop it
if (read('git', ['status', '--porcelain', '--untracked-files=no'])) stop('There are changes not committed: commit them first.');
if (!read('git', ['tag', '--points-at', 'HEAD']).split('\n').includes(tag)) stop(`HEAD is not ${tag}: check out the release's tag first.`);
if (!dry) {
  const draft = read('gh', ['release', 'view', tag, '--repo', repo, '--json', 'isDraft', '--jq', '.isDraft']);
  if (draft !== 'true') stop(`${tag} is not a draft release in ${repo} (push the tag first; never add to a published one).`);
}

console.log(`MicroLab ${version}: both Macs, signed as "${process.env.CSC_NAME}", updates from ${process.env.MICROLAB_UPDATE_URL}`);
run('npm', ['run', 'build']);
for (const arch of ['arm64', 'x64']) run(process.execPath, ['scripts/package.ts', '--arch', arch]);

const release = join(root, 'release');
const feeds = ['arm64', 'x64'].map((arch) => load(readFileSync(join(release, macFeedName(arch)), 'utf8')) as Feed);
if (feeds.some((f) => f.version !== version)) stop('A Mac feed is not for this version.');
writeFileSync(join(release, 'latest-mac.yml'), dump(mergeMacFeeds(feeds), { lineWidth: -1 }));

const files = [
  ...['arm64', 'x64'].flatMap((arch) => ['dmg', 'zip', 'dmg.blockmap', 'zip.blockmap'].map((ext) => `MicroLab-${version}-mac-${arch}.${ext}`)),
  'latest-mac.yml',
].filter((f) => existsSync(join(release, f)));
console.log(`\n${dry ? 'Would add' : 'Adding'} to the draft ${tag} in ${repo}:\n  ${files.join('\n  ')}`);
if (dry) process.exit(0);
run('gh', ['release', 'upload', tag, '--repo', repo, '--clobber', ...files.map((f) => join(release, f))]);
console.log(`\nDone. Check the draft ${tag} in ${repo} (Windows comes from the Release workflow), then publish it:`
  + ' every installed MicroLab sees it within 6 hours, or at its next start.');
