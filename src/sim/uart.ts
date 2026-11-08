/**
 * A UART line as the wire carries it (M7 slice 5, screens 28, 28d): idle high; each byte a start bit (low), its data
 * bits low bit first, a parity bit if any, its stop bits (high). A receiver finds a start bit's falling edge and samples
 * each bit in its middle by its own baud rate — so one set to another rate, or other bits, parity or stop, reads what
 * the line really did: runs of zeros, bytes of ones, framing errors — garbage, as a real one does. A UART puts each
 * byte it read in its buffer whatever its stop bit was (the RP2040 and the ESP32 flag it; MicroPython keeps the byte).
 */
export interface Framing {
  baud: number;
  /** Data bits, 5–9. */
  bits: number;
  /** -1 none, 0 even, 1 odd (MicroPython's parity=None / 0 / 1). */
  parity: number;
  stop: number;
}

/** How long a byte takes on the line, start to end of its stop bits (µs). */
export const frameUs = (f: Framing): number => ((1 + f.bits + (f.parity >= 0 ? 1 : 0) + f.stop) * 1e6) / f.baud;

/** Two ends read each other right within 2 % of baud rate (each samples a bit's middle: 10 bits drift < half a bit). */
const SAME_BAUD = 0.02;

const ones = (v: number) => { let n = 0; for (let x = v; x; x &= x - 1) n++; return n; };

/**
 * What a receiver with `to` framing reads from `bytes` sent back to back with `from` framing, the first start bit at
 * `startUs`: each byte it reads, at the moment its stop bit has been sampled.
 */
export function reframe(bytes: readonly number[], from: Framing, to: Framing, startUs: number): { us: number; byte: number }[] {
  const frame = frameUs(from);
  const same = Math.abs(from.baud - to.baud) / to.baud <= SAME_BAUD && from.bits === to.bits && from.parity === to.parity && from.stop <= to.stop + 1;
  if (same) {
    const mask = (1 << to.bits) - 1;
    return bytes.map((b, i) => ({ us: startUs + (i + 1) * frame, byte: b & mask }));
  }
  // the line: [level, from, to] in µs, idle high around it
  const bit = 1e6 / from.baud;
  const levels: number[] = [];
  for (const b of bytes) {
    levels.push(0);
    for (let i = 0; i < from.bits; i++) levels.push((b >> i) & 1);
    if (from.parity >= 0) levels.push((ones(b & ((1 << from.bits) - 1)) + from.parity) % 2);
    for (let i = 0; i < from.stop; i++) levels.push(1);
  }
  const end = startUs + levels.length * bit;
  const level = (t: number) => (t < startUs || t >= end ? 1 : levels[Math.floor((t - startUs) / bit)]!);
  // the line's falling edges (a start bit's, or within a byte): a receiver's next start is the first at or after t
  const falls: number[] = [];
  levels.forEach((v, i) => { if (v === 0 && (i === 0 || levels[i - 1] === 1)) falls.push(startUs + i * bit); });
  const rbit = 1e6 / to.baud;
  const out: { us: number; byte: number }[] = [];
  let t = startUs;
  for (let guard = 0; guard < 100_000; guard++) {
    // the next falling edge (while the line is low, the next one comes after it has gone high again)
    const next = falls.find((at) => at >= t);
    if (next === undefined) break;
    t = next;
    let v = 0;
    for (let i = 0; i < to.bits; i++) if (level(t + rbit * (1.5 + i))) v |= 1 << i;
    const stopAt = t + rbit * (1.5 + to.bits + (to.parity >= 0 ? 1 : 0));
    out.push({ us: stopAt, byte: v });
    t = stopAt;
  }
  return out;
}
