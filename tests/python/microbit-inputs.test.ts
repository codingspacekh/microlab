import { describe, expect, it } from 'vitest';
import { parseBoard } from '@lib/boards';
import type { CircuitSpec } from '@lib/circuit';
import mbitJson from '../../library/boards/microbit-v2/board.json';
import { VirtualClock } from '../../src/sim/clock';
import { Control } from '../../src/sim/control';
import { runProject, type RunResult } from '../../src/sim/run';
import { nodeLoader } from './vm';

/**
 * M6.6 (F-35, screen 06): the micro:bit's own inputs set from the window while a program runs — buttons A and B (the
 * board's own parts, board.A / board.B), the touch logo (touch:LOGO), its tilt in mg and a shake, the temperature
 * sensor, the light level (0–255, read through the display), and the microphone's sound level (0–255) with its loud
 * and quiet events (micropython-microbit-v2's `microphone`, `SoundEvent`).
 */
const SLOTS = ['pressed:board.A', 'pressed:board.B', 'touch:LOGO', 'board:accelx', 'board:accely', 'board:shake', 'board:celsius', 'board:light', 'board:sound'];
const board: CircuitSpec = { board: { data: parseBoard(mbitJson) }, breadboards: [], parts: [], wires: [] };

/** Runs `main` with the window's slots set as `start` says; `atSleep(n, set)` changes them at the program's n-th sleep. */
async function run(main: string, start: Record<string, number> = {}, atSleep?: (n: number, set: (name: string, v: number) => void) => void): Promise<RunResult> {
  const control = new Control(SLOTS);
  for (const [k, v] of Object.entries(start)) control.setInput(k, v);
  let n = 0;
  return runProject(await nodeLoader(), {
    board: 'microbit-v2', files: { 'main.py': main }, clock: new VirtualClock(), circuit: board, control,
    onSleep: () => atSleep?.(++n, (name, v) => control.setInput(name, v)),
  });
}
const lines = (r: RunResult) => r.output.trim().split('\n');

describe('M6.6 the micro:bit\'s inputs from the window', () => {
  it('buttons A and B, held: is_pressed; the logo touched: is_touched', async () => {
    const r = await run('from microbit import *\nprint(button_a.is_pressed(), button_b.is_pressed(), pin_logo.is_touched())\n',
      { 'pressed:board.A': 1, 'touch:LOGO': 1 });
    expect(lines(r)).toEqual(['True False True']);
  });

  it('tilted: x and y as set (mg), z what is left of 1 g, face up; a shake is a gesture', async () => {
    const r = await run([
      'from microbit import *', 'print(accelerometer.get_x(), accelerometer.get_y(), accelerometer.get_z())',
      'sleep(100)', 'sleep(100)', "print(accelerometer.was_gesture('shake'))", '',
    ].join('\n'), { 'board:accelx': 300, 'board:accely': -200 }, (n, set) => { if (n === 1) set('board:shake', 1); });
    expect(lines(r)).toEqual(['300 -200 -958', 'True']);   // −√(1024² − 300² − 200²)
  });

  it('the temperature and the light level as set', async () => {
    const r = await run('from microbit import *\nprint(temperature(), display.read_light_level())\n', { 'board:celsius': 31, 'board:light': 200 });
    expect(lines(r)).toEqual(['31 200']);
  });

  it('the microphone: its sound level; loud past 150, quiet again under 75', async () => {
    const r = await run([
      'from microbit import *', 'print(microphone.sound_level())', 'sleep(100)',
      'print(microphone.sound_level(), microphone.was_event(SoundEvent.LOUD))', 'sleep(100)',
      'print(microphone.current_event() == SoundEvent.QUIET, microphone.get_events())', '',
    ].join('\n'), { 'board:sound': 40 }, (n, set) => { if (n === 1) set('board:sound', 200); if (n === 2) set('board:sound', 20); });
    // was_event clears the history (its docs), so get_events has the quiet one only
    expect(lines(r)).toEqual(['40', '200 True', "True (SoundEvent('quiet'),)"]);
  });
});
