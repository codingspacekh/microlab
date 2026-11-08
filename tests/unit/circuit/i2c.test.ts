import { describe, expect, it } from 'vitest';
import { Bmp280, Max30102, MAX30102, MPU6050, Mpu6050, Pcf8591, Vl53l0x, VL53L0X } from '@lib/circuit/i2c';

/** M6.4b, M6.5b the I²C chips register by register: the cases their drivers in tests/python don't reach — resets,
 *  modes, empty writes, auto-increment, the FIFO's overflow. */
describe('M6.4b the MPU6050', () => {
  const flat = () => ({ tiltx: 0, tilty: 0, celsius: 25 });

  it('an empty write changes nothing; WHO_AM_I can\'t be written', () => {
    const m = new Mpu6050(flat);
    m.write([]);
    m.write([MPU6050.reg.whoAmI, 0x12]);
    m.write([MPU6050.reg.whoAmI]);
    expect(m.read(1)).toEqual([MPU6050.whoAmI]);
  });

  it('DEVICE_RESET puts it back to sleep, its readings kept', () => {
    const m = new Mpu6050(flat);
    m.write([MPU6050.reg.pwr1, 0x00]);
    m.write([MPU6050.reg.accel + 4]);
    expect(m.read(2)).toEqual([0x40, 0x00]);   // +1 g on Z
    m.write([MPU6050.reg.pwr1, 0x80]);
    m.write([MPU6050.reg.pwr1]);
    expect(m.read(1)).toEqual([0x40]);
  });
});

describe('M6.5b the PCF8591', () => {
  it('auto-increment reads the four inputs in turn, each the conversion before it; no VREF reads 0', () => {
    let vref = 3.3;
    const p = new Pcf8591(() => ({ ain: [0, 1.1, 2.2, 3.3], vref }));
    p.write([]);
    p.write([0x04]);
    expect(p.read(5)).toEqual([0x80, 0, 85, 170, 255]);
    vref = 0;
    expect(p.read(2)).toEqual([0, 0]);
  });

  it('AOUT: off (high impedance) until bit 6, then the last byte written over 255 of VREF', () => {
    const p = new Pcf8591(() => ({ ain: [0, 0, 0, 0], vref: 5 }));
    p.write([0x00, 0xff]);
    expect(p.aout(5)).toBeUndefined();
    p.write([0x40, 0x10, 51]);
    expect(p.aout(5)).toBeCloseTo(1, 5);
  });
});

describe('M6.5b the BMP280', () => {
  const air = () => ({ celsius: 20, hpa: 1000 });
  const raw = (b: Bmp280) => { b.write([0xf7]); return b.read(6); };

  it('asleep: the readings keep their reset value; an empty write changes nothing', () => {
    const b = new Bmp280(air);
    b.write([]);
    expect(raw(b)).toEqual([0x80, 0, 0, 0x80, 0, 0]);
  });

  it('forced mode measures once, then sleeps; normal mode stays on', () => {
    const b = new Bmp280(air);
    b.write([0xf4, 0x25]);   // forced
    expect(raw(b)).not.toEqual([0x80, 0, 0, 0x80, 0, 0]);
    b.write([0xf4]);
    expect(b.read(1)[0]! & 3).toBe(0);
    b.write([0xf4, 0x27]);   // normal
    raw(b);
    b.write([0xf4]);
    expect(b.read(1)[0]! & 3).toBe(3);
  });

  it('a soft reset (0xB6 to 0xE0) sleeps it again; the chip id stays', () => {
    const b = new Bmp280(air);
    b.write([0xf4, 0x27]);
    b.write([0xe0, 0xb6]);
    b.write([0xf4]);
    expect(b.read(1)).toEqual([0]);
    b.write([0xd0]);
    expect(b.read(1)).toEqual([0x58]);
  });
});

describe('M6.5b the VL53L0X', () => {
  it('SYSRANGE_START reads back clear in single shot, 0x02 back to back; ready: 0x13 = 4, 0x14 = 0x5E', () => {
    let now = 0;
    const v = new Vl53l0x(() => now, () => 300);
    v.write([]);
    v.write([0x00, 0x01]);
    v.write([0x00]);
    expect(v.read(1)).toEqual([0]);
    now += VL53L0X.rangeUs;
    v.write([0x13]);
    expect(v.read(2)).toEqual([0x04, 0x5e]);
    v.write([0x0b, 0x01]);
    v.write([0x00, 0x02]);
    v.write([0x00]);
    expect(v.read(1)).toEqual([0x02]);
    v.write([0x14]);
    expect(v.read(1)).toEqual([0]);
  });

  it('0x83 answers the SPAD-info poll unless written', () => {
    const v = new Vl53l0x(() => 0, () => 0);
    v.write([0x83]);
    expect(v.read(1)).toEqual([0x10]);
    v.write([0x83, 0x05]);
    v.write([0x83]);
    expect(v.read(1)).toEqual([0x05]);
  });
});

describe('M6.5b the MAX30102', () => {
  const pulse = () => ({ finger: true, bpm: 70, spo2: 97 });

  it('no mode: no samples, FIFO_DATA reads 0; heart-rate mode: 3 bytes a sample (red only)', () => {
    let now = 0;
    const m = new Max30102(() => now, pulse);
    m.write([]);
    m.write([0x07]);
    expect(m.read(3)).toEqual([0, 0, 0]);
    m.write([0x0a, 0x00]);   // 50 a second
    m.write([0x09, 0x02]);
    now += 1e6 / 50;
    m.write([0x04]);
    expect(m.read(1)).toEqual([1]);
    m.write([0x07]);
    m.read(3);
    m.write([0x00]);
    expect(m.read(1)).toEqual([0]);   // PPG_RDY: empty again
  });

  it('a full FIFO counts what it loses (up to 31); OVF_COUNTER can be written; mode 7 has two LEDs', () => {
    let now = 0;
    const m = new Max30102(() => now, pulse);
    m.write([0x0a, 0x00]);
    m.write([0x09, 0x07]);
    now += (40 * 1e6) / 50;
    m.write([0x05]);
    expect(m.read(1)).toEqual([8]);
    m.write([0x07]);
    expect(m.read(6).length).toBe(6);
    m.write([0x05, 0x00]);
    m.write([0x05]);
    expect(m.read(1)).toEqual([0]);
    now += (100 * 1e6) / 50;
    m.write([0x05]);
    expect(m.read(1)).toEqual([31]);
    m.write([0xff, 0x00]);
    m.write([0xff]);
    expect(m.read(1)).toEqual([MAX30102.partId]);
  });
});
