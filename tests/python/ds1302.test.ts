import { describe, expect, it } from 'vitest';
import { parseBoard } from '@lib/boards';
import type { CircuitSpec, WireSpec } from '@lib/circuit';
import picoJson from '../../library/boards/pico-w/board.json';
import mbitJson from '../../library/boards/microbit-v2/board.json';
import { VirtualClock } from '../../src/sim/clock';
import { runProject, type RunResult, type SimBoard } from '../../src/sim/run';
import { nodeLoader } from './vm';

/**
 * M6.5b the DS1302 real-time clock (Maxim DS1302 datasheet) on a module (VCC GND CLK DAT RST), driven pin by pin as a
 * program's driver does it: CE (RST) high, a command byte LSB first on I/O at each CLK rising edge (bit 0: read,
 * bits 5–1 the register), then data — written at rising edges, or sent by the chip from the falling edge of the
 * command's last clock. Registers in BCD: seconds (bit 7 CH, the clock halted), minutes, hours, date, month, day,
 * year; control (bit 7 WP); burst (0xBE / 0xBF); 31 bytes of RAM (0xC0…). It keeps time from the sim's clock.
 */
const DATA = { 'pico-w': parseBoard(picoJson), 'microbit-v2': parseBoard(mbitJson) } as const;
const w = (id: string, a: string, b: string): WireSpec => ({ id, a, b });
function rtc(board: SimBoard, clk: string, dat: string, rst: string, supply: string): CircuitSpec {
  const legs = ['vcc', 'gnd', 'clk', 'dat', 'rst'];
  return {
    board: { data: DATA[board as keyof typeof DATA] }, breadboards: [{ id: 'bb1', size: 'half' }],
    parts: [{ id: 'rtc1', type: 'ds1302', legs: Object.fromEntries(legs.map((l, i) => [l, `bb1.a${10 + i}`])) }],
    wires: [w('w1', `board.${supply}`, 'bb1.e10'), w('w2', 'board.GND', 'bb1.e11'), w('w3', `board.${clk}`, 'bb1.e12'), w('w4', `board.${dat}`, 'bb1.e13'), w('w5', `board.${rst}`, 'bb1.e14')],
  };
}
async function run(board: SimBoard, spec: CircuitSpec, main: string): Promise<RunResult> {
  return runProject(await nodeLoader(), { board, files: { 'main.py': main }, clock: new VirtualClock(), circuit: spec });
}
const lines = (r: RunResult) => r.output.trim().split('\n');

/** A driver as kit tutorials write it (after micropython-ds1302): bytes LSB first, I/O read before each clock. */
const DRIVER = `from machine import Pin
import time
clk, dat, rst = Pin(13, Pin.OUT, value=0), Pin(14, Pin.OUT), Pin(15, Pin.OUT, value=0)
def wbyte(b):
    dat.init(Pin.OUT)
    for i in range(8):
        dat.value((b >> i) & 1)
        clk.value(1)
        clk.value(0)
def rbyte():
    dat.init(Pin.IN)
    d = 0
    for i in range(8):
        d |= dat.value() << i
        clk.value(1)
        clk.value(0)
    return d
def get(reg):
    rst.value(1)
    wbyte(reg | 1)
    d = rbyte()
    rst.value(0)
    return d
def put(reg, v):
    rst.value(1)
    wbyte(reg)
    wbyte(v)
    rst.value(0)
bcd = lambda v: (v // 10) << 4 | v % 10
dec = lambda b: (b >> 4) * 10 + (b & 15)
def now():
    return [dec(get(r)) for r in (0x8C, 0x88, 0x86, 0x84, 0x82)] + [dec(get(0x80) & 0x7F)]
def set_time(y, mo, d, h, mi, s):
    put(0x8E, 0)
    for r, v in ((0x8C, y), (0x88, mo), (0x86, d), (0x84, h), (0x82, mi), (0x80, s)):
        put(r, bcd(v))
`;

describe('M6.5b the DS1302 clock, pin by pin', () => {
  it('set to 31 Dec 2026, 23:59:50, it runs into the new year', async () => {
    const r = await run('pico-w', rtc('pico-w', 'GP13', 'GP14', 'GP15', '3V3'), `${DRIVER}set_time(26, 12, 31, 23, 59, 50)\nprint(now())\ntime.sleep(12)\nprint(now())\n`);
    expect(lines(r)).toEqual(['[26, 12, 31, 23, 59, 50]', '[27, 1, 1, 0, 0, 2]']);
    expect(r.faults).toEqual([]);
  });

  it('CH set: the clock stands still; WP set: writes are ignored', async () => {
    const r = await run('pico-w', rtc('pico-w', 'GP13', 'GP14', 'GP15', '3V3'), [
      DRIVER, 'set_time(26, 1, 1, 8, 0, 0)', 'put(0x80, 0x80 | bcd(10))', 'time.sleep(3)', 'print(hex(get(0x80)))',
      'put(0x80, bcd(10))', 'put(0x8E, 0x80)', 'put(0x82, bcd(45))', 'time.sleep(2)', 'print(now()[4:])', '',
    ].join('\n'));
    expect(lines(r)).toEqual(['0x90', '[0, 12]']);
  });

  it('a burst read gives the 8 clock registers; RAM keeps what is written', async () => {
    const r = await run('pico-w', rtc('pico-w', 'GP13', 'GP14', 'GP15', '3V3'), [
      DRIVER, 'set_time(26, 11, 7, 9, 30, 15)', 'put(0xC0, 42)',
      'rst.value(1)', 'wbyte(0xBF)', 'b = [rbyte() for _ in range(8)]', 'rst.value(0)',
      'print([dec(x) for x in b[:5]], dec(b[6]), get(0xC0))', '',
    ].join('\n'));
    expect(lines(r)).toEqual(['[15, 30, 9, 7, 11] 26 42']);
  });

  it('not powered: I/O never answers (reads 0)', async () => {
    const spec = rtc('pico-w', 'GP13', 'GP14', 'GP15', '3V3');
    spec.wires = spec.wires.filter((x) => x.id !== 'w1');
    const r = await run('pico-w', spec, `${DRIVER}set_time(26, 1, 1, 8, 0, 0)\nprint(now())\n`);
    expect(lines(r)).toEqual(['[0, 0, 0, 0, 0, 0]']);
  });

  it('on the micro:bit, with its pins written and read by hand', async () => {
    const r = await run('microbit-v2', rtc('microbit-v2', 'P13', 'P14', 'P15', '3.3V'), [
      'from microbit import *',
      'def wbyte(b):', '    for i in range(8):', '        pin14.write_digital((b >> i) & 1)', '        pin13.write_digital(1)', '        pin13.write_digital(0)',
      'def rbyte():', '    d = 0', '    pin14.set_pull(pin14.NO_PULL)', '    for i in range(8):', '        d |= pin14.read_digital() << i', '        pin13.write_digital(1)', '        pin13.write_digital(0)', '    return d',
      'def put(reg, v):', '    pin15.write_digital(1)', '    wbyte(reg)', '    wbyte(v)', '    pin15.write_digital(0)',
      'def get(reg):', '    pin15.write_digital(1)', '    wbyte(reg | 1)', '    d = rbyte()', '    pin15.write_digital(0)', '    return d',
      'pin13.write_digital(0)', 'put(0x8E, 0)', 'put(0x80, 0x05)', 'sleep(2000)', 'print(get(0x80))', '',
    ].join('\n'));
    expect(lines(r)).toEqual(['7']);
  });
});
