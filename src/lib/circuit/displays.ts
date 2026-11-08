/**
 * The displays (M7 slice 2, screens 26–26c), followed as their drivers talk to them: the SSD1306 OLED and the 16×2
 * LCD's PCF8574 backpack answer on I²C (i2c.ts's transaction level); the TM1637 is read from its CLK and DIO as the
 * program toggles them; the MAX7219 shifts in what SPI clocks onto its DIN and takes it when LOAD (CS) rises. A
 * 7-segment digit is eight LEDs (models.ts) and needs no behaviour of its own.
 */
import type { I2CDevice } from './i2c';

export const DISPLAYS = {
  /** SSD1306 0.96" 128×64 module: 3.3–5 V through its regulator, ≈ 10 mA with half its pixels lit; 0x3C, or 0x3D
   *  with the address pad moved. */
  ssd1306: { workVolts: 3.0, minVolts: 3.0, loadOhms: 330, addresses: [0x3c, 0x3d] },
  /** 16×2 HD44780 LCD on a PCF8574 backpack: the PCF8574 answers from 2.5 V, but the LCD's letters can be read from
   *  4.5 V (on 3.3 V they are too faint); its backlight ≈ 25 mA on 5 V. 0x27 (PCF8574T, A0–A2 open) or 0x3F (PCF8574AT). */
  lcd1602: { workVolts: 2.5, minVolts: 4.5, loadOhms: 200, addresses: [0x27, 0x3f] },
  /** TM1637 4-digit module: 3.3–5 V, ≈ 15 mA; 10 kΩ pull-ups on CLK and DIO. */
  tm1637: { workVolts: 3.0, minVolts: 3.0, loadOhms: 220, pullOhms: 10_000 },
  /** MAX7219 8×8 module (1088AS): 4.0–5.5 V (it often works from less, dimly); ≈ 8 mA itself, each dot 40 mA (its
   *  10 kΩ RSET) for its row's eighth of the time, at its intensity's duty (2i + 1)/32; 150 µA shut down. */
  max7219: { workVolts: 3.0, minVolts: 4.0, idleA: 0.008, dotA: 0.04, shutdownA: 0.00015 },
} as const;

export type DisplayType = keyof typeof DISPLAYS;
export const isDisplay = (type: string): type is DisplayType => type in DISPLAYS;

/** Bits set in a byte. */
const bits = (b: number) => { let n = 0; for (let v = b; v; v &= v - 1) n++; return n; };

// ------------------------------------------------------------------ SSD1306

/** The SSD1306's commands that take arguments, and how many (its datasheet §9–10). */
const SSD1306_ARGS: Record<number, number> = {
  0x20: 1, 0x21: 2, 0x22: 2, 0x26: 6, 0x27: 6, 0x29: 5, 0x2a: 5, 0x81: 1, 0x8d: 1, 0xa3: 2, 0xa8: 1, 0xad: 1,
  0xd3: 1, 0xd5: 1, 0xd9: 1, 0xda: 1, 0xdb: 1,
};

/**
 * SSD1306 (Solomon Systech datasheet rev 1.1): each I²C write is control bytes — Co (bit 7: one byte follows, then
 * another control byte) and D/C# (bit 6: data, else commands) — and what they announce. Its RAM is 8 pages of 128
 * columns, bit 0 a page's top row; data goes in at the column and page pointers, which move on as the addressing
 * mode says. It powers up off, in page addressing.
 */
export class Ssd1306 implements I2CDevice {
  readonly ram = new Uint8Array(1024);
  on = false;
  contrast = 0x7f;
  invert = false;
  /** Changes with every write: the window's picture is made again only then. */
  version = 0;
  private entireOn = false;
  private remap = false;
  private comFlip = false;
  private startLine = 0;
  private mode = 2;
  private col = 0;
  private page = 0;
  private cols: [number, number] = [0, 127];
  private pages: [number, number] = [0, 7];
  private pending: number[] = [];

  write(bytes: number[]): void {
    let i = 0;
    while (i < bytes.length) {
      const control = bytes[i++]!;
      const end = control & 0x80 ? Math.min(i + 1, bytes.length) : bytes.length;
      for (; i < end; i++) {
        if (control & 0x40) this.data(bytes[i]!);
        else this.command(bytes[i]!);
      }
    }
    this.version++;
  }

  /** It can't be read over I²C on these modules (the status byte only): zeros. */
  read(n: number): number[] {
    return new Array<number>(n).fill(0);
  }

  private command(b: number): void {
    if (this.pending.length) {
      this.pending.push(b);
      if (this.pending.length > SSD1306_ARGS[this.pending[0]!]!) {
        this.exec(this.pending);
        this.pending = [];
      }
      return;
    }
    if (SSD1306_ARGS[b]) this.pending = [b];
    else this.exec([b]);
  }

  private exec([c, a = 0, b = 0]: number[]): void {
    if (c === 0xae || c === 0xaf) this.on = c === 0xaf;
    else if (c === 0x81) this.contrast = a;
    else if (c === 0xa6 || c === 0xa7) this.invert = c === 0xa7;
    else if (c === 0xa4 || c === 0xa5) this.entireOn = c === 0xa5;
    else if (c === 0xa0 || c === 0xa1) this.remap = c === 0xa1;
    else if (c === 0xc0 || c === 0xc8) this.comFlip = c === 0xc8;
    else if (c === 0x20) this.mode = a & 3;
    else if (c === 0x21) { this.cols = [a & 127, b & 127]; this.col = this.cols[0]; }
    else if (c === 0x22) { this.pages = [a & 7, b & 7]; this.page = this.pages[0]; }
    else if (c! >= 0x40 && c! <= 0x7f) this.startLine = c! & 63;
    else if (c! >= 0xb0 && c! <= 0xb7) this.page = c! & 7;
    else if (c! <= 0x0f) this.col = (this.col & 0xf0) | c!;
    else if (c! <= 0x1f) this.col = (this.col & 0x0f) | ((c! & 0x0f) << 4);
  }

  private data(b: number): void {
    this.ram[this.page * 128 + this.col] = b;
    if (this.mode === 0) {          // horizontal: along the page, then the next page
      if (this.col < this.cols[1]) this.col++;
      else { this.col = this.cols[0]; this.page = this.page < this.pages[1] ? this.page + 1 : this.pages[0]; }
    } else if (this.mode === 1) {   // vertical: down the pages, then the next column
      if (this.page < this.pages[1]) this.page++;
      else { this.page = this.pages[0]; this.col = this.col < this.cols[1] ? this.col + 1 : this.cols[0]; }
    } else {
      this.col = (this.col + 1) & 127;
    }
  }

  /** What the screen shows, 8 pages of 128 bytes (bit 0 a page's top row), the right way up when the program set
   *  the column remap and COM flip as ssd1306.py does (the modules are built so); all dark while it is off. */
  frame(): Uint8Array {
    const out = new Uint8Array(1024);
    if (!this.on) return out;
    for (let y = 0; y < 64; y++) {
      const row = ((this.comFlip ? y : 63 - y) + this.startLine) & 63;
      for (let x = 0; x < 128; x++) {
        const cx = this.remap ? x : 127 - x;
        let lit = this.entireOn || ((this.ram[(row >> 3) * 128 + cx]! >> (row & 7)) & 1) === 1;
        if (this.invert) lit = !lit;
        if (lit) out[(y >> 3) * 128 + x]! |= 1 << (y & 7);
      }
    }
    return out;
  }

  /** How many pixels are lit. */
  lit(): number {
    return this.frame().reduce((n, b) => n + bits(b), 0);
  }
}

// ------------------------------------------------------------------ 16×2 LCD (HD44780 behind a PCF8574)

/**
 * A 16×2 HD44780 LCD (Hitachi datasheet) behind a PCF8574 backpack: each byte written sets the PCF8574's eight pins
 * — P0 RS, P1 RW, P2 E, P3 the backlight, P4–P7 the LCD's D4–D7. The LCD takes D4–D7 as E falls: in 8-bit mode (as
 * it powers up) that is a whole instruction (D0–D3 low); once a function set chooses 4 bits, two nibbles, high first.
 * DDRAM 0x00–0x27 is row 0, 0x40–0x67 row 1 (40 columns each, 16 seen); CGRAM holds 8 characters of its own.
 */
export class Lcd1602 implements I2CDevice {
  readonly ddram = new Uint8Array(128).fill(0x20);
  readonly cgram = new Uint8Array(64);
  on = false;
  cursor = false;
  blink = false;
  version = 0;
  private port = 0;
  private eight = true;
  private high: number | undefined;
  private twoLines = false;
  private addr = 0;
  private toCg = false;
  private inc = true;
  private shiftOnWrite = false;
  private shift = 0;

  get backlight(): boolean {
    return (this.port & 0x08) !== 0;
  }

  write(bytes: number[]): void {
    for (const b of bytes) {
      const was = this.port;
      this.port = b & 0xff;
      if (was & 0x04 && !(b & 0x04)) this.nibble((was >> 4) & 0x0f, (was & 0x01) === 1, (was & 0x02) !== 0);
    }
    this.version++;
  }

  /** A PCF8574 read gives its pins: what was last written. */
  read(n: number): number[] {
    return new Array<number>(n).fill(this.port);
  }

  private nibble(n: number, rs: boolean, rw: boolean): void {
    if (rw) return;
    if (this.eight) { this.exec(n << 4, rs); return; }
    if (this.high === undefined) { this.high = n; return; }
    const byte = (this.high << 4) | n;
    this.high = undefined;
    this.exec(byte, rs);
  }

  private exec(b: number, rs: boolean): void {
    if (rs) { this.put(b); return; }
    if (b & 0x80) { this.addr = b & 0x7f; this.toCg = false; }
    else if (b & 0x40) { this.addr = b & 0x3f; this.toCg = true; }
    else if (b & 0x20) { this.eight = (b & 0x10) !== 0; this.twoLines = (b & 0x08) !== 0; this.high = undefined; }
    else if (b & 0x10) {
      const right = (b & 0x04) !== 0;
      if (b & 0x08) this.shift += right ? 1 : -1;
      else this.addr = this.step(this.addr, right);
    }
    else if (b & 0x08) { this.on = (b & 0x04) !== 0; this.cursor = (b & 0x02) !== 0; this.blink = (b & 0x01) !== 0; }
    else if (b & 0x04) { this.inc = (b & 0x02) !== 0; this.shiftOnWrite = (b & 0x01) !== 0; }
    else if (b & 0x02) { this.addr = 0; this.shift = 0; this.toCg = false; }
    else if (b & 0x01) { this.ddram.fill(0x20); this.addr = 0; this.shift = 0; this.inc = true; this.toCg = false; }
  }

  private put(b: number): void {
    if (this.toCg) {
      this.cgram[this.addr] = b & 0x1f;
      this.addr = (this.addr + (this.inc ? 1 : -1)) & 0x3f;
      return;
    }
    this.ddram[this.addr] = b;
    this.addr = this.step(this.addr, this.inc);
    if (this.shiftOnWrite) this.shift += this.inc ? -1 : 1;
  }

  /** The DDRAM address after `a`, one way or the other: on two lines 0x27 goes on to 0x40, 0x67 to 0x00. */
  private step(a: number, up: boolean): number {
    if (!this.twoLines) return (a + (up ? 1 : 79)) % 80;
    if (up) return a === 0x27 ? 0x40 : a === 0x67 ? 0x00 : a + 1;
    return a === 0x40 ? 0x27 : a === 0x00 ? 0x67 : a - 1;
  }

  /** The two rows as shown (16 character codes each; 0–7 are CGRAM's), what is in DDRAM even while it is off. */
  rows(): [string, string] {
    const row = (base: number) => Array.from({ length: 16 }, (_, c) => String.fromCharCode(this.ddram[base + ((((c - this.shift) % 40) + 40) % 40)]!)).join('');
    return [row(0x00), this.twoLines ? row(0x40) : ' '.repeat(16)];
  }
}

// ------------------------------------------------------------------ TM1637

/** Segments (bit 0 a … bit 6 g) back to what they show: tm1637.py's digits and letters. */
const SEGMENT_CHARS: Record<number, string> = {
  0x3f: '0', 0x06: '1', 0x5b: '2', 0x4f: '3', 0x66: '4', 0x6d: '5', 0x7d: '6', 0x07: '7', 0x7f: '8', 0x6f: '9',
  0x77: 'A', 0x7c: 'b', 0x39: 'C', 0x5e: 'd', 0x79: 'E', 0x71: 'F', 0x3d: 'G', 0x76: 'H', 0x1e: 'J', 0x38: 'L',
  0x54: 'n', 0x73: 'P', 0x67: 'q', 0x50: 'r', 0x78: 't', 0x3e: 'U', 0x1c: 'u', 0x6e: 'y', 0x63: '°', 0x40: '-', 0x00: ' ',
};

/** A 4-digit display's digits as text: bit 7 of the second is its colon ('01:27'); '?' for a pattern of no letter. */
export function digitsText(segments: number[]): string {
  return segments.map((s, i) => (SEGMENT_CHARS[s & 0x7f] ?? '?') + (i === 1 && s & 0x80 ? ':' : '')).join('');
}

/**
 * TM1637 (Titan Micro datasheet v2.4): two wires, CLK and DIO. DIO falling while CLK is high starts a frame, rising
 * while CLK is high ends it; between, a bit at each CLK rising edge, LSB first, and a ninth clock for its
 * acknowledge. A frame's first byte is a command: 0x40 data (bit 2: fixed address), 0xC0 | address then the digits'
 * segments, 0x80 display control (bit 3 on, bits 0–2 brightness).
 */
export class Tm1637 {
  readonly grid = [0, 0, 0, 0, 0, 0];
  on = false;
  brightness = 0;
  version = 0;
  private clk = 1;
  private dio = 1;
  private bit = 0;
  private byte = 0;
  private frame: number[] = [];
  private autoInc = true;

  /** CLK and DIO now, told whenever either changes. */
  lines(clk: number, dio: number): void {
    const [c0, d0] = [this.clk, this.dio];
    this.clk = clk ? 1 : 0;
    this.dio = dio ? 1 : 0;
    if (c0 && this.clk && d0 !== this.dio) {
      if (!this.dio) this.reset();
      else { this.run(this.frame); this.reset(); this.version++; }
      return;
    }
    if (!c0 && this.clk) {
      if (this.bit < 8) this.byte |= this.dio << this.bit++;
      else { this.frame.push(this.byte); this.byte = 0; this.bit = 0; }
    }
  }

  private reset(): void {
    this.frame = [];
    this.bit = 0;
    this.byte = 0;
  }

  private run(f: number[]): void {
    const c = f[0];
    if (c === undefined) return;
    if ((c & 0xc0) === 0x40) this.autoInc = (c & 0x04) === 0;
    else if ((c & 0xc0) === 0x80) { this.on = (c & 0x08) !== 0; this.brightness = c & 0x07; }
    else if ((c & 0xc0) === 0xc0) {
      let a = c & 0x07;
      for (const b of f.slice(1)) {
        if (a < 6) this.grid[a] = b;
        if (this.autoInc) a++;
      }
    }
  }
}

// ------------------------------------------------------------------ MAX7219

/**
 * MAX7219 (Maxim datasheet 19-4452): a 16-bit shift register clocked from DIN, what falls out of it going on to DOUT
 * (to the next one in a chain); LOAD (CS) rising takes its 16 bits — the high byte's low nibble a register, the low
 * byte its data: 1–8 the rows, 9 decode mode, 10 intensity (0–15), 11 scan limit, 12 shutdown (0 off), 15 display
 * test. It powers up shut down. On the 1088AS modules row 1 is the top one, bit 7 its left dot.
 */
export class Max7219 {
  readonly rows = [0, 0, 0, 0, 0, 0, 0, 0];
  on = false;
  intensity = 0;
  test = false;
  scanLimit = 7;
  version = 0;
  private shift: number[] = [];

  /** A byte clocked in on DIN; returns the byte it pushes out of DOUT, once 16 bits are in. */
  clockIn(b: number): number | undefined {
    this.shift.push(b & 0xff);
    return this.shift.length > 2 ? this.shift.shift() : undefined;
  }

  /** LOAD rose: the 16 bits in the shift register are taken. */
  load(): void {
    const [hi = 0, lo = 0] = this.shift.length >= 2 ? this.shift : [0, ...this.shift];
    const reg = hi & 0x0f;
    if (reg >= 1 && reg <= 8) this.rows[reg - 1] = lo;
    else if (reg === 10) this.intensity = lo & 0x0f;
    else if (reg === 11) this.scanLimit = lo & 0x07;
    else if (reg === 12) this.on = (lo & 0x01) === 1;
    else if (reg === 15) this.test = (lo & 0x01) === 1;
    this.version++;
  }

  /** The dots lit now. */
  lit(): number {
    if (this.test) return 64;
    if (!this.on) return 0;
    return this.rows.slice(0, this.scanLimit + 1).reduce((n, r) => n + bits(r), 0);
  }

  /** What it draws from its VCC (A). */
  amps(): number {
    const d = DISPLAYS.max7219;
    if (this.test) return d.idleA + 64 * d.dotA * (31 / 32) / 8;
    if (!this.on) return d.shutdownA;
    return d.idleA + this.lit() * d.dotA * ((2 * this.intensity + 1) / 32) / (this.scanLimit + 1);
  }
}
