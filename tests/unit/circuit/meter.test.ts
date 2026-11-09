import { describe, expect, it } from 'vitest';
import { meterReading, measureAmps, probePlace, measureOhms, measureVolts, showReading, type CircuitSpec, type SimState } from '@lib/circuit';
import { parseBoard } from '@lib/boards';
import picoJson from '../../../library/boards/pico-w/board.json';

/** M9 slice 4 (F-38, screen 29): the multimeter — V between its probes, A through a wire or a leg (as if the meter
 *  were put in its place), Ω with the power off. "The multimeter on the divider reads 1.65 V" (MILESTONES M9). */
const pico = parseBoard(picoJson);
const spec = (parts: CircuitSpec['parts'], wires: CircuitSpec['wires']): CircuitSpec =>
  ({ board: { data: pico }, breadboards: [{ id: 'bb1', size: 'half' }], parts, wires });

// screen 29: two 10 kΩ in series from 3V3 (column 5) to GND (column 13); their middle is column 9
const DIVIDER = spec([
  { id: 'r1', type: 'resistor', props: { ohms: 10000 }, legs: { a: 'bb1.f5', b: 'bb1.f9' } },
  { id: 'r2', type: 'resistor', props: { ohms: 10000 }, legs: { a: 'bb1.g9', b: 'bb1.g13' } },
], [{ id: 'w1', a: 'board.3V3', b: 'bb1.j5' }, { id: 'w2', a: 'board.GND@38', b: 'bb1.j13' }]);

// Blink: GP15 → 220 Ω → red LED → GND
const BLINK = spec([
  { id: 'r1', type: 'resistor', props: { ohms: 220 }, legs: { a: 'bb1.a5', b: 'bb1.a8' } },
  { id: 'led1', type: 'led', props: { color: 'red' }, legs: { a: 'bb1.b8', k: 'bb1.b10' } },
], [{ id: 'w1', a: 'board.GP15', b: 'bb1.e5' }, { id: 'w2', a: 'board.GND@38', b: 'bb1.e10' }]);
const HIGH: SimState = { pins: { GP15: { mode: 'out', value: 1 } } };

describe('V: from the black probe to the red', () => {
  it('the divider\'s middle reads 1.65 V, half of 3.3 — with no program running (the pins are inputs)', () => {
    expect(measureVolts(DIVIDER, {}, 'bb1.h9', 'bb1.h13')).toBeCloseTo(1.65, 2);
    expect(showReading('V', measureVolts(DIVIDER, {}, 'bb1.h9', 'bb1.h13'))).toEqual({ text: '1.65', unit: 'V' });
  });
  it('the probes swapped: −1.65 V; on a board pin and a rail as well as holes', () => {
    expect(measureVolts(DIVIDER, {}, 'bb1.h13', 'bb1.h9')).toBeCloseTo(-1.65, 2);
    expect(measureVolts(DIVIDER, {}, 'board.3V3', 'board.GND@3')).toBeCloseTo(3.3, 2);
  });
  it('a probe on nothing yet: no reading', () => {
    expect(measureVolts(DIVIDER, {}, undefined, 'bb1.h13')).toBeNull();
    expect(showReading('V', null)).toEqual({ text: '- - - -', unit: 'V' });
  });
  it('a PWM pin reads its average, as a real meter does: 50 % of 3.3 V', () => {
    expect(measureVolts(BLINK, { pins: { GP15: { mode: 'pwm', duty: 0.5 } } }, 'board.GP15', 'board.GND@3')).toBeCloseTo(1.65, 1);
  });
  it('the LED lit: about 2 V across it', () => {
    expect(measureVolts(BLINK, HIGH, 'bb1.e8', 'bb1.e10')).toBeGreaterThan(1.9);
  });
});

describe('A: through a wire or a leg, the meter in its place', () => {
  it('Blink lit: ≈ 5.9 mA through the LED\'s short leg, the same through GP15\'s wire', () => {
    const leg = measureAmps(BLINK, HIGH, { leg: 'led1.k' })!;
    expect(leg * 1000).toBeCloseTo((3.3 - 2.0) / 221 * 1000, 0);
    expect(measureAmps(BLINK, HIGH, { wire: 'w1' })).toBeCloseTo(leg, 4);
    expect(showReading('A', leg)).toEqual({ text: '5.9', unit: 'mA' });
  });
  it('dark: 0; the divider: 165 µA', () => {
    expect(measureAmps(BLINK, { pins: { GP15: { mode: 'out', value: 0 } } }, { leg: 'led1.a' })).toBeCloseTo(0, 6);
    expect(showReading('A', measureAmps(DIVIDER, {}, { leg: 'r1.b' }))).toEqual({ text: '165', unit: 'µA' });
  });
  it('nothing chosen yet, or a wire that isn\'t there: no reading', () => {
    expect(measureAmps(BLINK, HIGH, undefined)).toBeNull();
    expect(measureAmps(BLINK, HIGH, { wire: 'w9' })).toBeNull();
  });
});

describe('Ω: between the probes, the power off', () => {
  it('both resistors from 3V3\'s column to GND: 20.0 kΩ; a probe on each end of one: 10.0 kΩ', () => {
    expect(measureOhms(DIVIDER, 'bb1.h5', 'bb1.h13')).toBeCloseTo(20000, -1);
    expect(showReading('Ω', measureOhms(DIVIDER, 'bb1.h5', 'bb1.h13'))).toEqual({ text: '20.0', unit: 'kΩ' });
    expect(showReading('Ω', measureOhms(DIVIDER, 'bb1.h9', 'bb1.h13'))).toEqual({ text: '10.0', unit: 'kΩ' });
  });
  it('one column: 0 Ω; two columns with nothing between: OL; an LED at the meter\'s small test voltage: OL', () => {
    expect(measureOhms(DIVIDER, 'bb1.h9', 'bb1.j9')).toBe(0);
    expect(showReading('Ω', measureOhms(DIVIDER, 'bb1.a20', 'bb1.a25'))).toEqual({ text: 'OL', unit: 'MΩ' });
    expect(showReading('Ω', measureOhms(BLINK, 'bb1.e8', 'bb1.e10'))).toEqual({ text: 'OL', unit: 'MΩ' });
  });
  it('a pressed button between two columns: about 0 Ω; released: OL', () => {
    const btn = spec([{ id: 'btn1', type: 'button', legs: { '1a': 'bb1.e20', '2a': 'bb1.e22' } }], []);
    expect(measureOhms(btn, 'bb1.a20', 'bb1.a22', { parts: { btn1: { pressed: true } } })).toBeLessThan(1);
    expect(measureOhms(btn, 'bb1.a20', 'bb1.a22')).toBe(Infinity);
  });
});

describe('the display', () => {
  it('V, A and Ω each in its range', () => {
    expect(showReading('V', 0.0123)).toEqual({ text: '12.3', unit: 'mV' });
    expect(showReading('V', 4.97)).toEqual({ text: '4.97', unit: 'V' });
    expect(showReading('V', 12.5)).toEqual({ text: '12.5', unit: 'V' });
    expect(showReading('A', 1.2)).toEqual({ text: '1.20', unit: 'A' });
    expect(showReading('A', 0.048)).toEqual({ text: '48.0', unit: 'mA' });
    expect(showReading('A', 11)).toEqual({ text: 'OL', unit: 'A' });
    expect(showReading('Ω', 220.4)).toEqual({ text: '220.4', unit: 'Ω' });
    expect(showReading('Ω', 1.5e6)).toEqual({ text: '1.50', unit: 'MΩ' });
  });
  it('meterReading: the mode\'s measurement, shown', () => {
    expect(meterReading(DIVIDER, {}, { mode: 'V', red: 'bb1.h9', black: 'bb1.h13' })).toEqual({ text: '1.65', unit: 'V' });
    expect(meterReading(DIVIDER, {}, { mode: 'Ω', red: 'bb1.h5', black: 'bb1.h13' })).toEqual({ text: '20.0', unit: 'kΩ' });
    expect(meterReading(BLINK, HIGH, { mode: 'A', through: { wire: 'w1' } })).toEqual({ text: '5.9', unit: 'mA' });
  });
});

describe('where a probe is (the card\'s lines)', () => {
  it('a hole: its column and what is joined there — the parts, or the board pin it is wired to', () => {
    expect(probePlace(DIVIDER, 'bb1.h9')).toBe('column 9 — R1 and R2');
    expect(probePlace(DIVIDER, 'bb1.h13')).toBe('column 13 — GND');
    expect(probePlace(DIVIDER, 'bb1.a20')).toBe('column 20');
    expect(probePlace(DIVIDER, 'bb1.T+4')).toBe('the top + rail');
  });
  it('a board pin by its label; a part\'s terminal; nowhere yet', () => {
    expect(probePlace(BLINK, 'board.GP15')).toBe('GP15 — R1');
    expect(probePlace(DIVIDER, 'board.GND@3')).toBe('GND — R2');
    expect(probePlace(spec([{ id: 'motor1', type: 'motor', legs: {} }], []), 'motor1.+')).toBe("MOTOR1's +");
    expect(probePlace(DIVIDER, undefined)).toBe('not on anything yet');
  });
});
