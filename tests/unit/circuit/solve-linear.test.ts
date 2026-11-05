import { describe, expect, it } from 'vitest';
import { solve, toNetlist, type CircuitSpec, type SimState } from '@lib/circuit';
import { parseBoard } from '@lib/boards';
import { netlist } from '../../fixtures/circuits/dsl';
import picoJson from '../../../library/boards/pico-w/board.json';
import mbitJson from '../../../library/boards/microbit-v2/board.json';
import espJson from '../../../library/boards/esp32-devkit-v1/board.json';
import extJson from '../../../library/boards/esp32-devkit-v1-ext/board.json';

const pico = parseBoard(picoJson);
/** Within 1 % of the hand-worked answer (N-02). */
const within1 = (got: number, want: number) => expect(Math.abs(got - want)).toBeLessThanOrEqual(Math.abs(want) * 0.01);

describe('N-02 resistors, by hand', () => {
  it('divider: 3.3 V, 10 k + 10 k → 1.65 V', () => {
    const r = solve(netlist`3V3 -[10k]- A; A -[10k]- GND`);
    within1(r.volts.A!, 1.65);
  });

  it('series: 3.3 V across 1 k + 2 k → 3.3 / 3000 = 1.1 mA, and 2.2 V between them', () => {
    const r = solve(netlist`3V3 -[1k]- A; A -[2k]- GND`);
    within1(r.amps.r1!, 3.3 / 3000);
    within1(r.amps.r2!, 3.3 / 3000);
    within1(r.volts.A!, 3.3 * 2000 / 3000);
  });

  it('parallel: 2 k ∥ 2 k = 1 k, under 2 k from 3.3 V → 3.3 × 1 / 3 = 1.1 V; each takes half', () => {
    const r = solve(netlist`3V3 -[2k]- A; A -[2k]- GND; A -[2k]- GND`);
    within1(r.volts.A!, 1.1);
    within1(r.amps.r2!, 1.1 / 2000);
    within1(r.amps.r3!, r.amps.r2!);
  });

  it('current flows from a to b: a resistor drawn the other way round has a negative current', () => {
    const r = solve(netlist`A -[1k]- 3V3; A -[1k]- GND`);
    expect(r.amps.r1!).toBeLessThan(0);
    within1(r.volts.A!, 1.65);
  });

  it("the supply's current is what the circuit takes", () => {
    const r = solve(netlist`3V3 -[1k]- GND`);
    within1(r.amps['supply:3V3']!, 3.3 / 1000);
    expect(r.converged).toBe(true);
  });

  it('a net joined to nothing sits at 0 V, and an empty circuit solves', () => {
    expect(solve(netlist`3V3 -[1k]- GND; X -[1k]- Y`).volts.X).toBeCloseTo(0, 6);
    expect(solve({ nets: [], devices: [] }).converged).toBe(true);
  });
});

/** The Pico on a half breadboard; GP15 → a5, 1 k from e5 to e10, e10 → GND. */
function picoCircuit(extra: Partial<CircuitSpec> = {}): CircuitSpec {
  return {
    board: { data: pico },
    breadboards: [{ id: 'bb1', size: 'half' }],
    parts: [{ id: 'r1', type: 'resistor', props: { ohms: 1000 }, legs: { a: 'bb1.e5', b: 'bb1.e10' } }],
    wires: [{ id: 'w1', a: 'board.GP15', b: 'bb1.a5' }, { id: 'w2', a: 'bb1.a10', b: 'board.GND' }],
    ...extra,
  };
}
const run = (spec: CircuitSpec, state: SimState = {}) => {
  const { netlist: n } = toNetlist(spec);
  return solve(n, state);
};

describe('solving again', () => {
  it('from the last answer (the next step of a run) gives the same answer in fewer iterations', () => {
    const n = netlist`3V3 -[220]- A; A -|>|red- GND; 3V3 -[1k]- B; B -|>|green- GND`;
    const first = solve(n);
    const again = solve(n, {}, first);
    expect(again.volts.A).toBeCloseTo(first.volts.A!, 9);
    expect(again.iterations).toBeLessThan(first.iterations);
  });

  it('regression: after a pin changes, solving from the last answer converges to the fresh answer', () => {
    // Found by the perf test: GP13 LOW → HIGH from the last answer bounced between the pin's limits for 200 steps.
    const { netlist: n } = toNetlist(picoCircuit({
      parts: [
        { id: 'r1', type: 'resistor', props: { ohms: 220 }, legs: { a: 'board.GP13', b: 'led1.a' } },
        { id: 'led1', type: 'led', legs: { k: 'board.GND' } },
      ],
      wires: [],
    }));
    const low = solve(n, { pins: { GP13: { mode: 'out', value: 0 } } });
    const high = solve(n, { pins: { GP13: { mode: 'out', value: 1 } } }, low);
    expect(high.converged).toBe(true);
    expect(high.iterations).toBeLessThan(20);
    within1(high.amps.led1!, solve(n, { pins: { GP13: { mode: 'out', value: 1 } } }).amps.led1!);
  });

  it('from an answer for a different circuit: nets it did not have start at 0 V', () => {
    const first = solve(netlist`3V3 -[1k]- A; A -[1k]- GND`);
    const r = solve(netlist`3V3 -[1k]- B; B -[3k]- GND`, {}, first);
    within1(r.volts.B!, 3.3 * 3 / 4);
  });

  it('an LED colour it does not know is solved as red', () => {
    const r = solve({ nets: ['3V3', 'A', 'GND'], ground: 'GND', devices: [
      { kind: 'source', id: 's', plus: '3V3', minus: 'GND', volts: 3.3, ohms: 0.05, limitA: 1 },
      { kind: 'resistor', id: 'r1', a: '3V3', b: 'A', ohms: 220 },
      { kind: 'led', id: 'led1', a: 'A', k: 'GND', color: 'ultraviolet' },
    ] });
    within1(r.amps.led1!, 1.3 / 220);
  });
});

describe('F-31 a pin drives its net', () => {
  it('GP15 HIGH through 1 k to GND: 3.3 / 1000 = 3.3 mA out of the pin', () => {
    const r = run(picoCircuit(), { pins: { GP15: { mode: 'out', value: 1 } } });
    within1(r.amps.r1!, 3.3 / 1000);
    within1(r.amps['pin:GP15']!, 3.3 / 1000);
    within1(r.volts.GP15!, 3.3);
  });

  it('GP15 LOW with 1 k from 3V3: the pin takes 3.3 mA in and sits near 0 V', () => {
    const r = run(picoCircuit({ wires: [{ id: 'w1', a: 'board.GP15', b: 'bb1.a5' }, { id: 'w2', a: 'bb1.a10', b: 'board.3V3' }] }),
      { pins: { GP15: { mode: 'out', value: 0 } } });
    within1(r.amps['pin:GP15']!, -3.3 / 1000);
    expect(r.volts.GP15!).toBeLessThan(0.01);
  });

  it('an input with its pull-up and nothing else reads 3.3 V', () => {
    const r = run({ board: { data: pico }, breadboards: [], parts: [], wires: [] }, { pins: { GP15: { mode: 'in', pull: 'up' } } });
    within1(r.volts.GP15!, 3.3);
  });

  it('pull-up (≈ 50 kΩ, screen 02b) against 10 k to GND: 3.3 × 10 / 60 = 0.55 V', () => {
    const spec = picoCircuit();
    spec.parts[0]!.props = { ohms: 10_000 };
    within1(run(spec, { pins: { GP15: { mode: 'in', pull: 'up' } } }).volts.GP15!, 0.55);
  });

  it('pull-down against 10 k from 3V3: 3.3 × 50 / 60 = 2.75 V', () => {
    const spec = picoCircuit({ wires: [{ id: 'w1', a: 'board.GP15', b: 'bb1.a5' }, { id: 'w2', a: 'bb1.a10', b: 'board.3V3' }] });
    spec.parts[0]!.props = { ohms: 10_000 };
    within1(run(spec, { pins: { GP15: { mode: 'in', pull: 'down' } } }).volts.GP15!, 2.75);
  });

  it('a pin with no state is an input with no pull: it drives nothing', () => {
    const r = run(picoCircuit());
    expect(r.amps['pin:GP15']).toBeUndefined();
    expect(Math.abs(r.amps.r1!)).toBeLessThan(1e-9);
  });

  it('VBUS gives 5 V on USB; with no USB it gives nothing', () => {
    const spec = picoCircuit({ wires: [{ id: 'w1', a: 'board.VBUS', b: 'bb1.a5' }, { id: 'w2', a: 'bb1.a10', b: 'board.GND' }] });
    within1(run(spec).amps.r1!, 5 / 1000);
    expect(run({ ...spec, board: { data: pico, usb: false } }).amps.r1!).toBeCloseTo(0, 9);
  });
});

describe("board's own parts", () => {
  it("the ESP32's blue LED on D2 (through 1 k) lights when D2 is HIGH: (3.3 − 3.0) / 1000 ≈ 0.3 mA", () => {
    const spec = { board: { data: parseBoard(espJson) }, breadboards: [], parts: [], wires: [] };
    const r = run(spec, { pins: { D2: { mode: 'out', value: 1 } } });
    expect(Math.abs(r.amps['board.LED']! - 0.3 / 1001)).toBeLessThan(0.3 / 1001 * 0.05);
    expect(run(spec).amps['board.LED']!).toBeLessThan(1e-6);
  });

  it("the micro:bit's P19 reads 3.3 V through its 10 k pull-up (I²C), even with no pull set", () => {
    const r = run({ board: { data: parseBoard(mbitJson) }, breadboards: [], parts: [], wires: [] });
    within1(r.volts.P19!, 3.3);
  });

  it("the micro:bit GPIO board: SDA/SCL are not extra pins; 5V is there only with the GPIO board's USB", () => {
    const data = parseBoard(mbitJson);
    const devices = (usb?: boolean) => toNetlist({ board: { data, usb }, breadboards: [], parts: [], wires: [] }).netlist.devices;
    expect(devices().filter((d) => d.kind === 'pin')).toHaveLength(19);
    expect(devices().filter((d) => d.kind === 'source').map((d) => d.id)).toEqual(['supply:3.3V', 'supply:5V']);
    expect(devices(false).filter((d) => d.kind === 'source').map((d) => d.id)).toEqual(['supply:3.3V']);
  });

  it('the ESP32 extension board: V is 5 V, or 3.3 V with the jumper moved; an S pin is the ESP32 pin', () => {
    const data = parseBoard(extJson);
    const at = (jumper?: Record<string, number>) => run({ board: { data, jumpers: jumper }, breadboards: [], parts: [], wires: [] });
    within1(at().volts.V!, 5);
    within1(at({ V: 3.3 }).volts.V!, 3.3);
    const r = run({ board: { data }, breadboards: [], parts: [], wires: [] }, { pins: { D32: { mode: 'out', value: 1 } } });
    within1(r.volts.D32!, 3.3);
    expect(toNetlist({ board: { data }, breadboards: [], parts: [], wires: [] }).netlist.devices.filter((d) => d.kind === 'pin')).toHaveLength(25);
  });
});

