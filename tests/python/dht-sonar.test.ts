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
 * M6.4 against their datasheets. DHT11 / DHT22 (a 3-pin module, its 10 kΩ pull-up on the board, 3.3–5.5 V): the `dht`
 * module (micropython/drivers/dht) reads 5 bytes — DHT11: humidity %, 0, °C, 0, checksum; DHT22: humidity × 10 and
 * °C × 10 (the top bit the sign), 16 bits each, and the checksum; with no answer `dht_readinto` raises OSError 110
 * (ETIMEDOUT). The micro:bit's MicroPython has no `dht` module. HC-SR04 (5 V): a trigger pulse of ≥ 10 µs, then Echo
 * high for the sound's way there and back, 58 µs per cm (343 m/s), at 5 V — too much for a 3.3 V pin without a divider.
 */
const DATA = { 'pico-w': parseBoard(picoJson), 'esp32-devkit-v1': parseBoard(espJson), 'microbit-v2': parseBoard(mbitJson) } as const;
const w = (id: string, a: string, b: string): WireSpec => ({ id, a, b });
function circuit(board: SimBoard, parts: PartSpec[], wires: WireSpec[]): CircuitSpec {
  return { board: { data: DATA[board as keyof typeof DATA] }, breadboards: [{ id: 'bb1', size: 'half' }], parts, wires };
}
async function run(board: SimBoard, spec: CircuitSpec, main: string, partInputs: PartChange[] = []): Promise<RunResult> {
  return runProject(await nodeLoader(), { board, files: { 'main.py': main }, clock: new VirtualClock(), circuit: spec, partInputs });
}
const lines = (r: RunResult) => r.output.trim().split('\n');

/** A DHT module in a10 (VCC), a11 (DATA), a12 (GND) from 3V3, its data to `pin`. */
const dht = (board: SimBoard, kind: 'DHT11' | 'DHT22', pin: string, supply = '3V3') => circuit(board,
  [{ id: 'dht1', type: 'dht', props: { kind }, legs: { vcc: 'bb1.a10', out: 'bb1.a11', gnd: 'bb1.a12' } }],
  [w('w1', `board.${supply}`, 'bb1.e10'), w('w2', `board.${pin}`, 'bb1.e11'), w('w3', 'board.GND', 'bb1.e12')]);

describe('M6.4 DHT11 / DHT22 with the dht module', () => {
  const read = (pin: number, kind: string) => `import dht\nfrom machine import Pin\nd = dht.${kind}(Pin(${pin}))\nd.measure()\nprint(d.temperature(), d.humidity())\n`;

  it('a DHT22 on the Pico W: tenths of a degree and of a percent; 22 °C and 50 % when nothing sets them', async () => {
    expect(lines(await run('pico-w', dht('pico-w', 'DHT22', 'GP15'), read(15, 'DHT22')))).toEqual(['22.0 50.0']);
    const r = await run('pico-w', dht('pico-w', 'DHT22', 'GP15'), read(15, 'DHT22'), [{ atUs: 0, part: 'dht1', celsius: 27.3, humidity: 61.5 }]);
    expect(lines(r)).toEqual(['27.3 61.5']);
    expect(r.faults).toEqual([]);
  });

  it('below zero the DHT22 sets the sign bit; the driver gives a negative temperature', async () => {
    const r = await run('pico-w', dht('pico-w', 'DHT22', 'GP15'), read(15, 'DHT22'), [{ atUs: 0, part: 'dht1', celsius: -4.2, humidity: 30 }]);
    expect(lines(r)).toEqual(['-4.2 30.0']);
  });

  it('a DHT11 gives whole numbers, within its range (0–50 °C, 20–90 %); the bytes add up to the checksum', async () => {
    const r = await run('esp32-devkit-v1', dht('esp32-devkit-v1', 'DHT11', 'D4'),
      'import dht\nfrom machine import Pin\nd = dht.DHT11(Pin(4))\nd.measure()\nb = d.buf\nprint(d.temperature(), d.humidity(), (b[0] + b[1] + b[2] + b[3]) & 0xff == b[4])\n',
      [{ atUs: 0, part: 'dht1', celsius: 63.4, humidity: 97 }]);
    expect(lines(r)).toEqual(['50 90 True']);
  });

  it('nothing on the pin, or the module not powered: OSError 110 (ETIMEDOUT), as on the board', async () => {
    const code = 'import dht\nfrom machine import Pin\ntry:\n    dht.DHT22(Pin(14)).measure()\nexcept OSError as e:\n    print(e.errno)\n';
    expect(lines(await run('pico-w', dht('pico-w', 'DHT22', 'GP15'), code))).toEqual(['110']);
    const off = circuit('pico-w', [{ id: 'dht1', type: 'dht', props: { kind: 'DHT22' }, legs: { vcc: 'bb1.a10', out: 'bb1.a11', gnd: 'bb1.a12' } }],
      [w('w2', 'board.GP15', 'bb1.e11'), w('w3', 'board.GND', 'bb1.e12')]);
    expect(lines(await run('pico-w', off, code.replace('Pin(14)', 'Pin(15)')))).toEqual(['110']);
  });

  it('a reading takes the time the C driver takes: 250 ms high, the 18 ms start, ≈ 4 ms of bits', async () => {
    const r = await run('pico-w', dht('pico-w', 'DHT22', 'GP15'),
      'import dht, time\nfrom machine import Pin\nd = dht.DHT22(Pin(15))\nt = time.ticks_us()\nd.measure()\nprint(time.ticks_diff(time.ticks_us(), t) // 1000)\n');
    expect(Number(lines(r)[0])).toBeGreaterThanOrEqual(270);
    expect(Number(lines(r)[0])).toBeLessThanOrEqual(274);
  });
});

/** HC-SR04: VCC a10 (5 V), Trig a11 ← `trig`, Echo a12 → a 1 k / 2 k divider → `echo`, GND a13. */
function sonar(board: SimBoard, supply: string, trig: string, echo: string, divider = true): CircuitSpec {
  const parts: PartSpec[] = [{ id: 'sonar1', type: 'hc-sr04', legs: { vcc: 'bb1.a10', trig: 'bb1.a11', echo: 'bb1.a12', gnd: 'bb1.a13' } }];
  const wires = [w('w1', `board.${supply}`, 'bb1.e10'), w('w2', `board.${trig}`, 'bb1.e11'), w('w4', 'board.GND', 'bb1.e13')];
  if (divider) {
    parts.push({ id: 'r1', type: 'resistor', props: { ohms: 1000 }, legs: { a: 'bb1.d12', b: 'bb1.d16' } }, { id: 'r2', type: 'resistor', props: { ohms: 2000 }, legs: { a: 'bb1.c16', b: 'bb1.c20' } });
    wires.push(w('w3', `board.${echo}`, 'bb1.e16'), w('w5', `board.${board === 'esp32-devkit-v1' ? 'GND@29' : 'GND@8'}`, 'bb1.e20'));   // a second GND
  } else {
    wires.push(w('w3', `board.${echo}`, 'bb1.e12'));
  }
  return circuit(board, parts, wires);
}
const ping = (trig: number, echo: number) => [
  'from machine import Pin, time_pulse_us', 'import time',
  `trig = Pin(${trig}, Pin.OUT)`, `echo = Pin(${echo}, Pin.IN)`,
  'def cm():', '    trig.value(1)', '    time.sleep_us(10)', '    trig.value(0)', '    return time_pulse_us(echo, 1, 30000) / 58',
].join('\n');

describe('M6.4 HC-SR04 with time_pulse_us', () => {
  it('Echo lasts 58 µs per cm: 50 cm, then 10 cm; 100 cm when nothing sets it', async () => {
    const r = await run('pico-w', sonar('pico-w', 'VBUS', 'GP14', 'GP15'),
      `${ping(14, 15)}\nprint(round(cm()))\ntime.sleep(1)\nprint(round(cm()))\ntime.sleep(1)\nprint(round(cm(), 1))\n`,
      [{ atUs: 500_000, part: 'sonar1', cm: 50 }, { atUs: 1_500_000, part: 'sonar1', cm: 10 }]);
    expect(lines(r)).toEqual(['100', '50', '10.0']);
    expect(r.faults).toEqual([]);
  });

  it('the ESP32 (screen 07): 34 cm is an echo of 1972 µs', async () => {
    const r = await run('esp32-devkit-v1', sonar('esp32-devkit-v1', 'VIN', 'D5', 'D18'),
      'from machine import Pin, time_pulse_us\nimport time\ntrig = Pin(5, Pin.OUT)\necho = Pin(18, Pin.IN)\ntrig.value(1)\ntime.sleep_us(10)\ntrig.value(0)\nprint(time_pulse_us(echo, 1, 30000))\n',
      [{ atUs: 0, part: 'sonar1', cm: 34 }]);
    expect(lines(r)).toEqual(['1972']);
  });

  it('no trigger, no echo: time_pulse_us times out (−2)', async () => {
    const r = await run('pico-w', sonar('pico-w', 'VBUS', 'GP14', 'GP15'), 'from machine import Pin, time_pulse_us\nprint(time_pulse_us(Pin(15, Pin.IN), 1, 30000))\n');
    expect(lines(r)).toEqual(['-2']);
  });

  it('from 3.3 V it can\'t work: no echo, and a warning says it needs 4.5 V', async () => {
    const r = await run('pico-w', sonar('pico-w', '3V3', 'GP14', 'GP15'), `${ping(14, 15)}\nprint(cm() < 0)\n`);
    expect(lines(r)).toEqual(['True']);
    expect(r.faults.map((f) => `${f.kind} ${f.on}`)).toContain('sensor-underpowered sonar1');
  });

  it('Echo straight to a Pico W pin, with no divider: 5 V damages it, the run stops', async () => {
    const r = await run('pico-w', sonar('pico-w', 'VBUS', 'GP14', 'GP15', false), `${ping(14, 15)}\ncm()\nprint('still here')\n`);
    expect(r.ended).toBe('fault');
    expect(r.faults.map((f) => `${f.kind} ${f.on}`)).toContain('over-voltage GP15');
  });

  it('the micro:bit: its 5V pin and machine.time_pulse_us', async () => {
    const spec = circuit('microbit-v2', [
      { id: 'sonar1', type: 'hc-sr04', legs: { vcc: 'bb1.a10', trig: 'bb1.a11', echo: 'bb1.a12', gnd: 'bb1.a13' } },
      { id: 'r1', type: 'resistor', props: { ohms: 1000 }, legs: { a: 'bb1.d12', b: 'bb1.d16' } },
      { id: 'r2', type: 'resistor', props: { ohms: 2000 }, legs: { a: 'bb1.c16', b: 'bb1.c20' } },
    ], [w('w1', 'board.5V', 'bb1.e10'), w('w2', 'board.P1', 'bb1.e11'), w('w3', 'board.P2', 'bb1.e16'), w('w4', 'board.GND', 'bb1.e13'), w('w5', 'board.GND@15', 'bb1.e20')]);
    const r = await run('microbit-v2', spec, [
      'from microbit import *', 'from machine import time_pulse_us', 'import utime',
      'pin1.write_digital(1)', 'utime.sleep_us(10)', 'pin1.write_digital(0)', 'print(round(time_pulse_us(pin2, 1, 30000) / 58))', '',
    ].join('\n'), [{ atUs: 0, part: 'sonar1', cm: 25 }]);
    expect(lines(r)).toEqual(['25']);
  });
});

/** A clock that wakes 3 ms late from every sleep, as a busy laptop's can. */
class LateClock extends VirtualClock {
  override sleepUs(us: number, wake?: () => boolean): boolean {
    return super.sleepUs(us + 3000, wake);
  }
}

describe('M6.4 time_pulse_us times an edge when it was due, not when the sim woke for it', () => {
  it('waking 3 ms late, 50 cm still reads 50 cm (2900 µs)', async () => {
    const r = await runProject(await nodeLoader(), {
      board: 'pico-w', clock: new LateClock(), circuit: sonar('pico-w', 'VBUS', 'GP14', 'GP15'),
      files: { 'main.py': `${ping(14, 15)}\nprint(round(cm()))\n` }, partInputs: [{ atUs: 0, part: 'sonar1', cm: 50 }],
    });
    expect(lines(r)).toEqual(['50']);
  });
});
