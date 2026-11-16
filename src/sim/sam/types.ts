/**
 * SAM's memory (sam.h of the micro:bit firmware's lib/sam, micropython-microbit-v2 v2.1.2), as the three parts of
 * the port share it: reciter.ts (words → phonemes), sam.ts (phonemes → frames' worth of sounds) and render.ts
 * (→ samples). Every number is a C `unsigned char` unless said: kept 0–255 by whoever writes it.
 */
export interface Phoneme {
  index: number;
  length: number;
  /** 0 to 8. */
  stress: number;
  pitch: number;
}

export const PHONEME_IGNORE = 0;
export const PHONEME_END = 127;
export const PHONEME_END_BREATH = 126;
export const RENDER_FRAMES = 256;
export const INPUT_PHONEMES = 128;
export const OUTPUT_PHONEMES = RENDER_FRAMES / 4;

export interface SamMemory {
  common: {
    speed: number;
    pitch: number;
    mouth: number;
    throat: number;
    singmode: boolean;
    /** OUTPUT_PHONEMES of them. */
    phoneme_output: Phoneme[];
  };
  prepare: {
    /** The phonemes as text, one byte a character (C's `const char *input`); null once read (ClearInput). */
    input: Uint8Array | null;
    input_length: number;
    /** INPUT_PHONEMES of them. */
    phoneme_input: Phoneme[];
  };
  /** render_memory: C keeps freq1 in 6 bits, freq2 and freq3 in 7, each amp in 4 (bit-fields) — a value written is
   *  cut to those bits (`& 63`, `& 127`, `& 15`), as the C struct cuts it. RENDER_FRAMES each. */
  render: {
    freq1: Uint8Array;
    freq2: Uint8Array;
    freq3: Uint8Array;
    amp1: Uint8Array;
    amp2: Uint8Array;
    amp3: Uint8Array;
    pitch: Uint8Array;
    flags: Uint8Array;
  };
  /** C's global `sam_error`: "OK" until something fails. */
  error: string;
  /** C's global `bufferpos`: where the next sample goes, in the C64's time (render.c's timetable). */
  bufferpos: number;
  /** C's `SamOutputByte(pos, b)`: sample b (0–240, a multiple of 16) at time pos. */
  output: (pos: number, b: number) => void;
}

const phoneme = (): Phoneme => ({ index: 0, length: 0, stress: 0, pitch: 0 });

export function newSam(opts: { pitch: number; speed: number; mouth: number; throat: number; sing: boolean }, output: SamMemory['output']): SamMemory {
  return {
    common: {
      speed: opts.speed & 0xff, pitch: opts.pitch & 0xff, mouth: opts.mouth & 0xff, throat: opts.throat & 0xff, singmode: opts.sing,
      phoneme_output: Array.from({ length: OUTPUT_PHONEMES }, phoneme),
    },
    prepare: { input: null, input_length: 0, phoneme_input: Array.from({ length: INPUT_PHONEMES }, phoneme) },
    render: {
      freq1: new Uint8Array(RENDER_FRAMES), freq2: new Uint8Array(RENDER_FRAMES), freq3: new Uint8Array(RENDER_FRAMES),
      amp1: new Uint8Array(RENDER_FRAMES), amp2: new Uint8Array(RENDER_FRAMES), amp3: new Uint8Array(RENDER_FRAMES),
      pitch: new Uint8Array(RENDER_FRAMES), flags: new Uint8Array(RENDER_FRAMES),
    },
    error: 'OK',
    bufferpos: 0,
    output,
  };
}
