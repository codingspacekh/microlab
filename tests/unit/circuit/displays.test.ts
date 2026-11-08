import { describe, expect, it } from 'vitest';
import { DISPLAYS, Lcd1602, Max7219, Ssd1306, Tm1637, digitsText } from '@lib/circuit/displays';

/** M7 slice 2 (screens 26, 26b): the displays, fed exactly what the library pack's drivers send them — ssd1306.py
 *  (micropython-lib), machine_i2c_lcd.py + lcd_api.py (python_lcd), tm1637.py and max7219.py (mcauser).
 *  tests/python/displays.test.ts runs the drivers themselves. */

// ------------------------------------------------------------------ SSD1306, as ssd1306.py talks to it
const INIT = [0xae, 0x20, 0x00, 0x40, 0xa1, 0xa8, 63, 0xc8, 0xd3, 0x00, 0xda, 0x12, 0xd5, 0x80, 0xd9, 0xf1, 0xdb, 0x30, 0x81, 0xff, 0xa4, 0xa6, 0xad, 0x30, 0x8d, 0x14, 0xaf];
const cmd = (o: Ssd1306, ...cs: number[]) => { for (const c of cs) o.write([0x80, c]); };
const show = (o: Ssd1306, buf: Uint8Array) => { cmd(o, 0x21, 0, 127, 0x22, 0, 7); o.write([0x40, ...buf]); };
const at = (frame: Uint8Array, x: number, y: number) => (frame[(y >> 3) * 128 + x]! >> (y & 7)) & 1;
function oled() {
  const o = new Ssd1306();
  cmd(o, ...INIT);
  show(o, new Uint8Array(1024));   // init_display(): fill(0), show()
  return o;
}

describe('M7 the SSD1306 OLED takes ssd1306.py\'s commands and pixels', () => {
  it('off until its display-on command; dark after init; a pixel framebuf set is where it was set', () => {
    const o = new Ssd1306();
    expect(o.on).toBe(false);
    show(o, new Uint8Array(1024).fill(0xff));
    expect(o.lit()).toBe(0);                     // off: nothing shows, whatever is in its RAM
    const p = oled();
    expect(p.on).toBe(true);
    expect(p.lit()).toBe(0);
    const buf = new Uint8Array(1024);
    buf[0] = 0b0000_0001;                        // MONO_VLSB: pixel (0, 0)
    buf[2 * 128 + 5] = 0b1000_0000;              // pixel (5, 23)
    show(p, buf);
    const f = p.frame();
    expect(at(f, 0, 0)).toBe(1);
    expect(at(f, 5, 23)).toBe(1);
    expect(p.lit()).toBe(2);
  });

  it('a whole screen in one write (writevto): 1024 bytes fill the 8 pages, in horizontal addressing', () => {
    const o = oled();
    show(o, new Uint8Array(1024).fill(0xff));
    expect(o.lit()).toBe(128 * 64);
    // the window's bar: 79 columns of rows 40–51
    const buf = new Uint8Array(1024);
    for (let x = 0; x < 79; x++) for (let y = 40; y < 52; y++) buf[(y >> 3) * 128 + x]! |= 1 << (y & 7);
    show(o, buf);
    expect(o.lit()).toBe(79 * 12);
    expect(at(o.frame(), 78, 51)).toBe(1);
    expect(at(o.frame(), 79, 51)).toBe(0);
  });

  it('invert, contrast, power off and on; rotate(0) turns the picture over', () => {
    const o = oled();
    const buf = new Uint8Array(1024);
    buf[0] = 1;
    show(o, buf);
    cmd(o, 0xa7);                                // invert(1)
    expect(o.lit()).toBe(128 * 64 - 1);
    cmd(o, 0xa6, 0x81, 0x40);                    // invert(0), contrast(64)
    expect(o.contrast).toBe(0x40);
    cmd(o, 0xae);                                // poweroff()
    expect(o.lit()).toBe(0);
    cmd(o, 0xaf, 0xc0, 0xa0);                    // poweron(), rotate(0)
    expect(at(o.frame(), 127, 63)).toBe(1);
  });

  it('page addressing (SET_MEM_ADDR 2): columns from the low and high nibble commands, a page from B0–B7', () => {
    const o = oled();
    cmd(o, 0x20, 0x02, 0xb3, 0x0a, 0x11);       // page 3, column 0x1a
    o.write([0x40, 0xff]);
    expect(at(o.frame(), 0x1a, 24)).toBe(1);
    expect(at(o.frame(), 0x1a, 31)).toBe(1);
    expect(o.lit()).toBe(8);
  });

  it('works from 3.0 V (its regulator); answers at 0x3C, 0x3D with its pad moved', () => {
    expect(DISPLAYS.ssd1306).toMatchObject({ workVolts: 3.0, addresses: [0x3c, 0x3d] });
  });
});

// ------------------------------------------------------------------ 16×2 LCD on a PCF8574, as machine_i2c_lcd.py talks to it
function lcdDriver(l: Lcd1602) {
  const E = 0x04;
  let backlight = 1;
  const pulse = (byte: number) => { l.write([byte | E]); l.write([byte]); };
  const nibble = (n: number) => pulse(((n >> 4) & 0x0f) << 4);
  const command = (c: number) => { pulse((backlight << 3) | ((c >> 4) << 4)); pulse((backlight << 3) | ((c & 0x0f) << 4)); };
  const data = (d: number) => { pulse(1 | (backlight << 3) | ((d >> 4) << 4)); pulse(1 | (backlight << 3) | ((d & 0x0f) << 4)); };
  // I2cLcd.__init__ and LcdApi.__init__
  l.write([0]);
  nibble(0x30); nibble(0x30); nibble(0x30); nibble(0x20);
  l.write([1 << 3]);                              // backlight_on()
  command(0x08 | 0x04);                           // display_on()  (LcdApi: display off, backlight on, clear, entry mode, hide cursor, display on)
  command(0x01);
  command(0x04 | 0x02);
  command(0x20 | 0x08);                           // the function set with 2 lines, after LcdApi.__init__
  const moveTo = (x: number, y: number) => command(0x80 | ((x & 0x3f) + (y & 1 ? 0x40 : 0)));
  const putstr = (s: string) => { for (const ch of s) data(ch.charCodeAt(0)); };
  return { command, data, moveTo, putstr, backlightOff: () => { backlight = 0; l.write([0]); } };
}

describe('M7 the 16×2 LCD behind its PCF8574 backpack', () => {
  it('blank and off as it powers up; after the driver\'s init, on, its backlight on, the cursor at the start', () => {
    const l = new Lcd1602();
    expect(l.rows()).toEqual([' '.repeat(16), ' '.repeat(16)]);
    expect(l.on).toBe(false);
    lcdDriver(l);
    expect(l.on).toBe(true);
    expect(l.backlight).toBe(true);
  });

  it('putstr writes on from the cursor; move_to(0, 1) is the second row (DDRAM 0x40)', () => {
    const l = new Lcd1602();
    const d = lcdDriver(l);
    d.moveTo(0, 0); d.putstr('Knob:  62 %');
    d.moveTo(0, 1); d.putstr('ADC 40632');
    expect(l.rows()).toEqual(['Knob:  62 %     ', 'ADC 40632       ']);
    d.moveTo(14, 0); d.putstr('ok');
    expect(l.rows()[0]).toBe('Knob:  62 %   ok');
  });

  it('clear blanks it and goes home; past column 40 of row 0 the cursor goes on in row 1', () => {
    const l = new Lcd1602();
    const d = lcdDriver(l);
    d.putstr('Hello');
    d.command(0x01);
    expect(l.rows()[0]).toBe(' '.repeat(16));
    d.moveTo(39, 0); d.putstr('AB');
    expect(l.rows()[1]!.startsWith('B')).toBe(true);
  });

  it('display off hides the letters but keeps them; the backlight follows bit 3', () => {
    const l = new Lcd1602();
    const d = lcdDriver(l);
    d.putstr('Hi');
    d.command(0x08);                              // display_off()
    expect(l.on).toBe(false);
    d.command(0x0c);
    expect(l.rows()[0]!.slice(0, 2)).toBe('Hi');
    d.backlightOff();
    expect(l.backlight).toBe(false);
  });

  it('a custom character (CGRAM) is kept, and is character 0 in the row', () => {
    const l = new Lcd1602();
    const d = lcdDriver(l);
    d.command(0x40);                              // custom_char(0, …)
    for (const row of [0x00, 0x0a, 0x1f, 0x1f, 0x0e, 0x04, 0x00, 0x00]) d.data(row);
    d.moveTo(0, 0); d.data(0);
    expect([...l.cgram.slice(0, 8)]).toEqual([0x00, 0x0a, 0x1f, 0x1f, 0x0e, 0x04, 0x00, 0x00]);
    expect(l.rows()[0]!.charCodeAt(0)).toBe(0);
  });

  it('its PCF8574 answers from 2.5 V, but its letters can be read from 4.5 V; 0x27 or 0x3F', () => {
    expect(DISPLAYS.lcd1602).toMatchObject({ workVolts: 2.5, minVolts: 4.5, addresses: [0x27, 0x3f] });
  });
});

// ------------------------------------------------------------------ TM1637, pin by pin as tm1637.py toggles CLK and DIO
function tmDriver(t: Tm1637) {
  let clk = 0;
  let dio = 0;
  const set = (c: number, d: number) => { clk = c; dio = d; t.lines(clk, dio); };
  const start = () => { set(clk, 0); set(0, dio); };
  const stop = () => { set(clk, 0); set(1, dio); set(clk, 1); };
  const byte = (b: number) => {
    for (let i = 0; i < 8; i++) { set(clk, (b >> i) & 1); set(1, dio); set(0, dio); }
    set(0, dio); set(1, dio); set(0, dio);
  };
  set(0, 0);                                      // clk.init(OUT, 0); dio.init(OUT, 0)
  const frame = (...bs: number[]) => { start(); for (const b of bs) byte(b); stop(); };
  frame(0x40); frame(0x88 | 7);                   // _write_data_cmd(), _write_dsp_ctrl()
  return {
    write: (segs: number[], pos = 0) => { frame(0x40); frame(0xc0 | pos, ...segs); frame(0x88 | 7); },
    brightness: (v: number) => { frame(0x40); frame(0x88 | v); },
    off: () => frame(0x80),
  };
}

describe('M7 the TM1637 4-digit display, decoded from its CLK and DIO', () => {
  it('on at brightness 7 after the driver\'s init; numbers(1, 27) shows 01:27 with its colon', () => {
    const t = new Tm1637();
    const d = tmDriver(t);
    expect(t.on).toBe(true);
    expect(t.brightness).toBe(7);
    d.write([0x3f, 0x06 | 0x80, 0x5b, 0x07]);
    expect(t.grid.slice(0, 4)).toEqual([0x3f, 0x86, 0x5b, 0x07]);
    expect(digitsText(t.grid.slice(0, 4))).toBe('01:27');
  });

  it('from a position: write([…], 2) fills digits 3 and 4; brightness and off', () => {
    const t = new Tm1637();
    const d = tmDriver(t);
    d.write([0x3f, 0x3f, 0x3f, 0x3f]);
    d.write([0x66, 0x6d], 2);
    expect(digitsText(t.grid.slice(0, 4))).toBe('0045');
    d.brightness(2);
    expect(t.brightness).toBe(2);
    d.off();
    expect(t.on).toBe(false);
  });

  it('letters, a dash and blanks read back from their segments', () => {
    expect(digitsText([0x76, 0x79, 0x40, 0x00])).toBe('HE- ');
  });
});

// ------------------------------------------------------------------ MAX7219, as max7219.py sends it
function mxDriver(m: Max7219) {
  const send = (reg: number, data: number) => { m.clockIn(reg); m.clockIn(data); m.load(); };
  for (const [r, v] of [[12, 0], [15, 0], [11, 7], [9, 0], [12, 1]] as const) send(r, v);
  return send;
}

describe('M7 the MAX7219 8×8 dot matrix, on SPI', () => {
  it('dark as it powers up (shutdown); the driver\'s init turns it on; show() sends its 8 rows, a heart', () => {
    const m = new Max7219();
    expect(m.on).toBe(false);
    const send = mxDriver(m);
    expect(m.on).toBe(true);
    const heart = [0x00, 0x66, 0xff, 0xff, 0x7e, 0x3c, 0x18, 0x00];
    heart.forEach((row, y) => send(1 + y, row));
    send(10, 4);                                  // brightness(4)
    expect(m.rows).toEqual(heart);
    expect(m.intensity).toBe(4);
    expect(m.lit()).toBe(32);
  });

  it('draws more the more dots and the brighter: 32 dots at 4 of 15 ≈ 53 mA from its 5 V', () => {
    const m = new Max7219();
    const send = mxDriver(m);
    expect(m.amps()).toBeCloseTo(DISPLAYS.max7219.idleA, 4);
    [0x00, 0x66, 0xff, 0xff, 0x7e, 0x3c, 0x18, 0x00].forEach((row, y) => send(1 + y, row));
    send(10, 4);
    expect(m.amps()).toBeCloseTo(0.008 + 32 * 0.04 * (9 / 32) / 8, 4);
    send(12, 0);                                  // shutdown
    expect(m.amps()).toBeLessThan(0.001);
  });

  it('chained: bytes past its 16 bits go out of DOUT to the next one', () => {
    const m = new Max7219();
    expect(m.clockIn(0x01)).toBeUndefined();
    expect(m.clockIn(0xaa)).toBeUndefined();
    expect(m.clockIn(0x02)).toBe(0x01);
    expect(m.clockIn(0x55)).toBe(0xaa);
    m.load();
    expect(m.rows[1]).toBe(0x55);
  });

  it('display test lights every dot; it needs 4 V', () => {
    const m = new Max7219();
    const send = mxDriver(m);
    send(15, 1);
    expect(m.lit()).toBe(64);
    expect(DISPLAYS.max7219.minVolts).toBe(4.0);
  });
});

describe('M7 the displays\' other commands', () => {
  it('SSD1306: vertical addressing goes down the pages, then on; the entire-display-on command; start line; a read is zeros', () => {
    const o = oled();
    cmd(o, 0x20, 0x01, 0x21, 10, 11, 0x22, 6, 7);   // vertical, columns 10–11, pages 6–7
    o.write([0x40, 0x01, 0x01, 0x01, 0x01, 0x01]);  // (10, 48) (10, 56) (11, 48) (11, 56), then back to (10, 48)
    expect([at(o.frame(), 10, 48), at(o.frame(), 10, 56), at(o.frame(), 11, 48), at(o.frame(), 11, 56)]).toEqual([1, 1, 1, 1]);
    cmd(o, 0x20, 0x00, 0x21, 126, 127, 0x22, 7, 7);
    o.write([0x40, 0x80, 0x80, 0x80]);              // horizontal: past the last page it wraps to the first
    expect(at(o.frame(), 126, 63)).toBe(1);
    cmd(o, 0xa5);
    expect(o.lit()).toBe(128 * 64);
    cmd(o, 0xa4, 0x41);                             // start line 1: the picture one row up
    expect(at(o.frame(), 10, 47)).toBe(1);
    expect(o.read(2)).toEqual([0, 0]);
  });

  it('LCD: the cursor and the display shift, a decrementing entry mode, one line, a read gives its pins', () => {
    const l = new Lcd1602();
    const d = lcdDriver(l);
    d.putstr('AB');
    d.command(0x10);                                // cursor left
    d.putstr('C');
    expect(l.rows()[0]!.slice(0, 2)).toBe('AC');
    d.command(0x1c);                                // display right: everything moves one place right
    expect(l.rows()[0]!.slice(0, 3)).toBe(' AC');
    d.command(0x18);                                // and back left
    d.command(0x14);                                // cursor right
    d.command(0x04);                                // entry mode: decrement
    d.moveTo(0, 1); d.putstr('XY');                 // 0x40, then back to 0x27
    expect(l.rows()[1]![0]).toBe('X');
    d.moveTo(0, 0); d.putstr('Z');                  // 0x00, then back to 0x67
    d.command(0x07);                                // decrement and shift the display on each write
    d.putstr('Q');
    d.command(0x02);                                // home: the shift undone
    d.command(0x06);
    d.command(0x40 | 8); d.data(0x1f);              // CGRAM 8, then on (decrement in CGRAM too)
    d.command(0x44); d.data(0x01);
    expect(l.cgram[4]).toBe(0x01);
    d.command(0x20);                                // one line, 4-bit
    expect(l.rows()[1]).toBe(' '.repeat(16));
    d.moveTo(15, 0); d.putstr('W');                 // one line: 80 places in a row
    expect(l.read(1)).toEqual([0x79]);              // the last byte written: 'W''s low nibble 7, the backlight, RS
    l.write([0x02 | 0x04, 0x02]);                   // a read (RW) clocked with E: nothing written
    expect(l.rows()[0]).toContain('W');
  });

  it('MAX7219: the scan limit keeps the rows past it dark; a LOAD with fewer than 16 bits; a no-op', () => {
    const m = new Max7219();
    const send = mxDriver(m);
    send(1, 0xff); send(8, 0xff);
    send(11, 3);                                    // rows 1–4 only
    expect(m.lit()).toBe(8);
    expect(m.amps()).toBeCloseTo(0.008 + 8 * 0.04 * (1 / 32) / 4, 4);
    m.clockIn(0x0a); m.load();                      // one byte only: its low byte is that byte, its register 0 (no-op)
    send(0, 0x55);
    expect(m.intensity).toBe(0);
    expect(new Max7219().amps()).toBe(DISPLAYS.max7219.shutdownA);
    send(15, 1);
    expect(m.amps()).toBeCloseTo(0.008 + 64 * 0.04 * (31 / 32) / 8, 4);
  });

  it('TM1637: a fixed address writes each digit to the same place; a frame with no command does nothing', () => {
    const t = new Tm1637();
    const d = tmDriver(t);
    t.lines(1, 1); t.lines(1, 0); t.lines(1, 1);    // a start and a stop: no bytes
    d.write([0x06, 0x06]);
    expect(digitsText(t.grid.slice(0, 2))).toBe('11');
    expect(t.grid.length).toBe(6);
  });
});
