import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adjustLengths, code41240, copyStress, insertBreath, parser1, parser2, samMain, setInput, setPhonemeLength } from '../../../src/sim/sam/sam';
import { render } from '../../../src/sim/sam/render';
import { newSam, PHONEME_END, PHONEME_END_BREATH, type SamMemory } from '../../../src/sim/sam/types';

/** SAM's phoneme parser (sam.c of the micro:bit's firmware), a stage at a time and without the renderer. Every expected
 *  value is worked out by hand from sam.c and SamTabs.h: a phoneme's index is its place in signInputTable1/2 —
 *  0 ' ', 1 '.', 7 EH, 9 AA, 13 AX, 16 UX, 19 LX, 20 WX, 21 YX, 23 R, 24 L, 28 N, 30 DX, 31 Q, 32 S, 36 /H, 42 CH,
 *  48 EY, 49 AY, 50 OY, 52 OW, 53 UW, 57 D, 69 T, 72 K, 75 KX, 78 UL. */
vi.mock('../../../src/sim/sam/render', () => ({ render: vi.fn() }));

const bytes = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
function sam(phonemes: string): SamMemory {
  const s = newSam({ pitch: 64, speed: 72, mouth: 128, throat: 128, sing: false }, () => undefined);
  s.prepare.phoneme_input[127]!.index = PHONEME_END; // as Init leaves it
  setInput(s, bytes(phonemes));
  return s;
}
/** The phonemes up to the end's mark: one field of each. */
function list(s: SamMemory, field: 'index' | 'length' | 'stress' | 'pitch' = 'index'): number[] {
  const end = s.prepare.phoneme_input.findIndex((p) => p.index === PHONEME_END);
  return s.prepare.phoneme_input.slice(0, end).map((p) => p[field]);
}
/** Parser1, then the stages named. */
function parsed(phonemes: string, ...stages: ((s: SamMemory) => void)[]): SamMemory {
  const s = sam(phonemes);
  expect(parser1(s)).toBe(true);
  s.prepare.input = null; s.prepare.input_length = 0; // ClearInput
  for (const stage of stages) stage(s);
  return s;
}

describe('SAM Parser1: the text to phoneme indexes', () => {
  it('"/HEHLOW" is /H EH L OW, then the end', () => {
    const s = sam('/HEHLOW');
    expect(parser1(s)).toBe(true);
    expect(s.prepare.phoneme_input.slice(0, 5).map((p) => p.index)).toEqual([36, 7, 24, 52, PHONEME_END]);
    expect(list(s, 'pitch')).toEqual([64, 64, 64, 64]);
    expect(s.error).toBe('OK');
  });
  it('small letters are read as capitals', () => {
    const s = sam('/hehlow');
    expect(parser1(s)).toBe(true);
    expect(list(s)).toEqual([36, 7, 24, 52]);
  });
  it('a stress digit goes to the phoneme before it', () => {
    const s = sam('/HEH3LOW');
    expect(parser1(s)).toBe(true);
    expect(list(s)).toEqual([36, 7, 24, 52]);
    expect(list(s, 'stress')).toEqual([0, 3, 0, 0]);
  });
  it('a name that is no phoneme: "Phoneme not understood"', () => {
    for (const text of ['hello', 'X', 'AA9']) {
      const s = sam(text);
      expect(parser1(s)).toBe(false);
      expect(s.error).toBe('Phoneme not understood');
    }
  });
  it('"QQ" is two glottal stops (Q is a phoneme)', () => {
    expect(list(parsed('QQ'))).toEqual([31, 31]);
  });
  it('"#100" sets the pitch of the phonemes after it; no number or more than 255 is "Illegal pitch"', () => {
    const s = sam('AA#100AA');
    expect(parser1(s)).toBe(true);
    expect(list(s)).toEqual([9, 9]);
    expect(list(s, 'pitch')).toEqual([64, 100]);
    expect(s.common.pitch).toBe(100);
    for (const text of ['#AA', '#256AA', '#']) {
      const bad = sam(text);
      expect(parser1(bad)).toBe(false);
      expect(bad.error).toBe('Illegal pitch');
    }
  });
  it('127 phonemes fit, 128 are "Phonemes too long"', () => {
    const fits = sam(' '.repeat(127));
    expect(parser1(fits)).toBe(true);
    expect(fits.prepare.phoneme_input[127]!.index).toBe(PHONEME_END);
    const long = sam(' '.repeat(128));
    expect(parser1(long)).toBe(false);
    expect(long.error).toBe('Phonemes too long');
  });
  it('a stress digit before any phoneme: the C writes it into the text\'s length and reads past the text — not understood', () => {
    const s = sam('3AA');
    expect(parser1(s)).toBe(false);
    expect(s.error).toBe('Phoneme not understood');
  });
});

describe('SAM Parser2: the rules that rewrite phonemes', () => {
  it('a diphthong gets its second part: OW → OW WX, AY → AY YX; L after a vowel is LX', () => {
    expect(list(parsed('/HEHLOW', parser2))).toEqual([36, 7, 19, 52, 20]);
    expect(list(parsed('AY', parser2))).toEqual([49, 21]);
  });
  it('the inserted part takes the diphthong\'s stress', () => {
    const s = parsed('LOY5', parser2);
    expect(list(s)).toEqual([24, 50, 21]);
    expect(list(s, 'stress')).toEqual([0, 5, 5]);
  });
  it('UL → AX L — and that L, now after a vowel, is LX at the next step', () => {
    expect(list(parsed('UL', parser2))).toEqual([13, 19]);
  });
  it('T R → CH R (the T at the start: no CH\' after it, as the C leaves it)', () => {
    expect(list(parsed('TREY', parser2))).toEqual([42, 23, 48, 21]);
  });
  it('S T → S D; K before a vowel not ending in IY → KX; an alveolar\'s UW → UX', () => {
    expect(list(parsed('STEH', parser2))).toEqual([32, 57, 7]);
    expect(list(parsed('KOW', parser2))).toEqual([75, 52, 20]);
    expect(list(parsed('KAA', parser2))).toEqual([72, 9]);
    expect(list(parsed('DUW', parser2))).toEqual([57, 16, 20]);
  });
  it('a glottal stop between two stressed vowels with a pause between them', () => {
    expect(list(parsed('AA1 AA1', parser2))).toEqual([9, 0, 31, 9]);
    expect(list(parsed('AA1 AA', parser2))).toEqual([9, 0, 9]);
  });
  it('T after a vowel and before a pause and a vowel softens to DX; at the very end it stays', () => {
    expect(list(parsed('AAT AA', parser2))).toEqual([9, 30, 0, 9]);
    expect(list(parsed('AAT', parser2))).toEqual([9, 69]);
  });
});

describe('SAM stress and lengths', () => {
  it('CopyStress: the consonant before a stressed vowel gets its stress + 1', () => {
    const s = parsed('LOY5', parser2, copyStress);
    expect(list(s, 'stress')).toEqual([6, 5, 5]);
  });
  it('SetPhonemeLength: the stressed table for stressed phonemes, the other for the rest', () => {
    expect(list(parsed('LOY5', parser2, copyStress, setPhonemeLength), 'length')).toEqual([9, 15, 8]);
    expect(list(parsed('/HEHLOW', parser2, copyStress, setPhonemeLength), 'length')).toEqual([2, 8, 9, 14, 8]);
  });
  it('AdjustLengths: nothing to change in "/HEHLOW"', () => {
    expect(list(parsed('/HEHLOW', parser2, copyStress, setPhonemeLength, adjustLengths), 'length')).toEqual([2, 8, 9, 14, 8]);
  });
  it('AdjustLengths: from the vowel to the punctuation ×1.5 + 1, then the vowel before a voiced consonant ×1.25 + 1', () => {
    // S 2, AA 11 → 17 → 22, N 7 → 11, '.' 18
    expect(list(parsed('SAAN.', parser2, copyStress, setPhonemeLength, adjustLengths), 'length')).toEqual([2, 22, 11, 18]);
  });
  it('AdjustLengths: a vowel before an unvoiced plosive loses an eighth; Code41240 then gives the plosive its two parts', () => {
    const s = parsed('AAT', parser2, copyStress, setPhonemeLength, adjustLengths);
    expect(list(s, 'length')).toEqual([10, 4]);
    code41240(s);
    expect(list(s)).toEqual([9, 69, 70, 71]);
    expect(list(s, 'length')).toEqual([10, 4, 2, 2]);
  });
  it('InsertBreath: a breath after punctuation', () => {
    const s = parsed('SAAN.', parser2, copyStress, setPhonemeLength, adjustLengths, code41240, insertBreath);
    expect(list(s)).toEqual([32, 9, 28, 1, PHONEME_END_BREATH]);
  });
});

describe('SAMMain', () => {
  beforeEach(() => { vi.mocked(render).mockReset(); });
  it('hands the renderer a breath at a time', () => {
    const chunks: { index: number; length: number }[][] = [];
    vi.mocked(render).mockImplementation((s: SamMemory) => {
      const o = s.common.phoneme_output;
      chunks.push(o.slice(0, o.findIndex((p) => p.index === PHONEME_END)).map((p) => ({ index: p.index, length: p.length })));
    });
    const s = sam('SAAN.AA');
    expect(samMain(s)).toBe(true);
    expect(s.error).toBe('OK');
    expect(s.prepare.input).toBeNull();
    expect(chunks).toEqual([
      [{ index: 32, length: 2 }, { index: 9, length: 22 }, { index: 28, length: 11 }, { index: 1, length: 18 }],
      [{ index: 9, length: 11 }],
    ]);
  });
  it('false, with the error, and nothing rendered where the phonemes are not understood', () => {
    const s = sam('hello');
    expect(samMain(s)).toBe(false);
    expect(s.error).toBe('Phoneme not understood');
    expect(render).not.toHaveBeenCalled();
  });
});
