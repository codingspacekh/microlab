import { describe, expect, it } from 'vitest';
import { parseBoard } from '@lib/boards';
import type { CircuitSpec, PartSpec } from '@lib/circuit';
import picoJson from '../../../library/boards/pico-w/board.json';
import { CircuitHost } from '../../../src/sim/circuit';
import { PinBank } from '../../../src/sim/pins';

/** M3 slice 3: PWM by its average over the on and off states (§1.7), so an LED on 50 % glows at half its current. */
const pico = parseBoard(picoJson);
const within = (got: number, want: number, rel = 0.01) => expect(Math.abs(got - want)).toBeLessThanOrEqual(Math.abs(want) * rel);

function host(parts: PartSpec[], wires: [string, string][]) {
  const spec: CircuitSpec = {
    board: { data: pico }, breadboards: [{ id: 'bb1', size: 'half' }], parts,
    wires: wires.map(([a, b], i) => ({ id: `w${i}`, a, b })),
  };
  const pins = new PinBank();
  const h = new CircuitHost(spec, pins, () => 0);
  pins.attach(h);
  return { pins, h };
}

const ledOn = (pin: string, col: number, ohms = 220): [PartSpec[], [string, string][]] => [[
  { id: `r${col}`, type: 'resistor', props: { ohms }, legs: { a: `bb1.a${col}`, b: `bb1.a${col + 2}` } },
  { id: `led${col}`, type: 'led', props: { color: 'red' }, legs: { a: `bb1.b${col + 2}`, k: `bb1.b${col + 4}` } },
], [[`board.${pin}`, `bb1.e${col}`], ['board.GND', `bb1.e${col + 4}`]]];

describe('M3.3 PWM is the average over its on and off states', () => {
  it('an LED on 50 % carries half its full current (on DC-average it would be dark: 1.65 V < 2.0 V)', () => {
    const [parts, wires] = ledOn('GP15', 5);
    const { pins, h } = host(parts, wires);
    pins.configure('15', 'out', 'none', 1);
    h.update();
    const full = h.amps('led5');
    within(full, (3.3 - 2.0) / 221, 0.02);
    pins.setPwm('15', 1000, 0.5);
    h.update();
    within(h.amps('led5'), full * 0.5);
    pins.setPwm('15', 1000, 0.25);
    h.update();
    within(h.amps('led5'), full * 0.25);
  });

  it('two PWM pins (two LEDs) are averaged independently', () => {
    const [p1, w1] = ledOn('GP15', 5);
    const [p2, w2] = ledOn('GP16', 15);
    const { pins, h } = host([...p1, ...p2], [...w1, ...w2]);
    pins.setPwm('15', 1000, 0.5);
    pins.setPwm('16', 1000, 0.1);
    h.update();
    within(h.amps('led5'), 0.5 * (3.3 - 2.0) / 221, 0.03);
    within(h.amps('led15'), 0.1 * (3.3 - 2.0) / 221, 0.03);
  });

  it('a pin voltage read back is the average too (a resistor to GND: half of 3.3 V at 50 %)', () => {
    const { pins, h } = host([{ id: 'r1', type: 'resistor', props: { ohms: 1000 }, legs: { a: 'bb1.a5', b: 'bb1.a8' } }], [['board.GP15', 'bb1.e5'], ['board.GND', 'bb1.e8']]);
    pins.setPwm('15', 1000, 0.5);
    within(h.volts('15'), 1.65, 0.02);
  });

  it('faults look at the peaks: an LED with no resistor on 10 % PWM still burns', () => {
    const { pins, h } = host([{ id: 'led1', type: 'led', props: { color: 'red' }, legs: { a: 'bb1.a5', k: 'bb1.a7' } }], [['board.GP15', 'bb1.e5'], ['board.GND', 'bb1.e7']]);
    pins.setPwm('15', 1000, 0.1);
    h.update();
    expect(h.faults.map((f) => `${f.kind} ${f.on}`)).toContain('led-burnt led1');
  });

  it('0 % and 100 % are plain off and on (one solve)', () => {
    const [parts, wires] = ledOn('GP15', 5);
    const { pins, h } = host(parts, wires);
    pins.setPwm('15', 1000, 0);
    h.update();
    expect(h.amps('led5')).toBeLessThan(1e-6);
    pins.setPwm('15', 1000, 1);
    h.update();
    within(h.amps('led5'), (3.3 - 2.0) / 221, 0.02);
  });
});

describe('M3.4 part states for the window', () => {
  it('an LED\'s state: its current and brightness (current / its 20 mA rating), changes traced', () => {
    let t = 0;
    const [parts, wires] = ledOn('GP15', 5);
    const spec: CircuitSpec = { board: { data: pico }, breadboards: [{ id: 'bb1', size: 'half' }], parts, wires: wires.map(([a, b], i) => ({ id: `w${i}`, a, b })) };
    const pins = new PinBank();
    const h = new CircuitHost(spec, pins, () => t);
    pins.attach(h);
    pins.configure('15', 'out', 'none', 1);
    h.update();
    t = 500_000;
    pins.write('15', 0);
    h.update();
    expect(h.partTrace.map(([at, id, v]) => [at, id, v.kind === 'led' ? Math.round(v.brightness * 100) : -1])).toEqual([[0, 'led5', 29], [500_000, 'led5', 0]]);
  });

  it('a servo: its angle from the pulse width (0.5 ms = 0°, 2.5 ms = 180°) when it has its 5 V', () => {
    const spec: CircuitSpec = {
      board: { data: pico }, breadboards: [{ id: 'bb1', size: 'half' }],
      parts: [{ id: 's1', type: 'servo', legs: { gnd: 'bb1.a5', vcc: 'bb1.a6', signal: 'bb1.a7' } }],
      wires: [{ id: 'w1', a: 'board.GND', b: 'bb1.e5' }, { id: 'w2', a: 'board.VBUS', b: 'bb1.e6' }, { id: 'w3', a: 'board.GP16', b: 'bb1.e7' }],
    };
    let t = 0;
    const pins = new PinBank();
    const h = new CircuitHost(spec, pins, () => t);
    pins.attach(h);
    pins.setPwm('16', 50, 1500 / 20000);   // 1.5 ms of 20 ms
    expect(h.partStates()['s1']).toEqual({ kind: 'servo', angle: 90, powered: true, pulseUs: 1500 });
    pins.setPwm('16', 50, 500 / 20000);
    // M7: it turns there at its speed, 60° in 0.1 s — not at once
    expect(h.partStates()['s1']).toMatchObject({ angle: 90 });
    t = 100_000;
    expect(h.partStates()['s1']).toMatchObject({ angle: 30 });
    t = 200_000;
    expect(h.partStates()['s1']).toMatchObject({ angle: 0 });
  });

  it('a servo on 3V3 has no power to move (it keeps its angle)', () => {
    const spec: CircuitSpec = {
      board: { data: pico }, breadboards: [{ id: 'bb1', size: 'half' }],
      parts: [{ id: 's1', type: 'servo', legs: { gnd: 'bb1.a5', vcc: 'bb1.a6', signal: 'bb1.a7' } }],
      wires: [{ id: 'w1', a: 'board.GND', b: 'bb1.e5' }, { id: 'w2', a: 'board.3V3', b: 'bb1.e6' }, { id: 'w3', a: 'board.GP16', b: 'bb1.e7' }],
    };
    const pins = new PinBank();
    const h = new CircuitHost(spec, pins, () => 0);
    pins.attach(h);
    pins.setPwm('16', 50, 2500 / 20000);
    expect(h.partStates()['s1']).toMatchObject({ powered: false, angle: 90 });   // where a servo rests here: the middle
  });
});

