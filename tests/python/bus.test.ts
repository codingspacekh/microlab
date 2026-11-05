import { describe, expect, it } from 'vitest';
import { VirtualClock } from '../../src/sim/clock';
import type { InputChange } from '../../src/sim/pins';
import { runProject, type SimBoard } from '../../src/sim/run';
import { nodeLoader } from './vm';

/**
 * M2 slice 7: the bus APIs reach the bridge; with nothing wired (no parts until M3) they fail as the boards do.
 * Sources: MicroPython v1.29.0 extmod/machine_i2c.c, machine_pulse.c; ports/rp2/machine_i2c.c (+ .h), machine_spi.c,
 * machine_uart.c; ports/esp32/machine_i2c.c (+ .h), machine_uart.h; micropython-microbit-v2 microbit_i2c.c.
 */
const run = async (board: SimBoard, main: string, inputs: InputChange[] = []) =>
  runProject(await nodeLoader(), { board, files: { 'main.py': main }, clock: new VirtualClock(), inputs });

describe('M2.7 I2C with nothing on the bus', () => {
  it('Pico W: the default bus, scan finds nothing; a write is "EIO" (hardware I2C), as rp2 reports a NACK', async () => {
    const r = await run('pico-w', 'from machine import I2C\ni2c = I2C(0)\nprint(i2c, i2c.scan())\ni2c.writeto(0x3C, b"\\x00")\n');
    expect(r.output.split('\n')[0]).toBe('I2C(0, freq=400000, scl=5, sda=4, timeout=50000) []');
    expect(r.error).toMatchObject({ type: 'OSError', message: '[Errno 5] EIO', line: 4 });
    expect(r.bus.map(([, e]) => e)).toContain('i2c sda=4 scl=5 write 3c 00 nack');
  });

  it('Pico W: SoftI2C (and readfrom_mem) give "ENODEV"; the pins are checked', async () => {
    const r = await run('pico-w', 'from machine import SoftI2C, Pin\ni2c = SoftI2C(scl=Pin(5), sda=Pin(4))\ni2c.readfrom_mem(0x68, 0x75, 1)\n');
    expect(r.error).toMatchObject({ type: 'OSError', message: '[Errno 19] ENODEV', line: 3 });
    expect((await run('pico-w', 'from machine import I2C, Pin\nI2C(0, scl=Pin(4), sda=Pin(5))\n')).error).toMatchObject({ type: 'ValueError', message: 'bad SCL pin' });
    expect((await run('pico-w', 'from machine import I2C\nI2C(2)\n')).error).toMatchObject({ type: 'ValueError', message: "I2C(2) doesn't exist" });
    expect((await run('pico-w', 'from machine import I2C\nprint(I2C(1))\n')).output).toBe('I2C(1, freq=400000, scl=7, sda=6, timeout=50000)\n');
  });

  it('ESP32: I2C(0) on 18/19, a NACK is "ENODEV"', async () => {
    const r = await run('esp32-devkit-v1', 'from machine import I2C\ni2c = I2C(0)\nprint(i2c, i2c.scan())\ni2c.readfrom(0x3C, 2)\n');
    expect(r.output.split('\n')[0]).toBe('I2C(0, scl=18, sda=19, freq=400000, timeout=50000) []');
    expect(r.error).toMatchObject({ type: 'OSError', message: '[Errno 19] ENODEV', line: 4 });
  });

  it('micro:bit: i2c on P19 / P20; read and write raise "ENODEV"', async () => {
    const r = await run('microbit-v2', 'from microbit import i2c\nprint(i2c.scan())\ni2c.write(0x3C, b"\\x00")\n');
    expect(r.output.split('\n')[0]).toBe('[]');
    expect(r.error).toMatchObject({ type: 'OSError', message: '[Errno 19] ENODEV', line: 3 });
  });
});

describe('M2.7 SPI and UART with nothing connected', () => {
  it('SPI: writes reach the bridge; reads give what the idle MISO line reads (pulled down: 0x00)', async () => {
    const r = await run('pico-w', 'from machine import SPI\ns = SPI(0)\ns.write(b"\\x9f")\nprint(s.read(2), s)\n');
    expect(r.output).toBe("b'\\x00\\x00' SPI(0, baudrate=1000000, polarity=0, phase=0, bits=8, sck=18, mosi=19, miso=16)\n");
    expect(r.bus.map(([, e]) => e)[0]).toBe('spi sck=18 mosi=19 miso=16 write 9f');
  });

  it('UART: write returns the count; nothing ever arrives — read() is None, any() is 0', async () => {
    const r = await run('esp32-devkit-v1', 'from machine import UART\nu = UART(2, 9600)\nprint(u.write("AT\\r\\n"), u.read(), u.any(), u.readline())\n');
    expect(r.output).toBe('4 None 0 None\n');
    expect(r.bus.map(([, e]) => e)[0]).toBe('uart tx=17 rx=16 9600 write 41540d0a');
  });

  it('UART ids that don\'t exist', async () => {
    expect((await run('pico-w', 'from machine import UART\nUART(2)\n')).error).toMatchObject({ type: 'ValueError', message: "UART(2) doesn't exist" });
  });
});

describe('M2.7 time_pulse_us and bitstream', () => {
  it('no pulse: -2 if the pin never reaches the level, -1 if it is at it and never leaves', async () => {
    const r = await run('pico-w', 'from machine import Pin, time_pulse_us\np = Pin(14, Pin.IN, Pin.PULL_UP)\nprint(time_pulse_us(p, 0, 10000), time_pulse_us(p, 1, 10000))\n');
    expect(r.output).toBe('-2 -1\n');
  });

  it('measures a pulse on the pin (an echo of 580 µs: 10 cm on an HC-SR04)', async () => {
    const r = await run('esp32-devkit-v1', 'from machine import Pin, time_pulse_us\nimport time\ne = Pin(18, Pin.IN)\ntime.sleep_ms(1)\nprint(time_pulse_us(e, 1, 30000))\n',
      [{ atUs: 2000, pin: '18', level: 1 }, { atUs: 2580, pin: '18', level: 0 }]);
    expect(Math.abs(Number(r.output.trim()) - 580)).toBeLessThanOrEqual(20);
  });

  it('bitstream (what neopixel uses) reaches the bridge with its timing and bytes', async () => {
    const r = await run('pico-w', 'from machine import Pin, bitstream\nbitstream(Pin(16, Pin.OUT), 0, (400, 850, 800, 450), b"\\xff\\x00\\x80")\n');
    expect(r.bus.map(([, e]) => e)).toEqual(['bitstream pin=16 timing=400,850,800,450 ff0080']);
  });
});
