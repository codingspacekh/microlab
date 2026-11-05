// Records the golden outputs from a real board (M2.9; tests/golden/README.md).
// Run: npm run golden -- --board pico-w [--port <port>]
import { spawnSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const board = arg('board');
const port = arg('port') ?? 'auto';
const boards = ['pico-w', 'esp32-devkit-v1', 'microbit-v2'];
if (!boards.includes(board)) {
  console.error(`usage: npm run golden -- --board ${boards.join('|')} [--port <port>]`);
  process.exit(2);
}
const dir = join(root, 'tests/golden', board);
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const mpremote = (...args) => spawnSync('mpremote', ['connect', port, ...args], { encoding: 'utf8', timeout: 60_000 });

const check = spawnSync('mpremote', ['--version'], { encoding: 'utf8' });
if (check.error) {
  console.error('mpremote not found: pip install mpremote');
  process.exit(2);
}
for (const file of readdirSync(dir).filter((f) => f.endsWith('.py')).sort()) {
  mpremote('reset');   // a hard reset: every pin as after power-on
  sleep(board === 'esp32-devkit-v1' ? 3000 : 2000);
  const r = mpremote('run', join(dir, file));
  const out = (r.stdout ?? '').replace(/\r\n/g, '\n');
  writeFileSync(join(dir, file.replace(/\.py$/, '.txt')), out);
  console.log(`${board}/${file}: ${out.split('\n').length - 1} lines${r.status ? ` (mpremote exit ${r.status}: ${r.stderr.trim()})` : ''}`);
}
