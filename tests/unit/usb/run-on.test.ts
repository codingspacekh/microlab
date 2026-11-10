import { describe, expect, it } from 'vitest';
import { parseUname } from '@lib/repl';
import { boardCopy, runOnOf, runPlace, runWhere, type Detection, type FoundBoard } from '@lib/usb';

/** M11.8 F-125 (Rev 18, screens 37–37c): where Run runs — the simulator, the real board, or both — and what it copies. */
const PICO: FoundBoard = { id: 'e661', kind: 'pico', port: '/dev/cu.usbmodem14201', usb: '2e8a:0005' };
const MB: FoundBoard = { id: '9906', kind: 'microbit', port: '/dev/cu.usbmodem14202', usb: '0d28:0204' };
const W = parseUname("(sysname='rp2', nodename='rp2', release='1.29.0', version='v1.29.0 on 2026-08-24', machine='Raspberry Pi Pico W with RP2040')")!;
const ready: Detection = { boards: [PICO], drives: [], checks: { e661: { state: 'micropython', uname: W } } };
const none: Detection = { boards: [], drives: [] };

describe('M11.8 the choice kept in the settings', () => {
  it('the three choices come back as they were; anything else is the simulator', () => {
    expect(runOnOf('sim')).toBe('sim');
    expect(runOnOf('board')).toBe('board');
    expect(runOnOf('both')).toBe('both');
    for (const v of [undefined, null, '', 'Board', 3, {}]) expect(runOnOf(v)).toBe('sim');
  });
});

describe('M11.8 runPlace: where Run runs', () => {
  it('The simulator: the simulator, whatever is plugged in', () => {
    expect(runPlace('sim', ready, 'pico-w')).toEqual({ sim: true });
    expect(runPlace('sim', none, 'pico-w')).toEqual({ sim: true });
  });

  it('The real board, with the project\'s board plugged in and ready: that board alone', () => {
    expect(runPlace('board', ready, 'pico-w')).toEqual({ sim: false, board: PICO });
  });

  it('Both at once: the simulator and the board', () => {
    expect(runPlace('both', ready, 'pico-w')).toEqual({ sim: true, board: PICO });
  });

  it('a board not yet asked (it fits by its USB name): it is used, as Send to board does', () => {
    expect(runPlace('board', { boards: [PICO], drives: [] }, 'pico-w')).toEqual({ sim: false, board: PICO });
  });

  it('no board, another project\'s board, a Pico in BOOTSEL, a board busy, still checking or without MicroPython: the simulator, and it says no board', () => {
    const cases: Detection[] = [
      none,
      { boards: [MB], drives: [] },
      { boards: [], drives: [{ kind: 'pico-bootsel', volume: 'RPI-RP2' }] },
      { boards: [PICO], drives: [], checks: { e661: { state: 'busy', by: 'Thonny' } } },
      { boards: [PICO], drives: [], checks: { e661: { state: 'checking' } } },
      { boards: [PICO], drives: [], checks: { e661: { state: 'no-micropython', seen: '' } } },
      { boards: [PICO], drives: [], checks: { e661: { state: 'cant-open', message: 'no' } } },
      { boards: [PICO], drives: [], checks: { e661: { state: 'sending', done: 0, total: 2 } } },
    ];
    for (const d of cases) {
      expect(runPlace('board', d, 'pico-w')).toEqual({ sim: true, missing: true });
      expect(runPlace('both', d, 'pico-w')).toEqual({ sim: true, missing: true });
    }
  });

  it('two boards plugged in: the one chosen in the board chip', () => {
    const two: Detection = { boards: [MB, PICO], drives: [], checks: { e661: { state: 'micropython', uname: W } } };
    expect(runPlace('board', two, 'pico-w')).toEqual({ sim: false, board: PICO });
    expect(runPlace('board', two, 'microbit-v2', '9906')).toEqual({ sim: false, board: MB });
  });
});

describe('M11.8 runWhere: the words on the Run button', () => {
  it('The simulator: nothing more than the file\'s name, as before', () => {
    expect(runWhere('sim', { sim: true })).toBe('');
  });

  it('the real board: its name; both: sim + its name', () => {
    expect(runWhere('board', { sim: false, board: PICO }, 'Pico W')).toBe('Pico W');
    expect(runWhere('both', { sim: true, board: PICO }, 'Pico W')).toBe('sim + Pico W');
  });

  it('a board wanted but none fits: sim — no board', () => {
    expect(runWhere('board', { sim: true, missing: true })).toBe('sim — no board');
    expect(runWhere('both', { sim: true, missing: true })).toBe('sim — no board');
  });
});

describe('M11.8 boardCopy: what goes to the board before Run runs there', () => {
  it('every file of the project but main.py — the board\'s own start-up program stays as it was', () => {
    const files = { 'main.py': 'print(1)', 'lights.py': 'x = 1', 'lib/ssd1306.py': 'y = 2', 'data.bin': new Uint8Array([1, 2]) };
    expect(boardCopy(files)).toEqual({ 'lights.py': 'x = 1', 'lib/ssd1306.py': 'y = 2', 'data.bin': new Uint8Array([1, 2]) });
  });

  it('only main.py: nothing to copy', () => {
    expect(boardCopy({ 'main.py': 'print(1)' })).toEqual({});
  });

  it('a main.py inside a folder is a file like any other', () => {
    expect(boardCopy({ 'main.py': '', 'demo/main.py': 'z' })).toEqual({ 'demo/main.py': 'z' });
  });
});
