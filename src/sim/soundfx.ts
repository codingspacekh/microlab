/**
 * The micro:bit V2's sound expressions (M7 slice 4, screen 06): what `audio.play(Sound.GIGGLE)` and a SoundEffect
 * play, as CODAL plays them (codal-microbit-v2 c849b86: SoundExpressions.cpp parses them, SoundEmojiSynthesizer.cpp
 * steps them, SoundSynthesizerEffects.cpp's effects — MIT, Lancaster University and the BBC). An expression is one or
 * more effects of 72 digits, comma-separated: a waveform, a start volume and frequency, a duration, a shape and an end
 * frequency, an end volume, the shape's steps, an effect (vibrato, tremolo, warble) with its parameter and steps, and
 * how much to vary each at random. Each effect plays for its duration; its three effects — the shape moving the
 * frequency, a 36-step volume ramp, the effect — each step at their own sample positions, as CODAL does.
 */
export type Wave = 'sine' | 'sawtooth' | 'triangle' | 'square' | 'noise';

/** A change of the speaker's sound: from `us` after the start, `hz` at `volume` (0–1 of full) in `wave`; 0 Hz silent. */
export interface ToneStep { us: number; hz: number; volume: number; wave: Wave }

/** The built-in sounds (microbit.Sound), CODAL's data by their names. */
export const BUILT_IN_SOUNDS: Record<string, string> = {
  giggle: '010230988019008440044008881023001601003300240000000000000000000000000000,110232570087411440044008880352005901003300010000000000000000010000000000,310232729021105440288908880091006300000000240700020000000000003000000000,310232729010205440288908880091006300000000240700020000000000003000000000,310232729011405440288908880091006300000000240700020000000000003000000000',
  happy: '010231992066911440044008880262002800001800020500000000000000010000000000,002322129029508440240408880000000400022400110000000000000000007500000000,000002129029509440240408880145000400022400110000000000000000007500000000',
  hello: '310230673019702440118708881023012800000000240000000000000000000000000000,300001064001602440098108880000012800000100040000000000000000000000000000,310231064029302440098108881023012800000100040000000000000000000000000000',
  mysterious: '400002390033100440240408880477000400022400110400000000000000008000000000,405512845385000440044008880000012803010500160000000000000000085000500015',
  sad: '310232226070801440162408881023012800000100240000000000000000000000000000,310231623093602440093908880000012800000100240000000000000000000000000000',
  slide: '105202325022302440240408881023012801020000110400000000000000010000000000,010232520091002440044008881023012801022400110400000000000000010000000000',
  soaring: '210234009530905440599908881023002202000400020250000000000000020000000000,402233727273014440044008880000003101024400030000000000000000000000000000',
  spring: '306590037116312440058708880807003400000000240000000000000000050000000000,010230037116313440058708881023003100000000240000000000000000050000000000',
  twinkle: '010180007672209440075608880855012800000000240000000000000000000000000000',
  yawn: '200002281133202440150008881023012801024100240400030000000000010000000000,005312520091002440044008880636012801022400110300000000000000010000000000,008220784019008440044008880681001600005500240000000000000000005000000000,004790784019008440044008880298001600000000240000000000000000005000000000,003210784019008440044008880108001600003300080000000000000000005000000000',
};

const SAMPLE_RATE = 44100;
const WAVES: Wave[] = ['sine', 'sawtooth', 'triangle', 'square', 'noise'];
/** CODAL's intervals (JUST_SCALE is not set for the micro:bit: these, not equal temperament). */
const CHROMATIC = [1.0, 1.0417, 1.125, 1.2, 1.25, 1.3333, 1.4063, 1.5, 1.6, 1.6667, 1.8, 1.875];
const pick = (i: number[]) => i.map((k) => CHROMATIC[k]!);
const SCALES: Record<number, number[]> = {
  8: pick([0, 2, 4, 5, 7, 9, 11]), 9: pick([0, 2, 4, 5, 7, 9, 11]),       // major
  10: pick([0, 2, 3, 5, 7, 8, 10]), 11: pick([0, 2, 3, 5, 7, 8, 10]),     // minor
  12: pick([0, 3, 6, 9]), 13: pick([0, 3, 6, 9]),                         // diminished
  14: CHROMATIC, 15: CHROMATIC,                                           // chromatic
  16: pick([0, 2, 4, 6, 8, 10]), 17: pick([0, 2, 4, 6, 8, 10]),          // whole tone
};

interface Synth { frequency: number; volume: number }
interface Effect { steps: number; step: number; run?: (s: Synth, e: Effect) => void }

/** One effect's 72 digits as CODAL reads them (with its randomness applied), or undefined if it isn't valid. */
function parse(chars: string, random: (n: number) => number) {
  const d = (at: number, n: number) => {
    const s = chars.slice(at, at + n);
    return /^\d+$/.test(s) && s.length === n ? Number(s) : -1;
  };
  const varied = (value: number, spread: number) => (value < 0 || spread < 0 ? -1 : Math.abs(value + random(spread * 2 + 1) - spread));
  const wave = d(0, 1);
  const frequency = varied(d(5, 4), d(44, 4));
  const endFrequency = varied(d(18, 4), d(48, 4));
  const volume = varied(d(1, 4), d(52, 4));
  const endVolume = varied(d(26, 4), d(56, 4));
  const duration = varied(d(9, 4), d(60, 4));
  const fxParam = varied(d(36, 4), d(64, 4));
  const fxSteps = varied(d(40, 4), d(68, 4));
  const shape = d(13, 2);
  const steps = d(30, 4);
  const fx = d(34, 2);
  if ([wave, frequency, endFrequency, volume, endVolume, duration, fxParam, fxSteps].some((v) => v < 0)) return undefined;
  return { wave: WAVES[wave] ?? 'square', frequency, endFrequency, volume, endVolume, duration, fxParam, fxSteps, shape, steps, fx };
}

/** The frequency each shape gives at a step (SoundSynthesizerEffects.cpp). */
function shapeOf(shape: number, start: number, end: number): Effect['run'] {
  switch (shape) {
    case 1: return (s, e) => { s.frequency = start + ((end - start) / e.steps) * e.step; };
    case 2: return (s, e) => { s.frequency = Math.sin((e.step * 3.14159) / 180) * (end - start) + start; };
    case 5: return (s, e) => { s.frequency = start + Math.sin(0.01745329 * e.step) * end; };
    case 6: return (s, e) => { s.frequency = start + Math.cos(0.01745329 * e.step) * end; };
    case 18: return (s, e) => { s.frequency = Math.max(0, start + (Math.log10(e.step === 0 ? 1 : e.step) * (end - start)) / 1.95); };
  }
  const scale = SCALES[shape];
  if (!scale) return undefined;   // 0: no interpolation; an unknown shape has no effect either
  const at = (offset: number) => start * 2 ** Math.floor(offset / scale.length) * scale[offset % scale.length]!;
  return shape % 2 === 0 ? (s, e) => { s.frequency = at(e.step); } : (s, e) => { s.frequency = at(e.steps - e.step - 1); };
}

/**
 * The steps of a sound expression (or a built-in sound's name), from its start, ending with silence; undefined if it
 * isn't one (CODAL plays nothing then). `random(n)` is 0 … n − 1.
 */
export function soundSteps(expression: string, random: (n: number) => number = (n) => Math.floor(Math.random() * n)): ToneStep[] | undefined {
  const sound = BUILT_IN_SOUNDS[expression] ?? expression;
  const count = Math.floor((sound.length + 1) / 73);
  if (!count || sound.length !== count * 73 - 1) return undefined;
  const effects = [];
  for (let i = 0; i < count; i++) {
    if (i > 0 && sound[i * 73 - 1] !== ',') return undefined;
    const fx = parse(sound.slice(i * 73, i * 73 + 72), random);
    if (!fx) return undefined;
    effects.push(fx);
  }
  const out: ToneStep[] = [];
  let t0 = 0;   // samples before this effect
  const note = (samples: number, s: Synth, wave: Wave) => {
    const step = { us: Math.round(((t0 + samples) / SAMPLE_RATE) * 1e6), hz: s.frequency, volume: s.volume, wave };
    const last = out.at(-1);
    if (last && last.us === step.us) out[out.length - 1] = step;
    else if (!last || last.hz !== step.hz || last.volume !== step.volume || last.wave !== step.wave) out.push(step);
  };
  for (const fx of effects) {
    const total = Math.trunc(SAMPLE_RATE * (fx.duration / 1000));
    const synth: Synth = { frequency: fx.frequency, volume: Math.min(1023, Math.max(0, fx.volume)) / 1023 };
    const startVolume = synth.volume;
    const endVolume = Math.min(1023, Math.max(0, fx.endVolume)) / 1023;
    const fxSteps = Math.trunc((fx.duration / 10000) * fx.fxSteps);
    const list: Effect[] = [
      { steps: fx.steps, step: 0, run: shapeOf(fx.shape, fx.frequency, fx.endFrequency) },
      { steps: 36, step: 0, run: (s, e) => { s.volume = startVolume + e.step * ((endVolume - startVolume) / e.steps); } },
      {
        steps: fx.fx >= 1 && fx.fx <= 3 ? fxSteps : 0, step: 0,
        run: fx.fx === 1 ? (s, e) => { if (e.step) s.frequency = e.step % 2 === 0 ? s.frequency / fx.fxParam : s.frequency * fx.fxParam; }
          : fx.fx === 2 ? (s, e) => { if (e.step) s.volume = e.step % 2 === 0 ? s.volume / fx.fxParam : s.volume * fx.fxParam; }
          : fx.fx === 3 ? (s, e) => { s.frequency = Math.sin(e.step) * (fx.fxParam - fx.frequency) + fx.frequency; }
          : undefined,
      },
    ];
    for (const e of list) e.steps = Math.max(e.steps, 1);
    const perStep = list.map((e) => total / e.steps);
    let written = 0;
    note(0, synth, fx.wave);
    for (let guard = 0; written < total && guard < 100_000; guard++) {
      const ends = list.map((e, i) => (e.step === e.steps - 1 ? total : Math.trunc(perStep[i]! * e.step)));
      written = Math.max(written, Math.min(...ends));
      list.forEach((e, i) => {
        if (written === ends[i] && e.step < e.steps) {
          e.run?.(synth, e);
          e.step++;
        }
      });
      note(written, synth, fx.wave);
    }
    t0 += total;
  }
  out.push({ us: Math.round((t0 / SAMPLE_RATE) * 1e6), hz: 0, volume: 0, wave: out.at(-1)?.wave ?? 'square' });
  return out;
}
