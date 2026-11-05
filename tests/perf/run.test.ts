import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBoard } from '@lib/boards';
import { parseProject, toCircuit } from '@lib/project';
import { runProject } from '../../src/sim/run';
import { nodeLoader } from '../python/vm';

/** M3 gate: on the Blink circuit, a tight led.toggle() loop does ≥ 10 000 pin writes a second (writes are not
 *  solved one by one: M3.md, finding 1). */
const dir = join(process.cwd(), 'library/examples/blink/pico-w');
const project = parseProject(JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8')));
const circuit = toCircuit(project, parseBoard(JSON.parse(readFileSync(join(process.cwd(), 'library/boards/pico-w/board.json'), 'utf8'))));

async function timed(n: number) {
  const t = performance.now();
  const r = await runProject(await nodeLoader(), { board: 'pico-w', circuit, files: { 'main.py': `from machine import Pin\nled = Pin(15, Pin.OUT)\nfor i in range(${n}):\n    led.toggle()\n` } });
  expect(r.ended).toBe('done');
  return performance.now() - t;
}

describe('M3 perf', () => {
  it('a tight led.toggle() loop on the Blink circuit does ≥ 10 000 pin writes a second', async () => {
    await timed(10);   // warm up
    const base = await timed(0);
    const n = 50_000;
    const ms = Math.max(1, (await timed(n)) - base);
    const perSecond = Math.round((n / ms) * 1000);
    console.log(`pin writes on the Blink circuit: ${perSecond} a second`);
    expect(perSecond).toBeGreaterThanOrEqual(10_000);
  }, 60_000);
});
