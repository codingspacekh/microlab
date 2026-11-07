import { describe, expect, it } from 'vitest';
import { parseBoard } from '@lib/boards';
import type { CircuitSpec, PartSpec, WireSpec } from '@lib/circuit';
import picoJson from '../../library/boards/pico-w/board.json';
import espJson from '../../library/boards/esp32-devkit-v1/board.json';
import { VirtualClock } from '../../src/sim/clock';
import type { PartChange } from '../../src/sim/circuit';
import { runProject, type RunResult, type SimBoard } from '../../src/sim/run';
import { nodeLoader } from './vm';

/**
 * M6.5b the DS18B20 (Maxim): on 1-Wire with MicroPython's own `onewire` and `ds18x20` modules (micropython/drivers,
 * MIT), the bus answered bit by bit by the sim — the presence pulse, SEARCH ROM over every sensor on the wire
 * (wired-AND), MATCH and SKIP ROM; a 64-bit ROM (family 0x28, its CRC); CONVERT T takes 750 ms at 12 bits; the
 * scratchpad reads 85 °C until the first conversion is done, and carries its CRC. On a module: S VCC GND, its 4.7 kΩ
 * pull-up on the board. The micro:bit's MicroPython has no `onewire`.
 */
const DATA = { 'pico-w': parseBoard(picoJson), 'esp32-devkit-v1': parseBoard(espJson) } as const;
const w = (id: string, a: string, b: string): WireSpec => ({ id, a, b });
const sensor = (id: string, col: number): PartSpec => ({ id, type: 'ds18b20', legs: { out: `bb1.a${col}`, vcc: `bb1.a${col + 1}`, gnd: `bb1.a${col + 2}` } });

/** One sensor on `pin` (in columns 10–12), or two sharing it (the second in 20–22, joined by wires). */
function bus(board: SimBoard, pin: string, two = false): CircuitSpec {
  const parts = [sensor('temp1', 10)];
  const wires = [w('w1', `board.${pin}`, 'bb1.e10'), w('w2', 'board.3V3', 'bb1.e11'), w('w3', 'board.GND', 'bb1.e12')];
  if (two) {
    parts.push(sensor('temp2', 20));
    wires.push(w('w4', 'bb1.d10', 'bb1.d20'), w('w5', 'bb1.d11', 'bb1.d21'), w('w6', 'bb1.d12', 'bb1.d22'));
  }
  return { board: { data: DATA[board as keyof typeof DATA] }, breadboards: [{ id: 'bb1', size: 'half' }], parts, wires };
}
async function run(board: SimBoard, spec: CircuitSpec, main: string, partInputs: PartChange[] = []): Promise<RunResult> {
  return runProject(await nodeLoader(), { board, files: { 'main.py': main }, clock: new VirtualClock(), circuit: spec, partInputs });
}
const lines = (r: RunResult) => r.output.trim().split('\n');
const OPEN = (n: number) => `import onewire, ds18x20, time\nfrom machine import Pin\now = onewire.OneWire(Pin(${n}))\nds = ds18x20.DS18X20(ow)\n`;

describe('M6.5b the DS18B20 on 1-Wire', () => {
  it('found by scan: family 0x28, its CRC good; 85 °C before a conversion, then the temperature after 750 ms', async () => {
    const r = await run('pico-w', bus('pico-w', 'GP15'), [
      OPEN(15), 'roms = ds.scan()', 'print(len(roms), hex(roms[0][0]), ow.crc8(roms[0]))',
      'print(ds.read_temp(roms[0]))', 'ds.convert_temp()', 'time.sleep_ms(750)', 'print(ds.read_temp(roms[0]))', '',
    ].join('\n'), [{ atUs: 0, part: 'temp1', celsius: 25 }]);
    expect(lines(r)).toEqual(['1 0x28 0', '85.0', '25.0']);
  });

  it('read too soon after convert_temp: still the value before', async () => {
    const r = await run('pico-w', bus('pico-w', 'GP15'), [
      OPEN(15), 'rom = ds.scan()[0]', 'ds.convert_temp()', 'time.sleep_ms(750)', 'a = ds.read_temp(rom)',
      'ds.convert_temp()', 'time.sleep_ms(100)', 'print(a, ds.read_temp(rom))', 'time.sleep_ms(700)', 'print(ds.read_temp(rom))', '',
    ].join('\n'), [{ atUs: 0, part: 'temp1', celsius: 20 }, { atUs: 800_000, part: 'temp1', celsius: -10.5 }]);
    expect(lines(r)).toEqual(['20.0 20.0', '-10.5']);
  });

  it('two sensors on one wire: scan finds both, each reads its own', async () => {
    const r = await run('esp32-devkit-v1', bus('esp32-devkit-v1', 'D4', true), [
      OPEN(4), 'roms = ds.scan()', 'ds.convert_temp()', 'time.sleep_ms(750)',
      'print(len(roms), roms[0] != roms[1], sorted(ds.read_temp(r) for r in roms))', '',
    ].join('\n'), [{ atUs: 0, part: 'temp1', celsius: 18.5 }, { atUs: 0, part: 'temp2', celsius: 31.25 }]);
    expect(lines(r)).toEqual(['2 True [18.5, 31.25]']);
  });

  it('nothing on the wire (or no power): scan finds nothing; convert_temp raises OneWireError', async () => {
    const r = await run('pico-w', bus('pico-w', 'GP15'), `${OPEN(14)}print(ds.scan())\ntry:\n    ds.convert_temp()\nexcept onewire.OneWireError:\n    print('no answer')\n`);
    expect(lines(r)).toEqual(['[]', 'no answer']);
  });
});
