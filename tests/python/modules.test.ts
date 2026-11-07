import { describe, expect, it } from 'vitest';
import { parseBoard } from '@lib/boards';
import type { CircuitSpec, WireSpec } from '@lib/circuit';
import picoJson from '../../library/boards/pico-w/board.json';
import { VirtualClock } from '../../src/sim/clock';
import type { PartChange } from '../../src/sim/circuit';
import { runProject, type RunResult } from '../../src/sim/run';
import { nodeLoader } from './vm';

/**
 * M6.5a the SunFounder Universal Maker Sensor Kit's simple inputs (requirements Rev 8), on common modules — each with
 * its pins in the order commonly printed, its supply, its output stage (a pull-up and a comparator's open collector,
 * an analog divider, a push-pull output). On the Pico W; every board's examples are in the acceptance suite.
 */
const PICO = parseBoard(picoJson);
const w = (id: string, a: string, b: string): WireSpec => ({ id, a, b });

/** A module with its legs in row a from column 10, in `legs` order; `to` wires a leg to a board pin. */
function mod(type: string, legs: string[], to: Record<string, string>, props: Record<string, string> = {}): CircuitSpec {
  const spec: CircuitSpec = { board: { data: PICO }, breadboards: [{ id: 'bb1', size: 'half' }], parts: [], wires: [] };
  spec.parts.push({ id: 'm1', type, props, legs: Object.fromEntries(legs.map((l, i) => [l, `bb1.a${10 + i}`])) });
  legs.forEach((l, i) => { if (to[l]) spec.wires.push(w(`w${i}`, `board.${to[l]}`, `bb1.e${10 + i}`)); });
  return spec;
}
async function run(spec: CircuitSpec, main: string, partInputs: PartChange[] = []): Promise<RunResult> {
  return runProject(await nodeLoader(), { board: 'pico-w', files: { 'main.py': main }, clock: new VirtualClock(), circuit: spec, partInputs });
}
const lines = (r: RunResult) => r.output.trim().split('\n');
const at = (s: number, input: Omit<PartChange, 'atUs' | 'part'>): PartChange => ({ atUs: s * 1e6, part: 'm1', ...input });
/** Prints the pin's value now and after 0.5 s (the input changes at 0.25 s). */
const twice = (read: string) => `from machine import Pin, ADC\nimport time\ntime.sleep(0.1)\na = ${read}\ntime.sleep(0.5)\nprint(a, ${read})\n`;
const volts = (n: number) => `round(ADC(${n}).read_u16() * 3.3 / 65535, 2)`;
const S = ['out', 'vcc', 'gnd'];

describe('M6.5a digital modules', () => {
  it('a button module: 1 (its 10 kΩ pull-up), 0 while pressed', async () => {
    const r = await run(mod('button-module', S, { out: 'GP14', vcc: '3V3', gnd: 'GND' }), twice('Pin(14, Pin.IN).value()'), [at(0.25, { pressed: true })]);
    expect(lines(r)).toEqual(['1 0']);
    expect(r.faults).toEqual([]);
  });

  it('a touch module (TTP223): 0, 1 while touched', async () => {
    const r = await run(mod('touch', S, { out: 'GP14', vcc: '3V3', gnd: 'GND' }), twice('Pin(14, Pin.IN).value()'), [at(0.25, { pressed: true })]);
    expect(lines(r)).toEqual(['0 1']);
  });

  it('a vibration module (SW-420): 0 still, 1 while shaken', async () => {
    const r = await run(mod('vibration', ['vcc', 'gnd', 'out'], { out: 'GP14', vcc: '3V3', gnd: 'GND' }), twice('Pin(14, Pin.IN).value()'), [at(0.25, { pressed: true })]);
    expect(lines(r)).toEqual(['0 1']);
  });

  it('an IR obstacle module: 1 clear, 0 with something in front', async () => {
    const r = await run(mod('ir-obstacle', ['out', 'gnd', 'vcc'], { out: 'GP14', vcc: '3V3', gnd: 'GND' }), twice('Pin(14, Pin.IN).value()'), [at(0.25, { position: 1 })]);
    expect(lines(r)).toEqual(['1 0']);
  });

  it('a Hall module: 1, 0 with a magnet near', async () => {
    const r = await run(mod('hall', S, { out: 'GP14', vcc: '3V3', gnd: 'GND' }), twice('Pin(14, Pin.IN).value()'), [at(0.25, { position: 1 })]);
    expect(lines(r)).toEqual(['1 0']);
  });
});

describe('M6.5a analog modules', () => {
  it('a photoresistor module: more light, more volts', async () => {
    const r = await run(mod('ldr-module', S, { out: 'GP26', vcc: '3V3', gnd: 'GND' }), `from machine import ADC\nimport time\ntime.sleep(0.1)\na = ADC(26).read_u16()\ntime.sleep(0.5)\nprint(a < ADC(26).read_u16())\n`,
      [at(0, { lux: 5 }), at(0.25, { lux: 2000 })]);
    expect(lines(r)).toEqual(['True']);
  });

  it('a potentiometer module: 0 V at one end, 3.3 V at the other', async () => {
    const r = await run(mod('pot-module', S, { out: 'GP26', vcc: '3V3', gnd: 'GND' }), twice(volts(26)), [at(0, { position: 0 }), at(0.25, { position: 1 })]);
    expect(lines(r)).toEqual(['0.0 3.3']);
  });

  it('a water level sensor: 0 V dry, rising with the water', async () => {
    const r = await run(mod('water-level', S, { out: 'GP26', vcc: '3V3', gnd: 'GND' }), twice(volts(26)), [at(0.25, { position: 1 })]);
    const [dry, full] = lines(r)[0]!.split(' ').map(Number) as [number, number];
    expect(dry).toBe(0);
    expect(full).toBeGreaterThan(2);
  });

  it('a flame module: AO falls with the flame, DO goes 0', async () => {
    const spec = mod('flame', ['ao', 'gnd', 'vcc', 'out'], { ao: 'GP26', out: 'GP14', vcc: '3V3', gnd: 'GND' });
    const r = await run(spec, twice(`(${volts(26)}, Pin(14, Pin.IN).value())`), [at(0.25, { position: 1 })]);
    expect(lines(r)[0]).toMatch(/^\(3\.3, 1\) \([\d.]+, 0\)$/);
    expect(Number(lines(r)[0]!.match(/\(([\d.]+), 0\)$/)![1])).toBeCloseTo(0.5, 1);
  });

  it('a raindrop module: AO falls when wet, DO goes 0', async () => {
    const spec = mod('raindrop', ['ao', 'out', 'gnd', 'vcc'], { ao: 'GP26', out: 'GP14', vcc: '3V3', gnd: 'GND' });
    const r = await run(spec, twice(`(${volts(26)}, Pin(14, Pin.IN).value())`), [at(0.25, { position: 1 })]);
    expect(lines(r)[0]).toMatch(/^\(3\.3, 1\) \([\d.]+, 0\)$/);
    expect(Number(lines(r)[0]!.match(/\(([\d.]+), 0\)$/)![1])).toBeCloseTo(0.66, 1);
  });

  it('an MQ-2 from 5 V: its heater draws ≈ 150 mA; AO rises with gas (past the ADC\'s 3.3 V); from 3.3 V a warning, and nothing', async () => {
    const spec = mod('mq2', ['ao', 'out', 'gnd', 'vcc'], { ao: 'GP26', vcc: 'VBUS', gnd: 'GND' });
    const r = await run(spec, twice(volts(26)), [at(0.25, { position: 1 })]);
    const [clean, gas] = lines(r)[0]!.split(' ').map(Number) as [number, number];
    expect(clean).toBeCloseTo(0.4, 1);
    expect(gas).toBe(3.3);   // 3.5 V: above the Pico W's ADC range, it reads its top (a Learn note: a divider)
    expect(r.faults).toEqual([]);
    const low = await run(mod('mq2', ['ao', 'out', 'gnd', 'vcc'], { ao: 'GP26', vcc: '3V3', gnd: 'GND' }), twice(volts(26)), [at(0.25, { position: 1 })]);
    expect(lines(low)).toEqual(['0.0 0.0']);
    expect(low.faults.map((f) => `${f.kind} ${f.on}`)).toContain('sensor-underpowered m1');
  });
});

describe('M6.5a the joystick, the rotary encoder, the IR speed sensor', () => {
  it('a joystick: VRx and VRy from 0 to 3.3 V, the middle at rest; SW pulls to GND when pressed', async () => {
    const spec = mod('joystick', ['gnd', 'vcc', 'vrx', 'vry', 'sw'], { vrx: 'GP26', vry: 'GP27', sw: 'GP14', vcc: '3V3', gnd: 'GND' });
    const r = await run(spec, `from machine import Pin, ADC\nimport time\nsw = Pin(14, Pin.IN, Pin.PULL_UP)\ntime.sleep(0.1)\na = (${volts(26)}, ${volts(27)}, sw.value())\ntime.sleep(0.5)\nprint(a, (${volts(26)}, ${volts(27)}, sw.value()))\n`,
      [at(0.25, { x: 1, y: 0, pressed: true })]);
    expect(lines(r)).toEqual(['(1.65, 1.65, 1) (3.3, 0.0, 0)']);
  });

  it('a rotary encoder (KY-040): 3 steps one way, 1 the other — counted on CLK\'s falling edge', async () => {
    const spec = mod('rotary-encoder', ['clk', 'dt', 'sw', 'vcc', 'gnd'], { clk: 'GP14', dt: 'GP15', vcc: '3V3', gnd: 'GND' });
    const r = await run(spec, [
      'from machine import Pin', 'import time', 'clk, dt = Pin(14, Pin.IN), Pin(15, Pin.IN)', 'n = 0',
      'def turn(p):', '    global n', '    n += 1 if dt.value() else -1',
      'clk.irq(turn, Pin.IRQ_FALLING)', 'time.sleep(1)', 'print(n, clk.value(), dt.value())', '',
    ].join('\n'), [at(0.2, { steps: 3 }), at(0.6, { steps: 2 })]);
    expect(lines(r)).toEqual(['2 1 1']);
  });

  it('an IR speed sensor: a wheel at 60 rpm (20 slots) gives 20 pulses a second', async () => {
    const spec = mod('speed-sensor', ['vcc', 'gnd', 'out'], { out: 'GP14', vcc: '3V3', gnd: 'GND' });
    const r = await run(spec, [
      'from machine import Pin', 'import time', 'n = 0', 'def count(p):', '    global n', '    n += 1',
      'Pin(14, Pin.IN).irq(count, Pin.IRQ_RISING)', 'time.sleep(1)', 'print(n)', '',
    ].join('\n'), [at(0, { rpm: 60 })]);
    expect(Number(lines(r)[0])).toBeGreaterThanOrEqual(19);
    expect(Number(lines(r)[0])).toBeLessThanOrEqual(21);
  });
});
