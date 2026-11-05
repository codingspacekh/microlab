import type { BoardData } from '@lib/boards';
import { findFaults, solve, toNetlist, type CircuitSpec, type Fault, type Netlist, type PartState, type PinState, type SimState, type Solution } from '@lib/circuit';
import type { Control } from './control';
import type { PinBank } from './pins';

/**
 * The circuit engine inside the sim (M3, architecture §2.2): the board's pins and the parts' inputs make a
 * SimState; the circuit is solved when something needs its answer (a pin read, an ADC, a sleep, the VM hook) —
 * not on every write, so a tight `toggle()` loop stays fast — and the solved voltages are what the pins read.
 */

/** From `atUs` on, a part's input: a button pressed, a knob's position (0–1 from leg 1), the light on an LDR. */
export interface PartChange {
  atUs: number;
  /** A part id, or the board's own (board.A, board.B on the micro:bit). */
  part: string;
  pressed?: boolean;
  position?: number;
  lux?: number;
}

/** Up to this many PWM pins are averaged exactly (2^n solves: an RGB LED is 3); beyond, their DC average. */
const MAX_PWM_AVERAGED = 4;

export class CircuitHost {
  readonly netlist: Netlist;
  private readonly netOfPin = new Map<string, string>();   // pin key ('15') → its net
  private readonly labelOfPin = new Map<string, string>(); // pin key → its label ('GP15')
  private readonly parts: Record<string, PartState> = {};
  private readonly script: PartChange[];
  private next = 0;
  private solution: Solution | undefined;
  private dirty = true;
  faults: Fault[] = [];

  constructor(
    private readonly spec: CircuitSpec,
    private readonly pins: PinBank,
    private readonly now: () => number,
    changes: PartChange[] = [],
    private readonly live?: Control,
  ) {
    const { netlist, connectivity } = toNetlist(spec);
    this.netlist = netlist;
    const board: BoardData | undefined = spec.board?.data;
    for (const p of board?.pins ?? []) {
      if (p.role !== 'gpio' || p.same || p.gpio === undefined) continue;
      const net = connectivity.netOf(`board.${p.id}`);
      if (net === undefined) continue;
      this.netOfPin.set(String(p.gpio), net);
      this.labelOfPin.set(String(p.gpio), p.label);
    }
    this.script = [...changes].sort((a, b) => a.atUs - b.atUs);
  }

  /** Is this pin key on the board's header (in the circuit)? */
  has(pin: string): boolean {
    return this.netOfPin.has(pin);
  }

  /** Something the pins drive changed: the next answer needs a new solve. */
  invalidate(): void {
    this.dirty = true;
  }

  /** Applies part inputs due by now; true if any changed. */
  private updateParts(): boolean {
    let changed = false;
    const t = this.now();
    while (this.next < this.script.length && this.script[this.next]!.atUs <= t) {
      const c = this.script[this.next++]!;
      const s = (this.parts[c.part] ??= {});
      if (c.pressed !== undefined) s.pressed = c.pressed;
      if (c.position !== undefined) s.position = c.position;
      if (c.lux !== undefined) s.lux = c.lux;
      changed = true;
    }
    if (this.live) changed = this.readLive(this.live) || changed;
    return changed;
  }

  private readonly liveSeen: number[] = [];

  /** Live slots 'pressed:btn1' (0 / 1), 'position:pot1' (0–1), 'lux:ldr1'. */
  private readLive(live: Control): boolean {
    let changed = false;
    live.names.forEach((name, i) => {
      const [kind, part] = name.split(':') as [string, string];
      if (kind !== 'pressed' && kind !== 'position' && kind !== 'lux') return;
      const v = live.input(i);
      if (this.liveSeen[i] === v || (Number.isNaN(v) && this.liveSeen[i] === undefined)) return;
      this.liveSeen[i] = v;
      const s = (this.parts[part] ??= {});
      if (kind === 'pressed') s.pressed = v > 0.5;
      else s[kind] = v;
      changed = true;
    });
    return changed;
  }

  /** When the next scripted part input is due (µs), or Infinity: a sleep wakes for it. */
  nextChangeUs(): number {
    return this.script[this.next]?.atUs ?? Infinity;
  }

  private readonly previous = new Map<number, Solution>();   // the last solution of each on / off combination

  /** Solves if anything changed, then lets the pins see new input levels (edges, IRQs). PWM pins are averaged
   *  over their on and off states (M3.3): the circuit is solved for each combination of the PWM pins high and low
   *  and the answers weighted by the duties — an LED on 50 % carries half its current (on a steady duty × 3.3 V it
   *  would stay below its forward voltage). Faults are found in every combination: the peaks are what burn. */
  update(): void {
    if (this.updateParts()) this.dirty = true;
    if (!this.dirty) return;
    this.dirty = false;
    const state = this.state();
    const pwm: [string, number][] = [];
    for (const [label, p] of Object.entries(state.pins!)) {
      if (p.mode !== 'pwm') continue;
      if (p.duty <= 0 || p.duty >= 1) state.pins![label] = { mode: 'out', value: p.duty >= 1 ? 1 : 0 };
      else pwm.push([label, p.duty]);
    }
    if (pwm.length === 0 || pwm.length > MAX_PWM_AVERAGED) {
      // more PWM pins than that: their DC average (duty × voltage) — fine for resistive loads
      this.solution = solve(this.netlist, state, this.previous.get(-1));
      this.previous.set(-1, this.solution);
      this.faults = findFaults(this.spec, this.netlist, this.solution, state);
    } else {
      this.averagePwm(state, pwm);
    }
    for (const pin of this.netOfPin.keys()) this.pins.recheck(pin);
  }

  private averagePwm(state: SimState, pwm: [string, number][]): void {
    const volts: Record<string, number> = {};
    const amps: Record<string, number> = {};
    const faults = new Map<string, Fault>();
    let converged = true;
    let iterations = 0;
    for (let mask = 0; mask < 1 << pwm.length; mask++) {
      let weight = 1;
      const pins = { ...state.pins };
      pwm.forEach(([label, duty], i) => {
        const on = (mask >> i) & 1;
        weight *= on ? duty : 1 - duty;
        pins[label] = { mode: 'out', value: on ? 1 : 0 };
      });
      const combo = { ...state, pins };
      const sol = solve(this.netlist, combo, this.previous.get(mask));
      this.previous.set(mask, sol);
      converged &&= sol.converged;
      iterations += sol.iterations;
      for (const [k, v] of Object.entries(sol.volts)) volts[k] = (volts[k] ?? 0) + weight * v;
      for (const [k, v] of Object.entries(sol.amps)) amps[k] = (amps[k] ?? 0) + weight * v;
      for (const f of findFaults(this.spec, this.netlist, sol, combo)) {
        const key = `${f.kind}:${f.on}`;
        const before = faults.get(key);
        if (!before || (f.amps ?? 0) > (before.amps ?? 0)) faults.set(key, f);
      }
    }
    this.solution = { volts, amps, converged, iterations };
    this.faults = [...faults.values()];
  }

  /** A device's current (A), averaged over PWM (an LED's, a resistor's …); 0 if it carries none. */
  amps(id: string): number {
    this.update();
    return this.solution!.amps[id] ?? 0;
  }

  /** The solved voltage of a header pin's net. */
  volts(pin: string): number {
    this.update();
    const net = this.netOfPin.get(pin)!;
    return this.solution!.volts[net] ?? 0;
  }

  /** What the program's pins and the parts' inputs are now, for the solver. */
  private state(): SimState {
    const pins: Record<string, PinState> = {};
    for (const [key, label] of this.labelOfPin) pins[label] = this.pins.engineState(key);
    return { pins, parts: { ...this.parts } };
  }
}
