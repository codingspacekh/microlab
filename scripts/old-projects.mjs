#!/usr/bin/env node
// N-09 (M11.5): projects saved by each released MicroLab, kept as test fixtures that are never rewritten —
// tests/fixtures/projects/saved-by/<tag>/<board>.mlab. For each version tag (v0.4.0, M4's walking skeleton, onwards),
// that version's code is checked out on its own (a git worktree in the computer's temp folder), scripts/old-projects/
// make.ts is bundled against ITS src/lib (rolldown, as Vite), and run: the project is made and saved by that version.
// A tag already done is left as it is. `npm run old-projects` (all), or name tags: `npm run old-projects -- v0.7.0`.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const root = join(import.meta.dirname, '..');
const fixtures = join(root, 'tests/fixtures/projects/saved-by');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

const released = git('tag', '--list', 'v0.*.0').split('\n')
  .filter((t) => Number(t.split('.')[1]) >= 4)
  .sort((a, b) => Number(a.split('.')[1]) - Number(b.split('.')[1]));
const tags = process.argv.slice(2).length ? process.argv.slice(2) : released;

for (const tag of tags) {
  const dest = join(fixtures, tag);
  if (existsSync(dest)) { console.log(`${tag}: kept (already made)`); continue; }
  const work = mkdtempSync(join(tmpdir(), `microlab-${tag}-`));
  try {
    git('worktree', 'add', '--detach', work, tag);
    symlinkSync(join(root, 'node_modules'), join(work, 'node_modules'), 'junction');
    mkdirSync(join(work, 'scripts/old-projects'), { recursive: true });
    copyFileSync(join(root, 'scripts/old-projects/make.ts'), join(work, 'scripts/old-projects/make.ts'));
    const bundle = await rolldown({
      input: join(work, 'scripts/old-projects/make.ts'),
      platform: 'node',
      resolve: { alias: { '@lib': join(work, 'src/lib') } },
      logLevel: 'silent',
    });
    await bundle.write({ file: join(work, 'make.mjs'), format: 'esm' });
    const made = execFileSync(process.execPath, [join(work, 'make.mjs'), dest], { cwd: work, encoding: 'utf8' }).trim();
    writeFileSync(join(dest, 'made.json'), `${JSON.stringify({ tag, commit: git('rev-list', '-n', '1', tag), boards: JSON.parse(made) }, null, 2)}\n`);
    console.log(`${tag}: ${made}`);
  } finally {
    git('worktree', 'remove', '--force', work);
    rmSync(work, { recursive: true, force: true });
  }
}
// what the test reads: every version made, in order
const index = released.filter((t) => existsSync(join(fixtures, t)));
writeFileSync(join(fixtures, 'versions.json'), `${JSON.stringify(index, null, 2)}\n`);
