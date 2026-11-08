import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBoard } from '@lib/boards';
import { buildFor, filesFor, parsePack } from '@lib/libpack';
import { parseProject, toCircuit } from '@lib/project';
import json from '../../library/lib-pack/pack.json';
import { VirtualClock } from '../../src/sim/clock';
import { runProject } from '../../src/sim/run';
import { nodeLoader } from './vm';

/**
 * M6.7 (F-54): every library of the pack, as its authors wrote it, runs its "how to start" on each board it lists,
 * against the part it is for — wired as that part's example is (library/examples/<example>/<board>/project.json).
 */
const pack = parsePack(json);
const ROOT = join(process.cwd(), 'library/lib-pack');

/** The example whose circuit each library runs in, the part's inputs (s, values) and what the program prints. */
const CASES: Record<string, { example: string; part: string; inputs: [number, Record<string, number>][]; seconds: number; prints: (out: string[]) => void }> = {
  // the driver takes 29.1 µs a cm one way (sound at 343.6 m/s); the sim's echo is 58 µs a cm there and back
  hcsr04: { example: 'too-close', part: 'sonar1', inputs: [[0, { cm: 50 }], [1, { cm: 120 }]], seconds: 2, prints: (o) => {
    expect(Number(o[0]!.split(' ')[0])).toBeCloseTo(50, 0);
    expect(Number(o.at(-1)!.split(' ')[0])).toBeCloseTo(120, -1);
  } },
  bmp280: { example: 'bmp280', part: 'baro1', inputs: [[0, { celsius: 22, hpa: 1015 }]], seconds: 1.5, prints: (o) => {
    const [t, , p] = o[0]!.split(' ');
    expect(Number(t)).toBeCloseTo(22, 1);
    expect(Number(p)).toBeCloseTo(1015, 0);
  } },
  ds1302: { example: 'ds1302', part: 'rtc1', inputs: [], seconds: 2.5, prints: (o) => {
    expect(o.slice(0, 3)).toEqual(['[2026, 11, 8, 7, 8, 59, 58]', '[2026, 11, 8, 7, 8, 59, 59]', '[2026, 11, 8, 7, 9, 0, 0]']);
  } },
  vl53l0x: { example: 'vl53l0x', part: 'tof1', inputs: [[0, { cm: 25 }], [1, { cm: 80 }]], seconds: 2, prints: (o) => {
    expect(o).toContain('250 mm');
    expect(o).toContain('800 mm');
  } },
  mpu6050: { example: 'tilt-alarm', part: 'mpu1', inputs: [[0, { tiltx: 30 }]], seconds: 1, prints: (o) => {
    expect(o[0]).toMatch(/^x 0\.50 y 0\.00 z 0\.87 g 2\d\.\d+$/);
  } },
  rotary: { example: 'rotary-encoder', part: 'enc1', inputs: [[0.2, { steps: 3 }], [0.8, { steps: 1 }]], seconds: 1.5, prints: (o) => {
    // turned clockwise 3 steps, then back 2 (8 ms a step): looked at each 50 ms (the IRQ builds), or each 1 ms (the micro:bit's)
    expect(o.at(-1)).toBe('value 1');
    expect(o).toContain('value 3');
    expect(o.filter((x) => !['value 1', 'value 2', 'value 3'].includes(x))).toEqual([]);
  } },
  max30102: { example: 'heart-rate', part: 'pulse1', inputs: [[0, { bpm: 80, spo2: 96 }]], seconds: 2, prints: (o) => {
    const ir = o.map((l) => Number(l.split(' ')[1]));
    expect(ir.length).toBeGreaterThan(50);
    expect(Math.max(...ir) - Math.min(...ir)).toBeGreaterThan(200);   // the pulse in the light
  } },
};

const runs = pack.libraries.flatMap((l) => l.builds.flatMap((b) => b.boards.map((board) => [l.id, board] as const)));

describe('M6.7 the library pack runs against the parts', () => {
  it('every library has a case', () => expect(Object.keys(CASES).sort()).toEqual(pack.libraries.map((l) => l.id).sort()));

  it.each(runs)('%s on %s', async (id, board) => {
    const lib = pack.libraries.find((l) => l.id === id)!;
    const c = CASES[id]!;
    const dir = join(process.cwd(), 'library/examples', c.example, board);
    const project = parseProject(JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8')));
    const data = parseBoard(JSON.parse(readFileSync(join(process.cwd(), 'library/boards', board, 'board.json'), 'utf8')));
    const files = Object.fromEntries(filesFor(lib, board).map(([from, to]) => [to, readFileSync(join(ROOT, from), 'utf8')]));
    const r = await runProject(await nodeLoader(), {
      board, circuit: toCircuit(project, data), files: { ...files, 'main.py': buildFor(lib, board)!.use[board]! }, clock: new VirtualClock(),
      partInputs: c.inputs.map(([at, v]) => ({ atUs: Math.round(at * 1e6), part: c.part, ...v })), maxUs: c.seconds * 1e6,
    });
    expect(r.error).toBeUndefined();
    expect(r.faults).toEqual([]);
    c.prints(r.output.trim().split('\n').filter((l) => !l.startsWith('MicroPython') && l.trim()));
  }, 30_000);
});
