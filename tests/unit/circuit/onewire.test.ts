import { describe, expect, it } from 'vitest';
import { crc8, DS18B20, Ds18b20, OneWireBus } from '@lib/circuit/onewire';

/** M6.5b the 1-Wire bus and the DS18B20, command by command (Maxim DS18B20 datasheet: ROM and function commands).
 *  tests/python/onewire.test.ts drives them through MicroPython's own onewire and ds18x20. */
function wire(...devices: Ds18b20[]) {
  let now = 0;
  const bus = new OneWireBus(() => devices, () => now);
  const read = (n: number) => Array.from({ length: n }, () => bus.readByte());
  return { bus, read, later: (us: number) => { now += us; } };
}

describe('M6.5b the DS18B20 on the 1-Wire bus', () => {
  it('its ROM: family 0x28, the serial, its CRC; READ ROM sends it', () => {
    const t = new Ds18b20([1, 2, 3, 4, 5, 6], () => 21);
    expect(t.rom.slice(0, 7)).toEqual([0x28, 1, 2, 3, 4, 5, 6]);
    expect(crc8(t.rom)).toBe(0);
    const w = wire(t);
    expect(w.bus.reset()).toBe(true);
    w.bus.writeByte(0x33);
    expect(w.read(8)).toEqual(t.rom);
  });

  it('nothing on the wire: no presence pulse, every bit reads 1', () => {
    const w = wire();
    expect(w.bus.reset()).toBe(false);
    w.bus.writeByte(0xcc);
    expect(w.read(2)).toEqual([0xff, 0xff]);
  });

  it('WRITE SCRATCHPAD sets TH, TL and the resolution (its low bits stay 1s); READ SCRATCHPAD gives them back', () => {
    const w = wire(new Ds18b20([9, 9, 9, 9, 9, 9], () => 21));
    w.bus.reset();
    w.bus.writeByte(0xcc);
    w.bus.writeByte(0x4e);
    for (const b of [0x50, 0x0a, 0x20, 0x77]) w.bus.writeByte(b);   // the 4th is past the three: ignored
    w.bus.reset();
    w.bus.writeByte(0xcc);
    w.bus.writeByte(0xbe);
    const pad = w.read(9);
    expect(pad.slice(0, 5)).toEqual([DS18B20.powerOn & 0xff, DS18B20.powerOn >> 8, 0x50, 0x0a, 0x3f]);
    expect(crc8(pad)).toBe(0);
  });

  it('READ POWER SUPPLY: powered from VCC (1s); a command it doesn\'t know: it listens and sends nothing', () => {
    const w = wire(new Ds18b20([1, 1, 1, 1, 1, 1], () => 21));
    w.bus.reset();
    w.bus.writeByte(0xcc);
    w.bus.writeByte(0xb4);
    expect(w.read(1)).toEqual([0xff]);
    w.bus.reset();
    w.bus.writeByte(0xcc);
    w.bus.writeByte(0x99);
    w.bus.writeByte(0x00);
    expect(w.read(1)).toEqual([0xff]);
  });

  it('a ROM command it doesn\'t know: the bus goes quiet until the next reset', () => {
    const w = wire(new Ds18b20([1, 1, 1, 1, 1, 1], () => 21));
    w.bus.reset();
    w.bus.writeByte(0x12);
    w.bus.writeByte(0xbe);
    expect(w.read(2)).toEqual([0xff, 0xff]);
  });

  it('MATCH ROM with another ROM: nobody answers; with its own, it does — converted once 750 ms have passed', () => {
    const t = new Ds18b20([4, 3, 2, 1, 0, 0], () => -10.5);
    const w = wire(t);
    w.bus.reset();
    w.bus.writeByte(0x55);
    for (const b of [0x28, 0, 0, 0, 0, 0, 0, 0]) w.bus.writeByte(b);
    w.bus.writeByte(0xbe);
    expect(w.read(1)).toEqual([0xff]);
    w.bus.reset();
    w.bus.writeByte(0xcc);
    w.bus.writeByte(0x44);
    w.later(DS18B20.convertUs);
    w.bus.reset();
    w.bus.writeByte(0x55);
    for (const b of t.rom) w.bus.writeByte(b);
    w.bus.writeByte(0xbe);
    const [lo, hi] = w.read(2) as [number, number];
    expect((((hi << 8) | lo) << 16 >> 16) / 16).toBe(-10.5);
  });

  it('SEARCH ROM with nothing left on the wire reads 1s', () => {
    const w = wire(new Ds18b20([1, 1, 1, 1, 1, 1], () => 21));
    w.bus.reset();
    w.bus.writeByte(0xf0);
    const own = w.bus.readBit();
    w.bus.readBit();
    w.bus.writeBit(1 - own);   // the master picks the other way: the sensor drops out
    expect([w.bus.readBit(), w.bus.readBit()]).toEqual([1, 1]);
  });
});
