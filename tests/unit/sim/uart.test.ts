import { describe, expect, it } from 'vitest';
import { frameUs, reframe, type Framing } from '../../../src/sim/uart';

/** M7 slice 5 (screens 28, 28d): a UART line as the wire carries it — a start bit, the data bits low bit first, a
 *  parity bit, the stop bits — and what a receiver set to its own framing reads from it. */
const F = (baud: number, o: Partial<Framing> = {}): Framing => ({ baud, bits: 8, parity: -1, stop: 1, ...o });
const bytesOf = (r: { byte: number }[]) => r.map((x) => x.byte);

describe('M7 a UART frame', () => {
  it('8N1 is 10 bits: 9600 baud ≈ 1.04 ms a byte; parity and a second stop bit add theirs', () => {
    expect(frameUs(F(9600))).toBeCloseTo(1041.7, 1);
    expect(frameUs(F(115200))).toBeCloseTo(86.8, 1);
    expect(frameUs(F(9600, { parity: 0, stop: 2 }))).toBeCloseTo(12 * 1e6 / 9600, 1);
  });

  it('the same framing: every byte arrives as sent, each at the end of its stop bit', () => {
    const r = reframe([0x48, 0x69], F(9600), F(9600), 1000);
    expect(bytesOf(r)).toEqual([0x48, 0x69]);
    expect(r.map((x) => Math.round(x.us))).toEqual([1000 + 1042, 1000 + 2083]);
  });

  it('a baud rate within 2 % is read right (both ends\' clocks differ that much)', () => {
    expect(bytesOf(reframe([...Buffer.from('Hello')], F(9600), F(9700), 0))).toEqual([...Buffer.from('Hello')]);
  });

  it('read at 115200 what was sent at 9600: each bit lasts twelve — zeros, bytes of ones, garbage', () => {
    const got = bytesOf(reframe([...Buffer.from('Hello\r\n')], F(9600), F(115200), 0));
    expect(got.length).toBeGreaterThan(7);
    expect(Buffer.from(got).toString('latin1')).not.toContain('Hello');
    expect(got.filter((b) => b === 0).length).toBeGreaterThan(3);
  });

  it('read at 9600 what was sent at 115200: fewer bytes than were sent, none of them right', () => {
    const sent = [...Buffer.from('Hello from UART0\r\n')];
    const got = bytesOf(reframe(sent, F(115200), F(9600), 0));
    expect(got.length).toBeLessThan(sent.length);
    expect(Buffer.from(got).toString('latin1')).not.toContain('Hello');
  });

  it('7 data bits with even parity read as 8N1: the parity bit becomes bit 7', () => {
    // 'A' = 0x41 has two ones: even parity adds a 0; 'C' = 0x43 three ones: parity 1
    expect(bytesOf(reframe([0x41, 0x43], F(9600, { bits: 7, parity: 0 }), F(9600), 0))).toEqual([0x41, 0xc3]);
  });

  it('LSB first: a receiver wanting fewer bits gets the low ones', () => {
    expect(bytesOf(reframe([0xff], F(9600), F(9600, { bits: 7 }), 0))).toEqual([0x7f]);
  });
});
