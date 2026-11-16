/**
 * SAM's renderer: the phoneme list → frames of formant frequencies, amplitudes and pitch → samples.
 * It follows lib/sam/render.c of micropython-microbit-v2 v2.1.2 function by function, with C's names for the
 * functions and the variables (the 6502's A, X, Y and memory cells), so the two can be read side by side.
 * Every `unsigned char` is kept 0–255 (`& 0xff`); the frames' bit-fields are cut where they are written.
 * Where the C has a `goto`, the comment beside the loop or flag that stands for it names the label.
 */
import { OUTPUT_PHONEMES, PHONEME_END, RENDER_FRAMES, type SamMemory } from './types';
import {
  amplitudeRescale, ampl1data, ampl2data, ampl3data, blendRank, freq1data, freq2data, freq3data, inBlendLength,
  multtable, outBlendLength, rectangle, sampledConsonantFlags, sampleTable, sinus, tab47492, tab48426,
} from './tables';

/** A table read; past the table's end (undefined in C) it reads 0. */
const at = (t: Uint8Array, i: number): number => t[i] ?? 0;

// phoneme_output[i]'s fields. Past the list's end (undefined in C) the index reads PHONEME_END — the transitions'
// loop ends only at that — and the other fields 0.
const poIndex = (sam: SamMemory, i: number): number => sam.common.phoneme_output[i]?.index ?? PHONEME_END;
const poLength = (sam: SamMemory, i: number): number => sam.common.phoneme_output[i]?.length ?? 0;
const poStress = (sam: SamMemory, i: number): number => sam.common.phoneme_output[i]?.stress ?? 0;
const poPitch = (sam: SamMemory, i: number): number => sam.common.phoneme_output[i]?.pitch ?? 0;

//timetable for more accurate c64 simulation — C's timetable[5][5], row after row
const timetable = new Uint8Array([
  162, 167, 167, 127, 128,
  226, 60, 60, 0, 0,
  225, 60, 59, 0, 0,
  200, 0, 0, 54, 55,
  199, 0, 0, 54, 54,
]);

/** Output()'s `static unsigned oldtimetableindex`: C never puts it back to 0. */
let oldtimetableindex = 0;

/** Every variable render.c keeps between calls, back at its C start value. */
export function resetRenderState(): void {
  oldtimetableindex = 0;
}

function Output(sam: SamMemory, index: number, A: number): void {
  sam.bufferpos += at(timetable, oldtimetableindex * 5 + index);
  oldtimetableindex = index;
  sam.output(sam.bufferpos, (A & 15) * 16);
}

//written by me because of different table positions.
// mem[47] = ...
// 168=pitches
// 169=frequency1
// 170=frequency2
// 171=frequency3
// 172=amplitude1
// 173=amplitude2
// 174=amplitude3
function Read(sam: SamMemory, p: number, Y: number): number {
  if (p > RENDER_FRAMES) {
    sam.error = 'Out-of-buffer read';
    return 0;
  }
  switch (p) {
    case 168: return at(sam.render.pitch, Y);
    case 169: return at(sam.render.freq1, Y);
    case 170: return at(sam.render.freq2, Y);
    case 171: return at(sam.render.freq3, Y);
    case 172: return at(sam.render.amp1, Y);
    case 173: return at(sam.render.amp2, Y);
    case 174: return at(sam.render.amp3, Y);
  }
  sam.error = 'Read error';
  return 0;
}

/** The bit-fields of C's render_freq_amp_t are cut here: freq1 6 bits, freq2 and freq3 7, each amp 4. */
function Write(sam: SamMemory, p: number, Y: number, value: number): void {
  if (p > RENDER_FRAMES) {
    sam.error = 'Out-of-buffer write';
    return;
  }
  switch (p) {
    case 168: sam.render.pitch[Y] = value & 0xff; return;
    case 169: sam.render.freq1[Y] = value & 63; return;
    case 170: sam.render.freq2[Y] = value & 127; return;
    case 171: sam.render.freq3[Y] = value & 127; return;
    case 172: sam.render.amp1[Y] = value & 15; return;
    case 173: sam.render.amp2[Y] = value & 15; return;
    case 174: sam.render.amp3[Y] = value & 15; return;
  }
  sam.error = 'Write error';
}

// -------------------------------------------------------------------------
//Code48227
// Render a sampled sound from the sampleTable. (See render.c for the table of phonemes and sample ranges.)
// `mem66` is C's `unsigned char *mem66`.
function RenderSample(sam: SamMemory, mem66: { v: number }, sample: number, pos: number): number {
  let tempA: number;
  // current phoneme's index
  const mem49 = pos & 0xff;
  let mem56: number;

  // mask low three bits and subtract 1 get value to
  // convert 0 bits on unvoiced samples.
  let A = sample & 7;
  let X = (A - 1) & 0xff;

  // get value from the table
  if (X >= tab48426.length) {
    sam.error = 'Out-of-buffer read';
  }
  const mem53 = at(tab48426, X);
  const mem47 = X; //46016+mem[56]*256

  // voiced sample?
  A = sample & 248;
  if (A === 0) {
    // voiced phoneme: Z*, ZH, V*, DH
    // (C: `pos = mem49;` — written over below before it is read)
    A = at(sam.render.pitch, 9) >> 4;

    // jump to voiced portion — pos48315:
    // handle voiced samples here

    // number of samples?
    let phase1 = (A ^ 255) & 0xff;

    pos = mem66.v & 0xff;
    do {
      //pos48321:

      // shift through all 8 bits
      mem56 = 8;

      // fetch value from table
      A = at(sampleTable, mem47 * 256 + pos);

      // loop 8 times
      //pos48327:
      do {
        // left shift and check high bit
        tempA = A;
        A = (A << 1) & 0xff;
        if ((tempA & 128) !== 0) {
          // if bit set, output 26
          X = 26;
          Output(sam, 3, X);
        } else {
          //timetable 4
          // bit is not set, output a 6
          X = 6;
          Output(sam, 4, X);
        }

        mem56 = (mem56 - 1) & 0xff;
      } while (mem56 !== 0);

      // move ahead in the table
      pos = (pos + 1) & 0xff;

      // continue until counter done
      phase1 = (phase1 + 1) & 0xff;
    } while (phase1 !== 0);

    // restore values and return
    mem66.v = pos;
    pos = mem49;
    return pos;
  }

  pos = (A ^ 255) & 0xff;
  do { // pos48274:
    // step through the 8 bits in the sample
    mem56 = 8;

    // get the next sample from the table
    // mem47*256 = offset to start of samples
    A = at(sampleTable, mem47 * 256 + pos);
    do { // pos48280:
      /** C's `goto pos48296`: the byte for a 0 bit was not 0, so no 5 follows it. */
      let to48296 = false;

      // left shift to get the high bit
      tempA = A;
      A = (A << 1) & 0xff;
      //48281: BCC 48290

      // bit not set?
      if ((tempA & 128) === 0) {
        // convert the bit to value from table
        X = mem53;
        // output the byte
        Output(sam, 1, X);
        // if X != 0, exit loop
        if (X !== 0) to48296 = true;
      }

      // output a 5 for the on bit
      if (!to48296) Output(sam, 2, 5);

      // pos48296:
      // (C: `X = 0;` — never read: X is set again before its next use)

      // decrement counter
      mem56 = (mem56 - 1) & 0xff;

      // if not done, jump to top of loop
    } while (mem56 !== 0);

    // increment position
    pos = (pos + 1) & 0xff;
  } while (pos !== 0);

  // restore values and return
  pos = mem49;
  return pos;
}

// RENDER THE PHONEMES IN THE LIST
//
// The phoneme list is converted into sound through the steps:
//
// 1. Copy each phoneme <length> number of times into the frames list,
//    where each frame represents 10 milliseconds of sound.
//
// 2. Determine the transitions lengths between phonemes, and linearly
//    interpolate the values across the frames.
//
// 3. Offset the pitches by the fundamental frequency.
//
// 4. Render the each frame.

//void Code47574()
export function render(sam: SamMemory): void {
  let phase1 = 0; //mem43
  let phase2: number;
  let phase3: number;
  let mem38: number;
  let mem40: number;
  let speedcounter: number; //mem45
  let mem47: number;
  let mem48: number;
  let mem49: number;
  let mem50: number;
  let mem51: number;
  let mem53: number;
  let mem56: number;
  let mem44 = 0;
  let i: number;
  if (poIndex(sam, 0) === PHONEME_END) return; //exit if no data

  let A: number; // (C: `= 0`, written over before it is read)
  let X = 0;

  // CREATE FRAMES
  //
  // The length parameter in the list corresponds to the number of frames
  // to expand the phoneme to. The parameters are copied from the phoneme to the frame verbatim.

  do {
    // get the index
    let Y = mem44;
    // get the phoneme at the index
    A = poIndex(sam, mem44);
    mem56 = A;

    // if terminal phoneme, exit the loop
    if (A === PHONEME_END) break;

    // period phoneme *.
    if (A === 1) {
      // add rising inflection
      A = 1;
      mem48 = 1;
      //goto pos48376;
      AddInflection(sam, mem48, phase1, X);
    }

    // question mark phoneme?
    if (A === 2) {
      // create falling inflection
      mem48 = 255;
      AddInflection(sam, mem48, phase1, X);
    }
    //	pos47615:

    // get the stress amount (more stress = higher pitch)
    phase1 = at(tab47492, poStress(sam, Y) + 1);

    // get number of frames to write
    phase2 = poLength(sam, Y) & 0xff;
    const pitch = poPitch(sam, Y) & 0xff;
    Y = mem56;

    // copy from the source to the frames list (the bit-fields cut as the C struct cuts them)
    do {
      sam.render.freq1[X] = get_freq1(Y, sam.common.mouth) & 63; // F1 frequency
      sam.render.freq2[X] = get_freq2(Y, sam.common.throat) & 127; // F2 frequency
      sam.render.freq3[X] = at(freq3data, Y) & 127; // F3 frequency
      sam.render.amp1[X] = at(ampl1data, Y) & 15; // F1 amplitude
      sam.render.amp2[X] = at(ampl2data, Y) & 15; // F2 amplitude
      sam.render.amp3[X] = at(ampl3data, Y) & 15; // F3 amplitude
      sam.render.flags[X] = at(sampledConsonantFlags, Y); // phoneme data for sampled consonants
      sam.render.pitch[X] = (pitch + phase1) & 0xff; // pitch
      X = (X + 1) & 0xff;
      phase2 = (phase2 - 1) & 0xff;
    } while (phase2 !== 0);
    mem44 = (mem44 + 1) & 0xff;
  } while (mem44 !== OUTPUT_PHONEMES);

  // -------------------
  //pos47694:

  // CREATE TRANSITIONS (render.c explains the blend ranks and lengths at length)

  // (C: `A = 0;` — written over before it is read)
  mem44 = 0;
  mem49 = 0; // mem49 starts at as 0
  X = 0;
  for (;;) { //while No. 1
    // get the current and following phoneme
    let Y = poIndex(sam, X);
    A = poIndex(sam, X + 1);
    // (C: `X++;` — never read: X is set again just below, or the loop is left and X is not used after it)

    // exit loop at end token
    if (A === PHONEME_END) break; //goto pos47970;

    // get the ranking of each phoneme
    X = A;
    mem56 = at(blendRank, A);
    A = at(blendRank, Y);

    // compare the rank - lower rank value is stronger
    if (A === mem56) {
      // same rank, so use out blend lengths from each phoneme
      phase1 = at(outBlendLength, Y);
      phase2 = at(outBlendLength, X);
    } else if (A < mem56) {
      // first phoneme is stronger, so us it's blend lengths
      phase1 = at(inBlendLength, X);
      phase2 = at(outBlendLength, X);
    } else {
      // second phoneme is stronger, so use it's blend lengths
      // note the out/in are swapped
      phase1 = at(outBlendLength, Y);
      phase2 = at(inBlendLength, Y);
    }

    // (C: `Y = mem44;` — never read: Y is set again before its next use)
    A = (mem49 + poLength(sam, mem44)) & 0xff; // A is mem49 + length
    mem49 = A; // mem49 now holds length + position
    A = (A + phase2) & 0xff; //Maybe Problem because of carry flag

    //47776: ADC 42
    speedcounter = A;
    mem47 = 168;
    phase3 = (mem49 - phase1) & 0xff; // what is mem49
    A = (phase1 + phase2) & 0xff; // total transition?
    mem38 = A;

    X = A;
    X = (X - 2) & 0xff;
    if ((X & 128) === 0) {
      do { //while No. 2
        //pos47810:

        // mem47 is used to index the tables:
        // 168  pitches[]
        // 169  frequency1
        // 170  frequency2
        // 171  frequency3
        // 172  amplitude1
        // 173  amplitude2
        // 174  amplitude3

        mem40 = mem38;

        if (mem47 === 168) { // pitch
          // unlike the other values, the pitches[] interpolates from
          // the middle of the current phoneme to the middle of the
          // next phoneme

          let mem36: number;
          let mem37: number;
          // half the width of the current phoneme
          mem36 = (poLength(sam, mem44) & 0xff) >> 1;
          // half the width of the next phoneme
          mem37 = (poLength(sam, mem44 + 1) & 0xff) >> 1;
          // sum the values
          mem40 = (mem36 + mem37) & 0xff; // length of both halves
          mem37 = (mem37 + mem49) & 0xff; // center of next phoneme
          mem36 = (mem49 - mem36) & 0xff; // center index of current phoneme
          A = Read(sam, mem47, mem37); // value at center of next phoneme - end interpolation value
          //A = mem[address];

          // (C: `Y = mem36; // start index of interpolation` — never read: `Y = phase3` below writes over it,
          // so the pitch too is interpolated from phase3 on)
          mem53 = (A - Read(sam, mem47, mem36)) & 0xff; // value to center of current phoneme
        } else {
          // value to interpolate to
          A = Read(sam, mem47, speedcounter);
          // position to start interpolation from (C: `Y = phase3;` — set again below)
          // value to interpolate from
          mem53 = (A - Read(sam, mem47, phase3)) & 0xff;
        }

        // calculate change per frame — on C's `(signed char)mem53`
        const signed53 = (mem53 << 24) >> 24;
        mem50 = signed53 < 0 ? 128 : 0;
        if (mem40 === 0) {
          // C divides by zero here (undefined). The micro:bit's Cortex-M4 gives a quotient of 0 and does not
          // trap, and the remainder, n - (n / d) * d, is then n itself.
          mem51 = Math.abs(signed53) & 0xff;
          mem53 = 0;
        } else {
          mem51 = (Math.abs(signed53) % mem40) & 0xff;
          mem53 = Math.trunc(signed53 / mem40) & 0xff;
        }

        // interpolation range
        X = mem40; // number of frames to interpolate over
        Y = phase3; // starting frame

        // linearly interpolate values

        mem56 = 0;
        //47907: CLC
        //pos47908:
        for (;;) { //while No. 3
          A = (Read(sam, mem47, Y) + mem53) & 0xff; //carry alway cleared

          mem48 = A;
          Y = (Y + 1) & 0xff;
          X = (X - 1) & 0xff;
          if (X === 0) break;

          mem56 = (mem56 + mem51) & 0xff;
          if (mem56 >= mem40) { //???
            mem56 = (mem56 - mem40) & 0xff; //carry? is set
            //if ((mem56 & 128)==0)
            if ((mem50 & 128) === 0) {
              //47935: BIT 50
              //47937: BMI 47943
              if (mem48 !== 0) mem48 = (mem48 + 1) & 0xff;
            } else mem48 = (mem48 - 1) & 0xff;
          }
          //pos47945:
          Write(sam, mem47, Y, mem48);
        } //while No. 3

        //pos47952:
        mem47 = (mem47 + 1) & 0xff;
        //if (mem47 != 175) goto pos47810;
      } while (mem47 !== 175); //while No. 2
    }
    //pos47963:
    mem44 = (mem44 + 1) & 0xff;
    X = mem44;
  } //while No. 1

  //goto pos47701;
  //pos47970:

  // add the length of this phoneme
  mem48 = (mem49 + poLength(sam, mem44)) & 0xff;

  // ASSIGN PITCH CONTOUR
  //
  // This subtracts the F1 frequency from the pitch to create a
  // pitch contour. Without this, the output would be at a single
  // pitch level (monotone).

  // don't adjust pitch if in sing mode
  if (!sam.common.singmode) {
    // iterate through the buffer
    for (i = 0; i < RENDER_FRAMES; i++) {
      // subtract half the frequency of the formant 1.
      // this adds variety to the voice
      sam.render.pitch[i] = (at(sam.render.pitch, i) - (at(sam.render.freq1, i) >> 1)) & 0xff;
    }
  }
  outputFrames(sam, mem48);
}

export function outputFrames(sam: SamMemory, frame_count: number): void {
  frame_count &= 0xff;

  let phase1 = 0;
  let phase2 = 0;
  let phase3 = 0;
  let speedcounter = 72; //sam standard speed
  const mem66 = { v: 0 };

  // RESCALE AMPLITUDE
  // Rescale volume from decibels to a linear scale. (Written to the 4-bit fields.)
  for (let i = RENDER_FRAMES - 1; i >= 0; i--) {
    sam.render.amp1[i] = at(amplitudeRescale, at(sam.render.amp1, i)) & 15;
    sam.render.amp2[i] = at(amplitudeRescale, at(sam.render.amp2, i)) & 15;
    sam.render.amp3[i] = at(amplitudeRescale, at(sam.render.amp3, i)) & 15;
  }

  let Y = 0;
  let A = at(sam.render.pitch, 0);
  let glottal_pulse = A;
  let count = (A - (A >> 2)) & 0xff; // 3/4*A ???

  // PROCESS THE FRAMES
  //
  // In traditional vocal synthesis, the glottal pulse drives filters, which
  // are attenuated to the frequencies of the formants.
  //
  // SAM generates these formants directly with sin and rectangular waves.
  // To simulate them being driven by the glottal pulse, the waveforms are
  // reset at the beginning of each glottal pulse.

  //finally the loop for sound output
  //pos48078:
  for (;;) {
    /** C's `goto pos48155`: the frame is not over, so the frame count is not looked at and the speed not reloaded. */
    let to48155 = false;

    // get the sampled information on the phoneme
    A = at(sam.render.flags, Y);
    const sample = A;

    // unvoiced sampled phoneme?
    A = A & 248;
    if (A !== 0) {
      // render the sample for the phoneme
      Y = RenderSample(sam, mem66, sample, Y);

      // skip ahead two in the frame buffer
      Y = (Y + 2) & 0xff;
      frame_count = (frame_count - 2) & 0xff;
    } else {
      // simulate the glottal pulse and formants
      let accum = at(multtable, at(sinus, phase1) | at(sam.render.amp1, Y));

      let carry = 0;
      if (accum + at(multtable, at(sinus, phase2) | at(sam.render.amp2, Y)) > 255) carry = 1;
      accum = (accum + at(multtable, at(sinus, phase2) | at(sam.render.amp2, Y))) & 0xff;
      A = (accum + at(multtable, at(rectangle, phase3) | at(sam.render.amp3, Y)) + (carry ? 1 : 0)) & 0xff;
      A = ((A + 136) & 255) >> 4; //there must be also a carry

      // output the accumulated value
      Output(sam, 0, A);
      speedcounter = (speedcounter - 1) & 0xff;
      if (speedcounter !== 0) to48155 = true;
      else {
        Y = (Y + 1) & 0xff; //go to next amplitude

        // decrement the frame count
        frame_count = (frame_count - 1) & 0xff;
      }
    }

    if (!to48155) {
      // if the frame count is zero, exit the loop
      if (frame_count === 0) return;
      speedcounter = sam.common.speed & 0xff;
    }
    // pos48155:

    // decrement the remaining length of the glottal pulse
    glottal_pulse = (glottal_pulse - 1) & 0xff;

    // finished with a glottal pulse? If not:
    if (glottal_pulse !== 0) {
      // decrement the count
      count = (count - 1) & 0xff;

      // is the count non-zero and the sampled flag is zero?
      if (count !== 0 || sample === 0) {
        // reset the phase of the formants to match the pulse
        phase1 = (phase1 + at(sam.render.freq1, Y)) & 0xff;
        phase2 = (phase2 + at(sam.render.freq2, Y)) & 0xff;
        phase3 = (phase3 + at(sam.render.freq3, Y)) & 0xff;
        continue;
      }

      // voiced sampled phonemes interleave the sample with the
      // glottal pulse. The sample flag is non-zero, so render
      // the sample for the phoneme.
      Y = RenderSample(sam, mem66, sample, Y);
      // goto pos48159;
    }

    // pos48159: (reached when the glottal pulse is finished, and after the voiced sample just above)
    // fetch the next glottal pulse length
    A = at(sam.render.pitch, Y);
    glottal_pulse = A;
    A = (A - (A >> 2)) & 0xff;
    count = A;

    // reset the formant wave generators to keep them in
    // sync with the glottal pulse
    phase1 = 0;
    phase2 = 0;
    phase3 = 0;
  }
}

// Create a rising or falling inflection 30 frames prior to
// index X. A rising inflection is used for questions, and
// a falling inflection is used for statements.
// (`phase1` is a parameter in C, passed by value: what is written to it here is not seen by Render.)
export function AddInflection(sam: SamMemory, mem48: number, phase1: number, punctuation: number): void {
  punctuation &= 0xff;
  let A = punctuation;
  const Atemp = A;

  // backup 30 frames
  A = (A - 30) & 0xff;
  // if index is before buffer, point to start of buffer
  if (Atemp <= 30) A = 0;
  let X = A;

  // FIXME: Explain this fix better, it's not obvious
  // ML : A =, fixes a problem with invalid pitch with '.'
  while ((A = at(sam.render.pitch, X)) === 127) X = (X + 1) & 0xff;

  for (;;) {
    // add the inflection direction
    A = (A + mem48) & 0xff;
    phase1 = A;

    // set the inflection
    sam.render.pitch[X] = A;
    do {
      // increment the position
      X = (X + 1) & 0xff;

      // exit if the punctuation has been reached
      if (X === punctuation) return; //goto pos47615;
    } while (at(sam.render.pitch, X) === 255);
    A = phase1;
  }
}

function trans(mem39212: number, mem39213: number): number {
  return ((mem39212 * mem39213) >> 7) & 0xff;
}

/*
    SAM's voice can be altered by changing the frequencies of the
    mouth formant (F1) and the throat formant (F2). Only the voiced
    phonemes (5-29 and 48-53) are altered.
*/

const recalculate = new Uint8Array([
  0, 0, 0, 0, 0, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1,
  1, 1, 1, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0,
]);

const mouth_formants = new Uint8Array([
  0, 0, 0, 0, 0, 10, 14, 19, 24, 27,
  23, 21, 16, 20, 14, 18, 14, 18, 18, 16,
  13, 15, 11, 18, 14, 11, 9, 6, 6, 6,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 19, 27,
  21, 27, 18, 13, 0,
]);

function get_freq1(pos: number, mouth: number): number {
  if (at(recalculate, pos)) {
    return trans(mouth, at(mouth_formants, pos));
  } else {
    return at(freq1data, pos);
  }
}

const throat_formants = new Uint8Array([
  0, 0, 0, 0, 0, 84, 73, 67, 63, 40,
  44, 31, 37, 45, 73, 49, 36, 30, 51, 37,
  29, 69, 24, 50, 30, 24, 83, 46, 54, 86,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 72, 39,
  31, 43, 30, 34, 0,
]);

function get_freq2(pos: number, throat: number): number {
  if (at(recalculate, pos)) {
    return trans(throat, at(throat_formants, pos));
  } else {
    return at(freq2data, pos);
  }
}
