/**
 * WS2812B NeoPixels (M7 slice 3, screens 27–27c): a stick or a ring of LEDs, each with its own chip, on one data line.
 * A frame is 24 bits an LED, sent at 800 kHz (machine.bitstream, the micro:bit's ws2812_write): the first LED keeps
 * the first 24 bits — green, red, blue, high bit first — and passes the rest out of its DOUT to the next one, so a
 * chain of sticks and rings is one long strip. A bit is a 1 or a 0 by how long it is high; the line held low (50 µs)
 * ends the frame and every LED shows what it took (Worldsemi WS2812B datasheet).
 */
export const NEOPIXEL = {
  /** It works from 3.0 V (its datasheet says 3.5–5.3 V; on 3.3 V real ones light, a little dim in blue). */
  minVolts: 3.0,
  /** Each LED's chip draws ≈ 0.6 mA, dark; each colour ≈ 20 mA at 255 (its constant-current drivers): white ≈ 60 mA. */
  idleA: 0.0006,
  channelA: 0.02,
  /** A bit high this long or longer is a 1 (T0H 0.4 µs, T1H 0.8 µs, ± 0.15 µs). */
  oneFromNs: 600,
  /** The LED counts each shape comes in: a stick (a strip) and a ring. */
  sizes: { stick: [8, 16, 30], ring: [8, 12, 16, 24] },
} as const;

export type NeoPixelShape = keyof typeof NEOPIXEL.sizes;

/** A NeoPixel's shape and LED count from its props ('stick', 8 by default; a count it doesn't come in is its shape's first). */
export function neopixelShape(props: Record<string, unknown> = {}): { shape: NeoPixelShape; leds: number } {
  const shape: NeoPixelShape = props.shape === 'ring' ? 'ring' : 'stick';
  const sizes: readonly number[] = NEOPIXEL.sizes[shape];
  const n = Number(props.leds);
  return { shape, leds: sizes.includes(n) ? n : sizes[0]! };
}

export const neopixelCount = (props: Record<string, unknown> = {}): number => neopixelShape(props).leds;

/** What a WS2812B reads from `bytes` sent with `timing` [high0, low0, high1, low1] ns (bitstream's encoding 0): each bit
 *  by its high time — 400 kHz timing (a WS2811's) is read as all ones, full white. */
export function ws2812Bits(timing: readonly number[], bytes: readonly number[]): number[] {
  const zero = (timing[0] ?? 400) >= NEOPIXEL.oneFromNs ? 1 : 0;
  const one = (timing[2] ?? 800) >= NEOPIXEL.oneFromNs ? 1 : 0;
  // each bit sent as b is read as `one` (b = 1) or `zero` (b = 0)
  return bytes.map((b) => (one ? b : 0) | (zero ? ~b & 0xff : 0));
}

/** One stick or ring: its LEDs' colours [r, g, b] from LED 0 (at DIN's end; a ring's at the top). */
export class NeoPixels {
  readonly pixels: [number, number, number][];
  /** Counts the changes of colour (the window is told of a new picture then). */
  version = 0;

  constructor(readonly n: number) {
    this.pixels = Array.from({ length: n }, () => [0, 0, 0] as [number, number, number]);
  }

  /** A frame in at DIN: each LED takes its 3 bytes (G R B) while there are 3; returns what goes on out of DOUT. */
  take(bytes: readonly number[]): number[] {
    const leds = Math.min(this.n, Math.floor(bytes.length / 3));
    let changed = false;
    for (let i = 0; i < leds; i++) {
      const [g, r, b] = [bytes[3 * i]!, bytes[3 * i + 1]!, bytes[3 * i + 2]!];
      const p = this.pixels[i]!;
      if (p[0] !== r || p[1] !== g || p[2] !== b) { this.pixels[i] = [r, g, b]; changed = true; }
    }
    if (changed) this.version++;
    return bytes.length > 3 * this.n ? bytes.slice(3 * this.n) : [];
  }

  /** The LEDs lit (any colour above 0). */
  lit(): number {
    return this.pixels.filter(([r, g, b]) => r || g || b).length;
  }

  /** What they draw: each chip's own, and each colour's share of its 20 mA. */
  amps(): number {
    return this.pixels.reduce((a, [r, g, b]) => a + NEOPIXEL.idleA + (r + g + b) / 255 * NEOPIXEL.channelA, 0);
  }

  /** Their colours as hex, 'rrggbb' an LED (the window's picture). */
  hex(): string {
    return this.pixels.map((p) => p.map((c) => c.toString(16).padStart(2, '0')).join('')).join('');
  }
}
