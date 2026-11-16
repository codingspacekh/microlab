/**
 * SAM's "reciter": English text → phonemes.
 *
 * This file follows lib/sam/reciter.c of micropython-microbit-v2 v2.1.2 line by line. The C is a
 * disassembly of the 6502 original, full of gotos; here every C label (pos36554, pos36700, …) is one
 * `case` of a state machine — `pos = N; continue main;` is C's `goto posN;` — and the names
 * (A, X, Y, mem56 … mem66, inputtemp) are the C's, so the two can be read side by side.
 * Every `unsigned char` is kept in 0–255 by hand (`& 0xff`), `mem62` (unsigned short) in 0–65535.
 */
import { rules, rules2, tab36376, tab37489, tab37515 } from './tables';

/** C's INPUT_PHONEMES: the size of mem->input and of mem->inputtemp. */
const INPUT_PHONEMES = 128;

// C: static unsigned char A, X, Y;  (Code37055 / Code37066 leave their results in them)
let A = 0;
let X = 0;
let Y = 0;

/** Every C label that is the target of a goto (and 36550, where the labels begin). */
type Pos =
  | 36550 | 36554 | 36654 | 36677 | 36700 | 36791
  | 36895 | 36905 | 36910 | 36920 | 36930 | 36935 | 36967 | 37004 | 37014 | 37019 | 37040
  | 37077 | 37108 | 37113 | 37135 | 37157 | 37180 | 37184 | 37226
  | 37295 | 37305 | 37310 | 37320 | 37330 | 37335 | 37367 | 37404 | 37414 | 37419 | 37440
  | 37455 | 37461 | 37485;

/** tab36376[i]; past the table's end (undefined in C) it is 0. */
function tab(i: number): number {
  return tab36376[i] ?? 0;
}

/** mem->inputtemp[i]; past its end (undefined in C) it is 0. */
function at(inputtemp: Uint8Array, i: number): number {
  return inputtemp[i] ?? 0;
}

function Code37055(inputtemp: Uint8Array, mem59: number): void {
  X = mem59;
  X = (X - 1) & 0xff;
  A = at(inputtemp, X);
  Y = A;
  A = tab(Y);
}

function Code37066(inputtemp: Uint8Array, mem58: number): void {
  X = mem58;
  X = (X + 1) & 0xff;
  A = at(inputtemp, X);
  Y = A;
  A = tab(Y);
}

function GetRuleByte(mem62: number, Y: number): number {
  let address = mem62;

  if (mem62 >= 37541) {
    address -= 37541;
    return rules2[address + Y] ?? 0;
  }
  address -= 32000;
  return rules[address + Y] ?? 0;
}

/**
 * C's TextToPhonemes(reciter_memory*): `input` is mem->input (128 bytes, changed in place: the text
 * ending in '[' goes in, the phonemes ending in the byte 155 come out); returns false where C returns 0.
 *
 * In C, mem->inputtemp lies straight after mem->input in reciter_memory, and the phonemes are written
 * with an unsigned char index that is not checked everywhere — so more than 128 bytes of phonemes run
 * on into inputtemp (the text still being read). That is kept: a write to input[128 + i] goes to
 * inputtemp[i]. If `input` has 256 bytes or more it is taken as the whole reciter_memory (its bytes
 * 128–255 are inputtemp), so that a caller can read on past byte 127 as modspeech.c's translate does.
 */
export function textToPhonemes(input: Uint8Array): boolean {
  const inputtemp =
    input.length >= 2 * INPUT_PHONEMES ? input.subarray(INPUT_PHONEMES, 2 * INPUT_PHONEMES) : new Uint8Array(INPUT_PHONEMES);
  /** mem->input[i] = v, for an unsigned char i. */
  const setInput = (i: number, v: number): void => {
    if (i < INPUT_PHONEMES) input[i] = v;
    else inputtemp[i - INPUT_PHONEMES] = v;
  };

  let mem56 = 0; // output position for phonemes
  let mem57 = 0;
  let mem58 = 0;
  let mem59 = 0;
  let mem60 = 0;
  let mem61: number;
  let mem62 = 0; // memory position of current rule (unsigned short)

  let mem64 = 0; // position of '=' or current character
  let mem65 = 0; // position of ')'
  let mem66 = 0; // position of '('
  // mem36653 is written once in C (pos36654) and never read: left out.

  inputtemp[0] = 32;

  // secure copy of input
  // because input will be overwritten by phonemes
  X = 1;
  Y = 0;
  do {
    //pos36499:
    A = (input[Y] ?? 0) & 127;
    if (A >= 112) A = A & 95;
    else if (A >= 96) A = A & 79;

    inputtemp[X] = A;
    X = (X + 1) & 0xff;
    Y = (Y + 1) & 0xff;
  } while (Y !== INPUT_PHONEMES - 1);

  inputtemp[INPUT_PHONEMES - 1] = 27;
  mem61 = 255; // -1

  let pos: Pos = 36550;
  main: for (;;) {
    switch (pos) {
      case 36550:
        A = 255;
        mem56 = 255; // -1
        pos = 36554;
        continue main;

      case 36554:
        for (;;) {
          mem61 = (mem61 + 1) & 0xff;
          X = mem61;
          A = at(inputtemp, X);
          mem64 = A;
          if (A === 91) { // '['
            mem56 = (mem56 + 1) & 0xff;
            X = mem56;
            A = 155;
            setInput(X, 155);
            return true;
          }

          //pos36579:
          if (A !== 46) break; // '.'
          X = (X + 1) & 0xff;
          Y = at(inputtemp, X);
          A = tab(Y) & 1;
          if (A !== 0) break;
          mem56 = (mem56 + 1) & 0xff;
          X = mem56;
          A = 46;
          setInput(X, 46);
        } //while

        //pos36607:
        A = mem64;
        Y = A;
        A = tab(A);
        mem57 = A;
        if ((A & 2) !== 0) {
          mem62 = 37541;
          pos = 36700;
          continue main;
        }

        //pos36630:
        A = mem57;
        if (A !== 0) { pos = 36677; continue main; }
        A = 32;
        inputtemp[X] = 32; // ' '
        mem56 = (mem56 + 1) & 0xff;
        X = mem56;
        if (X > 120) { pos = 36654; continue main; }
        setInput(X, A);
        pos = 36554;
        continue main;

      // -----

      case 36654:
        setInput(X, 155);
        A = mem61;
        // mem36653 = A;
        return true;
        // (C has two more lines here that are never reached: mem61 = mem36653; goto pos36550;)

      case 36677:
        A = mem57 & 128;
        if (A === 0) {
          //36683: BRK   (C: sam_error = "Err 36683")
          return false;
        }

        // go to the right rules for this character.
        X = (mem64 - 65) & 0xff; // 'A'
        mem62 = ((tab37489[X] ?? 0) | ((tab37515[X] ?? 0) << 8)) & 0xffff;
        pos = 36700;
        continue main;

      // -------------------------------------
      // go to next rule
      // -------------------------------------

      case 36700:
        // find next rule
        Y = 0;
        do {
          mem62 = (mem62 + 1) & 0xffff;
          A = GetRuleByte(mem62, Y);
        } while ((A & 128) === 0);
        Y = (Y + 1) & 0xff;

        //pos36720:
        // find '('
        for (;;) {
          A = GetRuleByte(mem62, Y);
          if (A === 40) break; // '('
          Y = (Y + 1) & 0xff;
        }
        mem66 = Y;

        //pos36732:
        // find ')'
        do {
          Y = (Y + 1) & 0xff;
          A = GetRuleByte(mem62, Y);
        } while (A !== 41); // ')'
        mem65 = Y;

        //pos36741:
        // find '='
        do {
          Y = (Y + 1) & 0xff;
          A = GetRuleByte(mem62, Y);
          A = A & 127;
        } while (A !== 61); // '='
        mem64 = Y;

        X = mem61;
        mem60 = X;

        // compare the string within the bracket
        Y = mem66;
        Y = (Y + 1) & 0xff;
        //pos36759:
        for (;;) {
          mem57 = at(inputtemp, X);
          A = GetRuleByte(mem62, Y);
          if (A !== mem57) { pos = 36700; continue main; }
          Y = (Y + 1) & 0xff;
          if (Y === mem65) break;
          X = (X + 1) & 0xff;
          mem60 = X;
        }

        // the string in the bracket is correct

        //pos36787:
        A = mem61;
        mem59 = mem61;
        pos = 36791;
        continue main;

      case 36791:
        for (;;) {
          mem66 = (mem66 - 1) & 0xff;
          Y = mem66;
          A = GetRuleByte(mem62, Y);
          mem57 = A;
          //36800: BPL 36805
          if ((A & 128) !== 0) { pos = 37180; continue main; }
          X = A & 127;
          A = tab(X) & 128;
          if (A === 0) break;
          X = (mem59 - 1) & 0xff;
          A = at(inputtemp, X);
          if (A !== mem57) { pos = 36700; continue main; }
          mem59 = X;
        }

        //pos36833:
        A = mem57;
        if (A === 32) { pos = 36895; continue main; } // ' '
        if (A === 35) { pos = 36910; continue main; } // '#'
        if (A === 46) { pos = 36920; continue main; } // '.'
        if (A === 38) { pos = 36935; continue main; } // '&'
        if (A === 64) { pos = 36967; continue main; } // '@'
        if (A === 94) { pos = 37004; continue main; } // '^'
        if (A === 43) { pos = 37019; continue main; } // '+'
        if (A === 58) { pos = 37040; continue main; } // ':'
        //36894: BRK   (C: sam_error = "Err 36894")
        return false;

      // --------------

      case 36895:
        Code37055(inputtemp, mem59);
        A = A & 128;
        if (A !== 0) { pos = 36700; continue main; }
        pos = 36905;
        continue main;
      case 36905:
        mem59 = X;
        pos = 36791;
        continue main;

      // --------------

      case 36910:
        Code37055(inputtemp, mem59);
        A = A & 64;
        if (A !== 0) { pos = 36905; continue main; }
        pos = 36700;
        continue main;

      // --------------

      case 36920:
        Code37055(inputtemp, mem59);
        A = A & 8;
        if (A === 0) { pos = 36700; continue main; }
        pos = 36930;
        continue main;
      case 36930:
        mem59 = X;
        pos = 36791;
        continue main;

      // --------------

      case 36935:
        Code37055(inputtemp, mem59);
        A = A & 16;
        if (A !== 0) { pos = 36930; continue main; }
        A = at(inputtemp, X);
        if (A !== 72) { pos = 36700; continue main; }
        X = (X - 1) & 0xff;
        A = at(inputtemp, X);
        if (A === 67 || A === 83) { pos = 36930; continue main; }
        pos = 36700;
        continue main;

      // --------------

      case 36967:
        Code37055(inputtemp, mem59);
        A = A & 4;
        if (A !== 0) { pos = 36930; continue main; }
        A = at(inputtemp, X);
        if (A !== 72) { pos = 36700; continue main; }
        // C goes on:  if ((A != 84) && (A != 67) && (A != 83)) goto pos36700;  mem59 = X;  goto pos36791;
        // A is 72 here, so that `if` is always taken and the two statements after it never run
        // (and TypeScript refuses a comparison of 72 with 84): it is the plain goto.
        pos = 36700;
        continue main;

      // --------------

      case 37004:
        Code37055(inputtemp, mem59);
        A = A & 32;
        if (A === 0) { pos = 36700; continue main; }
        pos = 37014;
        continue main;

      case 37014:
        mem59 = X;
        pos = 36791;
        continue main;

      // --------------

      case 37019:
        X = mem59;
        X = (X - 1) & 0xff;
        A = at(inputtemp, X);
        if (A === 69 || A === 73 || A === 89) { pos = 37014; continue main; } // 'E' 'I' 'Y'
        pos = 36700;
        continue main;

      // --------------

      case 37040:
        Code37055(inputtemp, mem59);
        A = A & 32;
        if (A === 0) { pos = 36791; continue main; }
        mem59 = X;
        pos = 37040;
        continue main;

      //---------------------------------------

      case 37077:
        X = (mem58 + 1) & 0xff;
        A = at(inputtemp, X);
        if (A !== 69) { pos = 37157; continue main; } // 'E'
        X = (X + 1) & 0xff;
        Y = at(inputtemp, X);
        X = (X - 1) & 0xff;
        A = tab(Y) & 128;
        if (A === 0) { pos = 37108; continue main; }
        X = (X + 1) & 0xff;
        A = at(inputtemp, X);
        if (A !== 82) { pos = 37113; continue main; } // 'R'
        pos = 37108;
        continue main;
      case 37108:
        mem58 = X;
        pos = 37184;
        continue main;
      case 37113:
        if (A === 83 || A === 68) { pos = 37108; continue main; } // 'S' 'D'
        if (A !== 76) { pos = 37135; continue main; } // 'L'
        X = (X + 1) & 0xff;
        A = at(inputtemp, X);
        if (A !== 89) { pos = 36700; continue main; }
        pos = 37108;
        continue main;

      case 37135:
        if (A !== 70) { pos = 36700; continue main; }
        X = (X + 1) & 0xff;
        A = at(inputtemp, X);
        if (A !== 85) { pos = 36700; continue main; }
        X = (X + 1) & 0xff;
        A = at(inputtemp, X);
        if (A === 76) { pos = 37108; continue main; }
        pos = 36700;
        continue main;

      case 37157:
        if (A !== 73) { pos = 36700; continue main; }
        X = (X + 1) & 0xff;
        A = at(inputtemp, X);
        if (A !== 78) { pos = 36700; continue main; }
        X = (X + 1) & 0xff;
        A = at(inputtemp, X);
        if (A === 71) { pos = 37108; continue main; }
        //pos37177:
        pos = 36700;
        continue main;

      // -----------------------------------------

      case 37180:
        A = mem60;
        mem58 = A;
        pos = 37184;
        continue main;

      case 37184:
        Y = (mem65 + 1) & 0xff;

        //37187: CPY 64
        if (Y === mem64) { pos = 37455; continue main; }
        mem65 = Y;
        //37196: LDA (62),y
        A = GetRuleByte(mem62, Y);
        mem57 = A;
        X = A;
        A = tab(X) & 128;
        if (A === 0) { pos = 37226; continue main; }
        X = (mem58 + 1) & 0xff;
        A = at(inputtemp, X);
        if (A !== mem57) { pos = 36700; continue main; }
        mem58 = X;
        pos = 37184;
        continue main;
      case 37226:
        A = mem57;
        if (A === 32) { pos = 37295; continue main; } // ' '
        if (A === 35) { pos = 37310; continue main; } // '#'
        if (A === 46) { pos = 37320; continue main; } // '.'
        if (A === 38) { pos = 37335; continue main; } // '&'
        if (A === 64) { pos = 37367; continue main; } // '@'
        if (A === 94) { pos = 37404; continue main; } // '^'
        if (A === 43) { pos = 37419; continue main; } // '+'
        if (A === 58) { pos = 37440; continue main; } // ':'
        if (A === 37) { pos = 37077; continue main; } // '%'
        //pos37291:
        //37294: BRK   (C: sam_error = "Err 36894")
        return false;

      // --------------
      case 37295:
        Code37066(inputtemp, mem58);
        A = A & 128;
        if (A !== 0) { pos = 36700; continue main; }
        pos = 37305;
        continue main;
      case 37305:
        mem58 = X;
        pos = 37184;
        continue main;

      // --------------

      case 37310:
        Code37066(inputtemp, mem58);
        A = A & 64;
        if (A !== 0) { pos = 37305; continue main; }
        pos = 36700;
        continue main;

      // --------------

      case 37320:
        Code37066(inputtemp, mem58);
        A = A & 8;
        if (A === 0) { pos = 36700; continue main; }
        pos = 37330;
        continue main;

      case 37330:
        mem58 = X;
        pos = 37184;
        continue main;

      // --------------

      case 37335:
        Code37066(inputtemp, mem58);
        A = A & 16;
        if (A !== 0) { pos = 37330; continue main; }
        A = at(inputtemp, X);
        if (A !== 72) { pos = 36700; continue main; }
        X = (X + 1) & 0xff;
        A = at(inputtemp, X);
        if (A === 67 || A === 83) { pos = 37330; continue main; }
        pos = 36700;
        continue main;

      // --------------

      case 37367:
        Code37066(inputtemp, mem58);
        A = A & 4;
        if (A !== 0) { pos = 37330; continue main; }
        A = at(inputtemp, X);
        if (A !== 72) { pos = 36700; continue main; }
        // C goes on:  if ((A != 84) && (A != 67) && (A != 83)) goto pos36700;  mem58 = X;  goto pos37184;
        // A is 72 here, so that `if` is always taken and the two statements after it never run
        // (and TypeScript refuses a comparison of 72 with 84): it is the plain goto.
        pos = 36700;
        continue main;

      // --------------

      case 37404:
        Code37066(inputtemp, mem58);
        A = A & 32;
        if (A === 0) { pos = 36700; continue main; }
        pos = 37414;
        continue main;
      case 37414:
        mem58 = X;
        pos = 37184;
        continue main;

      // --------------

      case 37419:
        X = mem58;
        X = (X + 1) & 0xff;
        A = at(inputtemp, X);
        if (A === 69 || A === 73 || A === 89) { pos = 37414; continue main; }
        pos = 36700;
        continue main;

      // ----------------------

      case 37440:
        Code37066(inputtemp, mem58);
        A = A & 32;
        if (A === 0) { pos = 37184; continue main; }
        mem58 = X;
        pos = 37440;
        continue main;
      case 37455:
        Y = mem64;
        mem61 = mem60;
        pos = 37461;
        continue main;

      case 37461:
        //37461: LDA (62),y
        A = GetRuleByte(mem62, Y);
        mem57 = A;
        A = A & 127;
        if (A !== 61) { // '='
          mem56 = (mem56 + 1) & 0xff;
          X = mem56;
          setInput(X, A);
        }

        //37478: BIT 57
        //37480: BPL 37485  //not negative flag
        if ((mem57 & 128) === 0) { pos = 37485; continue main; } //???
        pos = 36554;
        continue main;
      case 37485:
        Y = (Y + 1) & 0xff;
        pos = 37461;
        continue main;
    }
  }
}
