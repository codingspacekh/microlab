import { describe, expect, it } from 'vitest';
import { parseBoard } from '@lib/boards';
import type { CircuitSpec } from '@lib/circuit';
import picoJson from '../../library/boards/pico-w/board.json';
import { VirtualClock } from '../../src/sim/clock';
import { runProject } from '../../src/sim/run';
import { nodeLoader } from './vm';

/** M11.5 (N-03, N-05): the app's runs keep no record of every change. Every output level, PWM and analog change, part
 *  state, display frame, sound, bus message and radio message was kept for the run's result — read by the tests and
 *  the acceptance suite, never by the window, which draws each change as it comes. A fast loop left running grew
 *  without end (40 000 writes a second on a 40-part circuit). With `record: false` (the worker's) the live callbacks
 *  still hear everything; the result's lists stay empty, or keep only the last entries they compare against. */
const LED_ON_GP15: CircuitSpec = {
  board: { data: parseBoard(picoJson) },
  breadboards: [{ id: 'bb1', size: 'half' }],
  parts: [
    { id: 'r1', type: 'resistor', props: { ohms: 220 }, legs: { a: 'bb1.a5', b: 'bb1.a8' } },
    { id: 'led1', type: 'led', props: { color: 'red' }, legs: { a: 'bb1.b8', k: 'bb1.b10' } },
  ],
  wires: [{ id: 'w1', a: 'board.GP15', b: 'bb1.e5' }, { id: 'w2', a: 'board.GND@38', b: 'bb1.e10' }],
};
const TOGGLES = 'from machine import Pin, PWM, ADC\np = Pin(15, Pin.OUT)\nfor i in range(2000):\n    p.toggle()\nprint("done")\n';

async function run(record?: boolean) {
  const levels: number[] = [];
  const parts: unknown[] = [];
  const r = await runProject(await nodeLoader(), {
    board: 'pico-w', files: { 'main.py': TOGGLES }, clock: new VirtualClock(), circuit: LED_ON_GP15,
    onPin: (_pin, level) => levels.push(level), onParts: (e) => parts.push(e),
    ...(record === undefined ? {} : { record }),
  });
  return { r, levels, parts };
}

describe('M11.5 a run records every change only when asked', () => {
  it('by default (the tests, the acceptance suite): every level change and part state is in the result', async () => {
    const { r, levels } = await run();
    expect(r.output).toBe('done\n');
    expect(r.trace).toHaveLength(2000);
    expect(r.parts.length).toBeGreaterThan(0);
    expect(levels).toHaveLength(2000);
  });

  it('record: false (the app): the window still hears every change as it comes, and the result keeps none of them', async () => {
    const { r, levels, parts } = await run(false);
    expect(r.output).toBe('done\n');
    expect(levels).toHaveLength(2000);
    expect(parts.length).toBeGreaterThan(0);
    expect(r.trace).toEqual([]);
    expect(r.pwm).toEqual([]);
    expect(r.analog).toEqual([]);
    expect(r.parts).toEqual([]);
  });

  it('record: false on the micro:bit: 60 display frames and notes are all heard, the result keeps at most the last two', async () => {
    const frames: string[] = [];
    const notes: number[] = [];
    const r = await runProject(await nodeLoader(), {
      board: 'microbit-v2', clock: new VirtualClock(), record: false,
      files: { 'main.py': 'from microbit import *\nimport music\nfor i in range(60):\n    display.set_pixel(i % 5, (i // 5) % 5, 9 if i % 2 else 3)\n    music.pitch(200 + i * 10, wait=False)\n' },
      onDisplay: (p) => frames.push(p), onSound: (hz) => notes.push(hz),
    });
    expect(frames.length).toBeGreaterThanOrEqual(55);
    expect(notes.length).toBeGreaterThanOrEqual(55);
    expect(r.display.length).toBeLessThanOrEqual(2);
    expect(r.sound.length).toBeLessThanOrEqual(2);
  });
});
