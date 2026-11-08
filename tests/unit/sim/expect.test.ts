import { describe, expect, it } from 'vitest';
import type { PartView } from '../../../src/sim/circuit';
import { check, expectSchema, inputsOf } from '../../../src/sim/expect';
import type { RunResult } from '../../../src/sim/run';

const led = (b: number): PartView => ({ kind: 'led', amps: b * 0.02, brightness: b });
const result = (over: Partial<RunResult> = {}): RunResult => ({
  output: '', trace: [], pwm: [], analog: [], display: [], sound: [], bus: [], parts: [], faults: [], ended: 'stopped', ...over,
});
/** An LED blinking at `hz` for `s` seconds, as the trace would show it. */
const blinking = (hz: number, s: number, skew = 0) => {
  const out: RunResult['parts'] = [];
  for (let i = 0; i * 0.5 / hz < s; i++) out.push([(i * 0.5 / hz + (i === 3 ? skew : 0)) * 1e6, 'led1', led(i % 2 ? 0 : 0.3)]);
  return out;
};

describe('M3.6 checking a run against expect.json', () => {
  it('inputs in seconds become part changes in µs', () => {
    expect(inputsOf(expectSchema.parse({ seconds: 1, inputs: [{ at: 0.5, part: 'btn1', pressed: true }] }))).toEqual([{ atUs: 500_000, part: 'btn1', pressed: true }]);
    expect(inputsOf(expectSchema.parse({ seconds: 1, inputs: [{ at: 0, part: 'tmp1', celsius: 30 }] }))).toEqual([{ atUs: 0, part: 'tmp1', celsius: 30 }]);   // M6.3
    expect(inputsOf(expectSchema.parse({ seconds: 1, inputs: [{ at: 0, part: 'dht1', humidity: 70 }, { at: 1, part: 'sonar1', cm: 12 }] })))
      .toEqual([{ atUs: 0, part: 'dht1', humidity: 70 }, { atUs: 1_000_000, part: 'sonar1', cm: 12 }]);   // M6.4
    expect(inputsOf(expectSchema.parse({ seconds: 1, inputs: [{ at: 0, part: 'joy1', x: 1, y: 0 }, { at: 0, part: 'enc1', steps: 3 }, { at: 0, part: 's1', rpm: 60 }] })))
      .toEqual([{ atUs: 0, part: 'joy1', x: 1, y: 0 }, { atUs: 0, part: 'enc1', steps: 3 }, { atUs: 0, part: 's1', rpm: 60 }]);   // M6.5a
  });

  it('a good blink passes; too slow, too few, or an LED not in the circuit are said in words', () => {
    const e = expectSchema.parse({ seconds: 2, ended: 'stopped', parts: { led1: { blinks: 1 } } });
    expect(check(result({ parts: blinking(1, 2) }), e)).toEqual([]);
    expect(check(result({ parts: blinking(1, 2, 0.05) }), e)).toEqual(['led1: lit for 0.550 s, should be 0.5 s']);
    expect(check(result({ parts: blinking(1, 0.9) }), e)).toEqual(['led1: changes 2 times in 2 s, should change 4 times (1 Hz)']);
    expect(check(result(), e)).toEqual(['led1: no state at all (is it in the circuit?)']);
  });

  it('lit / dark spans and brightness at moments', () => {
    const parts: RunResult['parts'] = [[0, 'led1', led(0)], [1e6, 'led1', led(0.3)], [2e6, 'led1', led(0)]];
    const e = expectSchema.parse({ seconds: 3, ended: 'stopped', parts: { led1: { lit: [[0.5, 1.5]], dark: [[1.5, 2.5]], brightness: [[1.5, 0.4, 0.5]] } } });
    expect(check(result({ parts }), e)).toEqual([
      'led1: dark at 0.50 s, should be lit 0.5–1.5 s',
      'led1: lit at 1.50 s, should be dark 1.5–2.5 s',
      'led1: brightness 0.300 at 1.5 s, should be 0.4–0.5',
    ]);
  });

  it('how it ended, damage faults, the console', () => {
    const e = expectSchema.parse({ seconds: 1, console: { includes: ['Hello'] } });
    const fault = { kind: 'led-burnt' as const, severity: 'damage' as const, on: 'led1', message: 'led1: the LED burnt out' };
    expect(check(result({ ended: 'fault', fault, faults: [fault] }), e)).toEqual([
      'the run ended fault (led1: the LED burnt out), not done',
      'a fault: led-burnt led1',
      'the console has no "Hello"',
    ]);
    expect(check(result({ ended: 'error', error: { type: 'NameError', message: "name 'x' isn't defined" }, output: 'Hello' }), e)).toEqual([
      "the run ended error (NameError: name 'x' isn't defined), not done",
    ]);
    expect(check(result({ ended: 'fault', fault, faults: [fault], output: 'Hello' }), expectSchema.parse({ seconds: 1, ended: 'fault', faults: ['led-burnt led1'], console: { includes: ['Hello'] } }))).toEqual([]);
  });
});

describe('M6.2 a buzzer in expect.json', () => {
  const tone = (hz: number, volume = 1): PartView => ({ kind: 'buzzer', hz, volume });
  const parts: RunResult['parts'] = [[0, 'bz1', tone(0, 0)], [100_000, 'bz1', tone(440)], [600_000, 'bz1', tone(880)], [1_100_000, 'bz1', tone(0, 0)]];

  it('sounds at a pitch over a span (±2 %), silent over another', () => {
    const e = expectSchema.parse({ seconds: 1.5, ended: 'stopped', parts: { bz1: { sounds: [[0.15, 0.55, 440], [0.65, 1.05, 880]], silent: [[1.15, 1.45]] } } });
    expect(check(result({ parts }), e)).toEqual([]);
  });

  it('a wrong note, a silence or a sound where it shouldn\'t be are said in words', () => {
    const e = expectSchema.parse({ seconds: 1.5, ended: 'stopped', parts: { bz1: { sounds: [[0.15, 0.55, 523], [1.15, 1.2, 440]], silent: [[0.3, 0.4]] } } });
    expect(check(result({ parts }), e)).toEqual([
      'bz1: 440 Hz at 0.15 s, should be 523 Hz 0.15–0.55 s',
      'bz1: silent at 1.15 s, should be 440 Hz 1.15–1.2 s',
      'bz1: 440 Hz at 0.30 s, should be silent 0.3–0.4 s',
    ]);
  });
});

describe('M7 any part\'s state in expect.json (values)', () => {
  it('a servo\'s angle, a motor\'s rpm, a relay on: within their range at that time; true is 1', () => {
    const parts: RunResult['parts'] = [
      [0, 's1', { kind: 'servo', angle: 90, powered: true }], [500_000, 's1', { kind: 'servo', angle: 180, powered: true }],
      [0, 'rel1', { kind: 'relay', on: true }],
    ];
    const e = expectSchema.parse({ seconds: 1, parts: { s1: { values: [[0.2, 'angle', 85, 95], [0.6, 'angle', 175, 180]] }, rel1: { values: [[0.5, 'on', 1, 1]] } } });
    expect(check(result({ parts, ended: 'done' }), e)).toEqual([]);
    const wrong = expectSchema.parse({ seconds: 1, parts: { s1: { values: [[0.6, 'angle', 0, 10], [0.6, 'rpm', 1, 2]] } } });
    expect(check(result({ parts, ended: 'done' }), wrong)).toEqual(['s1: angle 180 at 0.6 s, should be 0–10', 's1: rpm none at 0.6 s, should be 1–2']);
  });
});
