import { describe, expect, it } from 'vitest';
import { VirtualClock } from '../../src/sim/clock';
import { runProject, type RunResult } from '../../src/sim/run';
import { nodeLoader } from './vm';

/**
 * 1.0.1 — the class after v1.0: "the speech library should also be added to the micro:bit". The module as
 * micropython-microbit-v2 v2.1.2's modspeech.c has it — say, pronounce, sing, translate; pitch, speed, mouth, throat,
 * pin — so a program that speaks runs in the simulator as on the board: it waits while it speaks, and the speaker
 * and pin 0 sound. The voice itself is a stand-in (a buzz at the voice's pitch, word by word): the firmware's is the
 * SAM synthesizer, which has no licence to copy it under (docs/acceptance/1.0.1.md).
 */
const run = async (main: string, seconds = 20): Promise<RunResult> =>
  runProject(await nodeLoader(), { board: 'microbit-v2', files: { 'main.py': `from microbit import *\nimport speech\n${main}` }, clock: new VirtualClock(), maxUs: seconds * 1e6, seed: 1 });
const out = (r: RunResult) => r.output.split('\n').filter(Boolean);
const heard = (r: RunResult) => r.sound.filter(([, hz]) => hz).map(([, hz]) => Math.round(hz));
const pin0 = (r: RunResult) => r.pwm.filter((e) => e[1] === '0' && (e[2] as number) > 0);

describe('1.0.1 speech on the simulated micro:bit', () => {
  it('say() speaks on the speaker and pin 0, and the program waits until it has', async () => {
    const r = await run('t = running_time()\nspeech.say("Hello world")\nprint(running_time() - t)\nprint(pin0.get_mode())\n');
    expect(r.error).toBeUndefined();
    const ms = Number(out(r)[0]);
    expect(ms).toBeGreaterThan(500);
    expect(ms).toBeLessThan(2500);
    expect(heard(r).length).toBeGreaterThan(4);
    expect(r.sound.at(-1)![1]).toBe(0);              // silent when it has spoken
    expect(pin0(r).length).toBeGreaterThan(4);
    expect(out(r)[1]).toBe('audio_play');
  });

  it('two words are two bursts of sound, a silence between them', async () => {
    const r = await run('speech.say("hi you")\n');
    const gaps = r.sound.filter(([, hz], i) => !hz && i < r.sound.length - 1);
    expect(gaps).toHaveLength(1);
  });

  it('pitch: a lower number is a higher voice; speed: a higher number is slower', async () => {
    const low = await run('speech.say("a")\n');
    const high = await run('speech.say("a", pitch=32)\n');
    expect(heard(high)[0]! / heard(low)[0]!).toBeCloseTo(2, 1);
    const r = await run('t = running_time()\nspeech.say("banana")\na = running_time() - t\nt = running_time()\nspeech.say("banana", speed=144)\nprint(a, running_time() - t)\n');
    const [a, b] = out(r)[0]!.split(' ').map(Number);
    expect(b! / a!).toBeCloseTo(2, 1);
  });

  it('pin=None: the speaker alone; another pin: that one', async () => {
    const none = await run('speech.say("hi", pin=None)\nprint(pin0.get_mode())\n');
    expect(out(none)[0]).not.toBe('audio_play');      // pin 0 is not speech's
    expect(pin0(none)).toEqual([]);
    expect(heard(none).length).toBeGreaterThan(0);
    const one = await run('speech.say("hi", pin=pin1)\n');
    expect(one.pwm.some((e) => e[1] === '1' && (e[2] as number) > 0)).toBe(true);
  });

  it('sing(): #115 … sets the note of what follows — C, then D, then E', async () => {
    const r = await run('speech.sing("#115DOWWWW#103REYYYY#94MIYYYY")\n');
    expect(r.error).toBeUndefined();
    const notes = [...new Set(heard(r))];
    expect(notes).toEqual([133, 149, 163]);
  });

  it('pronounce(): phonemes, in capitals as the firmware wants them; a pause for a space', async () => {
    const r = await run('speech.pronounce("/HEHLOW WERLD")\n');
    expect(r.error).toBeUndefined();
    expect(heard(r).length).toBeGreaterThan(4);
    expect((await run('speech.pronounce("hello")\n')).error).toMatchObject({ type: 'ValueError', message: 'Phoneme not understood', line: 3 });
  });

  it('as the firmware: more than 80 characters is too long to say; what is said must be text; the options are named', async () => {
    expect((await run(`speech.say("${'a'.repeat(81)}")\n`)).error).toMatchObject({ type: 'ValueError', message: 'text too long', line: 3 });
    expect((await run('speech.say(42)\n')).error).toMatchObject({ type: 'TypeError', message: "can't convert 'int' object to str implicitly" });
    expect((await run('speech.say("hi", 32)\n')).error).toMatchObject({ type: 'TypeError' });
    expect((await run('speech.say("hi", pin=pin_speaker)\n')).error).toMatchObject({ type: 'ValueError', message: 'pin_speaker not allowed' });
  });

  it('Stop while it speaks leaves the speaker silent', async () => {
    const r = await run('speech.say("a very long sentence to say out loud")\n', 0.3);
    expect(r.sound.at(-1)![1]).toBe(0);
  });

  it('translate() needs the firmware\'s own pronunciation rules: it says so, in words a student can act on', async () => {
    expect((await run('print(speech.translate("hello"))\n')).error).toMatchObject({
      type: 'NotImplementedError', message: expect.stringMatching(/only on the real micro:bit/),
    });
  });
});
