import { describe, expect, it } from 'vitest';
import { parseBoard } from '@lib/boards';
import type { CircuitSpec, PartSpec } from '@lib/circuit';
import picoJson from '../../library/boards/pico-w/board.json';
import espJson from '../../library/boards/esp32-devkit-v1/board.json';
import mbitJson from '../../library/boards/microbit-v2/board.json';
import { VirtualClock } from '../../src/sim/clock';
import type { PartView } from '../../src/sim/circuit';
import { runProject, type RunResult, type SimBoard } from '../../src/sim/run';
import { nodeLoader } from './vm';

/** M7 slice 1 (screens 25, 25b, 25c), F-33: the actuators driven by MicroPython — a servo turning at its speed, a
 *  motor through its driver at the PWM's speed, a relay switching a pump, a stepper counting its half steps, the kit's
 *  passive buzzer module playing the PWM's note, and a motor straight on a pin damaging it. */
const DATA = { 'pico-w': parseBoard(picoJson), 'esp32-devkit-v1': parseBoard(espJson), 'microbit-v2': parseBoard(mbitJson) } as const;
const spec = (board: SimBoard, parts: PartSpec[], wires: [string, string][]): CircuitSpec => ({
  board: { data: DATA[board as keyof typeof DATA] }, breadboards: [{ id: 'bb1', size: 'half' }], parts,
  wires: wires.map(([a, b], i) => ({ id: `w${i + 1}`, a, b })),
});
const run = async (board: SimBoard, circuit: CircuitSpec, main: string): Promise<RunResult> =>
  runProject(await nodeLoader(), { board, files: { 'main.py': main }, clock: new VirtualClock(), circuit, maxUs: 5e6 });
function at(r: RunResult, id: string, s: number): PartView | undefined {
  let v: PartView | undefined;
  for (const [t, pid, view] of r.parts) if (pid === id && t <= s * 1e6) v = view;
  return v;
}
const py = (...lines: string[]) => `${lines.join('\n')}\n`;

const SERVO: PartSpec = { id: 's1', type: 'servo', legs: { signal: 'bb1.a2', vcc: 'bb1.a3', gnd: 'bb1.a4' } };

describe('M7 the SG90 turns to its pulses, at its speed', () => {
  it('Pico W: 0.5 ms → 0°, reached in ≈ 0.15 s from the middle; 2.5 ms → 180°; it draws ≈ 200 mA while it turns', async () => {
    const r = await run('pico-w', spec('pico-w', [SERVO], [['board.GP16', 'bb1.e2'], ['board.VBUS', 'bb1.e3'], ['board.GND', 'bb1.e4']]), py(
      'from machine import Pin, PWM', 'import time',
      's = PWM(Pin(16), freq=50)', 's.duty_ns(500_000)', 'time.sleep(0.5)', 's.duty_ns(2_500_000)', 'time.sleep(0.5)',
    ));
    expect(at(r, 's1', 0.05)).toMatchObject({ kind: 'servo', powered: true, pulseUs: 500 });
    expect((at(r, 's1', 0.05) as { angle: number }).angle).toBeGreaterThan(40);
    expect((at(r, 's1', 0.05) as { angle: number }).angle).toBeLessThan(80);
    expect(at(r, 's1', 0.3)).toMatchObject({ angle: 0 });
    expect((at(r, 's1', 0.6) as { angle: number }).angle).toBeLessThan(100);   // 180° takes 0.3 s
    expect(at(r, 's1', 0.95)).toMatchObject({ angle: 180 });
    expect(r.faults).toEqual([]);
  });

  it('micro:bit on its GPIO board\'s 5V: write_analog at 20 ms', async () => {
    const r = await run('microbit-v2', spec('microbit-v2', [SERVO], [['board.P0', 'bb1.e2'], ['board.5V', 'bb1.e3'], ['board.GND', 'bb1.e4']]), py(
      'from microbit import *', 'pin0.write_analog(128)', 'sleep(500)',
    ));
    expect(at(r, 's1', 0.45)).toMatchObject({ angle: 180, powered: true });
  });

  it('ESP32 on VIN: duty_u16 at 50 Hz', async () => {
    const r = await run('esp32-devkit-v1', spec('esp32-devkit-v1', [SERVO], [['board.D13', 'bb1.e2'], ['board.VIN', 'bb1.e3'], ['board.GND', 'bb1.e4']]), py(
      'from machine import Pin, PWM', 'import time', 's = PWM(Pin(13), freq=50, duty_u16=1638)', 'time.sleep(0.5)',
    ));
    expect(at(r, 's1', 0.45)).toMatchObject({ angle: 0, powered: true });
  });

  it('on 3V3 (screen 25c): a warning, it doesn\'t turn, the program goes on', async () => {
    const r = await run('pico-w', spec('pico-w', [SERVO], [['board.GP16', 'bb1.e2'], ['board.3V3', 'bb1.e3'], ['board.GND', 'bb1.e4']]), py(
      'from machine import Pin, PWM', 'import time', 's = PWM(Pin(16), freq=50)', 's.duty_ns(2_000_000)', 'time.sleep(0.4)', 'print("done")',
    ));
    expect(at(r, 's1', 0.3)).toMatchObject({ angle: 90, powered: false });
    expect(r.faults.map((f) => `${f.kind} ${f.on}`)).toEqual(['servo-underpowered s1']);
    expect(r.ended).toBe('done');
  });
});

const L9110S: PartSpec[] = [
  { id: 'drv1', type: 'l9110s', legs: { 'b-ia': 'bb1.f8', 'b-ib': 'bb1.f9', gnd: 'bb1.f10', vcc: 'bb1.f11', 'a-ia': 'bb1.f12', 'a-ib': 'bb1.f13' } },
  { id: 'motor1', type: 'motor', legs: {} },
];
const L9110S_WIRES: [string, string][] = [['board.GND', 'bb1.j10'], ['board.VBUS', 'bb1.j11'], ['board.GP17', 'bb1.j12'], ['board.GP16', 'bb1.j13'], ['drv1.a1', 'motor1.+'], ['drv1.a2', 'motor1.-']];

describe('M7 a TT motor through an L9110S (screen 25)', () => {
  it('PWM 70 % on A-IA, A-IB low: forward at ≈ 126 rpm; A-IB high: backward at full speed; both low: stopped', async () => {
    const r = await run('pico-w', spec('pico-w', L9110S, L9110S_WIRES), py(
      'from machine import Pin, PWM', 'import time',
      'ia = PWM(Pin(17), freq=1000, duty_u16=45875)', 'ib = Pin(16, Pin.OUT, value=0)', 'time.sleep(0.5)',
      'ia.deinit()', 'ia = Pin(17, Pin.OUT, value=0)', 'ib.on()', 'time.sleep(0.5)', 'ib.off()', 'time.sleep(0.5)',
    ));
    const fwd = at(r, 'motor1', 0.3) as Extract<PartView, { kind: 'motor' }>;
    expect(fwd).toMatchObject({ kind: 'motor', direction: 1 });
    expect(fwd.rpm).toBeGreaterThan(115);
    expect(fwd.rpm).toBeLessThan(130);
    const back = at(r, 'motor1', 0.8) as Extract<PartView, { kind: 'motor' }>;
    expect(back).toMatchObject({ direction: -1 });
    expect(back.rpm).toBeGreaterThan(165);
    expect(back.amps).toBeGreaterThan(0.15);
    expect(at(r, 'motor1', 1.3)).toMatchObject({ rpm: 0, direction: 0 });
    expect(r.faults).toEqual([]);
  });
});

describe('M7 screen 25c: a motor straight on a pin', () => {
  it('Pico W: the pin is damaged as it goes high, the run stops; the message says why and what to do', async () => {
    const r = await run('pico-w', spec('pico-w', [{ id: 'motor1', type: 'motor', legs: {} }], [['board.GP15', 'motor1.+'], ['motor1.-', 'board.GND']]), py(
      'from machine import Pin', 'import time', 'time.sleep(0.2)', 'Pin(15, Pin.OUT).on()', 'time.sleep(1)', 'print("never")',
    ));
    expect(r.ended).toBe('fault');
    expect(r.fault).toMatchObject({ kind: 'motor-on-pin', on: 'GP15', part: 'motor1' });
    expect(r.fault!.message).toMatch(/^GP15: motor1 straight on the pin draws \d+ mA, a pin gives 12 mA at most — drive it through a driver/);
    expect(r.output).not.toContain('never');
  });
});

describe('M7 a relay module switches a pump on a pack of its own (screen 25)', () => {
  const parts: PartSpec[] = [
    { id: 'relay1', type: 'relay', legs: { s: 'bb1.f19', vcc: 'bb1.f20', gnd: 'bb1.f21' } },
    { id: 'pump1', type: 'pump', legs: {} },
    { id: 'bat1', type: 'battery', props: { kind: '4xAA' }, legs: { '+': 'bb1.T+29', '-': 'bb1.T-29' } },
  ];
  const wires: [string, string][] = [['board.GP14', 'bb1.j19'], ['board.VBUS', 'bb1.j20'], ['board.GND', 'bb1.j21'], ['relay1.com', 'bb1.T+26'], ['relay1.no', 'pump1.+'], ['pump1.-', 'bb1.T-25']];
  it('S high: the relay on, the pump running on 6 V (≈ 180 mA from the pack); low: both off', async () => {
    const r = await run('pico-w', spec('pico-w', parts, wires), py(
      'from machine import Pin', 'import time', 'relay = Pin(14, Pin.OUT)', 'relay.on()', 'time.sleep(0.5)', 'relay.off()', 'time.sleep(0.5)',
    ));
    expect(at(r, 'relay1', 0.3)).toEqual({ kind: 'relay', on: true });
    expect(at(r, 'pump1', 0.3)).toMatchObject({ kind: 'pump', running: true });
    expect((at(r, 'pump1', 0.3) as { amps: number }).amps).toBeGreaterThan(0.17);
    expect(at(r, 'relay1', 0.8)).toEqual({ kind: 'relay', on: false });
    expect(at(r, 'pump1', 0.8)).toMatchObject({ running: false, amps: 0 });
    expect(r.faults).toEqual([]);
  });
});

describe('M7 a 28BYJ-48 on a ULN2003 (screen 25b)', () => {
  const parts: PartSpec[] = [
    { id: 'uln1', type: 'uln2003', legs: { in1: 'bb1.f4', in2: 'bb1.f5', in3: 'bb1.f6', in4: 'bb1.f7', '-': 'bb1.f8', '+': 'bb1.f9' } },
    { id: 'step1', type: 'stepper', legs: { blue: 'uln1.a', pink: 'uln1.b', yellow: 'uln1.c', orange: 'uln1.d', red: 'uln1.m' } },
  ];
  const wires: [string, string][] = [['board.GP2', 'bb1.j4'], ['board.GP3', 'bb1.j5'], ['board.GP4', 'bb1.j6'], ['board.GP5', 'bb1.j7'], ['board.GND', 'bb1.j8'], ['board.VBUS', 'bb1.j9']];
  const HALF = '[[1,0,0,0],[1,1,0,0],[0,1,0,0],[0,1,1,0],[0,0,1,0],[0,0,1,1],[0,0,0,1],[1,0,0,1]]';
  it('1024 half steps one way: a quarter turn; 512 full steps back (two phases on): 1023 half steps back — from A to DA is half a step', async () => {
    const r = await run('pico-w', spec('pico-w', parts, wires), py(
      'from machine import Pin', 'import time',
      'pins = [Pin(n, Pin.OUT) for n in (2, 3, 4, 5)]', `HALF = ${HALF}`,
      'def go(seq, n):', '    for i in range(n):', '        for p, v in zip(pins, seq[i % len(seq)]):', '            p.value(v)', '        time.sleep_ms(2)',
      'go(HALF, 1025)', 'time.sleep(0.2)',
      'go([[1,0,0,1],[0,0,1,1],[0,1,1,0],[1,1,0,0]], 512)',
    ));
    expect(at(r, 'step1', 2.2)).toMatchObject({ kind: 'stepper', steps: 1024, coils: 'A' });
    expect(at(r, 'step1', 5)).toMatchObject({ steps: 1, coils: 'AB' });
    expect(r.parts.some(([, id, v]) => id === 'uln1:A' && v.kind === 'led' && v.brightness > 0.05)).toBe(true);
    expect(r.faults).toEqual([]);
  }, 30_000);
});

describe('M7 the kit\'s passive buzzer module plays the PWM\'s note', () => {
  it('440 Hz on I/O: A4; duty 0: silent', async () => {
    const r = await run('pico-w', spec('pico-w', [{ id: 'bzm1', type: 'buzzer-module', legs: { io: 'bb1.f20', vcc: 'bb1.f21', gnd: 'bb1.f22' } }],
      [['board.GP12', 'bb1.j20'], ['board.3V3', 'bb1.j21'], ['board.GND', 'bb1.j22']]), py(
      'from machine import Pin, PWM', 'import time', 'b = PWM(Pin(12), freq=440, duty_u16=32768)', 'time.sleep(0.5)', 'b.duty_u16(0)', 'time.sleep(0.3)',
    ));
    expect(at(r, 'bzm1', 0.3)).toMatchObject({ kind: 'buzzer', hz: 440 });
    expect(at(r, 'bzm1', 0.7)).toMatchObject({ hz: 0 });
  });
});

describe('M7 the breadboard power supply gives its rails, apart from the board', () => {
  it('an L298N on its 5 V turns a motor backward; the supply says what it gives', async () => {
    const parts: PartSpec[] = [
      { id: 'psu1', type: 'power-supply', legs: { 't-1': 'bb1.T-1', 't-2': 'bb1.T-2', 't+1': 'bb1.T+1', 't+2': 'bb1.T+2', 'b+1': 'bb1.B+1', 'b+2': 'bb1.B+2', 'b-1': 'bb1.B-1', 'b-2': 'bb1.B-2' } },
      { id: 'l1', type: 'l298n', legs: {} }, { id: 'motor2', type: 'motor', legs: {} },
    ];
    const wires: [string, string][] = [['bb1.T+3', 'l1.12v'], ['bb1.T-4', 'l1.gnd'], ['board.GND', 'bb1.B-3'], ['board.GP17', 'l1.in3'], ['board.GP16', 'l1.in4'], ['l1.out3', 'motor2.+'], ['l1.out4', 'motor2.-']];
    const r = await run('pico-w', spec('pico-w', parts, wires), py(
      'from machine import Pin', 'import time', 'Pin(17, Pin.OUT, value=0)', 'Pin(16, Pin.OUT, value=1)', 'time.sleep(0.3)',
    ));
    const m = at(r, 'motor2', 0.2) as Extract<PartView, { kind: 'motor' }>;
    expect(m.direction).toBe(-1);
    expect(m.rpm).toBeGreaterThan(100);
    expect(m.rpm).toBeLessThan(160);   // the L298N loses ≈ 1–2 V of the 5
    const s = at(r, 'psu1', 0.2) as Extract<PartView, { kind: 'supply' }>;
    expect(s).toMatchObject({ kind: 'supply', on: true, bottom: 0 });
    expect(s.top).toBeGreaterThan(0.09);
  });
});
