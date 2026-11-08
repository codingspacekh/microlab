import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBoard } from '@lib/boards';
import type { CircuitSpec, PartSpec } from '@lib/circuit';
import picoJson from '../../library/boards/pico-w/board.json';
import espJson from '../../library/boards/esp32-devkit-v1/board.json';
import mbitJson from '../../library/boards/microbit-v2/board.json';
import { VirtualClock } from '../../src/sim/clock';
import type { PartView } from '../../src/sim/circuit';
import { runProject, type RunResult, type SimBoard } from '../../src/sim/run';
import { nodeLoader } from './vm';

/** M7 slice 2 (screens 26, 26b, 26c), F-34, F-36: the displays driven by MicroPython through the library pack's
 *  drivers — two displays on one I²C bus, a wrong address, a 7-segment digit with one resistor or none, an LCD on
 *  3V3, chained MAX7219s and what they draw. */
const DATA = { 'pico-w': parseBoard(picoJson), 'esp32-devkit-v1': parseBoard(espJson), 'microbit-v2': parseBoard(mbitJson) } as const;
const spec = (board: SimBoard, parts: PartSpec[], wires: [string, string][]): CircuitSpec => ({
  board: { data: DATA[board as keyof typeof DATA] }, breadboards: [{ id: 'bb1', size: 'half' }], parts,
  wires: wires.map(([a, b], i) => ({ id: `w${i + 1}`, a, b })),
});
const PACK = join(process.cwd(), 'library/lib-pack');
const lib = (...files: [string, string][]) => Object.fromEntries(files.map(([from, to]) => [to, readFileSync(join(PACK, from), 'utf8')]));
const LIBS = lib(['ssd1306/ssd1306.py', 'lib/ssd1306.py'], ['lcd/lcd_api.py', 'lib/lcd_api.py'], ['lcd/machine_i2c_lcd.py', 'lib/i2c_lcd.py'],
  ['tm1637/tm1637.py', 'lib/tm1637.py'], ['max7219/max7219.py', 'lib/max7219.py']);
const run = async (board: SimBoard, circuit: CircuitSpec, main: string, seconds = 1): Promise<RunResult> =>
  runProject(await nodeLoader(), { board, files: { ...LIBS, 'main.py': main }, clock: new VirtualClock(), circuit, maxUs: seconds * 1e6 });
const last = (r: RunResult, id: string): PartView | undefined => r.parts.filter(([, p]) => p === id).at(-1)?.[2];
function at(r: RunResult, id: string, s: number): PartView | undefined {
  let v: PartView | undefined;
  for (const [t, pid, view] of r.parts) if (pid === id && t <= s * 1e6) v = view;
  return v;
}
const py = (...lines: string[]) => `${lines.join('\n')}\n`;
const out = (r: RunResult) => r.output.split('\n').filter((l) => l && !l.startsWith('MicroPython'));

const OLED: PartSpec = { id: 'oled1', type: 'ssd1306', legs: { gnd: 'bb1.f14', vcc: 'bb1.f15', scl: 'bb1.f16', sda: 'bb1.f17' } };
const LCD: PartSpec = { id: 'lcd1', type: 'lcd1602', legs: {} };
const PICO_BUS: [string, string][] = [['board.3V3', 'bb1.j15'], ['board.GND', 'bb1.j14'], ['board.GP21', 'bb1.j16'], ['board.GP20', 'bb1.j17'],
  ['bb1.i16', 'lcd1.scl'], ['bb1.i17', 'lcd1.sda'], ['lcd1.vcc', 'board.VBUS'], ['lcd1.gnd', 'bb1.i14']];

describe('M7 the OLED and the LCD on one I²C bus (screen 26)', () => {
  it('i2c.scan() finds the LCD (39, 0x27) and the OLED (60, 0x3C); each shows what was drawn on it', async () => {
    const r = await run('pico-w', spec('pico-w', [OLED, LCD], PICO_BUS), py(
      'from machine import Pin, I2C', 'from ssd1306 import SSD1306_I2C', 'from i2c_lcd import I2cLcd',
      'i2c = I2C(0, sda=Pin(20), scl=Pin(21), freq=400000)', 'print(i2c.scan())',
      'oled = SSD1306_I2C(128, 64, i2c)', 'lcd = I2cLcd(i2c, 0x27, 2, 16)',
      'oled.fill_rect(0, 0, 10, 10, 1)', 'oled.show()',
      "lcd.putstr('Knob:  62 %')", 'lcd.move_to(0, 1)', "lcd.putstr('ADC 40632')",
    ));
    expect(r.error).toBeUndefined();
    expect(out(r)[0]).toBe('[39, 60]');
    expect(last(r, 'oled1')).toMatchObject({ kind: 'oled', on: true, lit: 100 });
    expect(last(r, 'lcd1')).toMatchObject({ kind: 'lcd', on: true, backlight: true, faint: false, rows: ['Knob:  62 %     ', 'ADC 40632       '] });
    expect(r.faults).toEqual([]);
  });

  it('the LCD set to 0x3F (its other backpack) and the code saying 0x27: OSError EIO on the Pico W, as the board says', async () => {
    const lcd = { ...LCD, props: { address: 0x3f } };
    const r = await run('pico-w', spec('pico-w', [OLED, lcd], PICO_BUS), py(
      'from machine import Pin, I2C', 'from i2c_lcd import I2cLcd', 'i2c = I2C(0, sda=Pin(20), scl=Pin(21))', 'print(i2c.scan())',
      'lcd = I2cLcd(i2c, 0x27, 2, 16)',
    ));
    expect(out(r)[0]).toBe('[60, 63]');
    expect(r.error).toMatchObject({ type: 'OSError', message: '[Errno 5] EIO' });
  });

  it('the micro:bit: ENODEV for the OLED with no power; with it, the pack\'s own driver draws text', async () => {
    const wires: [string, string][] = [['board.GND', 'bb1.j14'], ['board.P19', 'bb1.j16'], ['board.P20', 'bb1.j17']];
    const off = await run('microbit-v2', spec('microbit-v2', [OLED], wires), py('from microbit import *', 'i2c.write(0x3C, bytes([0x80, 0xAF]))'));
    expect(off.error).toMatchObject({ type: 'OSError', message: '[Errno 19] ENODEV' });
    const files = lib(['ssd1306/microbit/ssd1306.py', 'ssd1306.py']);
    const draw = ["o.text('Hi 8', 3, 5)", 'o.line(0, 63, 127, 20, 1)', 'o.rect(10, 30, 20, 10, 1)', 'o.fill_rect(40, 30, 5, 5, 1)', 'o.pixel(127, 0, 1)', 'o.show()'];
    const r = await runProject(await nodeLoader(), {
      board: 'microbit-v2', clock: new VirtualClock(), maxUs: 1e6, circuit: spec('microbit-v2', [OLED], [...wires, ['board.3.3V', 'bb1.j15']]),
      files: { ...files, 'main.py': py('from microbit import *', 'from ssd1306 import SSD1306_I2C', 'o = SSD1306_I2C(128, 64, i2c)', ...draw) },
    });
    expect(r.error).toBeUndefined();
    // the same pixels as MicroPython's own ssd1306.py and framebuf draw on the Pico W
    const pico = await run('pico-w', spec('pico-w', [OLED], [['board.3V3', 'bb1.j15'], ['board.GND', 'bb1.j14'], ['board.GP5', 'bb1.j16'], ['board.GP4', 'bb1.j17']]),
      py('from machine import Pin, I2C', 'from ssd1306 import SSD1306_I2C', 'o = SSD1306_I2C(128, 64, I2C(0))', ...draw));
    const frame = (x: RunResult) => (last(x, 'oled1') as { frame: string }).frame;
    expect(frame(pico).length).toBe(2048);
    expect(frame(r)).toBe(frame(pico));
  });
});

const DIGIT = (props: Record<string, string> = {}): PartSpec => ({ id: 'digit1', type: 'seven-segment', props,
  legs: { e: 'bb1.h9', d: 'bb1.h10', com2: 'bb1.h11', c: 'bb1.h12', dp: 'bb1.h13', b: 'bb1.d13', a: 'bb1.d12', com1: 'bb1.d11', f: 'bb1.d10', g: 'bb1.d9' } });
const SEGS: [string, string][] = [['board.GP18', 'bb1.b12'], ['board.GP19', 'bb1.c13'], ['board.GP20', 'bb1.j12'], ['board.GP21', 'bb1.j10'],
  ['board.GP22', 'bb1.j9'], ['board.GP17', 'bb1.a10'], ['board.GP16', 'bb1.a9']];
const SHOW = (n: number) => py('from machine import Pin', 'import time', 'segs = [Pin(n, Pin.OUT) for n in (18, 19, 20, 21, 22, 17, 16)]',
  'FONT = [0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F]',
  `for i, s in enumerate(segs):`, `    s.value(FONT[${n}] >> i & 1)`, 'time.sleep(0.2)');

describe('M7 a 7-segment digit (screens 26b, 26c)', () => {
  const R: PartSpec = { id: 'r1', type: 'resistor', props: { ohms: 220 }, legs: { a: 'bb1.i11', b: 'bb1.i14' } };
  const GND: [string, string][] = [['bb1.j14', 'bb1.B-14'], ['board.GND', 'bb1.B-1']];

  it('one 220 Ω on its COM: the lit segments share its current — a 1\'s two segments brighter than an 8\'s seven', async () => {
    const one = await run('pico-w', spec('pico-w', [DIGIT(), R], [...SEGS, ...GND]), SHOW(1));
    const eight = await run('pico-w', spec('pico-w', [DIGIT(), R], [...SEGS, ...GND]), SHOW(8));
    const b1 = (last(one, 'digit1:b') as { brightness: number }).brightness;
    const b8 = (last(eight, 'digit1:b') as { brightness: number }).brightness;
    expect((last(one, 'digit1:a') as { brightness: number }).brightness).toBeLessThan(0.001);
    expect(b1).toBeGreaterThan(0.1);
    expect(b8).toBeGreaterThan(0.01);
    expect(b1).toBeGreaterThan(2.5 * b8);
    expect(one.faults).toEqual([]);
  });

  it('its COM straight on GND (screen 26c): the first segment lit damages its pin, and the run stops', async () => {
    const r = await run('pico-w', spec('pico-w', [DIGIT()], [...SEGS, ['bb1.j11', 'bb1.B-11'], ['board.GND', 'bb1.B-1']]), SHOW(9));
    // the LED of segment a burns first (screen 04's fault): 48 mA, the most a Pico W pin pushes; the pin is warned of
    expect(r.ended).toBe('fault');
    expect(r.fault?.message).toBe('digit1 (segment a): the LED burnt out — 48 mA through it, it takes 30 mA at most');
    expect(r.faults).toContainEqual(expect.objectContaining({ kind: 'pin-over-current', on: 'GP18', severity: 'warning' }));
  });

  it('common anode: COM to 3V3, a segment lit by a low pin', async () => {
    const r = await run('pico-w', spec('pico-w', [DIGIT({ common: 'anode' }), R], [...SEGS, ['bb1.j14', 'bb1.B+14'], ['board.3V3', 'bb1.B+1']]), py(
      'from machine import Pin', 'import time', 'a = Pin(18, Pin.OUT, value=0)', 'b = Pin(19, Pin.OUT, value=1)', 'time.sleep(0.1)',
    ));
    expect((last(r, 'digit1:a') as { brightness: number }).brightness).toBeGreaterThan(0.1);
    expect((last(r, 'digit1:b') as { brightness: number }).brightness).toBeLessThan(0.001);
  });
});

describe('M7 the LCD on 3V3 (screen 26c): a warning, its letters too faint', () => {
  it('the code runs and writes; the LCD shows the letters faint, and says why', async () => {
    const wires: [string, string][] = [['lcd1.gnd', 'board.GND'], ['lcd1.vcc', 'board.3V3'], ['lcd1.sda', 'board.GP26'], ['lcd1.scl', 'board.GP27']];
    const r = await run('pico-w', spec('pico-w', [LCD], wires), py(
      'from machine import Pin, I2C', 'from i2c_lcd import I2cLcd', 'i2c = I2C(1, sda=Pin(26), scl=Pin(27))', 'lcd = I2cLcd(i2c, 0x27, 2, 16)', "lcd.putstr('Counting down')",
    ));
    expect(r.error).toBeUndefined();
    expect(last(r, 'lcd1')).toMatchObject({ on: true, faint: true, rows: ['Counting down   ', '                '] });
    expect(r.faults).toEqual([expect.objectContaining({ kind: 'display-underpowered', on: 'lcd1', severity: 'warning', message: expect.stringMatching(/too faint to read/) })]);
  });
});

describe('M7 the TM1637 and the MAX7219 (screen 26b)', () => {
  it('TM1637 on the ESP32: numbers(1, 27) shows 01:27; brightness(2); with no power it shows nothing', async () => {
    const tm: PartSpec = { id: 'tm1', type: 'tm1637', legs: {} };
    const wires: [string, string][] = [['tm1.clk', 'board.D25'], ['tm1.dio', 'board.D26'], ['tm1.vcc', 'board.3V3'], ['tm1.gnd', 'board.GND']];
    const r = await run('esp32-devkit-v1', spec('esp32-devkit-v1', [tm], wires), py(
      'from machine import Pin', 'import tm1637', 'import time', 'd = tm1637.TM1637(clk=Pin(25), dio=Pin(26))', 'd.numbers(1, 27)', 'time.sleep(0.2)', 'd.brightness(2)',
    ));
    expect(at(r, 'tm1', 0.15)).toMatchObject({ kind: 'digits', on: true, brightness: 7, text: '01:27' });
    expect(last(r, 'tm1')).toMatchObject({ brightness: 2 });
    const off = await run('esp32-devkit-v1', spec('esp32-devkit-v1', [tm], wires.slice(0, 2).concat([['tm1.gnd', 'board.GND']])), py(
      'from machine import Pin', 'import tm1637', 'd = tm1637.TM1637(clk=Pin(25), dio=Pin(26))', 'd.numbers(1, 27)',
    ));
    expect(last(off, 'tm1')).toMatchObject({ on: false, text: '    ' });
  });

  it('two MAX7219s chained (DOUT to DIN): the driver\'s num=2 fills both; they draw what their dots take from VBUS', async () => {
    const m1: PartSpec = { id: 'mx1', type: 'max7219', legs: {} };
    const m2: PartSpec = { id: 'mx2', type: 'max7219', legs: {} };
    const wires: [string, string][] = [['mx1.vcc', 'board.VBUS'], ['mx1.gnd', 'board.GND'], ['mx1.clk', 'board.GP18'], ['mx1.din', 'board.GP19'], ['mx1.cs', 'board.GP17'],
      ['mx1.vcc2', 'mx2.vcc'], ['mx1.gnd2', 'mx2.gnd'], ['mx1.dout', 'mx2.din'], ['mx1.cs2', 'mx2.cs'], ['mx1.clk2', 'mx2.clk']];
    const r = await run('pico-w', spec('pico-w', [m1, m2], wires), py(
      'from machine import Pin, SPI', 'import max7219', 'spi = SPI(0, sck=Pin(18), mosi=Pin(19))',
      'm = max7219.Matrix8x8(spi, Pin(17, Pin.OUT), 2)', 'm.brightness(15)', 'm.fill(0)', 'm.fill_rect(0, 0, 8, 8, 1)', 'm.pixel(8, 0, 1)', 'm.show()',
    ));
    expect(r.error).toBeUndefined();
    // the bytes for the last module go out first: the left 8 columns are the first module's
    expect(last(r, 'mx2')).toMatchObject({ on: true, lit: 64, intensity: 15 });
    expect(last(r, 'mx1')).toMatchObject({ on: true, lit: 1, rows: [0x80, 0, 0, 0, 0, 0, 0, 0] });
    expect((last(r, 'mx2') as { amps: number }).amps).toBeCloseTo(0.008 + 64 * 0.04 * (31 / 32) / 8, 3);
    expect(r.faults).toEqual([]);
  });

  it('a MAX7219 on 3V3: it works, with a warning — it needs 4 V', async () => {
    const wires: [string, string][] = [['mx1.vcc', 'board.3V3'], ['mx1.gnd', 'board.GND'], ['mx1.clk', 'board.GP18'], ['mx1.din', 'board.GP19'], ['mx1.cs', 'board.GP17']];
    const r = await run('pico-w', spec('pico-w', [{ id: 'mx1', type: 'max7219', legs: {} }], wires), py(
      'from machine import Pin, SPI', 'import max7219', 'm = max7219.Matrix8x8(SPI(0), Pin(17, Pin.OUT), 1)', 'm.pixel(0, 0, 1)', 'm.show()',
    ));
    expect(last(r, 'mx1')).toMatchObject({ on: true, lit: 1 });
    expect(r.faults.map((f) => f.kind)).toEqual(['display-underpowered']);
  });
});
