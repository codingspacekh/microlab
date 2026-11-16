import { textToPhonemes } from './reciter';
import { samMain, setInput } from './sam';
import { newSam } from './types';

/**
 * The micro:bit's voice in the simulator (1.0.2): SAM — Software Automatic Mouth, 1982 — as the firmware has it
 * (lib/sam of micropython-microbit-v2 v2.1.2), ported file by file (reciter.ts, sam.ts, render.ts; tables.ts by
 * scripts/sam-tables.py), and joined here as modspeech.c joins it: translate() and articulate(), with the samples
 * written as its SamOutputByte writes them to the speaker. So `speech.say("Hello")` says here what it says there.
 */
export class SamError extends Error {}

const bytes = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

/** modspeech.c's translate(): the phonemes SAM's reciter makes of the words. The caller has checked the length. */
export function samTranslate(words: string): string {
  const input = new Uint8Array(128);
  const text = bytes(words);
  input.set(text.subarray(0, 126));
  input[Math.min(text.length, 126)] = 0x5b;   // '['
  if (!textToPhonemes(input)) throw new SamError('could not parse input');
  let n = 0;
  while (n < 128 && input[n] !== 155) n++;
  return String.fromCharCode(...input.subarray(0, n));
}

export interface SamVoice { pitch: number; speed: number; mouth: number; throat: number; sing: boolean; mode: number; volume: number }
export interface Spoken {
  /** Unsigned 8-bit samples, 128 the middle. */
  samples: Uint8Array;
  /** Samples a second. */
  rate: number;
}

/** modspeech.c's sam_sample_remap: SAM's 16 levels as the speaker's, loud with little distortion (volume 4). */
const REMAP = [0, 1, 2, 4, 8, 16, 32, 64, 128, 192, 224, 240, 248, 252, 254, 255];
const CHUNK = 128;

/** modspeech.c's articulate(): the phonemes as samples, as its SamOutputByte and the dedicated audio channel give them. */
export function samSpeak(phonemes: string, voice: SamVoice): Spoken {
  const mode = voice.mode;
  const rate = mode === 0 ? 15625 : mode <= 2 ? 19000 : 38000;
  const out: number[] = [];
  let lastIdx = 0;
  let lastB = 0;
  const sam = newSam(voice, (pos, raw) => {
    let b = raw & 0xff;
    const v = voice.volume;
    if (v === 1) b |= b >> 4;
    else if (v === 2) { b = Math.min(Math.max(b, 2 << 4), 14 << 4); b = Math.trunc(((b - (2 << 4)) * 255) / (12 << 4)); }
    else if (v === 3) { b = Math.min(Math.max(b, 3 << 4), 13 << 4); b = Math.trunc(((b - (3 << 4)) * 255) / (10 << 4)); }
    else if (v === 4) b = REMAP[b >> 4]!;
    if (mode === 0) return;   // the micro:bit V1's way: not there on the V2's own audio channel
    const idx = mode === 1 || mode === 2 ? pos >>> 6 : pos >>> 5;
    if (mode === 1 || mode === 3) {
      while (lastIdx < idx) { lastIdx++; out.push(b); }
    } else {
      const delta = idx - lastIdx;
      if (delta > 0) {
        let cur = lastB;
        const step = Math.trunc((b - lastB) / delta);
        while (lastIdx < idx) {
          lastIdx++;
          cur = lastIdx === idx ? b : cur + step;
          out.push(cur & 0xff);
        }
      }
      lastB = b;
    }
  });
  setInput(sam, bytes(phonemes));
  if (!samMain(sam)) throw new SamError(sam.error);
  // the last buffer is filled with silence
  while (out.length % CHUNK !== 0) out.push(128);
  return { samples: Uint8Array.from(out), rate };
}
