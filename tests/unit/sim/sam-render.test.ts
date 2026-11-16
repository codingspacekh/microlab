import { beforeEach, describe, expect, it } from 'vitest';
import { AddInflection, outputFrames, render, resetRenderState } from '../../../src/sim/sam/render';
import { sampleTable } from '../../../src/sim/sam/tables';
import { newSam, PHONEME_END, type SamMemory } from '../../../src/sim/sam/types';

/** SAM's renderer (lib/sam/render.c of the micro:bit's firmware) — what its C says about the samples that come out,
 *  worked out from the C, for phoneme lists made by hand. */
type Sample = [pos: number, b: number];
type Ph = [index: number, length: number, stress?: number, pitch?: number];

const AA = 9; // a vowel: freq1 = (mouth * 27) >> 7, no sampled flags
const S = 32; // an unvoiced sampled consonant: flags 241
const PERIOD = 1;
const QUESTION = 2;

/** render.c's timetable, typed in from the C again: the C64's time from an output of kind [row] to one of [column]. */
const TIMETABLE = [
  [162, 167, 167, 127, 128],
  [226, 60, 60, 0, 0],
  [225, 60, 59, 0, 0],
  [200, 0, 0, 54, 55],
  [199, 0, 0, 54, 54],
];

function make(phonemes: Ph[], opts: Partial<{ pitch: number; speed: number; mouth: number; throat: number; sing: boolean }> = {}): { sam: SamMemory; samples: Sample[] } {
  const samples: Sample[] = [];
  const sam = newSam({ pitch: 64, speed: 72, mouth: 128, throat: 128, sing: false, ...opts }, (pos, b) => samples.push([pos, b]));
  [...phonemes, [PHONEME_END, 0] as Ph].forEach(([index, length, stress = 0, pitch = opts.pitch ?? 64], i) => {
    sam.common.phoneme_output[i] = { index, length, stress, pitch };
  });
  return { sam, samples };
}

function run(phonemes: Ph[], opts: Parameters<typeof make>[1] = {}): { sam: SamMemory; samples: Sample[] } {
  const made = make(phonemes, opts);
  render(made.sam);
  return made;
}

/** The shortest p with b[k] = b[k + p] for every k. */
function period(samples: Sample[]): number {
  const b = samples.map((s) => s[1]);
  for (let p = 1; p < b.length; p++) {
    if (b.every((v, k) => k + p >= b.length || v === b[k + p])) return p;
  }
  return -1;
}

beforeEach(() => resetRenderState());

describe('render: a vowel', () => {
  it('nothing for an empty list', () => {
    expect(run([]).samples).toEqual([]);
  });

  it('one sample every 162 ticks, each a multiple of 16 from 0 to 240', () => {
    const { samples, sam } = run([[AA, 10]]);
    expect(samples.length).toBeGreaterThan(0);
    samples.forEach(([pos, b], k) => {
      expect(pos).toBe(162 * (k + 1));
      expect(b % 16).toBe(0);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(240);
    });
    expect(sam.bufferpos).toBe(162 * samples.length);
    expect(new Set(samples.map((s) => s[1])).size).toBeGreaterThan(2);
    expect(sam.error).toBe('OK');
  });

  it('a frame is `speed` samples (the first always 72), a phoneme `length` frames', () => {
    expect(run([[AA, 5]]).samples.length).toBe(72 * 5);
    resetRenderState();
    expect(run([[AA, 10]]).samples.length).toBe(72 * 10);
    resetRenderState();
    expect(run([[AA, 10]], { speed: 36 }).samples.length).toBe(72 + 9 * 36);
    resetRenderState();
    expect(run([[AA, 10]], { speed: 144 }).samples.length).toBe(72 + 9 * 144);
  });

  it('the glottal period is the pitch less half of formant 1, in samples', () => {
    const f1 = (128 * 27) >> 7; // trans(mouth, mouth_formants[9])
    expect(period(run([[AA, 10]], { pitch: 64 }).samples)).toBe(64 - (f1 >> 1));
    resetRenderState();
    expect(period(run([[AA, 10]], { pitch: 40 }).samples)).toBe(40 - (f1 >> 1));
    resetRenderState();
    // singing: the pitch is not lowered by formant 1
    expect(period(run([[AA, 10]], { pitch: 40, sing: true }).samples)).toBe(40);
    resetRenderState();
    // stress 4 adds tab47492[5] = 243, i.e. takes 13 away
    expect(period(run([[AA, 10, 4]], { pitch: 64, sing: true }).samples)).toBe(64 - 13);
  });

  it('the frames keep the C struct\'s bits: formant 2 in 7', () => {
    // phoneme 29: throat_formants[29] = 86, and (255 * 86) >> 7 = 171 — 43 in 7 bits
    const { sam } = run([[29, 3]], { throat: 255 });
    expect([...sam.render.freq2.slice(0, 4)]).toEqual([43, 43, 43, 0]);
    // amplitudes 15, 13, 1 of AA through amplitudeRescale
    resetRenderState();
    const aa = run([[AA, 2]]).sam;
    expect([aa.render.amp1[0], aa.render.amp2[0], aa.render.amp3[0], aa.render.freq1[0], aa.render.freq2[0], aa.render.freq3[0]])
      .toEqual([15, 11, 1, 27, 40, 89]);
  });
});

describe('render: a sampled consonant', () => {
  /** What RenderSample puts out for S: sampleTable's bytes 15 to 255, a bit at a time from the top —
   *  24 (→ 128) for a 0, 5 (→ 80) for a 1. */
  const bits: number[] = [];
  for (let pos = 15; pos <= 255; pos++) for (let bit = 7; bit >= 0; bit--) bits.push(((sampleTable[pos] ?? 0) >> bit) & 1);

  it('S: the sample table\'s bits, at the timetable\'s steps', () => {
    const { samples, sam } = run([[S, 2]]);
    expect(samples.map((s) => s[1])).toEqual(bits.map((bit) => (bit ? 80 : 128)));
    let pos = 0;
    let old = 0;
    samples.forEach(([at], k) => {
      const kind = bits[k] ? 2 : 1;
      pos += TIMETABLE[old]![kind]!;
      old = kind;
      expect(at).toBe(pos);
    });
    expect(sam.error).toBe('OK');
  });

  it('the time of the first sample depends on the last kind put out, until the state is reset', () => {
    run([[S, 2]]);
    const last = bits[bits.length - 1] ? 2 : 1;
    expect(run([[AA, 1]]).samples[0]![0]).toBe(TIMETABLE[last]![0]);
    resetRenderState();
    expect(run([[AA, 1]]).samples[0]![0]).toBe(162);
  });

  it('S then a vowel: the consonant\'s two frames, then the vowel\'s', () => {
    const { samples } = run([[S, 2], [AA, 4]]);
    expect(samples.length).toBe(bits.length + 72 * 4);
    for (let k = 1; k < samples.length; k++) expect(samples[k]![0]).toBeGreaterThan(samples[k - 1]![0]);
    samples.forEach(([, b]) => expect(b % 16 === 0 && b >= 0 && b <= 240).toBe(true));
    // the vowel's samples are 162 apart
    for (let k = bits.length + 1; k < samples.length; k++) expect(samples[k]![0] - samples[k - 1]![0]).toBe(162);
  });
});

describe('outputFrames', () => {
  it('frames filled by hand: silence is 8 << 4, a period of pitch[Y] samples', () => {
    const { sam, samples } = make([]);
    sam.render.pitch.fill(30);
    outputFrames(sam, 3);
    // amplitudes 0: multtable gives 0, so (0 + 136) >> 4 = 8
    expect(samples.length).toBe(72 * 3);
    expect(samples.every(([, b]) => b === 128)).toBe(true);

    resetRenderState();
    const loud = make([]);
    loud.sam.render.pitch.fill(30);
    loud.sam.render.amp1.fill(15);
    loud.sam.render.freq1.fill(20);
    outputFrames(loud.sam, 4);
    expect(period(loud.samples)).toBe(30);
  });
});

describe('AddInflection', () => {
  const flat = (): SamMemory => {
    const { sam } = make([]);
    sam.render.pitch.fill(64);
    return sam;
  };

  it('a full stop: the pitch value climbs by one a frame over the 30 frames before it', () => {
    const sam = flat();
    AddInflection(sam, 1, 0, 50);
    expect([...sam.render.pitch.slice(0, 20)]).toEqual(new Array(20).fill(64));
    expect([...sam.render.pitch.slice(20, 50)]).toEqual(Array.from({ length: 30 }, (_, k) => 65 + k));
    expect(sam.render.pitch[50]).toBe(64);
  });

  it('a question mark: it falls by one a frame', () => {
    const sam = flat();
    AddInflection(sam, 255, 0, 50);
    expect([...sam.render.pitch.slice(20, 50)]).toEqual(Array.from({ length: 30 }, (_, k) => 63 - k));
    expect(sam.render.pitch[50]).toBe(64);
  });

  it('from the first frame when fewer than 30 come before; frames of 255 are passed over', () => {
    const sam = flat();
    sam.render.pitch[3] = 255;
    AddInflection(sam, 1, 0, 6);
    expect([...sam.render.pitch.slice(0, 7)]).toEqual([65, 66, 67, 255, 68, 69, 64]);
  });

  it('in a rendered list: "." after a vowel raises the vowel\'s pitch values, "?" lowers them', () => {
    // sing: no pitch contour. The transition to the punctuation writes pitch from frame 9 on (phase3 = 10 - 2, + 1).
    const stop = run([[AA, 10], [PERIOD, 3]], { sing: true }).sam;
    expect([...stop.render.pitch.slice(0, 8)]).toEqual([65, 66, 67, 68, 69, 70, 71, 72]);
    resetRenderState();
    const ask = run([[AA, 10], [QUESTION, 3]], { sing: true }).sam;
    expect([...ask.render.pitch.slice(0, 8)]).toEqual([63, 62, 61, 60, 59, 58, 57, 56]);
  });
});

describe('transitions', () => {
  it('formant 1 goes from one vowel to the next in even steps', () => {
    // IY (5, freq1 10) then AA (9, freq1 27), both rank 2: outBlendLength 4 each, so 8 frames from frame 6 —
    // 17 / 8 = 2 a frame, and the 1 left over a frame is carried: one more every 8th
    const { sam } = run([[5, 10], [AA, 10]]);
    expect([...sam.render.freq1.slice(5, 15)]).toEqual([10, 10, 12, 14, 16, 18, 20, 22, 24, 27]);
    expect(sam.error).toBe('OK');
  });
});
