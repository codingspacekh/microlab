/**
 * The DS1302 real-time clock (Maxim DS1302 datasheet, M6.5b), followed pin by pin: a program raises CE, clocks a
 * command byte in LSB first on I/O (sampled at each SCLK rising edge; bit 7 always 1, bit 6 RAM, bits 5–1 the address,
 * bit 0 read), then data — written at rising edges, or sent by the chip from the falling edge of the command's last
 * clock, a bit at each falling edge after. Its clock registers are BCD: seconds (bit 7 CH: the clock halted), minutes,
 * hours (24-hour), date, month, day (1–7), year (00–99); control (bit 7 WP: writes ignored); burst 0xBE / 0xBF reads
 * or writes the eight in one go; 31 bytes of RAM at 0xC0–0xFC (burst 0xFE / 0xFF). It counts time from the sim's
 * clock, from a moment on a calendar.
 */
export const DS1302 = { minVolts: 2.0, loadOhms: 10_000 } as const;

const bcd = (v: number) => ((Math.floor(v / 10) << 4) | (v % 10)) & 0xff;
const dec = (b: number) => (b >> 4) * 10 + (b & 0xf);

export class Ds1302 {
  /** The calendar time at `at` (µs of sim time), in ms since 1970 read as UTC; the clock runs unless halted. */
  private base: number;
  private at: number;
  private halted = false;
  private day = 1;
  private wp = false;
  private ram = new Array<number>(31).fill(0);
  // the conversation
  private ce = false;
  private bits = 0;
  private cmd = 0;
  private data: number[] = [];   // the bits being written in
  private out: number[] = [];    // the bits to send
  private sending = -1;          // the index of the bit on I/O now; -1: not sending

  constructor(startMs: number, now: number) {
    this.base = startMs;
    this.at = now;
  }

  private time(now: number): Date {
    return new Date(this.halted ? this.base : this.base + Math.floor((now - this.at) / 1000));
  }

  private setTime(d: Date, now: number): void {
    this.base = d.getTime();
    this.at = now;
  }

  /** The clock registers 0–7 as BCD, now. */
  private clockRegs(now: number): number[] {
    const d = this.time(now);
    return [
      bcd(d.getUTCSeconds()) | (this.halted ? 0x80 : 0), bcd(d.getUTCMinutes()), bcd(d.getUTCHours()), bcd(d.getUTCDate()),
      bcd(d.getUTCMonth() + 1), this.day, bcd(d.getUTCFullYear() % 100), this.wp ? 0x80 : 0,
    ];
  }

  private writeClock(reg: number, v: number, now: number): void {
    if (reg === 7) { this.wp = (v & 0x80) !== 0; return; }
    if (this.wp) return;
    const d = this.time(now);
    const f = { y: d.getUTCFullYear(), mo: d.getUTCMonth(), dd: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds() };
    if (reg === 0) { f.s = dec(v & 0x7f); this.halted = false; }
    else if (reg === 1) f.mi = dec(v & 0x7f);
    else if (reg === 2) f.h = dec(v & 0x3f);
    else if (reg === 3) f.dd = dec(v & 0x3f);
    else if (reg === 4) f.mo = dec(v & 0x1f) - 1;
    else if (reg === 5) { this.day = v & 7; return; }
    else if (reg === 6) f.y = 2000 + dec(v);
    this.setTime(new Date(Date.UTC(f.y, f.mo, f.dd, f.h, f.mi, f.s)), now);
    if (reg === 0) this.halted = (v & 0x80) !== 0;
  }

  /** CE (RST) rose or fell. */
  chipEnable(high: boolean): void {
    this.ce = high;
    this.bits = 0;
    this.cmd = 0;
    this.data = [];
    this.out = [];
    this.sending = -1;
  }

  /** SCLK rose (`rising`) or fell, with I/O at `io` (what the program drives on it), at `now` µs. */
  clock(rising: boolean, io: number, now: number): void {
    if (!this.ce) return;
    if (rising) {
      if (this.bits < 8) {
        this.cmd |= (io & 1) << this.bits;
        this.bits++;
        if (this.bits === 8 && this.cmd & 1) this.out = this.readBits(now);
        return;
      }
      if (!(this.cmd & 1)) {   // writing: a data bit
        this.data.push(io & 1);
        if (this.data.length % 8 === 0) this.store(this.data.length / 8 - 1, this.data.slice(-8).reduce((b, x, i) => b | (x << i), 0), now);
      }
      return;
    }
    if (this.bits === 8 && this.cmd & 1) this.sending++;   // the next bit on I/O
  }

  /** What the chip drives on I/O now: a bit while it sends, else nothing (high impedance). */
  io(): number | undefined {
    return this.ce && this.sending >= 0 && this.sending < this.out.length ? this.out[this.sending] : undefined;
  }

  private readBits(now: number): number[] {
    const addr = (this.cmd >> 1) & 0x1f;
    const ram = (this.cmd & 0x40) !== 0;
    const bytes = addr === 0x1f ? (ram ? this.ram : this.clockRegs(now)) : [ram ? this.ram[addr] ?? 0 : this.clockRegs(now)[addr] ?? 0];
    return bytes.flatMap((b) => [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (b >> i) & 1));
  }

  private store(index: number, byte: number, now: number): void {
    const addr = (this.cmd >> 1) & 0x1f;
    const ram = (this.cmd & 0x40) !== 0;
    const at = addr === 0x1f ? index : index === 0 ? addr : -1;
    if (at < 0) return;
    if (ram) { if (!this.wp && at < 31) this.ram[at] = byte; return; }
    if (at < 8) this.writeClock(at, byte, now);
  }
}
