import { describe, expect, it } from 'vitest';
import { crcA, MifareTag, Mfrc522, RC522, RFID_TAGS } from '@lib/circuit';

/** M7 (the teacher's request): the RC522's MFRC522 fed register by register what mfrc522.py sends it, and the MIFARE
 *  Classic 1K tags held to it. tests/python/rfid.test.ts runs the pack's driver. */
function chip(tag?: MifareTag) {
  let held = tag;
  const r = new Mfrc522(() => held);
  const wreg = (reg: number, v: number) => { r.select(); r.transfer((reg << 1) & 0x7e); r.transfer(v); };
  const rreg = (reg: number) => { r.select(); r.transfer(((reg << 1) & 0x7e) | 0x80); return r.transfer(0); };
  const tocard = (cmd: number, send: number[], bits = 0) => {
    wreg(0x0d, bits);
    wreg(0x04, rreg(0x04) & ~0x80);
    wreg(0x0a, 0x80);
    for (const b of send) wreg(0x09, b);
    wreg(0x01, cmd);
    if (cmd === 0x0c) wreg(0x0d, rreg(0x0d) | 0x80);
    const irq = rreg(0x04);
    const n = rreg(0x0a);
    return { irq, error: rreg(0x06), last: rreg(0x0c) & 7, data: Array.from({ length: n }, () => rreg(0x09)) };
  };
  const crc = (data: number[]) => { wreg(0x0a, 0x80); for (const b of data) wreg(0x09, b); wreg(0x01, 0x03); return [rreg(0x22), rreg(0x21)]; };
  wreg(0x01, 0x0f);
  wreg(0x14, rreg(0x14) | 0x03);   // the antenna on
  return { r, wreg, rreg, tocard, crc, hold: (t?: MifareTag) => { held = t; } };
}

describe('M7 the RC522 (MFRC522) and its tags', () => {
  it('CRC_A as ISO 14443-3 gives it: HALT 50 00 → 57 CD, READ 0 → 02 A8; the chip\'s CalcCRC the same', () => {
    expect(crcA([0x50, 0x00])).toEqual([0x57, 0xcd]);
    expect(crcA([0x30, 0x00])).toEqual([0x02, 0xa8]);
    expect(chip().crc([0x30, 0x00])).toEqual([0x02, 0xa8]);
  });

  it('its version register; the antenna off after a reset, on as the driver sets it', () => {
    const c = chip();
    expect(c.rreg(0x37)).toBe(RC522.version);
    expect(c.r.antenna).toBe(true);
    c.wreg(0x01, 0x0f);
    expect(c.r.antenna).toBe(false);
  });

  it('no tag: Transceive ends on its timer (the driver says NOTAGERR)', () => {
    const t = chip().tocard(0x0c, [0x26], 7);
    expect(t.irq & 0x01).toBe(0x01);
    expect(t.data).toEqual([]);
  });

  it('a card: REQA → its ATQA (16 bits), anticollision → its UID and BCC, SELECT → its SAK (24 bits)', () => {
    const card = new MifareTag(RFID_TAGS[0].uid);
    const c = chip(card);
    const req = c.tocard(0x0c, [0x26], 7);
    expect([req.irq & 0x31, req.data]).toEqual([0x30, [0x04, 0x00]]);
    const uid = c.tocard(0x0c, [0x93, 0x20]).data;
    expect(uid).toEqual([0x93, 0x5e, 0x1a, 0x2b, 0x93 ^ 0x5e ^ 0x1a ^ 0x2b]);
    const sel = [0x93, 0x70, ...uid];
    expect(c.tocard(0x0c, [...sel, ...crcA(sel)]).data).toEqual([0x08, ...crcA([0x08])]);
  });

  it('authenticated with key A FF…FF, a block is read and written; key A reads back as zeros; block 0 can\'t be written', () => {
    const card = new MifareTag(RFID_TAGS[1].uid);
    const c = chip(card);
    const key = [0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
    const ok = c.tocard(0x0e, [0x60, 8, ...key, ...card.uid]);
    expect([ok.irq & 0x11, ok.error, c.rreg(0x08) & 0x08]).toEqual([0x10, 0, 0x08]);
    const w = [0xa0, 8];
    expect(c.tocard(0x0c, [...w, ...crcA(w)])).toMatchObject({ data: [0x0a], last: 4 });
    const data = Array.from({ length: 16 }, (_, i) => i + 1);
    expect(c.tocard(0x0c, [...data, ...crcA(data)])).toMatchObject({ data: [0x0a], last: 4 });
    expect(card.blocks[8]).toEqual(data);
    const rd = [0x30, 8];
    expect(c.tocard(0x0c, [...rd, ...crcA(rd)]).data.slice(0, 16)).toEqual(data);
    const trailer = [0x30, 11];
    expect(c.tocard(0x0c, [...trailer, ...crcA(trailer)]).data.slice(0, 10)).toEqual([0, 0, 0, 0, 0, 0, 0xff, 0x07, 0x80, 0x69]);
    // another sector isn't authenticated: a NAK
    const other = [0x30, 12];
    expect(c.tocard(0x0c, [...other, ...crcA(other)])).toMatchObject({ data: [0x04], last: 4 });
    // stop_crypto1, then block 0 in its own sector
    c.wreg(0x08, c.rreg(0x08) & ~0x08);
    c.tocard(0x0e, [0x60, 0, ...key, ...card.uid]);
    const zero = [0xa0, 0];
    expect(c.tocard(0x0c, [...zero, ...crcA(zero)])).toMatchObject({ data: [0x04], last: 4 });
  });

  it('a wrong key: the authentication fails (an error); a HALTed tag answers WUPA, not REQA', () => {
    const card = new MifareTag(RFID_TAGS[0].uid);
    const c = chip(card);
    const bad = c.tocard(0x0e, [0x60, 4, 1, 2, 3, 4, 5, 6, ...card.uid]);
    expect(bad.error & 0x1b).not.toBe(0);
    const halt = [0x50, 0x00];
    c.tocard(0x0c, [...halt, ...crcA(halt)]);
    expect(c.tocard(0x0c, [0x26], 7).data).toEqual([]);
    expect(c.tocard(0x0c, [0x52], 7).data).toEqual([0x04, 0x00]);
  });

  it('the tag taken away: nothing answers; RST\'s hard reset turns the antenna off again', () => {
    const c = chip(new MifareTag(RFID_TAGS[0].uid));
    c.hold(undefined);
    expect(c.tocard(0x0c, [0x26], 7).data).toEqual([]);
    c.r.hardReset();
    expect(c.r.antenna).toBe(false);
    // a read of an address byte with more following: each byte sent is the next address
    c.r.select();
    c.r.transfer(0x80 | (0x37 << 1));
    expect(c.r.transfer(0x80 | (0x37 << 1))).toBe(RC522.version);
    expect(c.r.transfer(0)).toBe(RC522.version);
  });
});
