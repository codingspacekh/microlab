import { describe, expect, it } from 'vitest';
import { parseBoard } from '@lib/boards';
import type { CircuitSpec, PartSpec, WireSpec } from '@lib/circuit';
import picoJson from '../../library/boards/pico-w/board.json';
import espJson from '../../library/boards/esp32-devkit-v1/board.json';
import mbitJson from '../../library/boards/microbit-v2/board.json';
import { VirtualClock } from '../../src/sim/clock';
import type { PartChange } from '../../src/sim/circuit';
import { runProject, type RunResult, type SimBoard } from '../../src/sim/run';
import { nodeLoader } from './vm';

/**
 * M6.3 against their datasheets: the PIR motion sensor (HC-SR501: 4.5–20 V, its output 3.3 V while it sees motion and
 * for its hold time after, 3 s at the pot's shortest), the IR line sensor (a TCRT5000 module: 3.3–5 V, its comparator
 * pulls OUT low over a white surface, a 10 kΩ pull-up to VCC makes it high over the black line), the capacitive soil
 * moisture sensor (v1.2: ≈ 2.4 V in dry soil, ≈ 0.9 V in water, from 3.3 V), the TMP36 (2.7–5.5 V, 0.5 V + 10 mV/°C)
 * and the LM35 (4–30 V, 10 mV/°C). Each has VCC, OUT and GND legs; below its supply it gives nothing and says so.
 */
const DATA = { 'pico-w': parseBoard(picoJson), 'esp32-devkit-v1': parseBoard(espJson), 'microbit-v2': parseBoard(mbitJson) } as const;

function circuit(board: SimBoard, parts: PartSpec[], wires: WireSpec[]): CircuitSpec {
  return { board: { data: DATA[board as keyof typeof DATA] }, breadboards: [{ id: 'bb1', size: 'half' }], parts, wires };
}
const w = (id: string, a: string, b: string): WireSpec => ({ id, a, b });

/** A three-leg sensor in a10 (vcc), a11 (out), a12 (gnd), wired from `supply`, to `pin`, and to `gnd`. */
function sensor(board: SimBoard, type: string, supply: string, pin: string, gnd: string, props: Record<string, string> = {}): CircuitSpec {
  return circuit(board, [{ id: 's1', type, props, legs: { vcc: 'bb1.a10', out: 'bb1.a11', gnd: 'bb1.a12' } }],
    [w('w1', `board.${supply}`, 'bb1.e10'), w('w2', `board.${pin}`, 'bb1.e11'), w('w3', `board.${gnd}`, 'bb1.e12')]);
}

async function run(board: SimBoard, spec: CircuitSpec, main: string, partInputs: PartChange[] = []): Promise<RunResult> {
  return runProject(await nodeLoader(), { board, files: { 'main.py': main }, clock: new VirtualClock(), circuit: spec, partInputs });
}
const lines = (r: RunResult) => r.output.trim().split('\n');
const warnings = (r: RunResult) => r.faults.map((f) => `${f.kind} ${f.on}`);

describe('M6.3 the PIR motion sensor (HC-SR501)', () => {
  const sample = 'from machine import Pin\nimport time\np = Pin(14, Pin.IN)\nfor s in (0.3, 0.7, 2.5, 0.5):\n    time.sleep(s)\n    print(p.value())\n';

  it('from 5 V: high while it sees motion and for 3 s after, then low', async () => {
    const r = await run('pico-w', sensor('pico-w', 'pir', 'VBUS', 'GP14', 'GND'), sample,
      [{ atUs: 500_000, part: 's1', pressed: true }, { atUs: 700_000, part: 's1', pressed: false }]);
    expect(lines(r)).toEqual(['0', '1', '1', '0']);   // at 0.3, 1.0, 3.5 (held), 4.0 s (3 s after 0.7)
    expect(r.faults).toEqual([]);
  });

  it('a program waiting for it sees it go high with the motion and low 3 s after the motion ends', async () => {
    const r = await run('pico-w', sensor('pico-w', 'pir', 'VBUS', 'GP14', 'GND'), [
      'from machine import Pin', 'import time', 'p = Pin(14, Pin.IN)', 'start = time.ticks_ms()',
      'while p.value() == 0:', '    time.sleep_ms(5)', 'seen = time.ticks_diff(time.ticks_ms(), start)',
      'while p.value() == 1:', '    time.sleep_ms(5)', 'print(seen, time.ticks_diff(time.ticks_ms(), start))', '',
    ].join('\n'), [{ atUs: 200_000, part: 's1', pressed: true }, { atUs: 300_000, part: 's1', pressed: false }]);
    const [seen, gone] = lines(r)[0]!.split(' ').map(Number) as [number, number];
    expect(seen).toBeGreaterThanOrEqual(200);
    expect(seen).toBeLessThan(215);
    expect(gone).toBeGreaterThanOrEqual(3300);
    expect(gone).toBeLessThan(3315);
  });

  it('from 3.3 V it can\'t work: never high, and a warning says it needs 4.5 V', async () => {
    const r = await run('pico-w', sensor('pico-w', 'pir', '3V3', 'GP14', 'GND'), sample,
      [{ atUs: 500_000, part: 's1', pressed: true }, { atUs: 700_000, part: 's1', pressed: false }]);
    expect(lines(r)).toEqual(['0', '0', '0', '0']);
    expect(warnings(r)).toContain('sensor-underpowered s1');
  });

  it('the micro:bit\'s 5V pin (its GPIO board\'s USB plugged in) powers it', async () => {
    const r = await run('microbit-v2', sensor('microbit-v2', 'pir', '5V', 'P1', 'GND'),
      'from microbit import *\nsleep(300)\na = pin1.read_digital()\nsleep(400)\nprint(a, pin1.read_digital())\n',
      [{ atUs: 500_000, part: 's1', pressed: true }]);
    expect(lines(r)).toEqual(['0 1']);
  });
});

describe('M6.3 the IR line sensor (TCRT5000 module)', () => {
  it('over white it reads 0, over the black line 1; from 3.3 V', async () => {
    const r = await run('pico-w', sensor('pico-w', 'line-sensor', '3V3', 'GP14', 'GND'),
      'from machine import Pin\nimport time\np = Pin(14, Pin.IN)\ntime.sleep(0.2)\na = p.value()\ntime.sleep(0.5)\nprint(a, p.value())\n',
      [{ atUs: 500_000, part: 's1', position: 1 }]);
    expect(lines(r)).toEqual(['0 1']);
    expect(r.faults).toEqual([]);
  });

  it('from 5 V its high is 5 V: too much for the Pico W\'s pin, which is damaged', async () => {
    const r = await run('pico-w', sensor('pico-w', 'line-sensor', 'VBUS', 'GP14', 'GND'),
      'from machine import Pin\nimport time\np = Pin(14, Pin.IN)\ntime.sleep(0.5)\n', [{ atUs: 100_000, part: 's1', position: 1 }]);
    expect(r.ended).toBe('fault');
    expect(warnings(r)).toContain('over-voltage GP14');
  });
});

describe('M6.3 the capacitive soil moisture sensor (v1.2)', () => {
  it('dry soil ≈ 2.4 V, wet ≈ 0.9 V on the ADC', async () => {
    const r = await run('pico-w', sensor('pico-w', 'soil-moisture', '3V3', 'GP26', 'GND'),
      'from machine import ADC\nimport time\na = ADC(26)\ntime.sleep(0.2)\nd = a.read_u16() * 3.3 / 65535\ntime.sleep(0.5)\nprint("%.2f %.2f" % (d, a.read_u16() * 3.3 / 65535))\n',
      [{ atUs: 0, part: 's1', position: 0 }, { atUs: 500_000, part: 's1', position: 1 }]);
    const [dry, wet] = lines(r)[0]!.split(' ').map(Number) as [number, number];
    expect(dry).toBeCloseTo(2.4, 1);
    expect(wet).toBeCloseTo(0.9, 1);
  });
});

describe('M6.3 the TMP36 and the LM35', () => {
  it('a TMP36 at 25 °C gives 0.75 V on the Pico W; at −10 °C 0.40 V', async () => {
    const r = await run('pico-w', sensor('pico-w', 'temp-sensor', '3V3', 'GP26', 'GND', { kind: 'TMP36' }), [
      'from machine import ADC', 'import time', 'a = ADC(26)', 'def c():', '    return (a.read_u16() * 3.3 / 65535 - 0.5) * 100',
      'time.sleep(0.2)', 'x = c()', 'time.sleep(0.5)', 'print(round(x), round(c()))', '',
    ].join('\n'), [{ atUs: 0, part: 's1', celsius: 25 }, { atUs: 500_000, part: 's1', celsius: -10 }]);
    expect(lines(r)).toEqual(['25 -10']);
    expect(r.faults).toEqual([]);
  });

  it('room temperature (22 °C) when nothing sets it; the ESP32 reads it in µV', async () => {
    const r = await run('esp32-devkit-v1', sensor('esp32-devkit-v1', 'temp-sensor', '3V3', 'D34', 'GND', { kind: 'TMP36' }),
      'from machine import ADC, Pin\nimport time\na = ADC(Pin(34), atten=ADC.ATTN_11DB)\ntime.sleep(0.1)\nprint(round((a.read_uv() / 1e6 - 0.5) * 100))\n');
    expect(lines(r)).toEqual(['22']);
  });

  it('the micro:bit reads a TMP36 on pin 2 (0–1023)', async () => {
    const r = await run('microbit-v2', sensor('microbit-v2', 'temp-sensor', '3.3V', 'P2', 'GND', { kind: 'TMP36' }),
      'from microbit import *\nsleep(100)\nprint(round((pin2.read_analog() * 3.3 / 1023 - 0.5) * 100))\n', [{ atUs: 0, part: 's1', celsius: 30 }]);
    expect(lines(r)).toEqual(['30']);
  });

  it('an LM35 from 5 V: 10 mV/°C; from 3.3 V it is under its 4 V and says so', async () => {
    const code = 'from machine import ADC\nimport time\na = ADC(26)\ntime.sleep(0.1)\nprint(round(a.read_u16() * 3.3 / 65535 * 100))\n';
    const ok = await run('pico-w', sensor('pico-w', 'temp-sensor', 'VBUS', 'GP26', 'GND', { kind: 'LM35' }), code, [{ atUs: 0, part: 's1', celsius: 31 }]);
    expect(lines(ok)).toEqual(['31']);
    expect(ok.faults).toEqual([]);
    const low = await run('pico-w', sensor('pico-w', 'temp-sensor', '3V3', 'GP26', 'GND', { kind: 'LM35' }), code, [{ atUs: 0, part: 's1', celsius: 31 }]);
    expect(lines(low)).toEqual(['0']);
    expect(warnings(low)).toContain('sensor-underpowered s1');
  });
});
