/**
 * The RC522 RFID reader (M7, the teacher's request): an NXP MFRC522 on SPI, followed register by register as its
 * drivers talk to it (MFRC522 datasheet rev 3.9), and the MIFARE Classic 1K tags held to it (MF1S50yyX). A program
 * writes a register with an address byte (bit 7 low) and the value, reads one with bit 7 high; it puts a frame for
 * the tag in the FIFO and starts Transceive; the tag's answer comes back in the FIFO with ComIrqReg saying it is
 * there — or, with no tag in the field, the timer's interrupt. Authenticate (MFAuthent) checks the sector's key;
 * then blocks are read and written. The radio's crypto is the chip's business: what a program sees is plain.
 */
export const RC522 = { minVolts: 3.0, loadOhms: 150, version: 0x92 } as const;

/** The kit's two tags: a white card and a blue key fob — their UIDs (4 bytes, as MIFARE Classic 1K). */
export const RFID_TAGS = [
  { name: 'card', uid: [0x93, 0x5e, 0x1a, 0x2b] },
  { name: 'key fob', uid: [0x4a, 0xb7, 0x3c, 0x91] },
] as const;

const KEY_DEFAULT = [0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
const bcc = (uid: readonly number[]) => uid.reduce((x, b) => x ^ b, 0);

/** ISO 14443-3 CRC_A (x¹⁶ + x¹² + x⁵ + 1, from 0x6363, LSB first): [low, high]. */
export function crcA(data: number[]): [number, number] {
  let crc = 0x6363;
  for (const b of data) {
    let ch = (b ^ (crc & 0xff)) & 0xff;
    ch = (ch ^ (ch << 4)) & 0xff;
    crc = ((crc >> 8) ^ (ch << 8) ^ (ch << 3) ^ (ch >> 4)) & 0xffff;
  }
  return [crc & 0xff, crc >> 8];
}

/** A MIFARE Classic 1K tag: 16 sectors of 4 blocks of 16 bytes; block 0 its UID, BCC, SAK, ATQA; each sector's last
 *  block its keys A and B (FF … FF from the factory) and access bits. */
export class MifareTag {
  readonly blocks: number[][];
  halted = false;
  constructor(readonly uid: readonly number[]) {
    this.blocks = Array.from({ length: 64 }, (_, b) => {
      if (b === 0) return [...uid, bcc(uid), 0x08, 0x04, 0x00, 0x62, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69];
      if (b % 4 === 3) return [...KEY_DEFAULT, 0xff, 0x07, 0x80, 0x69, ...KEY_DEFAULT];
      return new Array<number>(16).fill(0);
    });
  }
}

/** ComIrqReg: Tx, Rx, Idle, … Timer; ErrorReg: protocol, parity, collision, buffer overflow. */
const IRQ = { tx: 0x40, rx: 0x20, idle: 0x10, timer: 0x01 } as const;
const REG = { command: 0x01, comIrq: 0x04, divIrq: 0x05, error: 0x06, status2: 0x08, fifo: 0x09, fifoLevel: 0x0a, control: 0x0c, bitFraming: 0x0d, txControl: 0x14, crcHigh: 0x21, crcLow: 0x22, version: 0x37 } as const;

export class Mfrc522 {
  private regs = new Uint8Array(64);
  private fifo: number[] = [];
  private addr = -1;
  private reading = false;
  private authed: number | undefined;   // the sector authenticated, while crypto is on
  version = 0;
  /** What it did last, for the window ('card 93 5E 1A 2B read'). */
  last = '';

  /** `tag()`: the tag in the field now, if any (the window's Inputs card; a script's input). */
  constructor(private readonly tag: () => MifareTag | undefined) {
    this.reset();
  }

  private reset(): void {
    this.regs.fill(0);
    this.regs[REG.version] = RC522.version;
    this.regs[0x14] = 0x80;   // TxControlReg: the antenna off
    this.fifo = [];
    this.authed = undefined;
  }

  /** NSS (its SDA pin) fell: a new address byte comes next. */
  select(): void {
    this.addr = -1;
  }

  /** NRSTPD rose: a hard reset. */
  hardReset(): void {
    this.reset();
    this.version++;
  }

  /** Is its antenna on (TxControlReg Tx1RFEn and Tx2RFEn)? */
  get antenna(): boolean {
    return (this.regs[REG.txControl]! & 0x03) !== 0;
  }

  /** A byte clocked in on MOSI while NSS is low; returns what goes out on MISO for it. */
  transfer(b: number): number {
    if (this.addr < 0) {
      this.addr = (b >> 1) & 0x3f;
      this.reading = (b & 0x80) !== 0;
      return 0;
    }
    if (this.reading) {
      const v = this.read(this.addr);
      if (b) this.addr = (b >> 1) & 0x3f;   // in a read, each byte sent is the next address (0: the end)
      return v;
    }
    this.write(this.addr, b);
    return 0;
  }

  private read(a: number): number {
    if (a === REG.fifo) return this.fifo.shift() ?? 0;
    if (a === REG.fifoLevel) return this.fifo.length;
    return this.regs[a]!;
  }

  private write(a: number, v: number): void {
    if (a === REG.fifo) { if (this.fifo.length < 64) this.fifo.push(v); return; }
    if (a === REG.fifoLevel) { if (v & 0x80) this.fifo = []; return; }
    if (a === REG.comIrq || a === REG.divIrq) {   // bit 7 set sets the bits given, clear clears them
      this.regs[a] = v & 0x80 ? this.regs[a]! | (v & 0x7f) : this.regs[a]! & ~v;
      return;
    }
    if (a === REG.status2) { this.regs[a] = v; if (!(v & 0x08)) this.authed = undefined; return; }
    this.regs[a] = v;
    if (a === REG.command) this.command(v & 0x0f);
    else if (a === REG.bitFraming && v & 0x80 && (this.regs[REG.command]! & 0x0f) === 0x0c) this.transceive();
  }

  private command(c: number): void {
    if (c === 0x0f) { this.reset(); return; }       // SoftReset
    if (c === 0x03) {                                // CalcCRC over the FIFO
      const [lo, hi] = crcA(this.fifo);
      this.fifo = [];
      this.regs[REG.crcLow] = lo;
      this.regs[REG.crcHigh] = hi;
      this.regs[REG.divIrq]! |= 0x04;
      return;
    }
    if (c === 0x0e) this.authenticate();             // MFAuthent
  }

  /** The frame in the FIFO sent to the tag; its answer into the FIFO. */
  private transceive(): void {
    const frame = this.fifo;
    this.fifo = [];
    this.regs[REG.error] = 0;
    this.regs[REG.control] = 0;
    const tag = this.antenna ? this.tag() : undefined;
    const answer = tag ? this.answer(tag, frame, this.regs[REG.bitFraming]! & 0x07) : undefined;
    if (!answer) { this.regs[REG.comIrq]! |= IRQ.timer | IRQ.idle; return; }   // nothing answered before its timer
    this.fifo = answer.bytes;
    this.regs[REG.control] = answer.lastBits ?? 0;
    this.regs[REG.comIrq]! |= IRQ.tx | IRQ.rx | IRQ.idle;
    this.version++;
  }

  private answer(tag: MifareTag, f: number[], bits: number): { bytes: number[]; lastBits?: number } | undefined {
    const c = f[0];
    const id = RFID_TAGS.find((t) => t.uid.every((b, i) => b === tag.uid[i]))?.name ?? 'tag';
    const hex = tag.uid.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    if (this.writing !== undefined) {                            // a WRITE's second part: its 16 bytes and CRC
      const block = this.writing;
      this.writing = undefined;
      if (f.length !== 18) return { bytes: [0x04], lastBits: 4 };
      tag.blocks[block] = f.slice(0, 16);
      this.last = `${id} ${hex}: block ${block} written`;
      return { bytes: [0x0a], lastBits: 4 };
    }
    if (bits === 7 && (c === 0x26 || c === 0x52)) {            // REQA, WUPA: its ATQA
      if (tag.halted && c === 0x26) return undefined;
      tag.halted = false;
      return { bytes: [0x04, 0x00] };
    }
    if (c === 0x93 && f[1] === 0x20) return { bytes: [...tag.uid, bcc(tag.uid)] };   // anticollision: its UID and BCC
    if (c === 0x93 && f[1] === 0x70) {                          // SELECT: its SAK
      this.last = `${id} ${hex} selected`;
      return { bytes: [0x08, ...crcA([0x08])] };
    }
    if (c === 0x50) { tag.halted = true; return undefined; }   // HALT: no answer
    const block = f[1] ?? 0;
    if (c === 0x30) {                                           // READ: 16 bytes and its CRC
      if (this.authed !== block >> 2) return { bytes: [0x04], lastBits: 4 };   // NAK
      const data = tag.blocks[block]!.map((b, i) => (block % 4 === 3 && i < 6 ? 0 : b));   // key A never reads back
      this.last = `${id} ${hex}: block ${block} read`;
      return { bytes: [...data, ...crcA(data)] };
    }
    if (c === 0xa0) {                                           // WRITE: an ACK, then the 16 bytes, then an ACK
      if (this.authed !== block >> 2 || block === 0) return { bytes: [0x04], lastBits: 4 };
      this.writing = block;
      return { bytes: [0x0a], lastBits: 4 };
    }
    return undefined;
  }

  private writing: number | undefined;

  /** MFAuthent: the FIFO has the command (0x60 key A, 0x61 key B), the block, the 6-byte key and the UID. */
  private authenticate(): void {
    const [cmd, block = 0, ...rest] = this.fifo;
    this.fifo = [];
    const key = rest.slice(0, 6);
    const uid = rest.slice(6, 10);
    const tag = this.antenna ? this.tag() : undefined;
    const trailer = tag?.blocks[(block & 0x3c) + 3];
    const want = trailer && (cmd === 0x61 ? trailer.slice(10, 16) : trailer.slice(0, 6));
    const ok = !!tag && !!want && want.every((b, i) => b === key[i]) && tag.uid.every((b, i) => b === uid[i]);
    this.regs[REG.comIrq]! |= IRQ.idle | (ok ? 0 : IRQ.timer);
    if (!ok) { this.regs[REG.error] = 0x01; return; }         // no answer to the authentication: a protocol error
    this.authed = block >> 2;
    this.regs[REG.status2]! |= 0x08;                             // MFCrypto1On
    this.version++;
  }
}
