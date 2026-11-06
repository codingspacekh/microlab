import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { chipState, detect, plugChanges, type PortInfo } from '@lib/usb';

/** M10.1 F-55, N-12, §1.13: which boards a port list means — from lists recorded on the teacher's laptop. */
const fixture = (name: string) => {
  const f = JSON.parse(readFileSync(`tests/fixtures/usb/${name}.json`, 'utf8')) as { platform: 'darwin' | 'win32'; volumes: string[]; ports: PortInfo[] };
  return detect(f.ports, f.volumes, f.platform);
};

describe('M10.1 detection: a port list in, the boards out', () => {
  it('the Pico W (2e8a:0005), opened by its /dev/cu name on a Mac, known by its serial number', () => {
    expect(fixture('mac-pico-w')).toEqual({
      boards: [{ id: 'e6614103e7519826', kind: 'pico', port: '/dev/cu.usbmodem14201', usb: '2e8a:0005' }],
      drives: [],
    });
  });

  it('the micro:bit (0d28:0204, its USB interface chip); its MICROBIT drive is noted', () => {
    expect(fixture('mac-microbit')).toEqual({
      boards: [{ id: '9906360200052820e706ba99b3769484000000006e052820', kind: 'microbit', port: '/dev/cu.usbmodem14202', usb: '0d28:0204' }],
      drives: [{ kind: 'microbit', volume: 'MICROBIT' }],
    });
  });

  it('nothing plugged in (or a cable that carries no data): no board — Bluetooth ports are not boards', () => {
    expect(fixture('mac-no-board')).toEqual({ boards: [], drives: [] });
  });

  it('a Pico in BOOTSEL mode: no port, its RPI-RP2 drive', () => {
    expect(fixture('mac-pico-bootsel')).toEqual({ boards: [], drives: [{ kind: 'pico-bootsel', volume: 'RPI-RP2' }] });
  });

  it('an ESP32 by its USB chip: CH340 on a Mac', () => {
    expect(fixture('mac-esp32-ch340-constructed').boards).toEqual([
      { id: '14230', kind: 'esp32', port: '/dev/cu.wchusbserial14230', usb: '1a86:7523', chip: 'CH340' },
    ]);
  });

  it('Windows: upper-case IDs, COM ports as they are; two boards, in port order', () => {
    expect(fixture('win-two-boards-constructed').boards).toEqual([
      { id: 'E6614103E7519826', kind: 'pico', port: 'COM5', usb: '2e8a:0005' },
      { id: '0001', kind: 'esp32', port: 'COM7', usb: '10c4:ea60', chip: 'CP210x' },
    ]);
  });

  it.each([
    ['10c4', 'ea60', 'CP210x'], ['1a86', '7523', 'CH340'], ['1a86', '55d4', 'CH9102'],
  ])('%s:%s is an ESP32 with a %s', (vendorId, productId, chip) => {
    expect(detect([{ path: 'COM3', vendorId, productId }], [], 'win32').boards[0]).toMatchObject({ kind: 'esp32', chip, id: 'COM3' });
  });

  it('a USB serial device it doesn\'t know is not a board (an Arduino, a GPS…)', () => {
    expect(detect([{ path: '/dev/tty.usbmodem1', vendorId: '2341', productId: '0043' }], [], 'darwin').boards).toEqual([]);
  });
});

describe('M10.1 plugged in, unplugged', () => {
  const pico = fixture('mac-pico-w');
  const none = fixture('mac-no-board');
  const mb = fixture('mac-microbit');

  it("a board that wasn't there is plugged in; one that's gone is unplugged; the same board on a new port is neither", () => {
    expect(plugChanges(none, pico)).toEqual({ plugged: pico.boards, unplugged: [] });
    expect(plugChanges(pico, none)).toEqual({ plugged: [], unplugged: pico.boards });
    expect(plugChanges(pico, mb)).toEqual({ plugged: mb.boards, unplugged: pico.boards });
    const moved = { ...pico, boards: [{ ...pico.boards[0]!, port: '/dev/cu.usbmodem14301' }] };
    expect(plugChanges(pico, moved)).toEqual({ plugged: [], unplugged: [] });
  });
});

describe('M10.1 the chip (screens 13, 13b): what it says for the project\'s board', () => {
  const pico = fixture('mac-pico-w');
  const mb = fixture('mac-microbit');

  it('no board', () => {
    expect(chipState(fixture('mac-no-board'), 'pico-w')).toEqual({ kind: 'none' });
  });

  it('the project\'s board: ready (a Pico seen on USB fits a Pico W project until it answers)', () => {
    expect(chipState(pico, 'pico-w')).toEqual({ kind: 'ready', board: pico.boards[0] });
    expect(chipState(mb, 'microbit-v2')).toEqual({ kind: 'ready', board: mb.boards[0] });
  });

  it('another board: wrong board, naming both', () => {
    expect(chipState(mb, 'pico-w')).toEqual({ kind: 'wrong', board: mb.boards[0], want: 'pico' });
  });

  it('a Pico in BOOTSEL mode', () => {
    expect(chipState(fixture('mac-pico-bootsel'), 'pico-w')).toEqual({ kind: 'bootsel', volume: 'RPI-RP2' });
  });

  it('two boards: the one chosen, else the one that fits the project, else the first', () => {
    const two = fixture('win-two-boards-constructed');
    expect(chipState(two, 'esp32-devkit-v1')).toEqual({ kind: 'ready', board: two.boards[1], others: 1 });
    expect(chipState(two, 'microbit-v2')).toEqual({ kind: 'wrong', board: two.boards[0], want: 'microbit', others: 1 });
    expect(chipState(two, 'pico-w', '0001')).toEqual({ kind: 'wrong', board: two.boards[1], want: 'pico', others: 1 });
  });

  it('with no project open, any board is ready', () => {
    expect(chipState(mb, undefined)).toEqual({ kind: 'ready', board: mb.boards[0] });
  });
});
