import type { PartView } from '../sim/circuit';

/**
 * What is heard while a program runs (M6.2, F-36): each sounding buzzer and the micro:bit's speaker is a voice — a
 * square wave at its pitch, as loud as its view says — played with Web Audio from the laptop's speakers. The player
 * makes its AudioContext only when something first sounds (a run started by a click), and lets it go when closed.
 */
export interface Voice {
  id: string;
  hz: number;
  volume: number;
}

/** The voices of a run now: the buzzers that sound, then the micro:bit's speaker (`speakerHz`, 0 for silence). */
export function voicesOf(parts: Record<string, PartView>, speakerHz = 0): Voice[] {
  const out: Voice[] = [];
  for (const [id, v] of Object.entries(parts)) if (v.kind === 'buzzer' && v.hz > 0 && v.volume > 0) out.push({ id, hz: v.hz, volume: v.volume });
  if (speakerHz > 0) out.push({ id: 'speaker', hz: speakerHz, volume: 1 });
  return out;
}

const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

/** The note a pitch is ('A4' for 440 Hz), or '' when it is between notes (more than a quarter of a semitone off). */
export function noteName(hz: number): string {
  if (!(hz > 0)) return '';
  const semis = 12 * Math.log2(hz / 440) + 57;   // 0 = C0
  const n = Math.round(semis);
  if (Math.abs(semis - n) > 0.25) return '';
  return `${NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12)}`;
}

/** The part of Web Audio the player uses (a fake in the tests). */
interface Param { value: number; setValueAtTime(v: number, t: number): void }
interface Node_ { connect(to: unknown): void }
interface Osc extends Node_ { type: string; frequency: Param; start(): void; stop(): void }
interface Gain extends Node_ { gain: Param }
export interface AudioLike {
  currentTime: number;
  destination: unknown;
  createOscillator(): Osc;
  createGain(): Gain;
  close(): Promise<void>;
}

/** Each voice's loudness at full volume: buzzers are piercing, so all of them together stay well below clipping. */
const LEVEL = 0.12;

export const webAudio = (): AudioLike | null => {
  const Ctx = (globalThis as { AudioContext?: new () => AudioLike }).AudioContext;
  return Ctx ? new Ctx() : null;
};

export class SoundPlayer {
  private ctx: AudioLike | null | undefined;
  private master: Gain | undefined;
  private readonly playing = new Map<string, { osc: Osc; gain: Gain }>();

  constructor(private readonly make: () => AudioLike | null = webAudio) {}

  /** Plays these voices (and stops the others); muted, nothing plays. */
  set(voices: Voice[], muted: boolean): void {
    const want = muted ? [] : voices;
    if (want.length && this.ctx === undefined) {
      this.ctx = this.make();
      if (this.ctx) {
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
      }
    }
    const ctx = this.ctx;
    const keep = new Set(want.map((v) => v.id));
    for (const [id, p] of this.playing) {
      if (keep.has(id)) continue;
      p.osc.stop();
      this.playing.delete(id);
    }
    if (!ctx || !this.master) return;
    for (const v of want) {
      let p = this.playing.get(v.id);
      if (!p) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.connect(gain);
        gain.connect(this.master);
        osc.start();
        p = { osc, gain };
        this.playing.set(v.id, p);
      }
      p.osc.frequency.setValueAtTime(v.hz, ctx.currentTime);
      p.gain.gain.setValueAtTime(LEVEL * v.volume, ctx.currentTime);
    }
  }

  /** Stops everything and lets the sound device go. */
  close(): void {
    for (const p of this.playing.values()) p.osc.stop();
    this.playing.clear();
    void this.ctx?.close().catch(() => {});
    this.ctx = undefined;
    this.master = undefined;
  }
}
