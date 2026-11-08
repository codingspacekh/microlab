import { describe, expect, it } from 'vitest';
import { analyse, connect, NEOPIXEL, neopixelCount, NeoPixels, ws2812Bits, type CircuitSpec, type SimState } from '@lib/circuit';
import { parseBoard } from '@lib/boards';
import picoJson from '../../../library/boards/pico-w/board.json';
import mbitJson from '../../../library/boards/microbit-v2/board.json';

/** M7 slice 3 (screens 27, 27b, 27c): WS2812B NeoPixels — what a frame sets, down a chain, what they draw, and the
 *  two mistakes: data on DOUT, more current than the supply gives. tests/python/neopixel.test.ts runs neopixel.py. */
const pico = parseBoard(picoJson);
const mbit = parseBoard(mbitJson);
const on = (board: typeof pico, parts: CircuitSpec['parts'], wires: [string, string][]): CircuitSpec =>
  ({ board: { data: board }, breadboards: [], parts, wires: wires.map(([a, b], i) => ({ id: `w${i + 1}`, a, b })) });
const STICK = { id: 'neo1', type: 'neopixel', legs: {}, props: { shape: 'stick', leds: 8 } };
const RING = { id: 'neo2', type: 'neopixel', legs: {}, props: { shape: 'ring', leds: 12 } };
const LOW: SimState['pins'] = { GP0: { mode: 'out', value: 0 } };

describe('M7 a WS2812B takes its 24 bits and passes the rest on', () => {
  it('each LED takes green, red, blue (neopixel.py\'s ORDER); the rest goes out of DOUT', () => {
    const s = new NeoPixels(2);
    const rest = s.take([0x00, 0xff, 0x00, 0x10, 0x20, 0x30, 1, 2, 3]);
    expect(s.pixels).toEqual([[255, 0, 0], [0x20, 0x10, 0x30]]);
    expect(rest).toEqual([1, 2, 3]);
    expect(s.lit()).toBe(2);
  });

  it('a short frame sets the first LEDs and leaves the others as they were; its last LED needs all 24 bits', () => {
    const s = new NeoPixels(3);
    s.take([9, 9, 9, 9, 9, 9, 9, 9, 9]);
    expect(s.take([0, 0, 0, 5, 5])).toEqual([]);
    expect(s.pixels).toEqual([[0, 0, 0], [9, 9, 9], [9, 9, 9]]);
  });

  it('counts a change only when a colour changed (the window is told then)', () => {
    const s = new NeoPixels(1);
    s.take([1, 2, 3]);
    const v = s.version;
    s.take([1, 2, 3]);
    expect(s.version).toBe(v);
    s.take([1, 2, 4]);
    expect(s.version).toBe(v + 1);
  });

  it('reads each bit by its high time: 800 kHz as sent; 400 kHz timing (WS2811) reads every bit as a 1 — full white', () => {
    expect(ws2812Bits([400, 850, 800, 450], [0x12, 0xf0])).toEqual([0x12, 0xf0]);
    expect(ws2812Bits([800, 1700, 1600, 900], [0x12, 0x00])).toEqual([0xff, 0xff]);
    expect(ws2812Bits([200, 1000, 400, 800], [0xff])).toEqual([0x00]);   // both too short: every bit a 0
  });

  it('draws ≈ 0.6 mA dark and 20 mA a colour at 255: full white ≈ 60 mA', () => {
    const s = new NeoPixels(12);
    expect(s.amps()).toBeCloseTo(12 * NEOPIXEL.idleA, 6);
    s.take(new Array(36).fill(255));
    expect(s.amps()).toBeCloseTo(12 * (NEOPIXEL.idleA + 3 * NEOPIXEL.channelA), 6);
    expect(12 * 3 * NEOPIXEL.channelA).toBeCloseTo(0.72, 6);
  });

  it('a stick has 8, 16 or 30 LEDs, a ring 8, 12, 16 or 24; anything else is the shape\'s first', () => {
    expect(neopixelCount({ shape: 'stick', leds: 30 })).toBe(30);
    expect(neopixelCount({ shape: 'ring', leds: 24 })).toBe(24);
    expect(neopixelCount({ shape: 'ring', leds: 30 })).toBe(8);
    expect(neopixelCount({})).toBe(8);
  });
});

describe('M7 a NeoPixel in the circuit', () => {
  it('its pads are points (no hole); its out side\'s 5V and GND are its in side\'s', () => {
    const spec = on(pico, [STICK, RING], [['board.VBUS', 'neo1.vcc'], ['board.GND', 'neo1.gnd'], ['neo1.vcc2', 'neo2.vcc'], ['neo1.gnd2', 'neo2.gnd'],
      ['board.GP0', 'neo1.din'], ['neo1.dout', 'neo2.din']]);
    const c = connect(spec);
    expect(c.problems).toEqual([]);
    expect(c.netOf('neo2.vcc')).toBe(c.netOf('board.VBUS'));
    expect(analyse(spec, { pins: LOW }).faults).toEqual([]);
  });

  it('data wired to DOUT is a warning on the NeoPixel (nothing lights); a chain\'s DOUT to the next DIN is not', () => {
    const backwards = on(pico, [STICK], [['board.VBUS', 'neo1.vcc'], ['board.GND', 'neo1.gnd'], ['board.GP0', 'neo1.dout']]);
    expect(analyse(backwards, { pins: LOW }).faults).toEqual([{ kind: 'neopixel-backwards', severity: 'warning', on: 'neo1', part: 'GP0' }]);
  });

  it('more than its supply gives: a warning with what they ask (not what the saturated supply could give), none of VBUS\'s own', () => {
    const ring24 = { ...RING, props: { shape: 'ring', leds: 24 } };
    const spec = on(pico, [STICK, ring24], [['board.VBUS', 'neo1.vcc'], ['board.GND', 'neo1.gnd'], ['board.VBUS', 'neo2.vcc'], ['board.GND', 'neo2.gnd'],
      ['board.GP0', 'neo1.din'], ['board.GP17', 'neo2.din']]);
    const white = 24 * (NEOPIXEL.idleA + 3 * NEOPIXEL.channelA);
    const ohms = { neo1: 5 / (8 * NEOPIXEL.idleA), neo2: 5 / white };
    const r = analyse(spec, { pins: LOW, parts: { neo1: { ohms: ohms.neo1 }, neo2: { ohms: ohms.neo2 } } });
    const f = r.faults.filter((x) => x.kind !== 'floating');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ kind: 'neopixel-over-current', severity: 'warning', on: 'neo2', part: 'VBUS', limitA: 0.5 });
    expect(f[0]!.amps).toBeCloseTo(white + 8 * NEOPIXEL.idleA, 3);
  });

  it('a ring on the micro:bit\'s own 3.3V: 12 at white ask 720 mA of its 190 mA', () => {
    const spec = on(mbit, [RING], [['board.3.3V', 'neo2.vcc'], ['board.GND', 'neo2.gnd'], ['board.P0', 'neo2.din']]);
    const white = 12 * (NEOPIXEL.idleA + 3 * NEOPIXEL.channelA);
    const r = analyse(spec, { pins: { P0: { mode: 'out', value: 0 } }, parts: { neo2: { ohms: 3.3 / white } } });
    expect(r.faults.find((x) => x.kind === 'neopixel-over-current')).toMatchObject({ on: 'neo2', part: '3.3V', limitA: 0.19 });
  });
});
