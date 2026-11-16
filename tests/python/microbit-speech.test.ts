import { describe, expect, it } from 'vitest';
import { VirtualClock } from '../../src/sim/clock';
import { runProject, type RunResult } from '../../src/sim/run';
import { nodeLoader } from './vm';

/**
 * 1.0.1 — the class after v1.0: "the speech library should also be added to the micro:bit"; 1.0.2 — its real voice.
 * The module as micropython-microbit-v2 v2.1.2's modspeech.c has it — say, pronounce, sing, translate; pitch, speed,
 * mouth, throat, pin — and the voice the firmware's own: SAM, ported from its lib/sam (src/sim/sam). A program that
 * speaks runs in the simulator as on the board: it waits while it speaks, and the words are heard.
 */
const run = async (main: string, seconds = 20): Promise<RunResult> =>
  runProject(await nodeLoader(), { board: 'microbit-v2', files: { 'main.py': `from microbit import *\nimport speech\n${main}` }, clock: new VirtualClock(), maxUs: seconds * 1e6, seed: 1 });
const out = (r: RunResult) => r.output.split('\n').filter(Boolean);
const pin0 = (r: RunResult) => r.pwm.filter((e) => e[1] === '0' && (e[2] as number) > 0 && (e[3] as number) > 0);

describe('1.0.2 speech on the simulated micro:bit, in SAM\'s voice', () => {
  it('say() speaks — the words as SAM\'s phonemes, then its samples — and the program waits until it has', async () => {
    const r = await run('t = running_time()\nspeech.say("Hello world")\nprint(running_time() - t)\nprint(pin0.get_mode())\n');
    expect(r.error).toBeUndefined();
    expect(r.speech).toHaveLength(1);
    const [at, phonemes, samples, rate] = r.speech[0]!;
    expect(at).toBeLessThan(5000);
    expect(phonemes).toBe(' /HEHLOW WERLD');
    expect(rate).toBe(19000);
    // it waited as long as the samples last
    expect(Number(out(r)[0])).toBe(Math.round((samples / rate) * 1000));
    expect(Number(out(r)[0])).toBeGreaterThan(600);
    expect(Number(out(r)[0])).toBeLessThan(2000);
    // the speaker speaks (no tone of its own), then is silent; pin 0 carries the voice's pitch for a buzzer
    expect(r.sound.map((e) => [e[1] > 0, e[3]])).toEqual([[true, 'speech'], [false, undefined]]);
    expect(pin0(r)).toHaveLength(1);
    expect(out(r)[1]).toBe('audio_play');
  });

  it('translate(): the phonemes say() uses, to change and pronounce()', async () => {
    const r = await run('print(repr(speech.translate("hello")))\nprint(repr(speech.translate("Hello, World")))\n');
    expect(out(r)).toEqual(["' /HEHLOW'", "' /HEHLOW, WERLD'"]);
  });

  it('speed: a higher number is slower; what is heard is as loud as set_volume says, and nothing with the speaker off', async () => {
    const r = await run('speech.say("banana")\nspeech.say("banana", speed=144)\n');
    expect(r.speech[1]![2] / r.speech[0]![2]).toBeGreaterThan(1.7);
    expect(r.speech[1]![2] / r.speech[0]![2]).toBeLessThan(2.2);
    const said: (number | null)[] = [];
    await runProject(await nodeLoader(), {
      board: 'microbit-v2', clock: new VirtualClock(), maxUs: 20e6,
      files: { 'main.py': 'from microbit import *\nimport speech\nspeech.say("hi")\nset_volume(51)\nspeech.say("hi")\nspeaker.off()\nspeech.say("hi")\n' },
      onSpeech: (s) => said.push(s ? s.volume : null),
    });
    expect(said).toEqual([1, 0.2, 0]);
  });

  it('pin=None: the speaker alone; another pin: that one', async () => {
    const none = await run('speech.say("hi", pin=None)\nprint(pin0.get_mode())\n');
    expect(out(none)[0]).not.toBe('audio_play');      // pin 0 is not speech's
    expect(pin0(none)).toEqual([]);
    expect(none.speech).toHaveLength(1);
    const one = await run('speech.say("hi", pin=pin1)\n');
    expect(one.pwm.some((e) => e[1] === '1' && (e[2] as number) > 0 && (e[3] as number) > 0)).toBe(true);
  });

  it('sing() and pronounce() take phonemes: #115 sets a note; a sound SAM does not know is its error', async () => {
    const r = await run('speech.sing("#115DOWWWW#103REYYYY#94MIYYYY")\nspeech.pronounce("/HEHLOW WERLD")\n');
    expect(r.error).toBeUndefined();
    expect(r.speech.map((e) => e[1])).toEqual(['#115DOWWWW#103REYYYY#94MIYYYY', '/HEHLOW WERLD']);
    expect((await run('speech.pronounce("X")\n')).error).toMatchObject({ type: 'ValueError', message: 'Phoneme not understood', line: 3 });
  });

  it('as the firmware: more than 80 characters is too long to say; what is said must be text; the options are named', async () => {
    expect((await run(`speech.say("${'a'.repeat(81)}")\n`)).error).toMatchObject({ type: 'ValueError', message: 'text too long', line: 3 });
    expect((await run('speech.say(42)\n')).error).toMatchObject({ type: 'TypeError', message: "can't convert 'int' object to str implicitly" });
    expect((await run('speech.say("hi", 32)\n')).error).toMatchObject({ type: 'TypeError' });
    expect((await run('speech.say("hi", pin=pin_speaker)\n')).error).toMatchObject({ type: 'ValueError', message: 'pin_speaker not allowed' });
  });

  it('Ctrl+C while it speaks cuts it short: the window is told, the speaker is silent (Stop ends the run, and the sound with it)', async () => {
    const said: boolean[] = [];
    const r = await runProject(await nodeLoader(), {
      board: 'microbit-v2', clock: new VirtualClock(), maxUs: 5e6, stdin: [[300_000, '\x03']],
      files: { 'main.py': 'import speech\nspeech.say("a very long sentence to say out loud")\n' },
      onSpeech: (s) => said.push(!!s),
    });
    expect(said).toEqual([true, false]);
    expect(r.sound.at(-1)![1]).toBe(0);
  });
});
