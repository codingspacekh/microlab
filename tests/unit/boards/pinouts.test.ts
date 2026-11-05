import { describe, expect, it } from 'vitest';
import { parseBoard, type BoardData } from '@lib/boards';
import picoJson from '../../../library/boards/pico-w/board.json';
import espJson from '../../../library/boards/esp32-devkit-v1/board.json';
import mbitJson from '../../../library/boards/microbit-v2/board.json';
import extJson from '../../../library/boards/esp32-devkit-v1-ext/board.json';

/**
 * Hand-typed from the official pinouts (M1 test list, N-01):
 *  - Raspberry Pi Pico W datasheet, pinout + RP2040 datasheet §1.4.3 GPIO functions (UART CTS/RTS left out);
 *  - ESP32 DevKit V1 (DOIT, 30 pins) pinout + ESP32 datasheet: ADC, touch, DAC, strapping; the bus pins are
 *    MicroPython's defaults (I2C(0) 18/19, I2C(1) 25/26, SPI(1) 14/13/12, SPI(2) 18/23/19, UART(2) 17/16);
 *  - micro:bit V2 edge connector (tech.microbit.org), as it comes out on the micro:bit GPIO board's headers.
 * Never generated from board.json: the two are typed separately so a slip in either shows up here.
 * Row: physical number, label, functions (comma-separated, '' for none).
 */
const PICO: [number, string, string][] = [
  [1, 'GP0', 'PWM0A, I2C0 SDA, SPI0 RX, UART0 TX'],
  [2, 'GP1', 'PWM0B, I2C0 SCL, SPI0 CS, UART0 RX'],
  [3, 'GND', ''],
  [4, 'GP2', 'PWM1A, I2C1 SDA, SPI0 SCK'],
  [5, 'GP3', 'PWM1B, I2C1 SCL, SPI0 TX'],
  [6, 'GP4', 'PWM2A, I2C0 SDA, SPI0 RX, UART1 TX'],
  [7, 'GP5', 'PWM2B, I2C0 SCL, SPI0 CS, UART1 RX'],
  [8, 'GND', ''],
  [9, 'GP6', 'PWM3A, I2C1 SDA, SPI0 SCK'],
  [10, 'GP7', 'PWM3B, I2C1 SCL, SPI0 TX'],
  [11, 'GP8', 'PWM4A, I2C0 SDA, SPI1 RX, UART1 TX'],
  [12, 'GP9', 'PWM4B, I2C0 SCL, SPI1 CS, UART1 RX'],
  [13, 'GND', ''],
  [14, 'GP10', 'PWM5A, I2C1 SDA, SPI1 SCK'],
  [15, 'GP11', 'PWM5B, I2C1 SCL, SPI1 TX'],
  [16, 'GP12', 'PWM6A, I2C0 SDA, SPI1 RX, UART0 TX'],
  [17, 'GP13', 'PWM6B, I2C0 SCL, SPI1 CS, UART0 RX'],
  [18, 'GND', ''],
  [19, 'GP14', 'PWM7A, I2C1 SDA, SPI1 SCK'],
  [20, 'GP15', 'PWM7B, I2C1 SCL, SPI1 TX'],
  [21, 'GP16', 'PWM0A, I2C0 SDA, SPI0 RX, UART0 TX'],
  [22, 'GP17', 'PWM0B, I2C0 SCL, SPI0 CS, UART0 RX'],
  [23, 'GND', ''],
  [24, 'GP18', 'PWM1A, I2C1 SDA, SPI0 SCK'],
  [25, 'GP19', 'PWM1B, I2C1 SCL, SPI0 TX'],
  [26, 'GP20', 'PWM2A, I2C0 SDA, SPI0 RX, UART1 TX'],
  [27, 'GP21', 'PWM2B, I2C0 SCL, SPI0 CS, UART1 RX'],
  [28, 'GND', ''],
  [29, 'GP22', 'PWM3A, I2C1 SDA, SPI0 SCK'],
  [30, 'RUN', ''],
  [31, 'GP26', 'ADC0, PWM5A, I2C1 SDA, SPI1 SCK'],
  [32, 'GP27', 'ADC1, PWM5B, I2C1 SCL, SPI1 TX'],
  [33, 'AGND', ''],
  [34, 'GP28', 'ADC2, PWM6A, I2C0 SDA, SPI1 RX, UART0 TX'],
  [35, 'ADC_VREF', ''],
  [36, '3V3', ''],
  [37, '3V3_EN', ''],
  [38, 'GND', ''],
  [39, 'VSYS', ''],
  [40, 'VBUS', ''],
];

/** 1–15: the header with EN, from EN down to VIN; 16–30: the other header, from D23 down to 3V3. */
const ESP32: [number, string, string][] = [
  [1, 'EN', ''],
  [2, 'VP', 'ADC1_CH0'],
  [3, 'VN', 'ADC1_CH3'],
  [4, 'D34', 'ADC1_CH6'],
  [5, 'D35', 'ADC1_CH7'],
  [6, 'D32', 'ADC1_CH4, TOUCH9, PWM'],
  [7, 'D33', 'ADC1_CH5, TOUCH8, PWM'],
  [8, 'D25', 'ADC2_CH8, DAC1, PWM, I2C1 SCL'],
  [9, 'D26', 'ADC2_CH9, DAC2, PWM, I2C1 SDA'],
  [10, 'D27', 'ADC2_CH7, TOUCH7, PWM'],
  [11, 'D14', 'ADC2_CH6, TOUCH6, PWM, SPI1 SCK'],
  [12, 'D12', 'ADC2_CH5, TOUCH5, PWM, SPI1 MISO'],
  [13, 'D13', 'ADC2_CH4, TOUCH4, PWM, SPI1 MOSI'],
  [14, 'GND', ''],
  [15, 'VIN', ''],
  [16, 'D23', 'PWM, SPI2 MOSI'],
  [17, 'D22', 'PWM'],
  [18, 'TX0', 'PWM, UART0 TX'],
  [19, 'RX0', 'PWM, UART0 RX'],
  [20, 'D21', 'PWM'],
  [21, 'D19', 'PWM, I2C0 SDA, SPI2 MISO'],
  [22, 'D18', 'PWM, I2C0 SCL, SPI2 SCK'],
  [23, 'D5', 'PWM'],
  [24, 'TX2', 'PWM, UART2 TX'],
  [25, 'RX2', 'PWM, UART2 RX'],
  [26, 'D4', 'ADC2_CH0, TOUCH0, PWM'],
  [27, 'D2', 'ADC2_CH2, TOUCH2, PWM'],
  [28, 'D15', 'ADC2_CH3, TOUCH3, PWM'],
  [29, 'GND', ''],
  [30, '3V3', ''],
];
const ESP32_GPIO: Record<string, number> = {
  VP: 36, VN: 39, D34: 34, D35: 35, D32: 32, D33: 33, D25: 25, D26: 26, D27: 27, D14: 14, D12: 12, D13: 13,
  D23: 23, D22: 22, TX0: 1, RX0: 3, D21: 21, D19: 19, D18: 18, D5: 5, TX2: 17, RX2: 16, D4: 4, D2: 2, D15: 15,
};

/**
 * The micro:bit GPIO board (resources/microbit_gpio_board.webp), read off the board's own printing:
 * 1–13 the top header row and 14–26 the bottom row, both left to right; 27–30 the right-angle I²C header, top down.
 */
const MICROBIT: [number, string, string][] = [
  [1, '3.3V', ''],
  [2, 'GND', ''],
  [3, 'GND', ''],
  [4, 'P20', 'PWM, I2C SDA'],
  [5, 'P19', 'PWM, I2C SCL'],
  [6, 'P16', 'PWM'],
  [7, 'P15', 'PWM, SPI MOSI'],
  [8, 'P14', 'PWM, SPI MISO'],
  [9, 'P13', 'PWM, SPI SCK'],
  [10, 'P12', 'PWM'],
  [11, 'P11', 'PWM'],
  [12, 'P10', 'ADC, PWM'],
  [13, '3.3V', ''],
  [14, '5V', ''],
  [15, 'GND', ''],
  [16, 'P0', 'ADC, TOUCH, PWM'],
  [17, 'P1', 'ADC, TOUCH, PWM'],
  [18, 'P2', 'ADC, TOUCH, PWM'],
  [19, 'P3', 'ADC, PWM'],
  [20, 'P4', 'ADC, PWM'],
  [21, 'P5', 'PWM'],
  [22, 'P6', 'PWM'],
  [23, 'P7', 'PWM'],
  [24, 'P8', 'PWM'],
  [25, 'P9', 'PWM'],
  [26, '5V', ''],
  [27, 'SDA', 'I2C SDA'],
  [28, 'SCL', 'I2C SCL'],
  [29, 'GND', ''],
  [30, '3.3V', ''],
];

function table(board: BoardData) {
  return board.pins.map((p) => [p.number, p.label, p.functions.join(', ')]);
}
const sorted = (fns: string) => fns.split(', ').filter(Boolean).sort().join(', ');

describe('N-01 Pico W pins equal the official pinout', () => {
  const pico = parseBoard(picoJson);
  it('has the 40 pins in order, with their functions', () => {
    expect(table(pico).map(([n, l, f]) => [n, l, sorted(f as string)])).toEqual(PICO.map(([n, l, f]) => [n, l, sorted(f)]));
  });
  it('GP pins have their GPIO number; GND, AGND are ground; 3V3, VBUS, VSYS are power', () => {
    for (const p of pico.pins) {
      if (p.label.startsWith('GP')) expect(p.gpio).toBe(Number(p.label.slice(2)));
      if (p.label === 'GND' || p.label === 'AGND') expect(p.role).toBe('ground');
      if (['3V3', 'VBUS', 'VSYS'].includes(p.label)) expect(p.role).toBe('power');
    }
  });
});

describe('N-01 ESP32 DevKit V1 (30 pins) equals the official pinout', () => {
  const esp = parseBoard(espJson);
  it('has the 30 pins in order, with their functions', () => {
    expect(table(esp).map(([n, l, f]) => [n, l, sorted(f as string)])).toEqual(ESP32.map(([n, l, f]) => [n, l, sorted(f)]));
  });
  it('labels map to the right GPIO numbers', () => {
    const got = Object.fromEntries(esp.pins.filter((p) => p.gpio !== undefined).map((p) => [p.label, p.gpio]));
    expect(got).toEqual(ESP32_GPIO);
  });
  it('GPIO 34–39 are input only, with no pull resistors', () => {
    const inputOnly = esp.pins.filter((p) => p.inputOnly).map((p) => p.gpio).sort((a, b) => a! - b!);
    expect(inputOnly).toEqual([34, 35, 36, 39]);
    expect(esp.pins.filter((p) => p.inputOnly).every((p) => p.noPulls)).toBe(true);
  });
  it('strapping pins on the header are 2, 5, 12, 15', () => {
    expect(esp.pins.filter((p) => p.strapping).map((p) => p.gpio).sort((a, b) => a! - b!)).toEqual([2, 5, 12, 15]);
  });
});

describe('N-01 micro:bit V2 on its GPIO board equals the edge connector', () => {
  const mbit = parseBoard(mbitJson);
  it('has the header pins in order, with their functions', () => {
    expect(table(mbit).map(([n, l, f]) => [n, l, sorted(f as string)])).toEqual(MICROBIT.map(([n, l, f]) => [n, l, sorted(f)]));
  });
  it('P3, P4, P6, P7, P10 are shared with the display columns; P5 and P11 with buttons A and B', () => {
    const shared = Object.fromEntries(mbit.pins.filter((p) => p.shared).map((p) => [p.label, p.shared]));
    expect(shared).toEqual({
      P3: 'display COL3', P4: 'display COL1', P6: 'display COL4', P7: 'display COL2', P10: 'display COL5',
      P5: 'button A', P11: 'button B',
    });
  });
  it('every edge-connector pin the board brings out is there once, as a GPIO pin with its number', () => {
    const gpio = mbit.pins.filter((p) => p.role === 'gpio' && !p.same).map((p) => p.label);
    expect([...gpio].sort()).toEqual(['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P12',
      'P13', 'P14', 'P15', 'P16', 'P19', 'P20'].sort());
    for (const p of mbit.pins.filter((q) => q.role === 'gpio' && !q.same)) expect(p.gpio).toBe(Number(p.label.slice(1)));
  });
  it('the repeated 3.3V and 5V pins and the I²C header are the same connection as the first one', () => {
    const same = Object.fromEntries(mbit.pins.filter((p) => p.same).map((p) => [p.id, p.same]));
    expect(same).toEqual({ '3.3V@13': '3.3V', '5V@26': '5V', SDA: 'P20', SCL: 'P19', '3.3V@30': '3.3V' });
  });
  it('the I²C header is right-angled: it takes jumper wires, not the breadboard', () => {
    expect(mbit.pins.filter((p) => p.wireOnly).map((p) => p.number)).toEqual([27, 28, 29, 30]);
  });
  it('5V comes only from the GPIO board\'s own micro-USB; 3.3V is the micro:bit\'s', () => {
    expect(mbit.supplies.map((s) => [s.pin, s.volts, !!s.usbOnly])).toEqual([['3.3V', 3.3, false], ['5V', 5, true]]);
  });
});

/**
 * ESP32 DevKit V1 on its 30-pin extension board (resources/esp32_extension_board.jpg): each signal of the
 * ESP32 comes out as a G-V-S triple (ground, the jumper-chosen V rail, the signal). 1–39: the EN header's
 * signals from EN to D13; 40–78: the other header's from D23 to D15; in each triple S, V, G.
 */
const EXT_ROWS = ['EN', 'VP', 'VN', 'D34', 'D35', 'D32', 'D33', 'D25', 'D26', 'D27', 'D14', 'D12', 'D13',
  'D23', 'D22', 'TX0', 'RX0', 'D21', 'D19', 'D18', 'D5', 'TX2', 'RX2', 'D4', 'D2', 'D15'];

describe('N-01 ESP32 DevKit V1 with extension board', () => {
  const ext = parseBoard(extJson);
  const esp = parseBoard(espJson);
  it('has a G-V-S triple for every signal of both headers, in order', () => {
    expect(ext.pins.map((p) => [p.number, p.label])).toEqual(
      EXT_ROWS.flatMap((s, i) => [[i * 3 + 1, s], [i * 3 + 2, 'V'], [i * 3 + 3, 'GND']]));
  });
  it('every S pin is the ESP32 pin itself: same GPIO, functions and flags as the plain ESP32 board', () => {
    const facts = (p: (typeof esp.pins)[number]) =>
      ({ role: p.role, gpio: p.gpio, functions: p.functions, inputOnly: p.inputOnly, noPulls: p.noPulls, strapping: p.strapping, note: p.note });
    for (const label of EXT_ROWS) {
      expect(facts(ext.pins.find((p) => p.label === label)!), label).toEqual(facts(esp.pins.find((p) => p.label === label)!));
    }
    expect({ ...ext.gpio }).toEqual({ ...esp.gpio });
    expect(ext.builtIn).toEqual(esp.builtIn);
    expect(ext.anyPinBuses).toEqual(esp.anyPinBuses);
  });
  it('every V pin is the one V rail; every G pin is ground; all are header pins for jumper wires', () => {
    expect(ext.pins.filter((p) => p.label === 'V').every((p) => p.role === 'power' && (p.id === 'V' || p.same === 'V'))).toBe(true);
    expect(ext.pins.filter((p) => p.label === 'GND').every((p) => p.role === 'ground')).toBe(true);
    expect(ext.pins.every((p) => p.wireOnly)).toBe(true);
  });
  it('the V rail is 5 V or 3.3 V, picked with the JUMP jumper', () => {
    expect(ext.supplies.map((s) => [s.pin, s.volts, s.choices])).toEqual([['V', 5, [3.3, 5]]]);
  });
});

