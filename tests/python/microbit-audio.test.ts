import { describe, expect, it } from 'vitest';
import { VirtualClock } from '../../src/sim/clock';
import { runProject, type RunResult } from '../../src/sim/run';
import { nodeLoader } from './vm';

/** M7 slice 4 (screen 06): the micro:bit V2's speaker and sounds — speaker.on / off, set_volume, music with
 *  pin=None, the audio module (built-in Sounds, SoundEffects, AudioFrames) as micropython-microbit-v2 v2.1.2's
 *  modaudio.c, microbit_soundeffect.c, microbit_sound.c, microbit_speaker.c and microbit_pinaudio.c. */
const run = async (main: string, seconds = 3): Promise<RunResult> =>
  runProject(await nodeLoader(), { board: 'microbit-v2', files: { 'main.py': `from microbit import *\nimport music\nimport audio\n${main}` }, clock: new VirtualClock(), maxUs: seconds * 1e6, seed: 1 });
const at = (line: number) => line + 3;
const out = (r: RunResult) => r.output.split('\n').filter(Boolean);
/** pin 0's PWM: [ms, Hz] each change. */
const pin0 = (r: RunResult) => r.pwm.filter((e) => e[1] === '0').map((e): [number, number] => [Math.round(e[0] / 1000), Math.round(e[2] as number)]);

describe('M7 the speaker and set_volume', () => {
  it('speaker.off(): the speaker is silent, pin 0 still plays; on() brings it back while it plays', async () => {
    const r = await run('speaker.off()\nmusic.pitch(440, 100)\nspeaker.on()\nmusic.pitch(440, 100)\n');
    const heard = r.sound.filter(([, hz]) => hz);
    expect(heard).toHaveLength(1);                       // only the second note, the speaker on again
    expect(heard[0]![0]).toBeGreaterThanOrEqual(100_000);
    expect(pin0(r).some(([t, hz]) => t === 0 && hz === 440)).toBe(true);      // pin 0 played the first …
    expect(pin0(r).some(([t, hz]) => t >= 100 && hz === 440)).toBe(true);     // … and the second
  });

  it('set_volume(64): the speaker at a quarter; what plays now changes with it', async () => {
    const r = await run('set_volume(64)\nmusic.pitch(440, 50)\nset_volume(255)\nmusic.pitch(440, 50)\n');
    expect(r.sound.filter(([, hz]) => hz).map((e) => e[2] ?? 1)).toEqual([0.251, 1]);   // 64 / 255, then full
  });

  it('music with pin=None: the speaker alone — pin 0 is free (it was music\'s)', async () => {
    const r = await run('music.play("c4:4", wait=False)\nprint(pin0.get_mode())\nmusic.play("c4:4", pin=None)\nprint(pin0.get_mode())\npin0.write_digital(1)\n');
    expect(out(r).slice(0, 2)).toEqual(['music', 'unused']);
    expect(r.error).toBeUndefined();
    expect(r.sound.filter(([, hz]) => hz).length).toBeGreaterThanOrEqual(1);
    expect(pin0(r).filter(([, hz]) => hz)).toEqual([]);   // freed before its first note: it never sounded
  });

  it('pin_speaker is not a pin music or audio can be routed to; a number is not a pin', async () => {
    expect((await run('music.play("c4", pin=pin_speaker)\n')).error).toMatchObject({ type: 'ValueError', message: 'pin_speaker not allowed', line: at(1) });
    expect((await run('music.play("c4", pin=3)\n')).error).toMatchObject({ type: 'TypeError', message: 'expecting a pin' });
  });

  it('the speaker prints as the firmware\'s', async () => {
    expect(out(await run('print(speaker)\nprint(Sound.GIGGLE, repr(Sound.HAPPY))\n'))).toEqual(['<MicroBitSpeaker>', "Sound('giggle') Sound('happy')"]);
  });
});

describe('M7 audio.play: the built-in sounds and SoundEffects', () => {
  it('Sound.HELLO plays its three effects (≈ 1.5 s), to the speaker and pin 0; play() waits for it', async () => {
    const r = await run('t = running_time()\naudio.play(Sound.HELLO)\nprint(running_time() - t)\nprint(audio.is_playing())\n');
    expect(r.error).toBeUndefined();
    const [ms, playing] = out(r);
    expect(Number(ms)).toBeGreaterThan(300);
    expect(playing).toBe('False');
    expect(r.sound.length).toBeGreaterThan(20);
    expect(r.sound.at(-1)![1]).toBe(0);
    expect(r.sound.some((e) => e[3] === 'square')).toBe(true);   // hello's effects are square waves (3 …)
    expect(pin0(r).length).toBeGreaterThan(5);
  });

  it('wait=False: the program goes on while it plays; is_playing() says so; stop() silences it', async () => {
    const r = await run('audio.play(Sound.YAWN, wait=False)\nprint(audio.is_playing())\nsleep(100)\naudio.stop()\nprint(audio.is_playing())\nsleep(200)\n');
    expect(out(r)).toEqual(['True', 'False']);
    const after = r.sound.filter(([t]) => t >= 100_000);
    expect(after.map(([, hz]) => hz)).toEqual([0]);
  });

  it('a SoundEffect: its defaults, attributes, str and repr as the firmware prints them', async () => {
    const r = await run([
      's = audio.SoundEffect()', 'print(s)', 'print(repr(s))',
      's.freq_start = 400', 's.vol_end = 100', 'print(s.freq_start, s.vol_start, s.vol_end, s.shape)',
      'print(audio.SoundEffect.WAVEFORM_SINE, audio.SoundEffect.FX_WARBLE, audio.SoundEffect.SHAPE_CURVE)',
      'c = s.copy()', 'c.duration = 9', 'print(s.duration, c.duration)',
    ].join('\n'));
    expect(out(r)).toEqual([
      'SoundEffect(freq_start=500, freq_end=2500, duration=500, vol_start=255, vol_end=0, waveform=WAVEFORM_SQUARE, fx=FX_NONE, shape=SHAPE_LOG)',
      'SoundEffect(500, 2500, 500, 255, 0, 3, 0, 18)',
      '400 255 100 18', '0 3 2', '500 9',
    ]);
  });

  it('a SoundEffect\'s limits: volumes to 255, fields to their digits', async () => {
    expect((await run('audio.SoundEffect(vol_start=300)\n')).error).toMatchObject({ type: 'ValueError', message: 'maximum value is 255' });
    expect((await run('audio.SoundEffect(freq_start=10000)\n')).error).toMatchObject({ type: 'ValueError', message: 'maximum value is 9999' });
    expect((await run('audio.SoundEffect(waveform=12)\n')).error).toMatchObject({ type: 'ValueError', message: 'maximum value is 9' });
    expect((await run('audio.SoundEffect(shape=100)\n')).error).toMatchObject({ type: 'ValueError', message: 'maximum value is 99' });
  });

  it('a SoundEffect plays for its duration, from its start frequency; a list of them one after another', async () => {
    const r = await run('t = running_time()\naudio.play(audio.SoundEffect(freq_start=300, duration=200, shape=audio.SoundEffect.SHAPE_LINEAR))\nprint(running_time() - t)\n'
      + 'audio.play([audio.SoundEffect(duration=100), audio.SoundEffect(duration=100, waveform=audio.SoundEffect.WAVEFORM_SINE)])\n');
    expect(Number(out(r)[0])).toBeGreaterThanOrEqual(200);
    expect(Math.round(r.sound[0]![1])).toBe(300);
    expect(r.sound.some((e) => e[3] === 'sine')).toBe(true);
  });

  it('return_pin is the V1\'s: not supported', async () => {
    expect((await run('audio.play(Sound.HAPPY, return_pin=pin1)\n')).error).toMatchObject({ type: 'ValueError', message: 'return_pin not supported' });
  });

  it('microbit.audio is the audio module', async () => {
    expect(out(await run('import microbit\nprint(microbit.audio is audio)\n'))).toEqual(['True']);
  });
});

describe('M7 audio.play of AudioFrames', () => {
  it('a frame of a square wave, 4 cycles in 32 samples: heard at ≈ 977 Hz while the frames last, then silence', async () => {
    const r = await run([
      'f = audio.AudioFrame()', 'for i in range(32):', '    f[i] = 255 if (i // 4) % 2 else 0',
      'audio.play([f] * 25)', 'print(len(f), f[4])',
    ].join('\n'));
    expect(r.error).toBeUndefined();
    expect(out(r)).toEqual(['32 255']);
    const hz = r.sound.filter(([, h]) => h > 0).map(([, h]) => Math.round(h));
    expect(Math.max(...hz)).toBeGreaterThan(900);
    expect(Math.min(...hz)).toBeLessThan(1100);
    expect(r.sound.at(-1)![1]).toBe(0);
  });

  it('its errors and its arithmetic: bounds, range, delete; + − * as modaudio.c clamps them; copyfrom', async () => {
    const r = await run([
      'f = audio.AudioFrame()', 'g = audio.AudioFrame()', 'g[0] = 228', 'h = f + g', 'print(h[0], f[0])',
      'h *= 0.5', 'print(h[0])', 'k = audio.AudioFrame()', 'k.copyfrom(bytes([1, 2, 3]))', 'print(k[0], k[2], k[3])',
      'try:', '    f[32] = 1', 'except ValueError as e:', '    print(e)',
      'try:', '    f[0] = 256', 'except ValueError as e:', '    print(e)',
      'try:', '    del f[0]', 'except TypeError as e:', '    print(e)',
    ].join('\n'));
    expect(out(r)).toEqual(['228 128', '178', '1 3 128', 'index out of bounds', 'value out of range', 'cannot delete elements of AudioFrame']);
  });

  it('something not an AudioFrame in what plays: TypeError "not an AudioFrame"', async () => {
    const r = await run('audio.play([audio.AudioFrame(), 7])\n');
    expect(r.error).toMatchObject({ type: 'TypeError', message: 'not an AudioFrame' });
  });
});
