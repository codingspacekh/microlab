import { describe, expect, it } from 'vitest';
import { parseBoard } from '@lib/boards';
import type { CircuitSpec, WireSpec } from '@lib/circuit';
import picoJson from '../../library/boards/pico-w/board.json';
import espJson from '../../library/boards/esp32-devkit-v1/board.json';
import mbitJson from '../../library/boards/microbit-v2/board.json';
import { VirtualClock } from '../../src/sim/clock';
import type { PartChange } from '../../src/sim/circuit';
import { runProject, type RunResult, type SimBoard } from '../../src/sim/run';
import { nodeLoader } from './vm';

/**
 * M6.4b the MPU6050 on its GY-521 board (3–5 V; pins VCC GND SCL SDA XDA XCL AD0 INT), answering on I²C from its
 * register map (RM-MPU-6000A): at 0x68, or 0x69 with AD0 high; WHO_AM_I (0x75) 0x68; it wakes up asleep
 * (PWR_MGMT_1 0x6B = 0x40) and its readings are 0 until it is woken; ACCEL_XOUT_H… (0x3B–0x40) big-endian signed,
 * 16384 per g at ±2 g (ACCEL_CONFIG 0x1C), TEMP_OUT (0x41) = (°C − 36.53) × 340, GYRO_XOUT_H… (0x43) 131 per °/s.
 * Its tilt is set while running: lying flat it reads +1 g on Z.
 */
const DATA = { 'pico-w': parseBoard(picoJson), 'esp32-devkit-v1': parseBoard(espJson), 'microbit-v2': parseBoard(mbitJson) } as const;
const w = (id: string, a: string, b: string): WireSpec => ({ id, a, b });
const LEGS = ['vcc', 'gnd', 'scl', 'sda', 'xda', 'xcl', 'ad0', 'int'];

/** The GY-521 in row a, columns 10–17, wired: VCC, GND, SCL, SDA (and AD0 to `ad0` if given). */
function mpu(board: SimBoard, supply: string, scl: string, sda: string, ad0?: string): CircuitSpec {
  const legs = Object.fromEntries(LEGS.map((l, i) => [l, `bb1.a${10 + i}`]));
  const wires = [w('w1', `board.${supply}`, 'bb1.e10'), w('w2', 'board.GND', 'bb1.e11'), w('w3', `board.${scl}`, 'bb1.e12'), w('w4', `board.${sda}`, 'bb1.e13')];
  if (ad0) wires.push(w('w5', `board.${ad0}`, 'bb1.e16'));
  return { board: { data: DATA[board as keyof typeof DATA] }, breadboards: [{ id: 'bb1', size: 'half' }], parts: [{ id: 'mpu1', type: 'mpu6050', legs }], wires };
}
async function run(board: SimBoard, spec: CircuitSpec, main: string, partInputs: PartChange[] = []): Promise<RunResult> {
  return runProject(await nodeLoader(), { board, files: { 'main.py': main }, clock: new VirtualClock(), circuit: spec, partInputs });
}
const lines = (r: RunResult) => r.output.trim().split('\n');
const PICO = "from machine import I2C, Pin\nimport struct\ni2c = I2C(0, sda=Pin(4), scl=Pin(5))\n";
const accel = 'def accel():\n    return struct.unpack(">hhh", i2c.readfrom_mem(0x68, 0x3B, 6))\n';

describe('M6.4b the MPU6050 on I²C', () => {
  it('found at 0x68; WHO_AM_I is 0x68; with AD0 high it answers at 0x69', async () => {
    const r = await run('pico-w', mpu('pico-w', '3V3', 'GP5', 'GP4'), `${PICO}print(i2c.scan(), hex(i2c.readfrom_mem(0x68, 0x75, 1)[0]))\n`);
    expect(lines(r)).toEqual(['[104] 0x68']);
    const high = await run('pico-w', mpu('pico-w', '3V3', 'GP5', 'GP4', '3V3'), `${PICO}print(i2c.scan())\n`);
    expect(lines(high)).toEqual(['[105]']);
  });

  it('not powered, or not on these pins: nothing answers; a read is an OSError (EIO on the Pico W)', async () => {
    const off = mpu('pico-w', '3V3', 'GP5', 'GP4');
    off.wires = off.wires.filter((x) => x.id !== 'w1');
    const r = await run('pico-w', off, `${PICO}print(i2c.scan())\ntry:\n    i2c.readfrom_mem(0x68, 0x75, 1)\nexcept OSError as e:\n    print(e.errno)\n`);
    expect(lines(r)).toEqual(['[]', '5']);
  });

  it('asleep after power-up: its readings are 0; woken (0x6B = 0), lying flat: 0, 0, +1 g (16384)', async () => {
    const r = await run('pico-w', mpu('pico-w', '3V3', 'GP5', 'GP4'),
      `${PICO}${accel}print(hex(i2c.readfrom_mem(0x68, 0x6B, 1)[0]), accel())\ni2c.writeto_mem(0x68, 0x6B, b'\\x00')\nprint(accel())\n`);
    expect(lines(r)).toEqual(['0x40 (0, 0, 0)', '(0, 0, 16384)']);
  });

  it('tilted 30° about Y: X reads half a g; at ±8 g (ACCEL_CONFIG 0x10) one g is 4096', async () => {
    const r = await run('pico-w', mpu('pico-w', '3V3', 'GP5', 'GP4'), [
      PICO + accel, "i2c.writeto_mem(0x68, 0x6B, b'\\x00')", 'import time', 'time.sleep(0.2)', 'print(accel())',
      "i2c.writeto_mem(0x68, 0x1C, b'\\x10')", 'print(accel())', '',
    ].join('\n'), [{ atUs: 100_000, part: 'mpu1', tiltx: 30 }]);
    expect(lines(r)).toEqual(['(8192, 0, 14189)', '(2048, 0, 3547)']);
  });

  it('its temperature: 22 °C reads (22 − 36.53) × 340; the gyro reads 0 while it is still', async () => {
    const r = await run('pico-w', mpu('pico-w', '3V3', 'GP5', 'GP4'), [
      PICO, "i2c.writeto_mem(0x68, 0x6B, b'\\x00')",
      't, = struct.unpack(">h", i2c.readfrom_mem(0x68, 0x41, 2))', 'print(round(t / 340 + 36.53, 1), struct.unpack(">hhh", i2c.readfrom_mem(0x68, 0x43, 6)))', '',
    ].join('\n'));
    expect(lines(r)).toEqual(['22.0 (0, 0, 0)']);
  });

  it('the ESP32 on its I²C pins (D21, D22) and the micro:bit on P19 / P20', async () => {
    const esp = await run('esp32-devkit-v1', mpu('esp32-devkit-v1', '3V3', 'D22', 'D21'),
      'from machine import I2C, Pin\ni2c = I2C(0, sda=Pin(21), scl=Pin(22))\nprint(i2c.scan())\n');
    expect(lines(esp)).toEqual(['[104]']);
    const mb = await run('microbit-v2', mpu('microbit-v2', '3.3V', 'P19', 'P20'),
      "from microbit import *\nprint(i2c.scan())\ni2c.write(0x68, b'\\x75')\nprint(hex(i2c.read(0x68, 1)[0]))\n");
    expect(lines(mb)).toEqual(['[104]', '0x68']);
  });
});
