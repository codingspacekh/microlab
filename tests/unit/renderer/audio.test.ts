import { describe, expect, it } from 'vitest';
import { noteName, SoundPlayer, voicesOf, type AudioLike } from '../../../src/renderer/audio';

/** M6.2 F-36: what is heard while running — each sounding buzzer and the micro:bit's speaker is a voice, played with
 *  Web Audio (an oscillator and a gain each); muted, nothing plays. The AudioContext is a fake here. */
function fakeAudio() {
  const log: string[] = [];
  const param = (name: string, value = 0) => ({
    value,
    setValueAtTime(v: number) { this.value = v; log.push(`${name}=${v}`); },
  });
  let n = 0;
  const ctx = {
    currentTime: 0,
    destination: { id: 'out' },
    closed: false,
    oscillators: [] as { id: number; type: string; frequency: { value: number }; stopped: boolean }[],
    gains: [] as { gain: { value: number } }[],
    createOscillator() {
      const o = { id: ++n, type: 'sine', frequency: param(`osc${n + 0}.hz`), stopped: false, connect() {}, start() { log.push(`start ${o.id}`); }, stop() { o.stopped = true; log.push(`stop ${o.id}`); } };
      this.oscillators.push(o);
      return o;
    },
    createGain() {
      const g = { gain: param('gain', 1), connect() {} };
      this.gains.push(g);
      return g;
    },
    async close() { ctx.closed = true; },
  };
  let made = 0;
  const make = () => { made++; return ctx as unknown as AudioLike; };
  return { ctx, make, log, made: () => made };
}

describe('M6.2 the voices of a run', () => {
  it('each buzzer that sounds, and the micro:bit\'s speaker; LEDs and silent buzzers are not heard', () => {
    expect(voicesOf({
      led1: { kind: 'led', amps: 0.01, brightness: 0.5 },
      bz1: { kind: 'buzzer', hz: 440, volume: 1 },
      bz2: { kind: 'buzzer', hz: 0, volume: 0 },
      bz3: { kind: 'buzzer', hz: 2300, volume: 0.5 },
    }, 523)).toEqual([
      { id: 'bz1', hz: 440, volume: 1 },
      { id: 'bz3', hz: 2300, volume: 0.5 },
      { id: 'speaker', hz: 523, volume: 1 },
    ]);
    expect(voicesOf({}, 0)).toEqual([]);
  });

  it('a pitch says its note when it is one (within a quarter of a semitone)', () => {
    expect(noteName(440)).toBe('A4');
    expect(noteName(262)).toBe('C4');
    expect(noteName(392)).toBe('G4');
    expect(noteName(2300)).toBe('');
    expect(noteName(0)).toBe('');
  });
});

describe('M6.2 the sound player', () => {
  it('nothing is made until something sounds; a voice is an oscillator at its pitch', () => {
    const a = fakeAudio();
    const p = new SoundPlayer(a.make);
    p.set([], false);
    expect(a.made()).toBe(0);
    p.set([{ id: 'bz1', hz: 440, volume: 1 }], false);
    expect(a.made()).toBe(1);
    expect(a.ctx.oscillators).toHaveLength(1);
    expect(a.ctx.oscillators[0]).toMatchObject({ type: 'square', frequency: { value: 440 }, stopped: false });
  });

  it('a new note changes the pitch of the same voice; a voice that stops is stopped', () => {
    const a = fakeAudio();
    const p = new SoundPlayer(a.make);
    p.set([{ id: 'bz1', hz: 440, volume: 1 }], false);
    p.set([{ id: 'bz1', hz: 523, volume: 1 }, { id: 'speaker', hz: 523, volume: 1 }], false);
    expect(a.ctx.oscillators).toHaveLength(2);
    expect(a.ctx.oscillators[0]!.frequency.value).toBe(523);
    p.set([{ id: 'speaker', hz: 523, volume: 1 }], false);
    expect(a.ctx.oscillators[0]!.stopped).toBe(true);
    expect(a.ctx.oscillators[1]!.stopped).toBe(false);
  });

  it('muted: every voice stops and none starts; unmuted, they play again', () => {
    const a = fakeAudio();
    const p = new SoundPlayer(a.make);
    p.set([{ id: 'bz1', hz: 440, volume: 1 }], false);
    p.set([{ id: 'bz1', hz: 440, volume: 1 }], true);
    expect(a.ctx.oscillators[0]!.stopped).toBe(true);
    expect(a.ctx.oscillators).toHaveLength(1);
    p.set([{ id: 'bz1', hz: 440, volume: 1 }], false);
    expect(a.ctx.oscillators).toHaveLength(2);
  });

  it('quieter voices are quieter; closing stops everything and lets the device go', async () => {
    const a = fakeAudio();
    const p = new SoundPlayer(a.make);
    p.set([{ id: 'bz1', hz: 440, volume: 1 }, { id: 'bz2', hz: 660, volume: 0.25 }], false);
    const [, loud, quiet] = a.ctx.gains;   // the first is the player's own (master) gain
    expect(quiet!.gain.value).toBeCloseTo(loud!.gain.value * 0.25);
    p.close();
    expect(a.ctx.oscillators.every((o) => o.stopped)).toBe(true);
    expect(a.ctx.closed).toBe(true);
  });

  it('no Web Audio (a test window): nothing happens, nothing breaks', () => {
    const p = new SoundPlayer(() => null);
    expect(() => p.set([{ id: 'bz1', hz: 440, volume: 1 }], false)).not.toThrow();
    expect(() => p.close()).not.toThrow();
  });
});

describe('M7 slice 4: the micro:bit speaker\'s volume and waveform', () => {
  it('the speaker voice takes its volume and waveform; at volume 0 it isn\'t heard', () => {
    expect(voicesOf({}, 440, { volume: 0.25, wave: 'sine' })).toEqual([{ id: 'speaker', hz: 440, volume: 0.25, wave: 'sine' }]);
    expect(voicesOf({}, 440, { volume: 1, wave: 'square' })).toEqual([{ id: 'speaker', hz: 440, volume: 1 }]);
    expect(voicesOf({}, 440, { volume: 0, wave: 'square' })).toEqual([]);
  });

  it('the oscillator plays its waveform; noise as a sawtooth', () => {
    const a = fakeAudio();
    const p = new SoundPlayer(a.make);
    p.set([{ id: 'speaker', hz: 440, volume: 1, wave: 'triangle' }], false);
    expect(a.ctx.oscillators[0]!.type).toBe('triangle');
    p.set([{ id: 'speaker', hz: 300, volume: 0.5, wave: 'noise' }], false);
    expect(a.ctx.oscillators[0]!.type).toBe('sawtooth');
    p.set([{ id: 'speaker', hz: 300, volume: 0.5 }], false);
    expect(a.ctx.oscillators[0]!.type).toBe('square');
  });
});

/** 1.0.2: the micro:bit's voice (speech) — SAM's samples played once, not a tone at the voice's pitch. */
describe('1.0.2 the micro:bit says something', () => {
  function withBuffers() {
    const a = fakeAudio();
    const sources: { data: Float32Array<ArrayBufferLike>; rate: number; started: boolean; stopped: boolean }[] = [];
    Object.assign(a.ctx, {
      createBuffer(_channels: number, length: number, rate: number) { const data = new Float32Array(length); return { rate, data, getChannelData: () => data }; },
      createBufferSource() {
        const s = { buffer: null as { data: Float32Array<ArrayBufferLike>; rate: number } | null, connect() {}, start() { rec.started = true; rec.data = s.buffer!.data; rec.rate = s.buffer!.rate; }, stop() { rec.stopped = true; } };
        const rec: (typeof sources)[number] = { data: new Float32Array(0), rate: 0, started: false, stopped: false };
        sources.push(rec);
        return s;
      },
    });
    return { ...a, sources };
  }

  it('the speaker\'s sound while it speaks is no voice of its own: the samples are what is heard', () => {
    expect(voicesOf({}, 239, { volume: 1, wave: 'speech' })).toEqual([]);
  });

  it('its samples (0–255, 128 the middle) are played once, at their own rate, as loud as set_volume says', () => {
    const a = withBuffers();
    const p = new SoundPlayer(a.make);
    p.say({ samples: Uint8Array.from([128, 255, 0, 192]), rate: 19000, volume: 0.5 }, false);
    expect(a.sources).toHaveLength(1);
    expect(a.sources[0]!.started).toBe(true);
    expect(a.sources[0]!.rate).toBe(19000);
    expect([...a.sources[0]!.data]).toEqual([0, 127 / 128, -1, 0.5]);
    expect(a.ctx.gains.at(-1)!.gain.value).toBeCloseTo(0.3);
  });

  it('saying something new, Stop (null) or closing cuts short what it was saying; muted, or the speaker off, nothing plays', () => {
    const a = withBuffers();
    const p = new SoundPlayer(a.make);
    const said = { samples: Uint8Array.from([128, 200]), rate: 19000, volume: 1 };
    p.say(said, false);
    p.say(said, false);
    expect(a.sources[0]!.stopped).toBe(true);
    p.say(null, false);
    expect(a.sources[1]!.stopped).toBe(true);
    p.say(said, true);
    p.say({ ...said, volume: 0 }, false);
    expect(a.sources).toHaveLength(2);
    p.say(said, false);
    p.close();
    expect(a.sources[2]!.stopped).toBe(true);
  });

  it('a sound device without buffers (a test\'s fake) plays none, and nothing breaks', () => {
    const a = fakeAudio();
    expect(() => new SoundPlayer(a.make).say({ samples: Uint8Array.from([1]), rate: 19000, volume: 1 }, false)).not.toThrow();
  });
});
