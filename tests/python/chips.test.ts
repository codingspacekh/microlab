import { describe, expect, it } from 'vitest';
import { parseBoard } from '@lib/boards';
import type { CircuitSpec, PartSpec, WireSpec } from '@lib/circuit';
import picoJson from '../../library/boards/pico-w/board.json';
import { VirtualClock } from '../../src/sim/clock';
import type { PartChange } from '../../src/sim/circuit';
import { runProject, type RunResult } from '../../src/sim/run';
import { nodeLoader } from './vm';

/**
 * M6.5b the kit's I²C chips, from their datasheets, on common modules (requirements Rev 8).
 * PCF8591 (NXP): at 0x48; a control byte (bit 6 AOUT on, bits 1–0 the channel, bit 2 auto-increment); a read gives
 * the previous conversion first, then the channel's, 8 bits of VREF (= VCC on the module); AOUT = value / 255 × VREF.
 * BMP280 (Bosch BST-BMP280-DS001): at 0x76 (SDO low; 0x77 high); chip id 0x58 at 0xD0; 24 bytes of calibration at
 * 0x88; asleep at power-up (its readings 0x80000); in normal or forced mode its 20-bit readings are what the
 * datasheet's own compensation (§8.1) turns into the temperature and the pressure set.
 */
const PICO = parseBoard(picoJson);
const w = (id: string, a: string, b: string): WireSpec => ({ id, a, b });
function spec(parts: PartSpec[], wires: WireSpec[]): CircuitSpec {
  return { board: { data: PICO }, breadboards: [{ id: 'bb1', size: 'full' }], parts, wires };
}
async function run(s: CircuitSpec, main: string, partInputs: PartChange[] = []): Promise<RunResult> {
  return runProject(await nodeLoader(), { board: 'pico-w', files: { 'main.py': main }, clock: new VirtualClock(), circuit: s, partInputs });
}
const lines = (r: RunResult) => r.output.trim().split('\n');
const I2C = 'from machine import I2C, Pin\nimport time\ni2c = I2C(0, sda=Pin(4), scl=Pin(5))\n';

/** PCF8591 in row a from column 10: AOUT AIN3 AIN2 AIN1 AIN0 SCL SDA GND VCC. */
const PCF = ['aout', 'ain3', 'ain2', 'ain1', 'ain0', 'scl', 'sda', 'gnd', 'vcc'];
function pcf(extraParts: PartSpec[] = [], extraWires: WireSpec[] = []): CircuitSpec {
  return spec([{ id: 'adc1', type: 'pcf8591', legs: Object.fromEntries(PCF.map((l, i) => [l, `bb1.a${10 + i}`])) }, ...extraParts], [
    w('w1', 'board.GP5', 'bb1.e15'), w('w2', 'board.GP4', 'bb1.e16'), w('w3', 'board.GND', 'bb1.e17'), w('w4', 'board.3V3', 'bb1.e18'), ...extraWires,
  ]);
}

describe('M6.5b the PCF8591 ADC / DAC', () => {
  it('at 0x48; AIN0 from a potentiometer module: the previous conversion first, then 8 bits of VCC', async () => {
    // the knob in f14–f16 (S VCC GND): S to AIN0's column, its VCC and GND to the module's
    const s = pcf([{ id: 'knob1', type: 'pot-module', legs: { out: 'bb1.f14', vcc: 'bb1.f20', gnd: 'bb1.f21' } }],
      [w('w5', 'bb1.j14', 'bb1.d14'), w('w6', 'bb1.j20', 'bb1.d18'), w('w7', 'bb1.j21', 'bb1.d17')]);
    const r = await run(s, `${I2C}print(i2c.scan())\ni2c.writeto(0x48, bytes([0x40]))\nprint(list(i2c.readfrom(0x48, 2)))\ntime.sleep(0.5)\nprint(i2c.readfrom(0x48, 2)[1])\n`,
      [{ atUs: 0, part: 'knob1', position: 0.5 }, { atUs: 300_000, part: 'knob1', position: 1 }]);
    const [scan, first, full] = lines(r);
    expect(scan).toBe('[72]');
    expect(first).toMatch(/^\[128, 12[78]\]$/);   // 0x80 after power-up, then half of VCC (127.5: the wiper's contact decides)
    expect(full).toBe('255');
  });

  it('the DAC: AOUT is value / 255 of VCC, once bit 6 is set', async () => {
    const r = await run(pcf([], [w('w5', 'board.GP26', 'bb1.e10')]),
      `${I2C}from machine import ADC\na = ADC(26)\nv = lambda: round(a.read_u16() * 3.3 / 65535, 2)\nx = v()\ni2c.writeto(0x48, bytes([0x40, 128]))\nprint(x, v())\n`);
    const [off, on] = lines(r)[0]!.split(' ').map(Number) as [number, number];
    expect(off).toBe(0);
    expect(on).toBeCloseTo(3.3 * 128 / 255, 1);
  });
});

/** GY-BMP280 in row a from column 30: VCC GND SCL SDA CSB SDO. */
function bmp(sdoHigh = false): CircuitSpec {
  const legs = ['vcc', 'gnd', 'scl', 'sda', 'csb', 'sdo'];
  const wires = [w('w1', 'board.3V3', 'bb1.e30'), w('w2', 'board.GND', 'bb1.e31'), w('w3', 'board.GP5', 'bb1.e32'), w('w4', 'board.GP4', 'bb1.e33')];
  if (sdoHigh) wires.push(w('w5', 'bb1.d30', 'bb1.d35'));
  return spec([{ id: 'baro1', type: 'bmp280', legs: Object.fromEntries(legs.map((l, i) => [l, `bb1.a${30 + i}`])) }], wires);
}
/** The datasheet's compensation (§8.1, the double-precision one), as a program's driver has it. */
const COMPENSATE = `
def u16(b, i):
    return b[i] | b[i + 1] << 8
def s16(b, i):
    v = u16(b, i)
    return v - 65536 if v > 32767 else v
c = i2c.readfrom_mem(ADDR, 0x88, 24)
T1, T2, T3 = u16(c, 0), s16(c, 2), s16(c, 4)
P1 = u16(c, 6)
P = [s16(c, i) for i in range(8, 24, 2)]
def read():
    d = i2c.readfrom_mem(ADDR, 0xF7, 6)
    ap = d[0] << 12 | d[1] << 4 | d[2] >> 4
    at = d[3] << 12 | d[4] << 4 | d[5] >> 4
    v1 = (at / 16384 - T1 / 1024) * T2
    v2 = (at / 131072 - T1 / 8192) ** 2 * T3
    tf = v1 + v2
    v1 = tf / 2 - 64000
    v2 = v1 * v1 * P[4] / 32768 + v1 * P[3] * 2
    v2 = v2 / 4 + P[2] * 65536
    v1 = (P[1] * v1 * v1 / 524288 + P[0] * v1) / 524288
    v1 = (1 + v1 / 32768) * P1
    p = (1048576 - ap - v2 / 4096) * 6250 / v1
    p += (P[7] * p * p / 2147483648 + p * P[6] / 32768 + P[5]) / 16
    return round(tf / 5120, 1), round(p / 100, 1), at
`;

describe('M6.5b the BMP280', () => {
  it('at 0x76 (0x77 with SDO high); chip id 0x58', async () => {
    const r = await run(bmp(), `${I2C}print(i2c.scan(), hex(i2c.readfrom_mem(0x76, 0xD0, 1)[0]))\n`);
    expect(lines(r)).toEqual(['[118] 0x58']);
    const high = await run(bmp(true), `${I2C}print(i2c.scan())\n`);
    expect(lines(high)).toEqual(['[119]']);
  });

  it('asleep at power-up (raw 0x80000); in normal mode the driver reads what is set: 25.0 °C, 1000.0 hPa', async () => {
    const r = await run(bmp(), `${I2C}ADDR = 0x76\n${COMPENSATE}\nprint(hex(read()[2]))\ni2c.writeto_mem(ADDR, 0xF4, b'\\x27')\nt, p, _ = read()\nprint(t, p)\n`,
      [{ atUs: 0, part: 'baro1', celsius: 25, hpa: 1000 }]);
    expect(lines(r)).toEqual(['0x80000', '25.0 1000.0']);
  });

  it('room air when nothing sets it: 22.0 °C, 1013.2 hPa; then −5 °C and 950 hPa', async () => {
    const r = await run(bmp(), `${I2C}ADDR = 0x76\n${COMPENSATE}\ni2c.writeto_mem(ADDR, 0xF4, b'\\x27')\nprint(read()[:2])\ntime.sleep(0.5)\nprint(read()[:2])\n`,
      [{ atUs: 300_000, part: 'baro1', celsius: -5, hpa: 950 }]);
    expect(lines(r)).toEqual(['(22.0, 1013.2)', '(-5.0, 950.0)']);
  });
});
