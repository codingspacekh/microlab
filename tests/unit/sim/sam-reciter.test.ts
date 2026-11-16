import { describe, expect, it } from 'vitest';
import { textToPhonemes } from '../../../src/sim/sam/reciter';

/**
 * What modspeech.c's `translate` does: a reciter_memory (input[128] then inputtemp[128]), the text copied
 * into input, '[' after it, TextToPhonemes, then input read up to the byte 155 (at most 255 bytes).
 * The firmware's memory is not cleared first; here it is zeros.
 */
function translate(text: string): string {
  if (text.length > 80) throw new Error('text too long');
  const mem = new Uint8Array(256);
  for (let i = 0; i < text.length; i++) mem[i] = text.charCodeAt(i);
  mem[text.length] = 0x5b; // '['
  if (!textToPhonemes(mem)) throw new Error('could not parse input');
  let outlen = 0;
  for (; outlen < 255; outlen++) if (mem[outlen] === 155) break;
  return String.fromCharCode(...mem.subarray(0, outlen));
}

/** The characters the rules in ReciterTabs.h can write: phoneme letters, stress digits, space, and / - . , ? */
const PHONEMES = /^[A-Z0-9 /.,?-]*$/;

// Every expected string below was worked out by hand from the rules in ReciterTabs.h (the rule that
// matches each letter is named beside it) — not copied from what the port prints. The reciter reads
// inputtemp = ' ' + text, so its first character is always that space: every output starts with ' '.
describe('SAM reciter (reciter.c): text → phonemes', () => {
  it('HELLO', () => {
    // H: (H)#=/H   E: (E)=EH   L: (L)=L   L: L(L)=   O: (O) =OW
    expect(translate('HELLO')).toBe(' /HEHLOW');
  });

  it('HELLO WORLD', () => {
    // … then ' ', W,O,R: (WOR)^=WER   L: (L)=L   D: (D)=D
    expect(translate('HELLO WORLD')).toBe(' /HEHLOW WERLD');
  });

  it('MY NAME IS SAM', () => {
    // M: (M)=M   Y:  :(Y) =AY
    // N: (N)=N   A: (A)^%=EY   M: (M)=M   E: #:(E) =
    // I: (I)=IH   S:  :#(S) =Z
    // S: (S)=S   A: (A)=AE   M: (M)=M
    expect(translate('MY NAME IS SAM')).toBe(' MAY NEYM IHZ SAEM');
  });

  it('THE QUICK BROWN FOX', () => {
    // THE:  (THE) =DHAX
    // QU: (QU)=KW   I: (I)=IH   CK: (CK)=K
    // B: (B)=B   R: (R)=R   OW: (OW)=OW   N: (N)=N
    // F: (F)=F   O: (O)=AA   X: (X)=KS
    expect(translate('THE QUICK BROWN FOX')).toBe(' DHAX KWIHK BROWN FAAKS');
  });

  it('digits: 1 2 3', () => {
    // rules2: (1)= WAH4N   (2)= TUW4   (3)= THRIY4 — each begins with its own space
    expect(translate('1 2 3')).toBe('  WAH4N  TUW4  THRIY4');
  });

  it('punctuation: HI, YOU.', () => {
    // H: (H)#=/H   I: (I) =AY   ',': (,)=,   YOU:  (YOU)=YUW   '.' not before a digit: copied (pos36554)
    expect(translate('HI, YOU.')).toBe(' /HAY, YUW.');
  });

  it('an empty string is only the leading space', () => {
    expect(translate('')).toBe(' ');
  });

  it('small letters are read as capitals (the copy into inputtemp folds them)', () => {
    expect(translate('hello')).toBe(' /HEHLOW');
  });

  it('an 80-character input', () => {
    const text = 'HELLO '.repeat(13) + 'HI'; // 80 characters
    expect(text.length).toBe(80);
    // HELLO as above, 13 times; then H: (H)#=/H   I: (I) =AY
    expect(translate(text)).toBe(' ' + '/HEHLOW '.repeat(13) + '/HAY');
  });

  it('an 80-character sentence: structure only', () => {
    // Too long to trace by hand: only that it ends properly and holds nothing but phoneme characters.
    const text = 'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG, AND THEN IT RUNS HOME AGAIN TO NAP.';
    expect(text.length).toBe(80);
    const out = translate(text);
    expect(out.startsWith(' DHAX KWIHK BROWN FAAKS ')).toBe(true);
    expect(out).toMatch(PHONEMES);
    expect(out.length).toBeGreaterThan(40);
    expect(out.length).toBeLessThan(128);
  });

  it('stops at a space once more than 120 bytes are written (pos36654)', () => {
    // (7)= SEH4VUN, then the space: 9 bytes for each "7 ". The space of the k-th pair would go to
    // byte 9k; the 14th (byte 126 > 120) is where the reciter writes 155 and stops.
    const out = translate('7 '.repeat(40));
    expect(out).toBe(' ' + ' SEH4VUN '.repeat(13) + ' SEH4VUN');
    expect(out.length).toBe(126);
  });

  it('works on a plain 128-byte input too', () => {
    const input = new Uint8Array(128);
    for (const [i, c] of [...'HELLO['].entries()) input[i] = c.charCodeAt(0);
    expect(textToPhonemes(input)).toBe(true);
    expect([...input.subarray(0, 9)]).toEqual([...' /HEHLOW'].map((c) => c.charCodeAt(0)).concat(155));
  });

  it('always ends: more than 128 bytes of phonemes, every byte value, and no "[" at all', () => {
    // 80 × '>' writes 15 bytes each — in C the phonemes run over inputtemp; only that it returns is checked.
    const over = new Uint8Array(256);
    over.fill(0x3e, 0, 80);
    over[80] = 0x5b;
    expect(typeof textToPhonemes(over)).toBe('boolean');
    for (let b = 0; b < 256; b++) {
      const one = new Uint8Array(128).fill(b); // no '[' unless b folds to it
      expect(typeof textToPhonemes(one)).toBe('boolean');
    }
  });
});
