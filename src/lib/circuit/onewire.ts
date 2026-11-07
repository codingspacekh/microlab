/**
 * 1-Wire (M6.5b): the bus answered bit by bit, as MicroPython's `_onewire` drives it (reset, read / write bit, read /
 * write byte), and the DS18B20 on it (Maxim DS18B20 datasheet). Every device on the wire hears every bit; when they
 * send, the wire is the AND of what they send (a 0 pulls it low). After a reset each takes a ROM command — SEARCH ROM
 * (0xF0, bit by bit: its bit, its complement, then the master's choice), READ ROM (0x33), MATCH ROM (0x55 + 8 bytes),
 * SKIP ROM (0xCC) — then a function command.
 */

/** Dallas / Maxim CRC-8 (x⁸ + x⁵ + x⁴ + 1), as onewire.crc8: 0 over bytes ending in their own CRC. */
export function crc8(bytes: number[]): number {
  let crc = 0;
  for (let b of bytes) {
    for (let i = 0; i < 8; i++) {
      const mix = (crc ^ b) & 1;
      crc >>= 1;
      if (mix) crc ^= 0x8c;
      b >>= 1;
    }
  }
  return crc;
}

/** A device on the wire. */
export interface OneWireDevice {
  rom: number[];
  /** A function command after it was selected: what it sends back (bytes), or undefined to listen instead. */
  command(cmd: number, now: number): number[] | undefined;
  /** A byte the master writes after a command that listens (write scratchpad). */
  listen?(byte: number): void;
}

export const DS18B20 = {
  family: 0x28, convertUs: 750_000, minVolts: 3.0, loadOhms: 3300, pullOhms: 4700,
  /** The scratchpad's temperature at power-up: 85 °C (0x0550), until the first conversion is done. */
  powerOn: 0x0550,
} as const;

/** A DS18B20 with a ROM made from `serial` (6 bytes) and the temperature `celsius()` gives when it converts. */
export class Ds18b20 implements OneWireDevice {
  readonly rom: number[];
  private raw: number = DS18B20.powerOn;
  private done = -1;   // when the conversion under way is done (µs); -1: none
  private th = 0x4b;
  private tl = 0x46;
  private config = 0x7f;   // 12 bits
  private writing = 0;

  constructor(serial: number[], private readonly celsius: () => number) {
    const rom = [DS18B20.family, ...serial.slice(0, 6)];
    this.rom = [...rom, crc8(rom)];
  }

  private settle(now: number): void {
    if (this.done >= 0 && now >= this.done) {
      this.raw = Math.round(Math.max(-55, Math.min(125, this.celsius())) * 16) & 0xffff;
      this.done = -1;
    }
  }

  command(cmd: number, now: number): number[] | undefined {
    this.settle(now);
    if (cmd === 0x44) { this.done = now + DS18B20.convertUs; return undefined; }   // CONVERT T
    if (cmd === 0xbe) {   // READ SCRATCHPAD
      const pad = [this.raw & 0xff, this.raw >> 8, this.th, this.tl, this.config, 0xff, 0x0c, 0x10];
      return [...pad, crc8(pad)];
    }
    if (cmd === 0x4e) { this.writing = 0; return undefined; }   // WRITE SCRATCHPAD: TH, TL, config follow
    if (cmd === 0xb4) return [0xff];   // READ POWER SUPPLY: powered from VCC
    return undefined;
  }

  listen(byte: number): void {
    if (this.writing === 0) this.th = byte;
    else if (this.writing === 1) this.tl = byte;
    else if (this.writing === 2) this.config = byte | 0x1f;
    this.writing++;
  }
}

type Phase = 'rom' | 'match' | 'search' | 'function' | 'send' | 'listen' | 'idle';

/** The wire: its devices and where the conversation is. */
export class OneWireBus {
  private phase: Phase = 'idle';
  private active: OneWireDevice[] = [];
  private bits: number[] = [];        // the bits written into the byte being collected
  private out = new Map<OneWireDevice, number[]>();   // each sending device's bits still to send
  private matched: number[] = [];
  private searchBit = 0;
  private searchStep = 0;

  constructor(private readonly devices: () => OneWireDevice[], private readonly now: () => number) {}

  /** A reset: true when a device answers with its presence pulse. */
  reset(): boolean {
    this.active = this.devices();
    this.phase = this.active.length ? 'rom' : 'idle';
    this.bits = [];
    this.out.clear();
    return this.active.length > 0;
  }

  /** The master reads a bit: the wire is the AND of what the devices send (1 when none does). */
  readBit(): number {
    if (this.phase === 'search') {
      const bit = this.searchBit;
      const ones = this.active.map((d) => (d.rom[bit >> 3]! >> (bit & 7)) & 1);
      const v = this.searchStep === 0 ? Math.min(1, ...ones, 1) : Math.min(1, ...ones.map((x) => 1 - x), 1);
      this.searchStep = Math.min(2, this.searchStep + 1);
      return this.active.length ? v : 1;
    }
    if (this.phase !== 'send') return 1;
    let v = 1;
    for (const d of this.active) {
      const q = this.out.get(d);
      if (q?.length) v &= q.shift()!;
    }
    return v;
  }

  /** The master writes a bit. */
  writeBit(v: number): void {
    if (this.phase === 'search') {
      const bit = this.searchBit;
      this.active = this.active.filter((d) => ((d.rom[bit >> 3]! >> (bit & 7)) & 1) === v);   // the others drop out
      this.searchBit++;
      this.searchStep = 0;
      if (this.searchBit === 64) this.phase = 'function';
      return;
    }
    this.bits.push(v & 1);
    if (this.bits.length < 8) return;
    const byte = this.bits.reduce((b, x, i) => b | (x << i), 0);
    this.bits = [];
    this.byte(byte);
  }

  readByte(): number {
    let b = 0;
    for (let i = 0; i < 8; i++) b |= this.readBit() << i;
    return b;
  }

  writeByte(b: number): void {
    for (let i = 0; i < 8; i++) this.writeBit((b >> i) & 1);
  }

  private byte(b: number): void {
    switch (this.phase) {
      case 'rom':
        if (b === 0xf0) { this.phase = 'search'; this.searchBit = 0; this.searchStep = 0; }
        else if (b === 0x55) { this.phase = 'match'; this.matched = []; }
        else if (b === 0xcc) this.phase = 'function';
        else if (b === 0x33) this.send(() => this.active[0]?.rom ?? []);
        else this.phase = 'idle';
        return;
      case 'match':
        this.matched.push(b);
        this.active = this.active.filter((d) => d.rom[this.matched.length - 1] === b);
        if (this.matched.length === 8) this.phase = 'function';
        return;
      case 'function': {
        const now = this.now();
        const replies = new Map(this.active.map((d) => [d, d.command(b, now)]));
        if ([...replies.values()].some((r) => r !== undefined)) {
          this.out = new Map([...replies].map(([d, r]) => [d, (r ?? []).flatMap((x) => [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (x >> i) & 1))]));
          this.phase = 'send';
        } else this.phase = 'listen';
        return;
      }
      case 'listen':
        for (const d of this.active) d.listen?.(b);
        return;
      default:
    }
  }

  private send(bytes: () => number[]): void {
    const data = bytes();
    this.out = new Map(this.active.map((d) => [d, data.flatMap((x) => [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (x >> i) & 1))]));
    this.phase = 'send';
  }
}
