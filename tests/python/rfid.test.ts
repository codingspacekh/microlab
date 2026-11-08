import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBoard } from '@lib/boards';
import type { CircuitSpec } from '@lib/circuit';
import picoJson from '../../library/boards/pico-w/board.json';
import mbitJson from '../../library/boards/microbit-v2/board.json';
import { VirtualClock } from '../../src/sim/clock';
import { runProject, type RunResult } from '../../src/sim/run';
import { nodeLoader } from './vm';

/** M7 (the teacher's request): the RC522 read and written through the pack's mfrc522.py on MicroPython — a card's
 *  UID, a block written and read back, a wrong key, no tag, the reader with no power, the micro:bit. */
const DRIVER = readFileSync(join(process.cwd(), 'library/lib-pack/mfrc522/microlab/mfrc522.py'), 'utf8');
const LEGS = Object.fromEntries(['sda', 'sck', 'mosi', 'miso', 'irq', 'gnd', 'rst', 'vcc'].map((l, i) => [l, `bb1.f${3 + i}`]));
const pico = (power = true): CircuitSpec => ({
  board: { data: parseBoard(picoJson) }, breadboards: [{ id: 'bb1', size: 'half' }], parts: [{ id: 'rfid1', type: 'rc522', legs: LEGS }],
  wires: [['board.GP17', 'bb1.j3'], ['board.GP18', 'bb1.j4'], ['board.GP19', 'bb1.j5'], ['board.GP16', 'bb1.j6'], ['board.GND', 'bb1.j8'], ['board.GP20', 'bb1.j9'],
    ...(power ? [['board.3V3', 'bb1.j10']] : [])].map(([a, b], i) => ({ id: `w${i}`, a: a!, b: b! })),
});
const HEAD = ['from mfrc522 import MFRC522', 'r = MFRC522(spi_id=0, sck=18, mosi=19, miso=16, cs=17, rst=20)'];
const run = async (main: string[], tag = 1, circuit = pico()): Promise<RunResult> => runProject(await nodeLoader(), {
  board: 'pico-w', circuit, clock: new VirtualClock(), maxUs: 2e6, files: { 'lib/mfrc522.py': DRIVER, 'main.py': [...HEAD, ...main, ''].join('\n') },
  partInputs: [{ atUs: 0, part: 'rfid1', position: tag }],
});
const out = (r: RunResult) => r.output.split('\n').filter((l) => l && !l.startsWith('MicroPython'));
const SELECT = ['stat, _ = r.request(r.REQIDL)', 'print(stat)', 'stat, uid = r.SelectTagSN()', 'print(stat, r.tohexstring(uid))'];

describe('M7 the RC522 through mfrc522.py', () => {
  it('a card held to it: request OK, its UID; the key fob its own', async () => {
    expect(out(await run(SELECT))).toEqual(['0', '0 [0x93, 0x5E, 0x1A, 0x2B]']);
    expect(out(await run(SELECT, 2))).toEqual(['0', '0 [0x4A, 0xB7, 0x3C, 0x91]']);
  });

  it('no tag: NOTAGERR — at once, as the real one does after its timer', async () => {
    const r = await run(['print(r.request(r.REQIDL))'], 0);
    expect(out(r)).toEqual(['(2, 0)']);   // request turns any failure into ERR (2); bits 0
  });

  it('a block written with key A FF…FF and read back; a wrong key: ERR', async () => {
    const r = await run([...SELECT.slice(0, 3), 'key = [0xFF] * 6',
      "print(r.writeSectorBlock(uid, 2, 0, list(b'MicroLab card #1'), keyA=key))",
      'stat, data = r.readSectorBlock(uid, 2, 0, keyA=key)', 'print(stat, bytes(data))', 'r.stop_crypto1()',
      'print(r.readSectorBlock(uid, 3, 0, keyA=[1, 2, 3, 4, 5, 6])[0])']);
    expect(out(r)).toEqual(['0', '0', "0 b'MicroLab card #1'", '2']);
  });

  it('with no power it answers nothing: ERR; no fault', async () => {
    const r = await run(['print(r.request(r.REQIDL)[0])'], 1, pico(false));
    expect(out(r)).toEqual(['2']);
    expect(r.faults).toEqual([]);
  });

  it('the micro:bit, on its spi and pins', async () => {
    const legs = LEGS;
    const circuit: CircuitSpec = {
      board: { data: parseBoard(mbitJson) }, breadboards: [{ id: 'bb1', size: 'half' }], parts: [{ id: 'rfid1', type: 'rc522', legs }],
      wires: [['board.P16', 'bb1.j3'], ['board.P13', 'bb1.j4'], ['board.P15', 'bb1.j5'], ['board.P14', 'bb1.j6'], ['board.GND', 'bb1.j8'], ['board.P8', 'bb1.j9'], ['board.3.3V', 'bb1.j10']]
        .map(([a, b], i) => ({ id: `w${i}`, a: a!, b: b! })),
    };
    const r = await runProject(await nodeLoader(), {
      board: 'microbit-v2', circuit, clock: new VirtualClock(), maxUs: 2e6, partInputs: [{ atUs: 0, part: 'rfid1', position: 2 }],
      files: { 'mfrc522.py': DRIVER, 'main.py': ['from microbit import *', 'from mfrc522 import MFRC522', 'r = MFRC522(sck=pin13, mosi=pin15, miso=pin14, cs=pin16, rst=pin8)', ...SELECT, ''].join('\n') },
    });
    expect(out(r)).toEqual(['0', '0 [0x4A, 0xB7, 0x3C, 0x91]']);
  });
});
