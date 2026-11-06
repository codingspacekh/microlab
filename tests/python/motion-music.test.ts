import { describe, expect, it } from 'vitest';
import { VirtualClock } from '../../src/sim/clock';
import type { InputChange } from '../../src/sim/pins';
import { runProject } from '../../src/sim/run';
import { nodeLoader } from './vm';

/** M2 slice 6c: the micro:bit's accelerometer and music (micropython-microbit-v2 v2.1.2:
 *  microbit_accelerometer.c, modmusic.c, modmusictunes.c; CODAL's gesture rules). */
const run = async (main: string, inputs: InputChange[] = []) =>
  runProject(await nodeLoader(), { board: 'microbit-v2', files: { 'main.py': `from microbit import *\nimport music\n${main}` }, clock: new VirtualClock(), inputs });
const at = (line: number) => line + 2;
const tones = (sound: [number, number][]) => sound.map(([t, f]) => [Math.round(t / 1000), Math.round(f * 10) / 10]);

describe('M2.6c accelerometer', () => {
  it('lying flat, face up: 0, 0, -1024 mg; strength 1024; the gesture "face up"', async () => {
    const r = await run('print(accelerometer.get_values(), accelerometer.get_x(), accelerometer.get_strength(), accelerometer.current_gesture())\n');
    expect(r.output).toBe("(0, 0, -1024) 0 1024 face up\n");
  });

  it('tilting changes the readings and the gesture; was_gesture and get_gestures remember them', async () => {
    const r = await run(
      'sleep(500)\nprint(accelerometer.get_y(), accelerometer.current_gesture(), accelerometer.is_gesture("up"))\nprint(accelerometer.get_gestures(), accelerometer.get_gestures())\n',
      [{ atUs: 100_000, pin: 'ACCEL', vector: [0, 1024, 0] }],
    );
    expect(r.output).toBe("1024 up True\n('face up', 'up') ()\n");
  });

  it('a shake is a gesture; was_gesture clears it (and the list)', async () => {
    const r = await run('sleep(300)\nprint(accelerometer.was_gesture("shake"), accelerometer.was_gesture("shake"), accelerometer.get_gestures())\n',
      [{ atUs: 100_000, pin: 'ACCEL', gesture: 'shake' }]);
    expect(r.output).toBe('True False ()\n');
  });

  it('left / right and face down by the axis tolerances', async () => {
    const r = await run('g = []\nfor i in range(3):\n    sleep(100)\n    g.append(accelerometer.current_gesture())\nprint(g)\n',
      [{ atUs: 50_000, pin: 'ACCEL', vector: [-1000, 0, 0] }, { atUs: 150_000, pin: 'ACCEL', vector: [1000, 0, 0] }, { atUs: 250_000, pin: 'ACCEL', vector: [0, 0, 1000] }]);
    expect(r.output).toBe("['left', 'right', 'face down']\n");
  });

  it('an unknown gesture name: "invalid gesture"', async () => {
    expect((await run('accelerometer.is_gesture("wobble")\n')).error).toMatchObject({ type: 'ValueError', message: 'invalid gesture', line: at(1) });
  });
});

describe('M2.6c music', () => {
  it('play(BA_DING): each note on the 6 ms tick, length × 125 ms less 10 ms of silence between notes', async () => {
    const r = await run('t = running_time()\nmusic.play(music.BA_DING)\nprint(running_time() - t)\n');
    expect(tones(r.sound)).toEqual([[6, 988.1], [126, 0], [138, 1319.3], [504, 0]]);
    expect(r.output).toBe('516\n');
  });

  it('the default pin is pin 0 (and the speaker): it is in music mode while a tune plays', async () => {
    const r = await run('music.play(["c4:4"] * 4, wait=False)\nprint(pin0.get_mode())\npin0.write_digital(1)\n');
    expect(r.output.split('\n')[0]).toBe('music');
    expect(r.error).toMatchObject({ type: 'ValueError', message: 'Pin 0 in music mode', line: at(3) });
  });

  it('pitch(440, 100) sounds at once, stops on the next tick after 100 ms', async () => {
    const r = await run('t = running_time()\nmusic.pitch(440, 100)\nprint(running_time() - t)\n');
    expect(tones(r.sound)).toEqual([[0, 440.1], [102, 0]]);
    expect(r.output).toBe('114\n');
  });

  it('tempo: get_tempo, set_tempo, reset; a note with no octave or length keeps the last ones', async () => {
    const r = await run('print(music.get_tempo())\nmusic.set_tempo(bpm=240)\nprint(music.get_tempo())\nt = running_time()\nmusic.play(["a5:2", "a"])\nprint(running_time() - t)\nmusic.reset()\nprint(music.get_tempo())\n');
    // 240 bpm, 4 ticks a beat: (60000 / 240) / 4 = 62 ms a tick; "a5:2" is 880.3 Hz (1136 µs) for 2 × 62 − 10 ms
    expect(r.output).toBe('(120, 4)\n(240, 4)\n258\n(120, 4)\n');
    expect(tones(r.sound)).toEqual([[6, 880.3], [120, 0], [132, 880.3], [246, 0]]);
  });

  it('stop() silences a tune playing in the background; a note that is not a string is reported and ends it', async () => {
    const r = await run('music.play(music.NYAN, wait=False)\nsleep(200)\nmusic.stop()\nsleep(200)\nmusic.play(["c", 5, "d"])\nprint("after")\n');
    expect(tones(r.sound).at(-1)![1]).toBe(0);
    expect(r.output).toBe('TypeError: expecting a str for note\nafter\n');
  });

  it('any pitch is taken: the V2\'s audio mixer accepts every period (a real micro:bit, golden 06_music, 2026-11-06)', async () => {
    const r = await run('print(music.pitch(2000000))\n');
    expect(r.error).toBeUndefined();
    expect(r.output).toBe('None\n');
  });
});
