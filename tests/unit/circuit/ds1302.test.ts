import { describe, expect, it } from 'vitest';
import { Ds1302 } from '@lib/circuit/ds1302';

/** M6.5b the DS1302 pin by pin (Maxim DS1302 datasheet): single registers, RAM, write protect, the year; CE low.
 *  tests/python/ds1302.test.ts drives it through the pack's ds1302.py. */
const START = Date.UTC(2026, 10, 8, 9, 30, 0);

function chip() {
  const c = new Ds1302(START, 0);
  let now = 0;
  const bits = (byte: number) => [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (byte >> i) & 1);
  const write = (cmd: number, ...data: number[]) => {
    c.chipEnable(true);
    for (const b of [cmd, ...data]) for (const bit of bits(b)) { c.clock(true, bit, now); c.clock(false, bit, now); }
    c.chipEnable(false);
  };
  const read = (cmd: number, n = 1) => {
    c.chipEnable(true);
    const got: number[] = [];
    bits(cmd).forEach((bit, i) => { c.clock(true, bit, now); if (i < 7) c.clock(false, bit, now); });
    for (let k = 0; k < n * 8; k++) { c.clock(false, 0, now); got.push(c.io() ?? 1); c.clock(true, 0, now); }
    c.chipEnable(false);
    return Array.from({ length: n }, (_, k) => got.slice(k * 8, k * 8 + 8).reduce((b, x, i) => b | (x << i), 0));
  };
  return { c, write, read, later: (s: number) => { now += s * 1_000_000; } };
}

describe('M6.5b the DS1302, register by register', () => {
  it('the year (register 6) and the day (5) written one at a time', () => {
    const k = chip();
    k.write(0x8c, 0x27);   // year 27
    k.write(0x8a, 0x03);   // day 3
    expect(k.read(0x8d)).toEqual([0x27]);
    expect(k.read(0x8b)).toEqual([0x03]);
    expect(k.read(0x85)).toEqual([0x09]);   // the hours untouched
  });

  it('one RAM byte written and read; the bytes after a single write are ignored', () => {
    const k = chip();
    k.write(0xc4, 0x5a, 0x77);   // RAM 2, then a stray byte
    expect(k.read(0xc5)).toEqual([0x5a]);
    expect(k.read(0xc7)).toEqual([0x00]);
  });

  it('write protect (WP) keeps the clock and the RAM as they are, until it is cleared', () => {
    const k = chip();
    k.write(0x8e, 0x80);
    k.write(0x82, 0x45);
    k.write(0xc0, 0x11);
    expect(k.read(0x83)).toEqual([0x30]);
    expect(k.read(0xc1)).toEqual([0x00]);
    expect(k.read(0x8f)).toEqual([0x80]);
    k.write(0x8e, 0x00);
    k.write(0x82, 0x45);
    expect(k.read(0x83)).toEqual([0x45]);
  });

  it('with CE low it hears nothing and drives nothing', () => {
    const k = chip();
    k.c.clock(true, 1, 0);
    k.c.clock(false, 1, 0);
    expect(k.c.io()).toBeUndefined();
    k.later(2);
    expect(k.c.timeText(2_000_000)).toBe('09:30:02');
  });
});
