import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PRELUDE, pyBytes } from '@lib/repl';
import { VirtualClock } from '../../src/sim/clock';
import { runProject } from '../../src/sim/run';
import { nodeLoader } from './vm';

/**
 * M10.3 Q15: the helpers Send to board puts on a board (files.ts PRELUDE) are plain MicroPython — run here on
 * MicroLab's own MicroPython, as the Pico W's and the micro:bit's, with the same calls files.ts makes. FakeBoard
 * answers these calls the same way (tests/unit/repl/files.test.ts).
 */
const data = Uint8Array.from([104, 105, 0, 39, 92, 255]);
const calls = [
  "_mlo('a.mlab-part')",
  `_mlc(${pyBytes(data.subarray(0, 4))})`,
  `_mlc(${pyBytes(data.subarray(4))})`,
  '_mlx()',
  "_mlh('a.mlab-part')",
  "_mlmv('a.mlab-part','a.bin')",
  "_mlr('a.bin')",
  "_mlrm('not-there.py')",
  "_mlls('')",
  // the way without binascii (a board that has none): the same hex
  '_mlhy=None',
  "_mlr('a.bin')",
];

async function run(board: 'pico-w' | 'microbit-v2', files: Record<string, string>) {
  const r = await runProject(await nodeLoader(), {
    board, files: { ...files, 'main.py': `${PRELUDE}${calls.join('\n')}\n` }, clock: new VirtualClock(), maxUs: 5e6,
  });
  expect(r.error).toBeUndefined();
  return r.output.split(/\r?\n/).filter(Boolean);
}

describe('M10.3 Q15 the board helpers on MicroPython', () => {
  it('on the Pico W: written in pieces, checksummed, renamed over, read back, listed with folders', async () => {
    const out = await run('pico-w', { 'lib/x.py': 'x = 1\n' });
    expect(out[0]).toBe(createHash('sha256').update(data).digest('hex'));
    expect(out[1]).toBe('686900275cff');
    expect(out).toContain('F 6 a.bin');
    expect(out).toContain('D lib');
    expect(out).toContain('F 6 lib/x.py');
    expect(out.some((l) => l.includes('mlab-part'))).toBe(false);
    expect(out.at(-1)).toBe('686900275cff');
  }, 20_000);

  it('as the micro:bit (no os.rename): put in place by copying, the part file gone', async () => {
    const out = await run('microbit-v2', {});
    expect(out[1]).toBe('686900275cff');
    expect(out).toContain('F 6 a.bin');
    expect(out.some((l) => l.includes('mlab-part'))).toBe(false);
  }, 20_000);
});
