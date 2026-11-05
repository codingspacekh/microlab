import { describe, expect, it } from 'vitest';
import { ldrOhms, solve, toNetlist, type CircuitSpec, type SimState } from '@lib/circuit';
import { parseBoard } from '@lib/boards';
import picoJson from '../../../library/boards/pico-w/board.json';
import mbitJson from '../../../library/boards/microbit-v2/board.json';

const pico = parseBoard(picoJson);
const within1 = (got: number, want: number) => expect(Math.abs(got - want)).toBeLessThanOrEqual(Math.abs(want) * 0.01 + 1e-9);
const run = (spec: CircuitSpec, state: SimState = {}) => solve(toNetlist(spec).netlist, state);
const onPico = (parts: CircuitSpec['parts'], wires: CircuitSpec['wires'] = []): CircuitSpec =>
  ({ board: { data: pico }, breadboards: [{ id: 'bb1', size: 'half' }], parts, wires });

describe('F-31 push button', () => {
  // Across the channel at columns 24 and 26 (as on screen 02); column 24 → GP14, column 26 → GND.
  const spec = onPico(
    [{ id: 'btn1', type: 'button', legs: { '1a': 'bb1.e24', '1b': 'bb1.f24', '2a': 'bb1.e26', '2b': 'bb1.f26' } }],
    [{ id: 'w1', a: 'board.GP14', b: 'bb1.a24' }, { id: 'w2', a: 'bb1.j26', b: 'board.GND' }],
  );
  const pullUp: SimState = { pins: { GP14: { mode: 'in', pull: 'up' } } };

  it('not pressed: the pull-up holds GP14 at 3.3 V', () => {
    within1(run(spec, pullUp).volts.GP14!, 3.3);
  });
  it('pressed: GP14 is joined to GND, ≈ 0 V', () => {
    expect(run(spec, { ...pullUp, parts: { btn1: { pressed: true } } }).volts.GP14!).toBeLessThan(0.001);
  });
});

describe('F-31 slide switch', () => {
  // 1 → 3V3, 3 → GND, the common leg 2 → GP16.
  const spec = onPico([{ id: 'sw1', type: 'slide-switch', legs: { 1: 'board.3V3', 2: 'board.GP16', 3: 'board.GND' } }]);
  it('position 0 joins 2 to 1: 3.3 V; position 1 joins 2 to 3: 0 V', () => {
    within1(run(spec, { parts: { sw1: { position: 0 } } }).volts.GP16!, 3.3);
    expect(run(spec, { parts: { sw1: { position: 1 } } }).volts.GP16!).toBeLessThan(0.001);
  });
  it('starts at position 0', () => {
    within1(run(spec).volts.GP16!, 3.3);
  });
});

describe('F-31 potentiometer (10 k)', () => {
  // End 1 → 3V3, end 3 → GND, wiper → GP26 (an ADC pin), as on screen 03.
  const spec = onPico([{ id: 'pot1', type: 'potentiometer', props: { ohms: 10_000 }, legs: { 1: 'board.3V3', 2: 'board.GP26', 3: 'board.GND' } }]);
  it.each([[0.25, 3.3 * 0.75], [0.5, 1.65], [0.9, 3.3 * 0.1]])('turned to %s of the way from end 1: %s V', (position, volts) => {
    within1(run(spec, { parts: { pot1: { position } } }).volts.GP26!, volts);
  });
  it('the ends are about 3.3 V and 0 V; it starts in the middle', () => {
    expect(run(spec, { parts: { pot1: { position: 0 } } }).volts.GP26!).toBeGreaterThan(3.29);
    expect(run(spec, { parts: { pot1: { position: 1 } } }).volts.GP26!).toBeLessThan(0.01);
    within1(run(spec).volts.GP26!, 1.65);
  });
  it('with no value it is 10 k; an unknown part beside it is left out of the solve (reported by connect)', () => {
    const plain = onPico([
      { id: 'pot1', type: 'potentiometer', legs: { 1: 'board.3V3', 2: 'board.GP26', 3: 'board.GND' } },
      { id: 'x1', type: 'flux-capacitor', legs: {} },
    ]);
    const { netlist: n, connectivity } = toNetlist(plain);
    within1(solve(n).amps['supply:3V3']!, 0.33e-3);
    expect(connectivity.problems).toEqual([{ kind: 'unknown-part-type', part: 'x1', type: 'flux-capacitor' }]);
  });

  it('3.3 V across the whole track: 3.3 / 10 000 = 0.33 mA', () => {
    within1(run(spec, { parts: { pot1: { position: 0.3 } } }).amps['supply:3V3']!, 0.33e-3);
  });
});

describe('F-31 LDR (light sensor)', () => {
  it('about 15 kΩ at 10 lux, falling with light (a GL5528-type cell); 1 MΩ in the dark', () => {
    within1(ldrOhms(10), 15_000);
    within1(ldrOhms(1000), 15_000 * 100 ** -0.7);
    expect(ldrOhms(0)).toBe(1_000_000);
    expect(ldrOhms(1e9)).toBe(100);
  });

  // 3V3 → LDR → GP27 → 10 k → GND
  const spec = onPico([
    { id: 'ldr1', type: 'ldr', legs: { a: 'board.3V3', b: 'board.GP27' } },
    { id: 'r1', type: 'resistor', props: { ohms: 10_000 }, legs: { a: 'board.GP27', b: 'board.GND' } },
  ]);
  it.each([[10, 15_000], [1000, 15_000 * 100 ** -0.7]])('at %s lux the divider gives 3.3 × 10 k / (10 k + R)', (lux, r) => {
    within1(run(spec, { parts: { ldr1: { lux } } }).volts.GP27!, 3.3 * 10_000 / (10_000 + r));
  });
  it('a room (300 lux) when nothing is set', () => {
    within1(run(spec).volts.GP27!, 3.3 * 10_000 / (10_000 + ldrOhms(300)));
  });
});

describe('batteries and a circuit with no board', () => {
  it.each([['9V', 9, 1.5], ['4xAA', 6, 0.6], ['2xAA', 3, 0.3]])('%s battery across 1 k: V / (1 k + its own resistance)', (kind, volts, ohms) => {
    const r = run({
      breadboards: [], wires: [],
      parts: [
        { id: 'bat1', type: 'battery', props: { kind }, legs: { '+': 'r1.a', '-': 'r1.b' } },
        { id: 'r1', type: 'resistor', props: { ohms: 1000 }, legs: {} },
      ],
    });
    within1(r.amps.r1!, volts / (1000 + ohms));
    within1(r.amps.bat1!, volts / (1000 + ohms));
  });

  it('an unknown battery is a 9 V one', () => {
    const r = run({ breadboards: [], wires: [], parts: [
      { id: 'bat1', type: 'battery', props: { kind: 'car' }, legs: { '+': 'r1.a', '-': 'r1.b' } },
      { id: 'r1', type: 'resistor', props: { ohms: 1000 }, legs: {} },
    ] });
    within1(r.amps.r1!, 9 / 1001.5);
  });
});

describe('servo (electrical side)', () => {
  it('draws about 10 mA at rest from 5 V (VBUS)', () => {
    const r = run(onPico([{ id: 's1', type: 'servo', legs: { gnd: 'board.GND', vcc: 'board.VBUS', signal: 'board.GP15' } }]));
    within1(r.amps.s1!, 5 / 500);
  });
});

describe("micro:bit's buttons A and B", () => {
  const mbit = { board: { data: parseBoard(mbitJson) }, breadboards: [], parts: [], wires: [] };
  it('P5 is held at 3.3 V by the board\'s 10 k; pressing A pulls it to 0 V', () => {
    within1(run(mbit).volts.P5!, 3.3);
    expect(run(mbit, { parts: { 'board.A': { pressed: true } } }).volts.P5!).toBeLessThan(0.001);
    within1(run(mbit, { parts: { 'board.A': { pressed: true } } }).volts.P11!, 3.3);
  });
});
