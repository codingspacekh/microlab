import { describe, expect, it } from 'vitest';
import { parseBoard } from '@lib/boards';
import type { CircuitSpec, PartSpec, WireSpec } from '@lib/circuit';
import picoJson from '../../library/boards/pico-w/board.json';
import espJson from '../../library/boards/esp32-devkit-v1/board.json';
import mbitJson from '../../library/boards/microbit-v2/board.json';
import { VirtualClock } from '../../src/sim/clock';
import type { PartView } from '../../src/sim/circuit';
import { runProject, type RunResult, type SimBoard } from '../../src/sim/run';
import { nodeLoader } from './vm';

/** M6.2 F-33, F-36: the active and the passive buzzer. Both are piezo buzzers, as a kit wires straight to a pin.
 *  An active buzzer has its own oscillator: with ≥ 2 V from + to − it sounds at its own pitch (≈ 2.3 kHz, as a
 *  TMB12A03 / 3–5 V self-drive piezo), turned round it is silent; it draws ≈ 7 mA at 3.3 V, within every board's safe
 *  pin current. A passive buzzer only sounds with a square wave across it: the pitch is the PWM's frequency, the
 *  loudness from the swing and the duty (a 50 % square wave is the loudest); a steady level is silent. */
const DATA = { 'pico-w': parseBoard(picoJson), 'esp32-devkit-v1': parseBoard(espJson), 'microbit-v2': parseBoard(mbitJson) } as const;

function circuit(board: SimBoard, parts: PartSpec[], wires: WireSpec[]): CircuitSpec {
  return { board: { data: DATA[board as keyof typeof DATA] }, breadboards: [{ id: 'bb1', size: 'half' }], parts, wires };
}
const w = (id: string, a: string, b: string): WireSpec => ({ id, a, b });
const buzzer = (kind: 'active' | 'passive', id = 'bz1', plus = 'bb1.a10', minus = 'bb1.a13'): PartSpec => ({ id, type: 'buzzer', props: { kind }, legs: { '+': plus, '-': minus } });

async function run(board: SimBoard, spec: CircuitSpec, main: string): Promise<RunResult> {
  return runProject(await nodeLoader(), { board, files: { 'main.py': main }, clock: new VirtualClock(), circuit: spec });
}

/** The buzzer's state at `s` seconds. */
function at(r: RunResult, id: string, s: number): PartView | undefined {
  let v: PartView | undefined;
  for (const [t, pid, view] of r.parts) if (pid === id && t <= s * 1e6) v = view;
  return v;
}
const sound = (r: RunResult, id: string, s: number) => {
  const v = at(r, id, s);
  return v?.kind === 'buzzer' ? v : undefined;
};

/** GP15 (or the board's pin) → + ; − → GND. */
const direct = (board: SimBoard, pin: string, kind: 'active' | 'passive') =>
  circuit(board, [buzzer(kind)], [w('w1', `board.${pin}`, 'bb1.e10'), w('w2', board === 'microbit-v2' ? 'board.GND@15' : 'board.GND', 'bb1.e13')]);

describe('M6.2 the active buzzer: on and off', () => {
  it('a pin on: it sounds at its own pitch; off: silent', async () => {
    const r = await run('pico-w', direct('pico-w', 'GP15', 'active'),
      'from machine import Pin\nimport time\nb = Pin(15, Pin.OUT)\nb.on()\ntime.sleep(0.5)\nb.off()\ntime.sleep(0.5)\n');
    expect(sound(r, 'bz1', 0.25)).toEqual({ kind: 'buzzer', hz: 2300, volume: 1 });
    expect(sound(r, 'bz1', 0.75)).toMatchObject({ hz: 0 });
    expect(r.faults).toEqual([]);
  });

  it('turned round (+ to GND): silent', async () => {
    const spec = circuit('pico-w', [buzzer('active')], [w('w1', 'board.GP15', 'bb1.e13'), w('w2', 'board.GND', 'bb1.e10')]);
    const r = await run('pico-w', spec, 'from machine import Pin\nimport time\nPin(15, Pin.OUT).on()\ntime.sleep(0.3)\n');
    expect(sound(r, 'bz1', 0.2)).toMatchObject({ hz: 0 });
  });

  it('within the micro:bit\'s safe pin current (10 mA): no warning', async () => {
    const r = await run('microbit-v2', direct('microbit-v2', 'P0', 'active'), 'from microbit import *\npin0.write_digital(1)\nsleep(300)\n');
    expect(sound(r, 'bz1', 0.2)).toMatchObject({ hz: 2300 });
    expect(r.faults).toEqual([]);
  });
});

describe('M6.2 the passive buzzer: the pitch of the PWM', () => {
  it('PWM 440 Hz at 50 %: A4, at full loudness; duty 0: silent; a steady level: silent', async () => {
    const r = await run('pico-w', direct('pico-w', 'GP15', 'passive'), [
      'from machine import Pin, PWM', 'import time',
      'p = PWM(Pin(15), freq=440, duty_u16=32768)', 'time.sleep(0.5)',
      'p.duty_u16(0)', 'time.sleep(0.5)',
      'p.deinit()', 'Pin(15, Pin.OUT).on()', 'time.sleep(0.5)', '',
    ].join('\n'));
    expect(sound(r, 'bz1', 0.25)).toEqual({ kind: 'buzzer', hz: 440, volume: 1 });
    expect(sound(r, 'bz1', 0.75)).toMatchObject({ hz: 0 });
    expect(sound(r, 'bz1', 1.25)).toMatchObject({ hz: 0 });
  });

  it('a change of frequency is a new note; a 10 % duty is quieter', async () => {
    const r = await run('pico-w', direct('pico-w', 'GP15', 'passive'), [
      'from machine import Pin, PWM', 'import time',
      'p = PWM(Pin(15), freq=262, duty_u16=32768)', 'time.sleep(0.3)',
      'p.freq(392)', 'time.sleep(0.3)',
      'p.duty_u16(6554)', 'time.sleep(0.3)', '',
    ].join('\n'));
    expect(sound(r, 'bz1', 0.2)).toMatchObject({ hz: 262 });
    expect(sound(r, 'bz1', 0.5)).toMatchObject({ hz: 392, volume: 1 });
    const quiet = sound(r, 'bz1', 0.8)!;
    expect(quiet.hz).toBe(392);
    expect(quiet.volume).toBeCloseTo(Math.sin(Math.PI * 0.1), 1);
  });

  it('through a 100 Ω resistor it still sounds', async () => {
    const spec = circuit('pico-w', [buzzer('passive'), { id: 'r1', type: 'resistor', props: { ohms: 100 }, legs: { a: 'bb1.c5', b: 'bb1.c10' } }],
      [w('w1', 'board.GP15', 'bb1.e5'), w('w2', 'board.GND', 'bb1.e13')]);
    const r = await run('pico-w', spec, 'from machine import Pin, PWM\nimport time\nPWM(Pin(15), freq=1000, duty_u16=32768)\ntime.sleep(0.3)\n');
    expect(sound(r, 'bz1', 0.2)).toMatchObject({ hz: 1000 });
  });

  it('the ESP32\'s PWM and the micro:bit\'s music on pin 0', async () => {
    const esp = await run('esp32-devkit-v1', direct('esp32-devkit-v1', 'D15', 'passive'),
      'from machine import Pin, PWM\nimport time\nPWM(Pin(15), freq=880, duty=512)\ntime.sleep(0.3)\n');
    expect(sound(esp, 'bz1', 0.2)).toMatchObject({ hz: 880 });
    const mbit = await run('microbit-v2', direct('microbit-v2', 'P0', 'passive'), 'import music\nmusic.pitch(523, 300)\nsleep(300)\n');
    expect(sound(mbit, 'bz1', 0.15)).toMatchObject({ hz: 523 });
    expect(sound(mbit, 'bz1', 0.45)).toMatchObject({ hz: 0 });
  });

  it('two buzzers on two PWM pins each play their own note', async () => {
    const spec = circuit('pico-w', [buzzer('passive', 'bz1', 'bb1.a10', 'bb1.a13'), buzzer('passive', 'bz2', 'bb1.a20', 'bb1.a23')], [
      w('w1', 'board.GP15', 'bb1.e10'), w('w2', 'board.GND', 'bb1.e13'), w('w3', 'board.GP13', 'bb1.e20'), w('w4', 'board.GND@23', 'bb1.e23'),
    ]);
    const r = await run('pico-w', spec, 'from machine import Pin, PWM\nimport time\nPWM(Pin(15), freq=440, duty_u16=32768)\nPWM(Pin(13), freq=660, duty_u16=32768)\ntime.sleep(0.3)\n');
    expect(sound(r, 'bz1', 0.2)).toMatchObject({ hz: 440 });
    expect(sound(r, 'bz2', 0.2)).toMatchObject({ hz: 660 });
  });
});
