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

/** From `atUs` on, something outside drives `pin`: to a logic `level` (a button pressed, released), or to a
 *  voltage (a knob; its logic level is HIGH from half the supply up). */
export type InputChange = { atUs: number; pin: string } & (
  | { level: Level; volts?: undefined; touched?: undefined }
  | { volts: number; level?: undefined; touched?: undefined }
  /** A finger on a touch pin (ESP32 TouchPad, micro:bit). */
  | { touched: boolean; level?: undefined; volts?: undefined }
  /** The micro:bit's accelerometer (pin 'ACCEL'): readings in mg, or a shake (src/sim/motion.ts). */
  | { vector: [number, number, number]; level?: undefined; volts?: undefined; touched?: undefined }
  | { gesture: 'shake'; level?: undefined; volts?: undefined; touched?: undefined }
);

/** [µs since the run started, pin, volts] — one entry per change of an analog output (ESP32 DAC). */
export type AnalogEntry = [number, string, number];

/** [µs since the run started, pin, frequency in Hz, duty 0–1] — one entry per change of a PWM output. */
export type PwmEntry = [number, string, number, number];

/** The supply the pins switch between (all three boards run their GPIO at 3.3 V). */
export const VDD = 3.3;

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

/** A pin after reset: RP2040 pads come out of reset with their pull-down on (datasheet §2.19.6.3, PADS_BANK0
 *  PDE = 1); the ESP32's GPIO matrix starts as inputs with no pull (each board passes its own). */
export const RP2040_RESET: PinState = { mode: 'reset', pull: 'down', out: 0 };

export class PinBank {
  readonly trace: TraceEntry[] = [];
  readonly pwmTrace: PwmEntry[] = [];
  readonly analogTrace: AnalogEntry[] = [];
  private readonly analogOut = new Map<string, number>();
  private readonly touchedPins = new Set<string>();
  private readonly falls = new Map<string, number>();
  private readonly pwm = new Map<string, { freq: number; duty: number }>();
  private readonly outsideVolts = new Map<string, number>();
  private readonly state = new Map<string, PinState>();
  private readonly seen = new Map<string, Level>();
  private readonly outside = new Map<string, Level>();
  private readonly script: InputChange[];
  private next = 0;
  private readonly irqs = new Map<string, { rising: boolean; falling: boolean; handler: unknown; owner: unknown }>();
  private readonly pending: PendingIrq[] = [];

  constructor(
    inputs: InputChange[] = [],
    private readonly now: () => number = () => 0,
    private readonly reset: PinState = RP2040_RESET,
    /** Pins with a pull-up resistor on the board itself (the micro:bit's buttons and I²C lines). */
    private readonly pulledUp: ReadonlySet<string> = new Set(),
  ) {
    this.script = inputs.filter((c) => c.pin !== 'ACCEL').sort((a, b) => a.atUs - b.atUs);
  }

  get(pin: string): PinState {
    return this.state.get(pin) ?? { ...this.reset };
  }

  /** Brings the level a pin reads at reset (a board pull-up) into the record, so its first press is an edge. */
  private initialLevel(pin: string): Level {
    return this.pulledUp.has(pin) ? 1 : 0;
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

  /** The voltage on the pin, for an ADC: from outside if driven, else what the pin itself drives or pulls to. */
  volts(pin: string): number {
    this.update();
    const v = this.outsideVolts.get(pin);
    if (v !== undefined) return v;
    const a = this.analogOut.get(pin);
    if (a !== undefined) return a;
    const p = this.pwm.get(pin);
    if (p) return p.duty * VDD;
    return this.levelNow(pin) * VDD;
  }

  /** An analog output on the pin (ESP32 DAC), or none (`volts` < 0). */
  setAnalog(pin: string, volts: number): void {
    const before = this.analogOut.get(pin);
    if (volts < 0) {
      this.analogOut.delete(pin);
      return;
    }
    if (before === volts) return;
    this.analogOut.set(pin, volts);
    this.analogTrace.push([this.now(), pin, volts]);
  }

  /** Is a finger on the pin (touch sensing)? */
  touched(pin: string): boolean {
    this.update();
    return this.touchedPins.has(pin);
  }

  /** A PWM output on the pin (duty 0–1), or none (`duty` < 0): its average is what M3's circuit sees. */
  setPwm(pin: string, freq: number, duty: number): void {
    const before = this.pwm.get(pin);
    if (duty < 0) {
      if (!before) return;
      this.pwm.delete(pin);
      this.pwmTrace.push([this.now(), pin, before.freq, 0]);
      return;
    }
    if (before && before.freq === freq && before.duty === duty) return;
    this.pwm.set(pin, { freq, duty });
    this.pwmTrace.push([this.now(), pin, freq, duty]);
  }

  /** When the next scripted input change is due (µs), or Infinity: a sleep wakes for it. */
  nextChangeUs(): number {
    return this.script[this.next]?.atUs ?? Infinity;
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
      if (c.touched !== undefined) {
        if (c.touched) this.touchedPins.add(c.pin);
        else this.touchedPins.delete(c.pin);
        continue;
      }
      if (c.volts !== undefined) {
        this.outsideVolts.set(c.pin, c.volts);
        this.outside.set(c.pin, c.volts >= VDD / 2 ? 1 : 0);
      } else if (c.level !== undefined) {
        this.outsideVolts.delete(c.pin);
        this.outside.set(c.pin, c.level);
      }
      this.changed(c.pin);
    }
  }

  /** How many times the pin went from high to low since the last call (button presses, counted by the board). */
  takeFalls(pin: string): number {
    this.update();
    const n = this.falls.get(pin) ?? 0;
    this.falls.delete(pin);
    return n;
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
    if (this.pulledUp.has(pin)) return 1;
    return s.pull === 'up' ? 1 : 0;   // floating reads 0 here; the circuit decides from M3 on
  }

  private changed(pin: string): void {
    const now = this.levelNow(pin);
    const before = this.seen.get(pin) ?? this.initialLevel(pin);   // low, or high with a board pull-up
    if (before === now) return;
    this.seen.set(pin, now);
    if (now === 0) this.falls.set(pin, (this.falls.get(pin) ?? 0) + 1);
    const s = this.get(pin);
    if (s.mode === 'out' || s.mode === 'od') this.trace.push([this.now(), pin, now]);
    const irq = this.irqs.get(pin);
    if (irq && ((now === 1 && irq.rising) || (now === 0 && irq.falling))) {
      this.pending.push({ pin, handler: irq.handler, owner: irq.owner });
    }
  }
}
