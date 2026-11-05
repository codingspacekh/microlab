import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VirtualClock } from '../../src/sim/clock';
import { runProject, type SimBoard } from '../../src/sim/run';
import { nodeLoader } from './vm';

/** M2.9 (N-01): every golden snippet prints in the sim exactly what the real board printed (tests/golden/README.md).
 *  Snippets not yet recorded are skipped. */
const root = join(process.cwd(), 'tests/golden');
const boards: SimBoard[] = ['pico-w', 'esp32-devkit-v1', 'microbit-v2'];

describe.each(boards)('golden %s', (board) => {
  const dir = join(root, board);
  const snippets = readdirSync(dir).filter((f) => f.endsWith('.py')).sort();
  it('has snippets', () => expect(snippets.length).toBeGreaterThan(0));
  for (const file of snippets) {
    const recorded = join(dir, file.replace(/\.py$/, '.txt'));
    const test = existsSync(recorded) ? it : it.skip;
    test(file, async () => {
      const r = await runProject(await nodeLoader(), { board, files: { 'main.py': readFileSync(join(dir, file), 'utf8') }, clock: new VirtualClock() });
      expect(r.output).toBe(readFileSync(recorded, 'utf8'));
    }, 20_000);
  }
});

describe('golden snippets run in the sim without crashing (before they are recorded)', () => {
  for (const board of boards) {
    for (const file of readdirSync(join(root, board)).filter((f) => f.endsWith('.py')).sort()) {
      it(`${board}/${file}`, async () => {
        const r = await runProject(await nodeLoader(), { board, files: { 'main.py': readFileSync(join(root, board, file), 'utf8') }, clock: new VirtualClock() });
        expect(r.ended).toBe('done');
        expect(r.output.length).toBeGreaterThan(0);
      }, 20_000);
    }
  }
});
