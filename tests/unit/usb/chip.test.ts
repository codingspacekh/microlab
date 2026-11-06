import { describe, expect, it } from 'vitest';
import { parseUname } from '@lib/repl';
import { chipState, holderName, openFailure, type BoardCheck, type Detection, type FoundBoard } from '@lib/usb';

/** M10.2 F-55 (screen 13b): with the board's own answer the chip can say which board it is, its MicroPython, and why
 *  it can't be used — checking, used by another program, no MicroPython, can't connect. */
const PICO: FoundBoard = { id: 'e661', kind: 'pico', port: '/dev/cu.usbmodem14201', usb: '2e8a:0005' };
const PICO2: FoundBoard = { id: 'e662', kind: 'pico', port: '/dev/cu.usbmodem14301', usb: '2e8a:0005' };
const W = parseUname("(sysname='rp2', nodename='rp2', release='1.29.0', version='v1.29.0 on 2026-08-24', machine='Raspberry Pi Pico W with RP2040')")!;
const PLAIN = parseUname("(sysname='rp2', nodename='rp2', release='1.29.0', version='v1.29.0 on 2026-08-24', machine='Raspberry Pi Pico with RP2040')")!;
const d = (checks: Record<string, BoardCheck>, boards = [PICO]): Detection => ({ boards, drives: [], checks });

describe('M10.2 F-55 the chip, with the board\'s answer', () => {
  it('not asked yet: what USB tells (a Pico fits a Pico W project)', () => {
    expect(chipState(d({}), 'pico-w')).toEqual({ kind: 'ready', board: PICO });
  });

  it('being asked: checking', () => {
    expect(chipState(d({ e661: { state: 'checking' } }), 'pico-w')).toEqual({ kind: 'checking', board: PICO });
  });

  it('a Pico W answered: ready, with its name and version', () => {
    expect(chipState(d({ e661: { state: 'micropython', uname: W } }), 'pico-w'))
      .toEqual({ kind: 'ready', board: PICO, uname: W, model: expect.objectContaining({ model: 'pico-w', short: 'Pico W' }) });
  });

  it('a plain Pico answered, for a Pico W project: the wrong board', () => {
    expect(chipState(d({ e661: { state: 'micropython', uname: PLAIN } }), 'pico-w'))
      .toMatchObject({ kind: 'wrong', board: PICO, model: { short: 'Pico' } });
  });

  it.each([
    [{ state: 'busy', by: 'Thonny' }, { kind: 'busy', board: PICO, by: 'Thonny' }],
    [{ state: 'no-micropython', seen: '' }, { kind: 'no-micropython', board: PICO }],
    [{ state: 'cant-open', message: 'gone' }, { kind: 'cant-open', board: PICO, message: 'gone' }],
  ] as const)('%j → %j', (check, state) => {
    expect(chipState(d({ e661: check as BoardCheck }), 'pico-w')).toEqual(state);
  });

  it('two Picos, one a Pico W: the Pico W is chosen for a Pico W project', () => {
    const s = chipState(d({ e661: { state: 'micropython', uname: PLAIN }, e662: { state: 'micropython', uname: W } }, [PICO, PICO2]), 'pico-w');
    expect(s).toMatchObject({ kind: 'ready', board: PICO2, others: 1 });
  });
});

describe('M10.2 F-56 a port another program holds', () => {
  it.each([
    ['Error Resource temporarily unavailable Cannot lock port', 'busy'],  // macOS and Linux, recorded 2026-11-06
    ['Opening COM7: Access denied', 'busy'],                             // Windows
    ['Error: No such file or directory, cannot open /dev/cu.usbmodem1', 'gone'],
    ['Opening COM9: File not found', 'gone'],
    ['something else', 'other'],
  ] as const)('%s → %s', (message, kind) => {
    expect(openFailure(message)).toBe(kind);
  });

  it.each([
    [['/Applications/Thonny.app/Contents/MacOS/Python -m thonny'], 'Thonny'],
    [['/Applications/Thonny.app/Contents/Frameworks/Python.framework/Versions/3.10/bin/python3.10 -u -m thonny.plugins.micropython.os_mp_backend --port /dev/cu.usbmodem14201'], 'Thonny'],
    [['/Applications/Arduino IDE.app/Contents/MacOS/Arduino IDE --type=renderer'], 'the Arduino IDE'],
    [['/usr/local/bin/python3 /usr/local/bin/mu-editor'], 'Mu'],
    [['/Users/x/Library/Python/3.12/bin/mpremote connect auto repl'], 'mpremote'],
    [['/Applications/MicroLab.app/Contents/MacOS/MicroLab'], 'another MicroLab window'],
    [['screen /dev/cu.usbmodem14201 115200'], 'screen'],
    [['/opt/x/unknown-tool'], undefined],
    [[], undefined],
  ] as const)('%j → %s', (commands, name) => {
    expect(holderName([...commands])).toBe(name);
  });
});
