/**
 * The board's pins without a circuit (M2): what the board modules configure and drive, what they read back,
 * and the edges that raise IRQs. Inputs are levels scripted over time; outputs are recorded as a trace of
 * level changes. In M3 the circuit engine stands behind the same `Pins` calls (architecture §2.4).
 *
 * A pin is named by a string: the GPIO number for the chip's own pins ("15"), else the board's name for it
 * ("LED", the Pico W's LED on the Wi-Fi chip).
 */

export type PinMode = 'reset' | 'in' | 'out' | 'od' | 'alt';
export type Pull = 'none' | 'up' | 'down' | 'both';
export type Level = 0 | 1;

/** [µs since the run started, pin, level] — one entry per change of a pin's level. */
export type TraceEntry = [number, string, Level];

/** From `atUs` on, something outside drives `pin` to `level` (a button pressed, released). */
export interface InputChange {
  atUs: number;
  pin: string;
  level: Level;
}

export interface PinState {
  mode: PinMode;
  pull: Pull;
  /** The output register (rp2: gpio_put; kept while the pin is an input). */
  out: Level;
}

export interface PendingIrq {
  pin: string;
  handler: unknown;
  owner: unknown;
}

/** RP2040 pads come out of reset with their pull-down on (datasheet §2.19.6.3, PADS_BANK0 PDE = 1). */
const RESET: PinState = { mode: 'reset', pull: 'down', out: 0 };

export class PinBank {
  readonly trace: TraceEntry[] = [];
  private readonly state = new Map<string, PinState>();
  private readonly seen = new Map<string, Level>();
  private readonly outside = new Map<string, Level>();
  private readonly script: InputChange[];
  private next = 0;
  private readonly irqs = new Map<string, { rising: boolean; falling: boolean; handler: unknown; owner: unknown }>();
  private readonly pending: PendingIrq[] = [];

  constructor(inputs: InputChange[] = [], private readonly now: () => number = () => 0) {
    this.script = [...inputs].sort((a, b) => a.atUs - b.atUs);
  }

  get(pin: string): PinState {
    return this.state.get(pin) ?? { ...RESET };
  }

  /** mode, pull and (if given) the output register, which is set first so an output starts at its value. */
  configure(pin: string, mode: PinMode, pull: Pull, out?: Level): void {
    const s = this.get(pin);
    this.state.set(pin, { mode, pull, out: out ?? s.out });
    this.changed(pin);
  }

  write(pin: string, value: Level): void {
    this.state.set(pin, { ...this.get(pin), out: value });
    this.changed(pin);
  }

  toggle(pin: string): void {
    const s = this.get(pin);
    this.write(pin, s.out ? 0 : 1);
  }

  /** The level on the pin: driven by us (out, or open drain pulling low), else from outside, else its pull. */
  level(pin: string): Level {
    this.update();
    return this.levelNow(pin);
  }

  irq(pin: string, rising: boolean, falling: boolean, handler: unknown, owner: unknown): void {
    if (handler === null || handler === undefined || (!rising && !falling)) this.irqs.delete(pin);
    else this.irqs.set(pin, { rising, falling, handler, owner });
    this.seen.set(pin, this.levelNow(pin));
  }

  /** Applies the scripted input changes due by now; edges on pins with an IRQ queue its handler. */
  update(): void {
    const t = this.now();
    while (this.next < this.script.length && this.script[this.next]!.atUs <= t) {
      const c = this.script[this.next++]!;
      this.outside.set(c.pin, c.level);
      this.changed(c.pin);
    }
  }

  /** Handlers to schedule, oldest first; taking them empties the queue. */
  takePending(): PendingIrq[] {
    return this.pending.splice(0);
  }

  hasPending(): boolean {
    return this.pending.length > 0;
  }

  private levelNow(pin: string): Level {
    const s = this.get(pin);
    if (s.mode === 'out') return s.out;
    if (s.mode === 'od' && s.out === 0) return 0;
    const o = this.outside.get(pin);
    if (o !== undefined) return o;
    return s.pull === 'up' ? 1 : 0;   // floating reads 0 here; the circuit decides from M3 on
  }

  private changed(pin: string): void {
    const now = this.levelNow(pin);
    const before = this.seen.get(pin) ?? 0;   // every pin starts low (the reset pull-down)
    if (before === now) return;
    this.seen.set(pin, now);
    const s = this.get(pin);
    if (s.mode === 'out' || s.mode === 'od') this.trace.push([this.now(), pin, now]);
    const irq = this.irqs.get(pin);
    if (irq && ((now === 1 && irq.rising) || (now === 0 && irq.falling))) {
      this.pending.push({ pin, handler: irq.handler, owner: irq.owner });
    }
  }
}
