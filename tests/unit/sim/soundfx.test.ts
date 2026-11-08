import { describe, expect, it } from 'vitest';
import { BUILT_IN_SOUNDS, soundSteps, type ToneStep } from '../../../src/sim/soundfx';

/** M7 slice 4 (screen 06): the micro:bit V2's sound expressions — a SoundEffect's 72 characters, or a built-in Sound's
 *  name — played as CODAL's SoundEmojiSynthesizer does: each effect's frequency, volume and its effect steps. */
const noRandom = () => 0;
/** A SoundEffect's expression, as microbit_soundeffect.c writes it (volumes 0–255 encoded 0–1023). */
function effect(o: { wave?: number; volStart?: number; freqStart?: number; duration?: number; shape?: number; freqEnd?: number; volEnd?: number; steps?: number; fx?: number; fxParam?: number; fxSteps?: number }): string {
  const d = (v: number, n: number) => String(v).padStart(n, '0');
  const vol = (v: number) => Math.floor((v * 1023 + 127) / 255);
  const e = '0'.repeat(72).split('');
  const put = (at: number, s: string) => s.split('').forEach((c, i) => { e[at + i] = c; });
  put(0, d(o.wave ?? 3, 1)); put(1, d(vol(o.volStart ?? 255), 4)); put(5, d(o.freqStart ?? 500, 4)); put(9, d(o.duration ?? 500, 4));
  put(13, d(o.shape ?? 18, 2)); put(18, d(o.freqEnd ?? 2500, 4)); put(26, d(vol(o.volEnd ?? 0), 4)); put(30, d(o.steps ?? 128, 4));
  put(34, d(o.fx ?? 0, 2)); put(36, d(o.fxParam ?? 1, 4)); put(40, d(o.fxSteps ?? 24, 4));
  return e.join('');
}
const at = (steps: ToneStep[], us: number) => steps.filter((s) => s.us <= us).at(-1)!;

describe('M7 the micro:bit\'s sound expressions', () => {
  it('a linear sweep 500 → 2500 Hz over 1 s in 4 steps (500, 1000, 1500 heard), the volume falling from full to 0 in 36', () => {
    const s = soundSteps(effect({ shape: 1, duration: 1000, steps: 4, freqStart: 500, freqEnd: 2500 }), noRandom)!;
    expect(s[0]).toMatchObject({ us: 0, hz: 500, volume: 1, wave: 'square' });
    expect(at(s, 260_000).hz).toBe(1000);
    expect(at(s, 510_000).hz).toBe(1500);
    expect(at(s, 760_000).hz).toBe(1500);   // CODAL's last step falls at the very end: 2000 Hz is never heard
    expect(at(s, 500_000).volume).toBeCloseTo(1 - 18 / 36, 1);
    expect(s.at(-1)).toMatchObject({ us: 1_000_000, hz: 0, volume: 0 });   // the end: silence
  });

  it('its waveform: 0 sine, 1 sawtooth, 2 triangle, 3 square, 4 noise', () => {
    expect([0, 1, 2, 3, 4].map((w) => soundSteps(effect({ wave: w }), noRandom)![0]!.wave)).toEqual(['sine', 'sawtooth', 'triangle', 'square', 'noise']);
  });

  it('the logarithmic shape (a SoundEffect\'s default) rises fast, then slowly; no shape keeps the start', () => {
    const log = soundSteps(effect({ shape: 18 }), noRandom)!;
    expect(at(log, 250_000).hz).toBeGreaterThan(1500);
    expect(at(log, 490_000).hz).toBeGreaterThan(2600);   // log10(127) / 1.95 > 1: it goes past its end, as on the real one
    const none = soundSteps(effect({ shape: 0 }), noRandom)!;
    expect(new Set(none.filter((x) => x.hz).map((x) => x.hz))).toEqual(new Set([500]));
  });

  it('an arpeggio up a major scale (shape 8) from 262 Hz', () => {
    const s = soundSteps(effect({ shape: 8, freqStart: 262, steps: 8, duration: 800 }), noRandom)!;
    const notes = [...new Set(s.filter((x) => x.hz).map((x) => Math.round(x.hz)))];
    expect(notes.slice(0, 3)).toEqual([262, 295, 328]);   // CODAL's just intervals: 1, 9/8, 5/4
  });

  it('vibrato (fx 1) swings the frequency up and down by its parameter, step by step', () => {
    const s = soundSteps(effect({ shape: 0, fx: 1, fxParam: 2, fxSteps: 100, duration: 1000 }), noRandom)!;
    expect(new Set(s.filter((x) => x.hz).map((x) => x.hz))).toEqual(new Set([500, 1000]));
  });

  it('several effects in a row, one after another; a built-in sound by its name', () => {
    const one = effect({ duration: 200 });
    const s = soundSteps(`${one},${one}`, noRandom)!;
    expect(s.at(-1)!.us).toBe(400_000);
    expect(s.filter((x) => x.hz === 500 && x.us > 0).map((x) => x.us)).toContain(200_000);
    expect(Object.keys(BUILT_IN_SOUNDS)).toEqual(['giggle', 'happy', 'hello', 'mysterious', 'sad', 'slide', 'soaring', 'spring', 'twinkle', 'yawn']);
    const twinkle = soundSteps('twinkle', noRandom)!;
    expect(twinkle[0]).toMatchObject({ us: 0, wave: 'sine' });
    expect(Math.round(twinkle.at(-1)!.us / 1000)).toBe(6722);   // twinkle: one effect of 6722 ms, a major scale down from 7 Hz's 18th octave
    expect(Math.round(twinkle.at(-2)!.hz)).toBe(7);
  });

  it('not 72 characters an effect, or not digits: nothing plays (CODAL ignores it)', () => {
    expect(soundSteps('hello there', noRandom)).toBeUndefined();
    expect(soundSteps(`${effect({})}x`, noRandom)).toBeUndefined();
    expect(soundSteps(effect({}).replace(/^3/, 'a'), noRandom)).toBeUndefined();
  });

  it('randomness: a frequency spread of 100 moves the start frequency by up to ± 100', () => {
    const e = effect({}).split('');
    '0100'.split('').forEach((c, i) => { e[44 + i] = c; });
    const lo = soundSteps(e.join(''), () => 0)![0]!.hz;
    const hi = soundSteps(e.join(''), (n) => n - 1)![0]!.hz;
    expect([lo, hi]).toEqual([400, 600]);
  });
});
