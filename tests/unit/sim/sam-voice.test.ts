import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SamError, samSpeak, samTranslate } from '../../../src/sim/sam';
import { resetRenderState } from '../../../src/sim/sam/render';

/**
 * 1.0.2 — the micro:bit's real voice: SAM joined as modspeech.c joins it (translate, then articulate), the samples as
 * its SamOutputByte gives them to the speaker (mode 1: 19 000 a second; volume 4: its remap table).
 */
const voice = { pitch: 64, speed: 72, mouth: 128, throat: 128, sing: false, mode: 1, volume: 4 };
const seconds = (s: { samples: Uint8Array; rate: number }) => s.samples.length / s.rate;
/** The strongest repeat in a stretch of samples, in samples (autocorrelation): the voice's period. */
function period(x: Uint8Array, from: number, n: number, lo: number, hi: number): number {
  let best = 0;
  let at = 0;
  for (let lag = lo; lag <= hi; lag++) {
    let sum = 0;
    for (let i = from; i < from + n; i++) sum += (x[i]! - 128) * (x[i + lag]! - 128);
    if (sum > best) { best = sum; at = lag; }
  }
  return at;
}

describe('1.0.2 SAM, the micro:bit\'s voice', () => {
  it('translate: the words as phonemes, as the micro:bit docs show them', () => {
    expect(samTranslate('hello')).toBe(' /HEHLOW');
    expect(samTranslate('Hello, World')).toBe(' /HEHLOW, WERLD');
  });

  it('say: a second or so of sound for two words, in whole buffers of 128, loud and never stuck at one level', () => {
    resetRenderState();
    const s = samSpeak(samTranslate('hello world'), voice);
    expect(s.rate).toBe(19000);
    expect(s.samples.length % 128).toBe(0);
    expect(seconds(s)).toBeGreaterThan(0.6);
    expect(seconds(s)).toBeLessThan(2);
    const levels = new Set(s.samples);
    expect(levels.size).toBeGreaterThan(8);
    expect(Math.max(...s.samples)).toBeGreaterThan(200);
    expect(Math.min(...s.samples)).toBeLessThan(60);
    if (process.env.MICROLAB_WAV) writeFileSync(process.env.MICROLAB_WAV, wav(s));
  });

  it('speed: 144 takes about twice as long as 72; pitch: a lower number is a higher voice', () => {
    resetRenderState();
    const slow = samSpeak('AAAAAAAA', { ...voice, speed: 144 });
    const usual = samSpeak('AAAAAAAA', voice);
    expect(seconds(slow) / seconds(usual)).toBeGreaterThan(1.7);
    expect(seconds(slow) / seconds(usual)).toBeLessThan(2.2);
    const high = samSpeak('AAAAAAAA', { ...voice, pitch: 32 });
    const mid = Math.floor(usual.samples.length / 2);
    const p64 = period(usual.samples, mid, 2000, 20, 400);
    const p32 = period(high.samples, Math.floor(high.samples.length / 2), 2000, 10, 400);
    // spoken, a voice's period is its pitch less half the first formant (render.c): 51 and 19 for AA — more than an octave
    expect(p64 / p32).toBeGreaterThan(2.4);
    expect(p64 / p32).toBeLessThan(3);
  });

  it('sing: #115 and #58 are an octave apart', () => {
    resetRenderState();
    const low = samSpeak('#115AAAAAAAA', { ...voice, sing: true });
    const top = samSpeak('#58AAAAAAAA', { ...voice, sing: true });
    const pl = period(low.samples, Math.floor(low.samples.length / 2), 3000, 20, 600);
    const pt = period(top.samples, Math.floor(top.samples.length / 2), 3000, 20, 600);
    expect(pl / pt).toBeGreaterThan(1.85);
    expect(pl / pt).toBeLessThan(2.15);
    // its note: 15 300 / 115 Hz was the stand-in's guess — what SAM really sings is measured here
    expect(19000 / pl).toBeGreaterThan(60);
    expect(19000 / pl).toBeLessThan(300);
  });

  it('a phoneme SAM does not know is the firmware\'s error', () => {
    expect(() => samSpeak('X', voice)).toThrow(SamError);
    expect(() => samSpeak('X', voice)).toThrow('Phoneme not understood');
  });

  it('nothing to say: no samples', () => {
    expect(samSpeak('', voice).samples.length).toBe(0);
  });

  it('80 characters of any text never hang or throw anything but SAM\'s own error', () => {
    for (const text of ['A'.repeat(80), 'S'.repeat(80), '7 '.repeat(40), 'the quick brown fox jumps over the lazy dog again and again and again ok', '!?.,;:-'.repeat(11)]) {
      let said = 0;
      try { said = samSpeak(samTranslate(text), voice).samples.length; } catch (e) { expect(e).toBeInstanceOf(SamError); }
      expect(said).toBeGreaterThanOrEqual(0);
    }
  });
});

function wav(s: { samples: Uint8Array; rate: number }): Uint8Array {
  const head = new DataView(new ArrayBuffer(44));
  const put = (at: number, text: string) => { for (let i = 0; i < text.length; i++) head.setUint8(at + i, text.charCodeAt(i)); };
  put(0, 'RIFF'); head.setUint32(4, 36 + s.samples.length, true); put(8, 'WAVEfmt '); head.setUint32(16, 16, true); head.setUint16(20, 1, true);
  head.setUint16(22, 1, true); head.setUint32(24, s.rate, true); head.setUint32(28, s.rate, true); head.setUint16(32, 1, true); head.setUint16(34, 8, true);
  put(36, 'data'); head.setUint32(40, s.samples.length, true);
  const out = new Uint8Array(44 + s.samples.length);
  out.set(new Uint8Array(head.buffer));
  out.set(s.samples, 44);
  return out;
}
