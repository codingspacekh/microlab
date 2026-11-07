import { describe, expect, it } from 'vitest';
import { LED_COLORS, solve, toNetlist } from '@lib/circuit';
import { parseBoard } from '@lib/boards';
import { netlist } from '../../fixtures/circuits/dsl';
import picoJson from '../../../library/boards/pico-w/board.json';

const within = (pct: number) => (got: number, want: number) => expect(Math.abs(got - want)).toBeLessThanOrEqual(Math.abs(want) * pct / 100);
const within1 = within(1);

describe('N-02 LED current', () => {
  it('3.3 V → 220 Ω → red LED is (3.3 − 2.0) / 220 ≈ 5.9 mA', () => {
    const r = solve(netlist`3V3 -[220]- A; A -|>|red- GND`);
    within1(r.amps.led1!, (3.3 - 2.0) / 220);
    within1(r.volts.A!, 2.0);   // "2.0 V across" (screen 03)
    expect(r.converged).toBe(true);
  });

  it('the same LED reversed carries no current', () => {
    const r = solve(netlist`3V3 -[220]- A; A -|<|red- GND`);
    expect(Math.abs(r.amps.led1!)).toBeLessThan(1e-6);
    within1(r.volts.A!, 3.3);
  });

  it.each([
    ['red', 2.0], ['yellow', 2.1], ['green', 2.2], ['blue', 3.0], ['white', 3.0],
  ])('%s (%s V, screen 12b): 5 V → 220 Ω → (5 − Vf) / 220', (color, vf) => {
    expect(LED_COLORS[color]!.vf).toBe(vf);
    const r = solve(netlist`5V -[220]- A; A -|>|${color}- GND`);
    within1(r.amps.led1!, (5 - vf) / 220);
  });

  it('a blue LED on 3.3 V through 220 Ω is dim: about (3.3 − 3.0) / 220 ≈ 1.4 mA', () => {
    // Little voltage left over, so the LED's real curve matters more: within 5 %.
    within(5)(solve(netlist`3V3 -[220]- A; A -|>|blue- GND`).amps.led1!, 0.3 / 220);
  });

  it('two red LEDs in series on 5 V through 220 Ω: (5 − 2 × 2.0) / 220', () => {
    within1(solve(netlist`5V -[220]- A; A -|>|red- B; B -|>|red- GND`).amps.led2!, 1 / 220);
  });

  it('two LEDs in parallel, each with its own 220 Ω, share nothing: each (3.3 − Vf) / 220', () => {
    const r = solve(netlist`3V3 -[220]- A; A -|>|red- GND; 3V3 -[220]- B; B -|>|green- GND`);
    within1(r.amps.led1!, 1.3 / 220);
    within1(r.amps.led2!, 1.1 / 220);
  });
});

describe('N-02 an LED on a pin (screen 03)', () => {
  it('GP13 HIGH → 220 Ω → red LED → GND: 5.9 mA, as worked out by hand', () => {
    const { netlist: n } = toNetlist({
      board: { data: parseBoard(picoJson) },
      breadboards: [{ id: 'bb1', size: 'half' }],
      parts: [
        { id: 'r1', type: 'resistor', props: { ohms: 220 }, legs: { a: 'bb1.a5', b: 'bb1.a9' } },
        { id: 'led1', type: 'led', props: { color: 'red' }, legs: { a: 'bb1.b9', k: 'bb1.b12' } },
      ],
      wires: [{ id: 'w1', a: 'board.GP13', b: 'bb1.e5' }, { id: 'w2', a: 'bb1.e12', b: 'board.GND' }],
    });
    const r = solve(n, { pins: { GP13: { mode: 'out', value: 1 } } });
    within1(r.amps.led1!, (3.3 - 2.0) / 220);
    expect(solve(n, { pins: { GP13: { mode: 'out', value: 0 } } }).amps.led1!).toBeLessThan(1e-6);
  });

  it('with no resistor the pin gives its limit: a green LED straight on GP13 takes ≈ 48 mA (screen 04)', () => {
    const { netlist: n } = toNetlist({
      board: { data: parseBoard(picoJson) },
      breadboards: [],
      parts: [{ id: 'led1', type: 'led', props: { color: 'green' }, legs: { a: 'board.GP13', k: 'board.GND' } }],
      wires: [],
    });
    const r = solve(n, { pins: { GP13: { mode: 'out', value: 1 } } });
    expect(r.converged).toBe(true);
    expect(Math.round(r.amps.led1! * 1000)).toBe(48);
    expect(r.amps['pin:GP13']).toBeCloseTo(r.amps.led1!, 6);
  });

  it('a part with no value: a resistor is 220 Ω, an LED is red (the kit defaults)', () => {
    const { netlist: n } = toNetlist({
      board: { data: parseBoard(picoJson) },
      breadboards: [],
      parts: [
        { id: 'r1', type: 'resistor', legs: { a: 'board.3V3', b: 'board.GP2' } },
        { id: 'led1', type: 'led', legs: { a: 'board.GP2', k: 'board.GND' } },
      ],
      wires: [],
    });
    within1(solve(n).amps.led1!, 1.3 / 220);
  });

  it('PWM is its average (§1.7): 50 % duty gives half the voltage', () => {
    const { netlist: n } = toNetlist({
      board: { data: parseBoard(picoJson) },
      breadboards: [],
      parts: [{ id: 'r1', type: 'resistor', props: { ohms: 1000 }, legs: { a: 'board.GP2', b: 'board.GND' } }],
      wires: [],
    });
    within1(solve(n, { pins: { GP2: { mode: 'pwm', duty: 0.5 } } }).amps.r1!, 1.65 / 1000);
  });
});

describe('M6.1 RGB LED (§1.4: common cathode; common anode as a choice)', () => {
  const pico = parseBoard(picoJson);
  // legs as on the part, left to right: red, the common (longest), green, blue; each colour through 220 Ω from a pin
  const rgb = (common?: 'cathode' | 'anode') => toNetlist({
    board: { data: pico },
    breadboards: [{ id: 'bb1', size: 'half' }],
    parts: [
      { id: 'rgb1', type: 'rgb-led', ...(common ? { props: { common } } : {}), legs: { r: 'bb1.h20', common: 'bb1.h21', g: 'bb1.h22', b: 'bb1.h23' } },
      { id: 'r1', type: 'resistor', props: { ohms: 220 }, legs: { a: 'bb1.e20', b: 'bb1.f20' } },
      { id: 'r2', type: 'resistor', props: { ohms: 220 }, legs: { a: 'bb1.e22', b: 'bb1.f22' } },
      { id: 'r3', type: 'resistor', props: { ohms: 220 }, legs: { a: 'bb1.e23', b: 'bb1.f23' } },
    ],
    wires: [
      { id: 'w1', a: 'board.GP15', b: 'bb1.a20' }, { id: 'w2', a: 'board.GP14', b: 'bb1.a22' },
      { id: 'w3', a: 'board.GP13', b: 'bb1.a23' },
      { id: 'w4', a: common === 'anode' ? 'board.3V3' : 'board.GND', b: 'bb1.j21' },
    ],
  }).netlist;
  const high = (...on: string[]) => ({ pins: Object.fromEntries(['GP15', 'GP14', 'GP13'].map((p) => [p, { mode: 'out' as const, value: on.includes(p) ? 1 as const : 0 as const }])) });

  it('common cathode (the default): GP15 high lights only the red, (3.3 − 2.0) / 220', () => {
    const r = solve(rgb(), high('GP15'));
    within1(r.amps['rgb1:r']!, 1.3 / 220);
    expect(Math.abs(r.amps['rgb1:g']!)).toBeLessThan(1e-6);
    expect(Math.abs(r.amps['rgb1:b']!)).toBeLessThan(1e-6);
  });

  it('its green and blue need about 3.0 V, as a real RGB LED\'s: dim on 3.3 V through 220 Ω, ≈ 1.4 mA', () => {
    const r = solve(rgb(), high('GP14', 'GP13'));
    within(5)(r.amps['rgb1:g']!, 0.3 / 220);
    within(5)(r.amps['rgb1:b']!, 0.3 / 220);
  });

  it('common anode: the common to 3V3, a colour lights when its pin is LOW', () => {
    const r = solve(rgb('anode'), high('GP15', 'GP13'));
    expect(Math.abs(r.amps['rgb1:r']!)).toBeLessThan(1e-6);
    within(5)(r.amps['rgb1:g']!, 0.3 / 220);
    expect(Math.abs(r.amps['rgb1:b']!)).toBeLessThan(1e-6);
  });
});
