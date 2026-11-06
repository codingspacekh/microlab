import { describe, expect, it } from 'vitest';
import { boardFits, modelOf, parseUname, shortVersion, versionText } from '@lib/repl';

/** M10.2 F-55: the board's answer to os.uname() says which board it is and its MicroPython — USB alone can't tell a
 *  Pico from a Pico W. The strings are the real boards' (the Pico W recording, golden 07_system on the micro:bit). */
const PICO_W = "(sysname='rp2', nodename='rp2', release='1.29.0', version='v1.29.0 on 2026-08-24 (GNU 16.1.0 MinSizeRel)', machine='Raspberry Pi Pico W with RP2040')";
const MICROBIT = "(sysname='microbit', nodename='microbit', release='2.1.2', version='micro:bit v2.1.2+0697c6d on 2023-10-30; MicroPython v1.18 on 2023-10-30', machine='micro:bit with nRF52833')";
const ESP32 = "(sysname='esp32', nodename='esp32', release='1.29.0', version='v1.29.0 on 2026-08-24', machine='Generic ESP32 module with ESP32')";

describe('M10.2 F-55 the board\'s greeting', () => {
  it('os.uname() as printed is read back into its five fields', () => {
    expect(parseUname(`${PICO_W}\r\n`)).toEqual({
      sysname: 'rp2', nodename: 'rp2', release: '1.29.0', version: 'v1.29.0 on 2026-08-24 (GNU 16.1.0 MinSizeRel)', machine: 'Raspberry Pi Pico W with RP2040',
    });
    expect(parseUname('Traceback (most recent call last):\r\n')).toBeNull();
  });

  it.each([
    [PICO_W, 'pico-w', 'Pico W', 'Raspberry Pi Pico W', 'pico'],
    ["(sysname='rp2', nodename='rp2', release='1.29.0', version='v1.29.0', machine='Raspberry Pi Pico with RP2040')", 'pico', 'Pico', 'Raspberry Pi Pico', 'pico'],
    ["(sysname='rp2', nodename='rp2', release='1.29.0', version='v1.29.0', machine='Raspberry Pi Pico 2 W with RP2350')", 'pico2-w', 'Pico 2 W', 'Raspberry Pi Pico 2 W', 'pico'],
    [MICROBIT, 'microbit-v2', 'micro:bit', 'BBC micro:bit V2', 'microbit'],
    ["(sysname='microbit', nodename='microbit', release='1.1.1', version='micro:bit v1.1.1+0 on 2022-10-12; MicroPython v1.15', machine='micro:bit with nRF51822')", 'microbit-v1', 'micro:bit V1', 'BBC micro:bit V1', 'microbit'],
    [ESP32, 'esp32', 'ESP32', 'ESP32 board', 'esp32'],
    ["(sysname='esp32', nodename='esp32', release='1.29.0', version='v1.29.0', machine='Generic ESP32S3 module with ESP32S3')", 'esp32-other', 'ESP32S3', 'ESP32S3 board', 'esp32'],
    ["(sysname='samd', nodename='samd', release='1.29.0', version='v1.29.0', machine='Seeed Wio Terminal with SAMD51P19A')", 'other', 'Seeed Wio Terminal', 'Seeed Wio Terminal', undefined],
  ] as const)('%s → %s ("%s")', (text, model, short, name, kind) => {
    expect(modelOf(parseUname(text)!)).toEqual({ model, short, name, kind });
  });

  it('the version: short in the chip (1.29), whole in the card and the message', () => {
    expect(shortVersion(parseUname(PICO_W)!)).toBe('MicroPython 1.29');
    expect(shortVersion(parseUname(MICROBIT)!)).toBe('MicroPython 2.1.2');
    expect(versionText(parseUname(PICO_W)!)).toBe('MicroPython v1.29.0 (2026-08-24)');
    expect(versionText(parseUname(MICROBIT)!)).toBe('micro:bit MicroPython v2.1.2 (MicroPython v1.18, 2023-10-30)');
  });

  it('which boards fit which project: only the board itself (a plain Pico has no Wi-Fi, a V1 micro:bit no sound)', () => {
    expect(boardFits('pico-w', 'pico-w')).toBe(true);
    expect(boardFits('pico', 'pico-w')).toBe(false);
    expect(boardFits('microbit-v2', 'microbit-v2')).toBe(true);
    expect(boardFits('microbit-v1', 'microbit-v2')).toBe(false);
    expect(boardFits('esp32', 'esp32-devkit-v1')).toBe(true);
    expect(boardFits('esp32', 'esp32-devkit-v1-ext')).toBe(true);
    expect(boardFits('esp32-other', 'esp32-devkit-v1')).toBe(false);
  });
});
