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

/** M7 slice 3 (screens 27, 27b, 27c), F-34: NeoPixels driven by MicroPython's own neopixel module — the firmware's
 *  neopixel.py through machine.bitstream on the Pico W and the ESP32, the micro:bit's through ws2812_write — a stick
 *  and a ring, a chain, GRB on every board, what they draw, and the mistakes. */
const DATA = { 'pico-w': parseBoard(picoJson), 'esp32-devkit-v1': parseBoard(espJson), 'microbit-v2': parseBoard(mbitJson) } as const;
const spec = (board: SimBoard, parts: PartSpec[], wires: [string, string][]): CircuitSpec => ({
  board: { data: DATA[board as keyof typeof DATA] }, breadboards: [], parts,
  wires: wires.map(([a, b], i) => ({ id: `w${i + 1}`, a, b })),
});
const run = async (board: SimBoard, circuit: CircuitSpec, main: string, seconds = 0.5): Promise<RunResult> =>
  runProject(await nodeLoader(), { board, files: { 'main.py': main }, clock: new VirtualClock(), circuit, maxUs: seconds * 1e6 });
const last = (r: RunResult, id: string) => r.parts.filter(([, p]) => p === id).at(-1)?.[2] as Extract<PartView, { kind: 'pixels' }> | undefined;
const py = (...lines: string[]) => `${lines.join('\n')}\n`;
/** The LEDs' colours from a view's hex. */
const rgb = (v?: { pixels: string }) => (v?.pixels.match(/.{6}/g) ?? []).map((h) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)));

const STICK: PartSpec = { id: 'neo1', type: 'neopixel', legs: {}, props: { shape: 'stick', leds: 8 } };
const RING: PartSpec = { id: 'neo2', type: 'neopixel', legs: {}, props: { shape: 'ring', leds: 12 } };
const POWER = (b: SimBoard, id: string, v5 = b === 'microbit-v2' ? 'board.5V' : b === 'esp32-devkit-v1' ? 'board.VIN' : 'board.VBUS'): [string, string][] =>
  [[v5, `${id}.vcc`], ['board.GND', `${id}.gnd`]];

describe('M7 NeoPixels on the Pico W (screen 27)', () => {
  it('a stick on GP0 and a ring on GP17, from VBUS: each LED shows what write() sent, in red, green, blue', async () => {
    const r = await run('pico-w', spec('pico-w', [STICK, RING], [...POWER('pico-w', 'neo1'), ...POWER('pico-w', 'neo2'), ['board.GP0', 'neo1.din'], ['board.GP17', 'neo2.din']]), py(
      'from machine import Pin', 'from neopixel import NeoPixel',
      'strip = NeoPixel(Pin(0), 8)', 'ring = NeoPixel(Pin(17), 12)',
      'strip[0] = (255, 0, 0)', 'strip[1] = (0, 255, 0)', 'strip[7] = (0, 0, 40)', 'strip.write()',
      'ring.fill((0, 0, 0))', 'ring[3] = (0, 0, 80)', 'ring.write()', 'print(len(ring), ring[3])',
    ));
    expect(r.error).toBeUndefined();
    expect(r.output).toContain('12 (0, 0, 80)');
    const s = last(r, 'neo1');
    expect(s).toMatchObject({ kind: 'pixels', on: true, lit: 3, from: 'VBUS', limitA: 0.5 });
    expect(rgb(s)).toEqual([[255, 0, 0], [0, 255, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 40]]);
    expect(rgb(last(r, 'neo2'))[3]).toEqual([0, 0, 80]);
    // red and green ≈ 20 mA each, the blue at 40 ≈ 3 mA, the 8 chips ≈ 5 mA
    expect(s!.amps).toBeCloseTo(0.02 + 0.02 + 40 / 255 * 0.02 + 8 * 0.0006, 3);
    expect(r.faults).toEqual([]);
  });

  it('the bytes go out green first (neopixel.py\'s ORDER), at 800 kHz, as on the real board', async () => {
    const r = await run('pico-w', spec('pico-w', [STICK], [...POWER('pico-w', 'neo1'), ['board.GP0', 'neo1.din']]), py(
      'from machine import Pin', 'from neopixel import NeoPixel', 'np = NeoPixel(Pin(0), 2)', 'np[0] = (255, 16, 1)', 'np.write()',
    ));
    expect(r.bus.map(([, e]) => e)).toEqual(['bitstream pin=0 timing=400,850,800,450 10ff01000000']);
    expect(rgb(last(r, 'neo1')).slice(0, 2)).toEqual([[255, 16, 1], [0, 0, 0]]);
  });

  it('a chain: the stick\'s DOUT into the ring\'s DIN, one NeoPixel(Pin(0), 20) for both — LED 8 is the ring\'s first', async () => {
    const r = await run('pico-w', spec('pico-w', [STICK, RING], [...POWER('pico-w', 'neo1'), ['neo1.vcc2', 'neo2.vcc'], ['neo1.gnd2', 'neo2.gnd'],
      ['board.GP0', 'neo1.din'], ['neo1.dout', 'neo2.din']]), py(
      'from machine import Pin', 'from neopixel import NeoPixel', 'np = NeoPixel(Pin(0), 20)', 'np[7] = (1, 2, 3)', 'np[8] = (9, 0, 0)', 'np[19] = (0, 9, 0)', 'np.write()',
    ));
    expect(rgb(last(r, 'neo1'))[7]).toEqual([1, 2, 3]);
    const ring = rgb(last(r, 'neo2'));
    expect(ring[0]).toEqual([9, 0, 0]);
    expect(ring[11]).toEqual([0, 9, 0]);
    expect(r.faults).toEqual([]);
  });

  it('timing=0 (400 kHz, for WS2811s) on a WS2812B: every bit is read as a 1 — full white', async () => {
    const r = await run('pico-w', spec('pico-w', [STICK], [...POWER('pico-w', 'neo1'), ['board.GP0', 'neo1.din']]), py(
      'from machine import Pin', 'from neopixel import NeoPixel', 'np = NeoPixel(Pin(0), 8, timing=0)', 'np[0] = (10, 0, 0)', 'np.write()',
    ));
    expect(last(r, 'neo1')).toMatchObject({ lit: 8 });
    expect(rgb(last(r, 'neo1'))[0]).toEqual([255, 255, 255]);
  });

  it('with no power it shows nothing and takes nothing; given power, it is dark until the next write()', async () => {
    const r = await run('pico-w', spec('pico-w', [STICK], [['board.GND', 'neo1.gnd'], ['board.GP0', 'neo1.din']]), py(
      'from machine import Pin', 'from neopixel import NeoPixel', 'np = NeoPixel(Pin(0), 8)', 'np.fill((50, 50, 50))', 'np.write()',
    ));
    expect(last(r, 'neo1')).toMatchObject({ kind: 'pixels', on: false, lit: 0, amps: 0 });
  });
});

describe('M7 NeoPixels on the ESP32 and the micro:bit (screen 27b)', () => {
  it('the ESP32: the same neopixel.py, on D5 from VIN', async () => {
    const r = await run('esp32-devkit-v1', spec('esp32-devkit-v1', [RING], [...POWER('esp32-devkit-v1', 'neo2'), ['board.D5', 'neo2.din']]), py(
      'from machine import Pin', 'from neopixel import NeoPixel', 'np = NeoPixel(Pin(5), 12)', 'np.fill((0, 30, 0))', 'np.write()',
    ));
    expect(r.error).toBeUndefined();
    expect(last(r, 'neo2')).toMatchObject({ on: true, lit: 12, from: 'VIN' });
    expect(rgb(last(r, 'neo2'))[11]).toEqual([0, 30, 0]);
  });

  it('the micro:bit\'s own neopixel: show() (and write()), fill(), clear(), on P0 from the GPIO board\'s 5V', async () => {
    const circuit = spec('microbit-v2', [RING], [...POWER('microbit-v2', 'neo2'), ['board.P0', 'neo2.din']]);
    const r = await run('microbit-v2', circuit, py(
      'from microbit import *', 'import neopixel', 'np = neopixel.NeoPixel(pin0, 12)',
      'np[0] = (255, 0, 0)', 'np.show()', 'sleep(100)', 'np.fill((0, 0, 9))', 'np.write()', 'sleep(100)', 'print(np[5], len(np))',
    ));
    expect(r.error).toBeUndefined();
    expect(r.output).toContain('(0, 0, 9) 12');
    const views = r.parts.filter(([, id]) => id === 'neo2').map(([, , v]) => v as Extract<PartView, { kind: 'pixels' }>);
    expect(views.some((v) => v.lit === 1 && rgb(v)[0]![0] === 255)).toBe(true);
    expect(last(r, 'neo2')).toMatchObject({ lit: 12 });
    const c = await run('microbit-v2', circuit, py('from microbit import *', 'import neopixel', 'np = neopixel.NeoPixel(pin0, 12)', 'np.fill((9, 9, 9))', 'np.show()', 'sleep(10)', 'np.clear()'));
    expect(last(c, 'neo2')).toMatchObject({ lit: 0 });
  });

  it('the micro:bit: its errors are its own module\'s (an LED past the end; not a pin)', async () => {
    const circuit = spec('microbit-v2', [RING], [...POWER('microbit-v2', 'neo2'), ['board.P0', 'neo2.din']]);
    const past = await run('microbit-v2', circuit, py('from microbit import *', 'import neopixel', 'np = neopixel.NeoPixel(pin0, 12)', 'np[12] = (1, 1, 1)'));
    expect(past.error).toMatchObject({ type: 'IndexError' });
    const pin = await run('microbit-v2', circuit, py('from microbit import *', 'import neopixel', 'np = neopixel.NeoPixel(0, 12)', 'np.show()'));
    expect(pin.error).toMatchObject({ type: 'TypeError', message: 'expecting a pin' });
  });
});

describe('M7 NeoPixel mistakes (screen 27c)', () => {
  it('data on the stick\'s DOUT: nothing lights, a warning naming the pin; the program runs on', async () => {
    const r = await run('pico-w', spec('pico-w', [STICK], [...POWER('pico-w', 'neo1'), ['board.GP0', 'neo1.dout']]), py(
      'from machine import Pin', 'from neopixel import NeoPixel', 'np = NeoPixel(Pin(0), 8)', 'np.fill((0, 40, 0))', 'np.write()', "print('done')",
    ));
    expect(r.error).toBeUndefined();
    expect(r.output).toContain('done');
    expect(last(r, 'neo1')).toMatchObject({ on: true, lit: 0 });
    expect(r.faults).toEqual([expect.objectContaining({ kind: 'neopixel-backwards', severity: 'warning', on: 'neo1', part: 'GP0' })]);
  });

  it('a ring of 24 at full white on VBUS asks ≈ 1.46 A of USB\'s 500 mA: a warning; it still lights', async () => {
    const ring24 = { ...RING, props: { shape: 'ring', leds: 24 } };
    const r = await run('pico-w', spec('pico-w', [ring24], [...POWER('pico-w', 'neo2'), ['board.GP17', 'neo2.din']]), py(
      'from machine import Pin', 'from neopixel import NeoPixel', 'np = NeoPixel(Pin(17), 24)', 'np.fill((255, 255, 255))', 'np.write()', 'import time', 'time.sleep_ms(50)',
    ));
    expect(r.error).toBeUndefined();
    expect(last(r, 'neo2')).toMatchObject({ on: true, lit: 24 });
    const f = r.faults.filter((x) => x.kind !== 'floating');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ kind: 'neopixel-over-current', on: 'neo2', part: 'VBUS', limitA: 0.5 });
    expect(f[0]!.amps).toBeCloseTo(1.454, 2);
  });

  it('dimmed to (40, 40, 40) the same ring asks ≈ 0.24 A: no warning', async () => {
    const ring24 = { ...RING, props: { shape: 'ring', leds: 24 } };
    const r = await run('pico-w', spec('pico-w', [ring24], [...POWER('pico-w', 'neo2'), ['board.GP17', 'neo2.din']]), py(
      'from machine import Pin', 'from neopixel import NeoPixel', 'np = NeoPixel(Pin(17), 24)', 'np.fill((40, 40, 40))', 'np.write()',
    ));
    expect(last(r, 'neo2')!.amps).toBeCloseTo(24 * (0.0006 + 120 / 255 * 0.02), 3);
    expect(r.faults.filter((x) => x.kind !== 'floating')).toEqual([]);
  });

  it('a ring on the micro:bit\'s own 3.3V at white asks 720 mA of its 190 mA: a warning', async () => {
    const r = await run('microbit-v2', spec('microbit-v2', [RING], [['board.3.3V', 'neo2.vcc'], ['board.GND', 'neo2.gnd'], ['board.P0', 'neo2.din']]), py(
      'from microbit import *', 'import neopixel', 'np = neopixel.NeoPixel(pin0, 12)', 'np.fill((255, 255, 255))', 'np.show()', 'sleep(50)',
    ));
    expect(r.faults.find((x) => x.kind === 'neopixel-over-current')).toMatchObject({ on: 'neo2', part: '3.3V', limitA: 0.19 });
  });
});
