/**
 * SAM's phoneme parser: the phonemes as text ("/HEH3LOW") → the list of phonemes with their lengths and stress, handed
 * to the renderer a breath at a time. It follows sam.c of the micro:bit firmware's lib/sam (micropython-microbit-v2
 * v2.1.2) function by function, with the C's names — most of it a 6502 disassembly, its `goto`s kept as the labels of
 * a switch. Every `unsigned char` is kept 0–255 (`& 0xff`); the debug printing is left out.
 *
 * Where the C reads or writes outside an array (undefined behaviour), this does what the micro:bit's memory does where
 * that is certain, and otherwise something that ends: see `ph`, `out`, `flag` and `inputAt`.
 */
import { flags, flags2, phonemeLengthTable, phonemeStressedLengthTable, signInputTable1, signInputTable2, stressInputTable } from './tables';
import { render } from './render';
import { INPUT_PHONEMES, OUTPUT_PHONEMES, PHONEME_END, PHONEME_END_BREATH, RENDER_FRAMES, type Phoneme, type SamMemory } from './types';

/** A table's byte. Past its end — the C reads whatever the linker put next — 0. (Only flags[PHONEME_END] is reached
 *  that way, for its bits 64 and 128: both are 0 whether flags2 or signInputTable2 follows flags, padded or not.) */
const at = (t: Uint8Array, i: number): number => t[i] ?? 0;
const flag = (i: number): number => at(flags, i);
const flag2 = (i: number): number => at(flags2, i);

/** What a read past phoneme_input's end gives: the end, so that every loop over the phonemes stops there. (The C goes
 *  on into render's memory — zeros — and, its positions being unsigned chars, round and round.) */
const PAST_THE_END = PHONEME_END;

/**
 * C's `sam->prepare.phoneme_input[i]`. i is an int in the C: −1 (`[pos-1]` at the first phoneme) is the four bytes of
 * `input_length`, which lies just before the array — read as they are (0 once ClearInput has run), a write is dropped
 * (the only one made, Parser1's stress, is done there by hand). 128 and more: PAST_THE_END, a write is dropped.
 */
function ph(sam: SamMemory, i: number): Phoneme {
  const p = sam.prepare.phoneme_input[i];
  if (p !== undefined) return p;
  if (i < 0) {
    const l = sam.prepare.input_length >>> 0;
    return { index: l & 0xff, length: (l >>> 8) & 0xff, stress: (l >>> 16) & 0xff, pitch: (l >>> 24) & 0xff };
  }
  return { index: PAST_THE_END, length: 0, stress: 0, pitch: 0 };
}

/**
 * C's `sam->common.phoneme_output[Y]`. Past OUTPUT_PHONEMES the C writes on into `prepare` (which follows it in
 * sam_memory: phonemes of phoneme_input already copied) and Render reads them from there as if the array were longer —
 * so here the array grows.
 */
function out(sam: SamMemory, Y: number): Phoneme {
  const o = sam.common.phoneme_output;
  while (o.length <= Y) o.push({ index: 0, length: 0, stress: 0, pitch: 0 });
  return o[Y]!;
}

/** C's `sam->prepare.input[X]`. Past the text: 0, the byte MicroPython ends every string with. */
const inputAt = (sam: SamMemory, X: number): number => sam.prepare.input?.[X] ?? 0;

/** C's SetInput. `input`: the phonemes as bytes, one per character. */
export function setInput(sam: SamMemory, input: Uint8Array): void {
  sam.prepare.input = input;
  sam.prepare.input_length = input.length;
}

export function init(sam: SamMemory): void {
  sam.bufferpos = 0;

  for (let i = 0; i < INPUT_PHONEMES; i++) {
    ph(sam, i).stress = 0;
    ph(sam, i).length = 0;
  }

  for (let i = 0; i < OUTPUT_PHONEMES; i++) {
    out(sam, i).index = 0;
    out(sam, i).stress = 0;
    out(sam, i).length = 0;
    out(sam, i).pitch = 0;
  }
  ph(sam, INPUT_PHONEMES - 1).index = PHONEME_END; // to prevent buffer overflow
  sam.error = 'OK';
}

export function clearInput(sam: SamMemory): void {
  sam.prepare.input = null;
  sam.prepare.input_length = 0;
}

/** C's SAMMain: false where C returns 0 (sam.error says why). Calls the renderer for each chunk as the C does. */
export function samMain(sam: SamMemory): boolean {
  init(sam);

  const err = !parser1(sam);
  clearInput(sam);
  if (err) return false;

  parser2(sam);
  copyStress(sam);
  setPhonemeLength(sam);
  adjustLengths(sam);
  code41240(sam);
  let X = 0;
  do {
    const A = ph(sam, X).index;
    if (A > 80) {
      if (A === PHONEME_END) break;
      sam.error = 'INTERNAL ERROR: Illegal phoneme index';
      return false;
    }
    X = (X + 1) & 0xff;
  } while (X < INPUT_PHONEMES);

  insertBreath(sam);

  prepareOutput(sam);
  if (sam.error !== 'OK') {
    return false;
  }
  return true;
}

// void Code48547()
export function prepareOutput(sam: SamMemory): void {
  let A: number;
  let X = 0;
  let Y = 0;

  // pos48551:
  for (;;) {
    A = ph(sam, X).index;
    if (A === PHONEME_END) {
      out(sam, Y).index = PHONEME_END;
      render(sam);
      return;
    }
    if (A === PHONEME_END_BREATH) {
      X = (X + 1) & 0xff;
      const temp = X;
      out(sam, Y).index = PHONEME_END;
      render(sam);
      X = temp;
      Y = 0;
      continue;
    }

    if (A === 0) {
      X = (X + 1) & 0xff;
      continue;
    }

    out(sam, Y).index = A;
    out(sam, Y).length = ph(sam, X).length;
    out(sam, Y).stress = ph(sam, X).stress;
    out(sam, Y).pitch = ph(sam, X).pitch;
    X = (X + 1) & 0xff;
    Y = (Y + 1) & 0xff;
  }
}

export function insertBreath(sam: SamMemory): void {
  let index = 0;
  let frames = 0;
  for (;;) {
    const phoneme_id = ph(sam, index).index;
    if (phoneme_id === PHONEME_END) return;
    frames = (frames + ph(sam, index).length) & 0xff;
    if (frames >= RENDER_FRAMES - 16) {
      index = (index + 1) & 0xff;
      insert(sam, index, 0, 0, 0, 0);
      // (the C sets frames = 0 here too)
      index = (index + 1) & 0xff;
      insert(sam, index, PHONEME_END_BREATH, 0, 0, 0);
      frames = 0;
    }
    // If phoneme is punctuation, then insert a breath after it.
    else if (phoneme_id < PHONEME_END_BREATH && (flag2(phoneme_id) & 1)) {
      index = (index + 1) & 0xff;
      insert(sam, index, PHONEME_END_BREATH, 0, 0, 0);
      frames = 0;
    }
    index = (index + 1) & 0xff;
  }
}

// Iterates through the phoneme buffer, copying the stress value from the following phoneme where the current phoneme
// is voiced (excluding plosives and fricatives) and the following is a stressed vowel: the stress value + 1 is copied.
// void Code41883()
export function copyStress(sam: SamMemory): void {
  // loop thought all the phonemes to be output
  let pos = 0; // mem66
  for (;;) {
    // get the phomene
    let Y = ph(sam, pos).index;

    // exit at end of buffer
    if (Y === PHONEME_END) return;

    // if CONSONANT_FLAG set, skip - only vowels get stress
    if ((flag(Y) & 64) === 0) { pos = (pos + 1) & 0xff; continue; }
    // get the next phoneme
    Y = ph(sam, pos + 1).index;
    if (Y === PHONEME_END) { // prevent buffer overflow
      pos = (pos + 1) & 0xff; continue;
    } else
    // if the following phoneme is a vowel, skip
    if ((flag(Y) & 128) === 0) { pos = (pos + 1) & 0xff; continue; }

    // get the stress value at the next position
    Y = ph(sam, pos + 1).stress;

    // if next phoneme is not stressed, skip
    if (Y === 0) { pos = (pos + 1) & 0xff; continue; }

    // if next phoneme is not a VOWEL OR ER, skip
    if ((Y & 128) !== 0) { pos = (pos + 1) & 0xff; continue; }

    // copy stress from prior phoneme to this one
    ph(sam, pos).stress = (Y + 1) & 0xff;

    // advance pointer
    pos = (pos + 1) & 0xff;
  }
}

// void Code41014()
/** position, index, length, stress, pitch: unsigned chars — the caller cuts them (`& 0xff`). */
export function insert(sam: SamMemory, position: number /* var57 */, index: number, length: number, stress: number, pitch: number): void {
  for (let i = INPUT_PHONEMES - 3; i >= position; i--) { // ML : always keep last safe-guarding.
    const from = ph(sam, i);
    const to = ph(sam, i + 1);
    to.index = from.index;
    to.length = from.length;
    to.stress = from.stress;
    to.pitch = from.pitch;
  }

  const p = ph(sam, position);
  p.index = index;
  p.length = length;
  p.stress = stress;
  p.pitch = pitch;
}

// The input holds a string of phonemes and stress markers along the lines of "DHAX KAET IHZ AH5GLIY." Each is looked
// for first as a two-character name (signInputTable1[] + signInputTable2[], not ending with '*'), then as a
// one-character name (ending with '*'), then as a stress marker (stressInputTable[]), which goes to the phoneme
// before; "#" and a number sets the pitch of the phonemes after it. On success the phonemes end with PHONEME_END.
export function parser1(sam: SamMemory): boolean {
  let sign1: number;
  let sign2: number;
  let position = 0;
  let X = 0;
  let A: number;
  let Y: number;

  // CLEAR THE STRESS TABLE
  for (let i = 0; i < INPUT_PHONEMES; i++) ph(sam, i).stress = 0;

  // THIS CODE MATCHES THE PHONEME LETTERS TO THE TABLE
  // pos41078:
  phonemes: for (;;) {
    if (position >= INPUT_PHONEMES) {
      // Run out of space for phonemes -- This won't happen with a string from the reciter,
      // but can happen with manually created phonetic input.
      sam.error = 'Phonemes too long';
      return false;
    }
    // TEST FOR END OF STRING
    if (X >= sam.prepare.input_length) {
      // MARK ENDPOINT AND RETURN
      ph(sam, position).index = PHONEME_END; // mark endpoint
      // REACHED END OF PHONEMES, SO EXIT
      return true; // all ok
    }

    // GET THE FIRST CHARACTER FROM THE PHONEME BUFFER
    sign1 = inputAt(sam, X);

    if (sign1 > 96) sign1 = (sign1 - 32) & 0xff;

    // GET THE NEXT CHARACTER FROM THE BUFFER
    X = (X + 1) & 0xff;
    if (X === sam.prepare.input_length) {
      sign2 = 0;
    } else {
      sign2 = inputAt(sam, X);
    }

    if (sign2 > 96) sign2 = (sign2 - 32) & 0xff;

    if (sign1 === 35) { // '#'
      // `unsigned pitch`: 32 bits, wrapping
      let pitch = (sign2 - 48) >>> 0;
      if (pitch > 9) {
        sam.error = 'Illegal pitch';
        return false;
      }
      X = (X + 1) & 0xff;
      while (X < sam.prepare.input_length && ((inputAt(sam, X) - 48) >>> 0) < 10) {
        pitch = Math.imul(pitch, 10) >>> 0;
        pitch = (pitch + (inputAt(sam, X) - 48)) >>> 0;
        X = (X + 1) & 0xff;
      }
      if (pitch > 255) {
        sam.error = 'Illegal pitch';
        return false;
      }
      sam.common.pitch = pitch;
      continue;
    }

    // NOW sign1 = FIRST CHARACTER OF PHONEME, AND sign2 = SECOND CHARACTER OF PHONEME

    // TRY TO MATCH PHONEMES ON TWO TWO-CHARACTER NAME
    // IGNORE PHONEMES IN TABLE ENDING WITH WILDCARDS

    // SET INDEX TO 0
    Y = 0;
    // pos41095:
    do {
      // GET FIRST CHARACTER AT POSITION Y IN signInputTable
      A = at(signInputTable1, Y);

      // FIRST CHARACTER MATCHES?
      if (A === sign1) {
        // GET THE CHARACTER FROM THE PhonemeSecondLetterTable
        A = at(signInputTable2, Y);
        // NOT A SPECIAL AND MATCHES SECOND CHARACTER?
        if (A !== 42 && A === sign2) { // '*'
          // STORE THE INDEX OF THE PHONEME INTO THE phomeneIndexTable
          ph(sam, position).index = Y;
          ph(sam, position).pitch = sam.common.pitch;

          // ADVANCE THE POINTER TO THE phonemeIndexTable
          position = (position + 1) & 0xff;
          // ADVANCE THE POINTER TO THE phonemeInputBuffer
          X = (X + 1) & 0xff;

          // CONTINUE PARSING
          continue phonemes;
        }
      }

      // NO MATCH, TRY TO MATCH ON FIRST CHARACTER TO WILDCARD NAMES (ENDING WITH '*')

      // ADVANCE TO THE NEXT POSITION
      Y = (Y + 1) & 0xff;
      // IF NOT END OF TABLE, CONTINUE
    } while (Y !== 81);

    // REACHED END OF TABLE WITHOUT AN EXACT (2 CHARACTER) MATCH.
    // THIS TIME, SEARCH FOR A 1 CHARACTER MATCH AGAINST THE WILDCARDS

    // RESET THE INDEX TO POINT TO THE START OF THE PHONEME NAME TABLE
    Y = 0;
    // pos41134:
    do {
      // DOES THE PHONEME IN THE TABLE END WITH '*'?
      if (at(signInputTable2, Y) === 42) {
        // DOES THE FIRST CHARACTER MATCH THE FIRST LETTER OF THE PHONEME
        if (at(signInputTable1, Y) === sign1) {
          // SAVE THE POSITION AND MOVE AHEAD
          ph(sam, position).index = Y;
          ph(sam, position).pitch = sam.common.pitch;

          // ADVANCE THE POINTER
          position = (position + 1) & 0xff;

          // CONTINUE THROUGH THE LOOP
          continue phonemes;
        }
      }
      Y = (Y + 1) & 0xff;
    } while (Y !== 81); // 81 is size of PHONEME NAME table

    // FAILED TO MATCH WITH A WILDCARD. ASSUME THIS IS A STRESS
    // CHARACTER. SEARCH THROUGH THE STRESS TABLE

    // SET INDEX TO POSITION 8 (END OF STRESS TABLE)
    Y = 8;

    // WALK BACK THROUGH TABLE LOOKING FOR A MATCH
    while (sign1 !== at(stressInputTable, Y) && Y > 0) {
      // DECREMENT INDEX
      Y = (Y - 1) & 0xff;
    }

    // REACHED THE END OF THE SEARCH WITHOUT BREAKING OUT OF LOOP?
    if (Y === 0) {
      // FAILED TO MATCH ANYTHING, RETURN 0 ON FAILURE
      sam.error = 'Phoneme not understood';
      return false;
    }
    // SET THE STRESS FOR THE PRIOR PHONEME
    if (position === 0) {
      // phoneme_input[-1].stress is the third byte of input_length: the text now "ends" 65536·Y characters on, and
      // the parser reads on to the 0 after the text — which no phoneme is.
      sam.prepare.input_length = (((sam.prepare.input_length >>> 0) & 0xff00ffff) | (Y << 16)) >>> 0;
    } else {
      ph(sam, position - 1).stress = Y;
    }
  } // while
}

// change phonemelength depedendent on stress
// void Code41203()
export function setPhonemeLength(sam: SamMemory): void {
  let A: number;
  let position = 0; // an int
  while (ph(sam, position).index !== PHONEME_END) {
    A = ph(sam, position).stress;
    // 41218: BMI 41229
    if (A === 0 || (A & 128) !== 0) {
      ph(sam, position).length = at(phonemeLengthTable, ph(sam, position).index);
    } else {
      ph(sam, position).length = at(phonemeStressedLengthTable, ph(sam, position).index);
    }
    position++;
  }
}

export function code41240(sam: SamMemory): void {
  let pos = 0;

  while (ph(sam, pos).index !== PHONEME_END) {
    let X = pos;
    const index = ph(sam, pos).index; // register AC
    if ((flag(index) & 2) === 0) {
      pos = (pos + 1) & 0xff;
      continue;
    } else if ((flag(index) & 1) === 0) {
      insert(sam, (pos + 1) & 0xff, (index + 1) & 0xff, at(phonemeLengthTable, index + 1), ph(sam, pos).stress, ph(sam, pos).pitch);
      insert(sam, (pos + 2) & 0xff, (index + 2) & 0xff, at(phonemeLengthTable, index + 2), ph(sam, pos).stress, ph(sam, pos).pitch);
      pos = (pos + 3) & 0xff;
      continue;
    }
    let A: number;
    do {
      X = (X + 1) & 0xff;
      A = ph(sam, X).index;
    } while (A === 0);

    if (A !== PHONEME_END) {
      if ((flag(A) & 8) !== 0) { pos = (pos + 1) & 0xff; continue; }
      if (A === 36 || A === 37) { pos = (pos + 1) & 0xff; continue; } // '/H' '/X'
    }

    insert(sam, (pos + 1) & 0xff, (index + 1) & 0xff, at(phonemeLengthTable, index + 1), ph(sam, pos).stress, ph(sam, pos).pitch);
    insert(sam, (pos + 2) & 0xff, (index + 2) & 0xff, at(phonemeLengthTable, index + 2), ph(sam, pos).stress, ph(sam, pos).pitch);
    pos = (pos + 3) & 0xff;
  }
}

// Rewrites the phonemes using the following rules:
//
//       <DIPHTONG ENDING WITH WX> -> <DIPHTONG ENDING WITH WX> WX
//       <DIPHTONG NOT ENDING WITH WX> -> <DIPHTONG NOT ENDING WITH WX> YX
//       UL -> AX L
//       UM -> AX M
//       <STRESSED VOWEL> <SILENCE> <STRESSED VOWEL> -> <STRESSED VOWEL> <SILENCE> Q <VOWEL>
//       T R -> CH R
//       D R -> J R
//       <VOWEL> R -> <VOWEL> RX
//       <VOWEL> L -> <VOWEL> LX
//       G S -> G Z
//       K <VOWEL OR DIPHTONG NOT ENDING WITH IY> -> KX <VOWEL OR DIPHTONG NOT ENDING WITH IY>
//       G <VOWEL OR DIPHTONG NOT ENDING WITH IY> -> GX <VOWEL OR DIPHTONG NOT ENDING WITH IY>
//       S P -> S B
//       S T -> S D
//       S K -> S G
//       S KX -> S GX
//       <ALVEOLAR> UW -> <ALVEOLAR> UX
//       CH -> CH CH' (CH requires two phonemes to represent it)
//       J -> J J' (J requires two phonemes to represent it)
//       <UNSTRESSED VOWEL> T <PAUSE> -> <UNSTRESSED VOWEL> DX <PAUSE>
//       <UNSTRESSED VOWEL> D <PAUSE>  -> <UNSTRESSED VOWEL> DX <PAUSE>

/** The C's labels inside Parser2's loop, in the order they stand there (a case falls through to the next as the C
 *  runs on from one label into the next). */
const enum L { pos41457, pos41466, pos41487, pos41495, pos41503, pos41611, pos41749, pos41779, pos41788, pos41812 }

// void Code41397()
export function parser2(sam: SamMemory): void {
  let pos = 0; // mem66;
  let mem58: number;

  // Loop through phonemes
  phonemes: for (;;) {
    // SET X TO THE CURRENT POSITION
    let X = pos;
    // GET THE PHONEME AT THE CURRENT POSITION
    let A = ph(sam, pos).index;

    // Is phoneme pause or pitch shift?
    if (A === 0) {
      // Move ahead to the
      pos = (pos + 1) & 0xff;
      continue;
    }

    // If end of phonemes flag reached, exit routine
    if (A === PHONEME_END) return;

    // Copy the current phoneme index to Y
    let Y = A;

    let label: L;

    // RULE:
    //       <DIPHTONG ENDING WITH WX> -> <DIPHTONG ENDING WITH WX> WX
    //       <DIPHTONG NOT ENDING WITH WX> -> <DIPHTONG NOT ENDING WITH WX> YX
    // Example: OIL, COW

    // Check for DIPHTONG
    if ((flag(A) & 16) === 0) {
      label = L.pos41457;
    } else {
      // Not a diphthong. Get the stress
      mem58 = ph(sam, pos).stress;

      // End in IY sound?
      A = flag(Y) & 32;

      // If ends with IY, use YX, else use WX
      if (A === 0) A = 20; else A = 21; // 'WX' = 20 'YX' = 21
      // pos41443:
      // Insert at WX or YX following, copying the stress
      insert(sam, (pos + 1) & 0xff, A, 0, mem58, ph(sam, pos).pitch);
      X = pos;
      // Jump to ???
      label = L.pos41749;
    }

    for (;;) {
      switch (label) {
        case L.pos41457:
          // RULE:
          //       UL -> AX L
          // Example: MEDDLE

          // Get phoneme
          A = ph(sam, X).index;
          // Skip this rule if phoneme is not UL
          if (A !== 78) { label = L.pos41487; continue; } // 'UL'
          A = 24; // 'L'                 //change 'UL' to 'AX L'
          // falls through
        case L.pos41466:
          // Get current phoneme stress
          mem58 = ph(sam, X).stress;

          // Change UL to AX
          ph(sam, X).index = 13; // 'AX'
          // Perform insert. Note code below may jump up here with different values
          insert(sam, (X + 1) & 0xff, A, 0, mem58, ph(sam, X).pitch);
          pos = (pos + 1) & 0xff;
          // Move to next phoneme
          continue phonemes;

        case L.pos41487:
          // RULE:
          //       UM -> AX M
          // Example: ASTRONOMY

          // Skip rule if phoneme != UM
          if (A !== 79) { label = L.pos41495; continue; } // 'UM'
          // Jump up to branch - replaces current phoneme with AX and continues
          A = 27; // 'M'  //change 'UM' to  'AX M'
          label = L.pos41466;
          continue;

        case L.pos41495:
          // RULE:
          //       UN -> AX N
          // Example: FUNCTION

          // Skip rule if phoneme != UN
          if (A !== 80) { label = L.pos41503; continue; } // 'UN'

          // Jump up to branch - replaces current phoneme with AX and continues
          A = 28; // 'N' //change UN to 'AX N'
          label = L.pos41466;
          continue;

        case L.pos41503:
          // RULE:
          //       <STRESSED VOWEL> <SILENCE> <STRESSED VOWEL> -> <STRESSED VOWEL> <SILENCE> Q <VOWEL>
          // EXAMPLE: AWAY EIGHT

          // (the C's `Y = A;` — Y is set again before it is read)
          // VOWEL set?
          A = flag(A) & 128;

          // Skip if not a vowel
          if (A !== 0) {
            // Get the stress
            A = ph(sam, X).stress;

            // If stressed...
            if (A !== 0) {
              // Get the following phoneme
              X = (X + 1) & 0xff;
              A = ph(sam, X).index;
              // If following phoneme is a pause

              if (A === 0) {
                // Get the phoneme following pause
                X = (X + 1) & 0xff;
                Y = ph(sam, X).index;

                // Check for end of buffer flag
                if (Y === PHONEME_END) // buffer overflow
                  // ??? Not sure about these flags
                  A = 65 & 128;
                else
                  // And VOWEL flag to current phoneme's flags
                  A = flag(Y) & 128;

                // If following phonemes is not a pause
                if (A !== 0) {
                  // If the following phoneme is not stressed
                  A = ph(sam, X).stress;
                  if (A !== 0) {
                    // Insert a glottal stop and move forward
                    // 31 = 'Q'
                    insert(sam, X, 31, 0, 0, 0);
                    pos = (pos + 1) & 0xff;
                    continue phonemes;
                  }
                }
              }
            }
          }

          // RULES FOR PHONEMES BEFORE R
          //        T R -> CH R
          // Example: TRACK

          // Get current position and phoneme
          X = pos;
          A = ph(sam, pos).index;
          if (A !== 23) { label = L.pos41611; continue; } // 'R'

          // Look at prior phoneme
          X = (X - 1) & 0xff;
          A = ph(sam, pos - 1).index;
          // pos41567:
          if (A === 69) { // 'T'
            // Change T to CH
            ph(sam, pos - 1).index = 42;
            label = L.pos41779;
            continue;
          }

          // RULES FOR PHONEMES BEFORE R
          //        D R -> J R
          // Example: DRY

          // Prior phonemes D?
          if (A === 57) { // 'D'
            // Change D to J
            ph(sam, pos - 1).index = 44;
            label = L.pos41788;
            continue;
          }

          // RULES FOR PHONEMES BEFORE R
          //        <VOWEL> R -> <VOWEL> RX
          // Example: ART

          // If vowel flag is set change R to RX
          A = flag(A) & 128;
          if (A !== 0) ph(sam, pos).index = 18; // 'RX'

          // continue to next phoneme
          pos = (pos + 1) & 0xff;
          continue phonemes;

        case L.pos41611:
          // RULE:
          //       <VOWEL> L -> <VOWEL> LX
          // Example: ALL

          // Is phoneme L?
          if (A === 24) { // 'L'
            // If prior phoneme does not have VOWEL flag set, move to next phoneme
            if ((flag(ph(sam, pos - 1).index) & 128) === 0) { pos = (pos + 1) & 0xff; continue phonemes; }
            // Prior phoneme has VOWEL flag set, so change L to LX and move to next phoneme
            ph(sam, X).index = 19; // 'LX'
            pos = (pos + 1) & 0xff;
            continue phonemes;
          }

          // RULE:
          //       G S -> G Z
          //
          // Can't get to fire -
          //       1. The G -> GX rule intervenes
          //       2. Reciter already replaces GS -> GZ

          // Is current phoneme S?
          if (A === 32) { // 'S'
            // If prior phoneme is not G, move to next phoneme
            if (ph(sam, pos - 1).index !== 60) { pos = (pos + 1) & 0xff; continue phonemes; }
            // Replace S with Z and move on
            ph(sam, pos).index = 38; // 'Z'
            pos = (pos + 1) & 0xff;
            continue phonemes;
          }

          // RULE:
          //             K <VOWEL OR DIPHTONG NOT ENDING WITH IY> -> KX <VOWEL OR DIPHTONG NOT ENDING WITH IY>
          // Example: COW

          // Is current phoneme K?
          if (A === 72) { // 'K'
            // Get next phoneme
            Y = ph(sam, pos + 1).index;
            // If at end, replace current phoneme with KX
            if (Y === PHONEME_END) ph(sam, pos).index = 75; // ML : prevents an index out of bounds problem
            else {
              // VOWELS AND DIPHTONGS ENDING WITH IY SOUND flag set?
              A = flag(Y) & 32;
              // Replace with KX
              if (A === 0) ph(sam, pos).index = 75; // 'KX'
            }
          } else

          // RULE:
          //             G <VOWEL OR DIPHTONG NOT ENDING WITH IY> -> GX <VOWEL OR DIPHTONG NOT ENDING WITH IY>
          // Example: GO

          // Is character a G?
          if (A === 60) { // 'G'
            // Get the following character
            const index = ph(sam, pos + 1).index;

            // At end of buffer?
            if (index === PHONEME_END) { // prevent buffer overflow
              pos = (pos + 1) & 0xff; continue phonemes;
            } else
            // If diphtong ending with YX, move continue processing next phoneme
            if ((flag(index) & 32) !== 0) { pos = (pos + 1) & 0xff; continue phonemes; }
            // replace G with GX and continue processing next phoneme
            ph(sam, pos).index = 63; // 'GX'
            pos = (pos + 1) & 0xff;
            continue phonemes;
          }

          // RULE:
          //      S P -> S B
          //      S T -> S D
          //      S K -> S G
          //      S KX -> S GX
          // Examples: SPY, STY, SKY, SCOWL

          Y = ph(sam, pos).index;
          // pos41719:
          // Replace with softer version?
          A = flag(Y) & 1;
          if (A === 0) { label = L.pos41749; continue; }
          A = ph(sam, pos - 1).index;
          if (A !== 32) { // 'S'
            A = Y;
            label = L.pos41812;
            continue;
          }
          // Replace with softer version
          ph(sam, pos).index = (Y - 12) & 0xff;
          pos = (pos + 1) & 0xff;
          continue phonemes;

        case L.pos41749:
          // RULE:
          //      <ALVEOLAR> UW -> <ALVEOLAR> UX
          //
          // Example: NEW, DEW, SUE, ZOO, THOO, TOO

          //       UW -> UX

          A = ph(sam, X).index;
          if (A === 53) { // 'UW'
            // ALVEOLAR flag set?
            Y = ph(sam, X - 1).index;
            A = flag2(Y) & 4;
            // If not set, continue processing next phoneme
            if (A === 0) { pos = (pos + 1) & 0xff; continue phonemes; }
            ph(sam, X).index = 16;
            pos = (pos + 1) & 0xff;
            continue phonemes;
          }
          // falls through
        case L.pos41779:
          // RULE:
          //       CH -> CH CH' (CH requires two phonemes to represent it)
          // Example: CHEW

          if (A === 42) { // 'CH'
            //        pos41783:
            insert(sam, (X + 1) & 0xff, (A + 1) & 0xff, 0, ph(sam, X).stress, ph(sam, X).pitch);
            pos = (pos + 1) & 0xff;
            continue phonemes;
          }
          // falls through
        case L.pos41788:
          // RULE:
          //       J -> J J' (J requires two phonemes to represent it)
          // Example: JAY

          if (A === 44) { // 'J'
            insert(sam, (X + 1) & 0xff, (A + 1) & 0xff, 0, ph(sam, X).stress, ph(sam, X).pitch);
            pos = (pos + 1) & 0xff;
            continue phonemes;
          }
          // Jump here to continue
          // falls through
        case L.pos41812:
          // RULE: Soften T following vowel
          // NOTE: This rule fails for cases such as "ODD"
          //       <UNSTRESSED VOWEL> T <PAUSE> -> <UNSTRESSED VOWEL> DX <PAUSE>
          //       <UNSTRESSED VOWEL> D <PAUSE>  -> <UNSTRESSED VOWEL> DX <PAUSE>
          // Example: PARTY, TARDY

          // Past this point, only process if phoneme is T or D

          if (A !== 69) // 'T'
            if (A !== 57) { pos = (pos + 1) & 0xff; continue phonemes; } // 'D'
          // pos41825:

          // If prior phoneme is not a vowel, continue processing phonemes
          if ((flag(ph(sam, X - 1).index) & 128) === 0) { pos = (pos + 1) & 0xff; continue phonemes; }

          // Get next phoneme
          X = (X + 1) & 0xff;
          A = ph(sam, X).index;
          // pos41841
          // Is the next phoneme a pause?
          if (A !== 0) {
            // If next phoneme is not a pause, continue processing phonemes
            if ((flag(A) & 128) === 0) { pos = (pos + 1) & 0xff; continue phonemes; }
            // If next phoneme is stressed, continue processing phonemes
            // FIXME: How does a pause get stressed?
            if (ph(sam, X).stress !== 0) { pos = (pos + 1) & 0xff; continue phonemes; }
            // pos41856:
            // Set phonemes to DX
            ph(sam, pos).index = 30; // 'DX'
          } else {
            A = ph(sam, X + 1).index;
            if (A === PHONEME_END) // prevent buffer overflow
              A = 65 & 128;
            else
              // Is next phoneme a vowel or ER?
              A = flag(A) & 128;
            if (A !== 0) ph(sam, pos).index = 30; // 'DX'
          }

          pos = (pos + 1) & 0xff;
          continue phonemes;
      }
    }
  } // while
}

// Applies various rules that adjust the lengths of phonemes
//
//         Lengthen <FRICATIVE> or <VOICED> between <VOWEL> and <PUNCTUATION> by 1.5
//         <VOWEL> <RX | LX> <CONSONANT> - decrease <VOWEL> length by 1
//         <VOWEL> <UNVOICED PLOSIVE> - decrease vowel by 1/8th
//         <VOWEL> <UNVOICED CONSONANT> - increase vowel by 1/2 + 1
//         <NASAL> <STOP CONSONANT> - set nasal = 5, consonant = 6
//         <VOICED STOP CONSONANT> {optional silence} <STOP CONSONANT> - shorten both to 1/2 + 1
//         <LIQUID CONSONANT> <DIPHTONG> - decrease by 2

// void Code48619()
export function adjustLengths(sam: SamMemory): void {
  // LENGTHEN VOWELS PRECEDING PUNCTUATION
  //
  // Search for punctuation. If found, back up to the first vowel, then
  // process all phonemes between there and up to (but not including) the punctuation.
  // If any phoneme is found that is a either a fricative or voiced, the duration is
  // increased by (length * 1.5) + 1

  // loop index
  let X = 0;
  let index: number;
  let mem56: number;

  // iterate through the phoneme list
  let loopIndex: number;
  punctuation: for (;;) {
    // get a phoneme
    index = ph(sam, X).index;

    // exit loop if end on buffer token
    if (index === PHONEME_END) break;

    // not punctuation?
    if ((flag2(index) & 1) === 0) {
      // skip
      X = (X + 1) & 0xff;
      continue;
    }

    // hold index
    loopIndex = X;

    // Loop backwards from this point
    // pos48644:
    for (;;) {
      // back up one phoneme
      X = (X - 1) & 0xff;

      // stop once the beginning is reached
      if (X === 0) break punctuation;

      // get the preceding phoneme
      index = ph(sam, X).index;

      if (index !== PHONEME_END) // inserted to prevent access overrun
        if ((flag(index) & 128) === 0) continue; // if not a vowel, continue looping
      break;
    }

    // pos48657:
    do {
      // test for vowel
      index = ph(sam, X).index;

      if (index !== PHONEME_END) // inserted to prevent access overrun
        // test for fricative/unvoiced or not voiced
        if ((flag2(index) & 32) === 0 || (flag(index) & 4) !== 0) {
          // get the phoneme length
          let A = ph(sam, X).length;

          // change phoneme length to (length * 1.5) + 1
          A = ((A >> 1) + A + 1) & 0xff;

          ph(sam, X).length = A;
        }
      // keep moving forward
      X = (X + 1) & 0xff;
    } while (X !== loopIndex);
    //	if (X != loopIndex) goto pos48657;
    X = (X + 1) & 0xff;
  } // while

  // Similar to the above routine, but shorten vowels under some circumstances

  // Loop throught all phonemes
  loopIndex = 0;
  // pos48697

  for (;;) {
    // get a phoneme
    X = loopIndex;
    index = ph(sam, X).index;

    // exit routine at end token
    if (index === PHONEME_END) return;

    // vowel?
    let A = flag(index) & 128;
    if (A !== 0) {
      // get next phoneme
      X = (X + 1) & 0xff;
      index = ph(sam, X).index;

      // get flags
      if (index === PHONEME_END)
        mem56 = 65; // use if end marker
      else
        mem56 = flag(index);

      // not a consonant
      if ((flag(index) & 64) === 0) {
        // RX or LX?
        if (index === 18 || index === 19) { // 'RX' & 'LX'
          // get the next phoneme
          X = (X + 1) & 0xff;
          index = ph(sam, X).index;

          // next phoneme a consonant?
          if ((flag(index) & 64) !== 0) {
            // RULE: <VOWEL> RX | LX <CONSONANT>

            // decrease length of vowel by 1 frame
            ph(sam, loopIndex).length = (ph(sam, loopIndex).length - 1) & 0xff;
          }
          // move ahead
          loopIndex = (loopIndex + 1) & 0xff;
          continue;
        }
        // move ahead
        loopIndex = (loopIndex + 1) & 0xff;
        continue;
      }

      // Got here if not <VOWEL>

      // not voiced
      if ((mem56 & 4) === 0) {
        // Unvoiced
        // *, .*, ?*, ,*, -*, DX, S*, SH, F*, TH, /H, /X, CH, P*, T*, K*, KX

        // not an unvoiced plosive?
        if ((mem56 & 1) === 0) {
          // move ahead
          loopIndex = (loopIndex + 1) & 0xff;
          continue;
        }

        // P*, T*, K*, KX

        // RULE: <VOWEL> <UNVOICED PLOSIVE>
        // <VOWEL> <P*, T*, K*, KX>

        // move back
        X = (X - 1) & 0xff;

        // decrease length by 1/8th
        mem56 = ph(sam, X).length >> 3;
        ph(sam, X).length = (ph(sam, X).length - mem56) & 0xff;

        // move ahead
        loopIndex = (loopIndex + 1) & 0xff;
        continue;
      }

      // RULE: <VOWEL> <VOICED CONSONANT>
      // <VOWEL> <WH, R*, L*, W*, Y*, M*, N*, NX, DX, Q*, Z*, ZH, V*, DH, J*, B*, D*, G*, GX>

      // decrease length
      A = ph(sam, X - 1).length;
      ph(sam, X - 1).length = ((A >> 2) + A + 1) & 0xff; // 5/4*A + 1

      // move ahead
      loopIndex = (loopIndex + 1) & 0xff;
      continue;
    }

    // WH, R*, L*, W*, Y*, M*, N*, NX, Q*, Z*, ZH, V*, DH, J*, B*, D*, G*, GX

    // pos48821:

    // RULE: <NASAL> <STOP CONSONANT>
    //       Set punctuation length to 6
    //       Set stop consonant length to 5

    // nasal?
    if ((flag2(index) & 8) !== 0) {
      // M*, N*, NX,

      // get the next phoneme
      X = (X + 1) & 0xff;
      index = ph(sam, X).index;

      // end of buffer?
      if (index === PHONEME_END)
        A = 65 & 2; // prevent buffer overflow
      else
        A = flag(index) & 2; // check for stop consonant

      // is next phoneme a stop consonant?
      if (A !== 0) {
        // B*, D*, G*, GX, P*, T*, K*, KX

        // set stop consonant length to 6
        ph(sam, X).length = 6;

        // set nasal length to 5
        ph(sam, X - 1).length = 5;
      }
      // move to next phoneme
      loopIndex = (loopIndex + 1) & 0xff;
      continue;
    }

    // WH, R*, L*, W*, Y*, Q*, Z*, ZH, V*, DH, J*, B*, D*, G*, GX

    // RULE: <VOICED STOP CONSONANT> {optional silence} <STOP CONSONANT>
    //       Shorten both to (length/2 + 1)

    // (voiced) stop consonant?
    if ((flag(index) & 2) !== 0) {
      // B*, D*, G*, GX

      // move past silence
      do {
        // move ahead
        X = (X + 1) & 0xff;
        index = ph(sam, X).index;
      } while (index === 0);

      // check for end of buffer
      if (index === PHONEME_END) { // buffer overflow
        // ignore, overflow code
        // (the C's `if ((65 & 2) == 0)`: always so)
        loopIndex = (loopIndex + 1) & 0xff;
        continue;
      } else if ((flag(index) & 2) === 0) {
        // if another stop consonant, move ahead
        loopIndex = (loopIndex + 1) & 0xff;
        continue;
      }

      // RULE: <UNVOICED STOP CONSONANT> {optional silence} <STOP CONSONANT>

      // shorten the prior phoneme length to (length/2 + 1)
      ph(sam, X).length = ((ph(sam, X).length >> 1) + 1) & 0xff;
      // (the C's `X = loopIndex;` — X is set again before it is read)

      // also shorten this phoneme length to (length/2 +1)
      ph(sam, loopIndex).length = ((ph(sam, loopIndex).length >> 1) + 1) & 0xff;

      // move ahead
      loopIndex = (loopIndex + 1) & 0xff;
      continue;
    }

    // WH, R*, L*, W*, Y*, Q*, Z*, ZH, V*, DH, J*, **,

    // RULE: <VOICED NON-VOWEL> <DIPHTONG>
    //       Decrease <DIPHTONG> by 2

    // liquic consonant?
    if ((flag2(index) & 16) !== 0) {
      // R*, L*, W*, Y*

      // get the prior phoneme
      index = ph(sam, X - 1).index;

      // prior phoneme a stop consonant>
      if ((flag(index) & 2) !== 0)
        // Rule: <LIQUID CONSONANT> <DIPHTONG>

        // decrease the phoneme length by 2 frames (20 ms)
        ph(sam, X).length = (ph(sam, X).length - 2) & 0xff;
    }

    // move to next phoneme
    loopIndex = (loopIndex + 1) & 0xff;
    continue;
  }
  //            goto pos48701;
}
