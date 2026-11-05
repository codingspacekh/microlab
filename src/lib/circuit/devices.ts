/**
 * What the solver works on (architecture §2.5): nets and devices. Plain data, so `solve()` is one function
 * with data in and data out (Q14). Devices whose value changes while the program runs (pins, buttons,
 * potentiometers, light sensors) read it from the SimState at solve time; the netlist stays the same.
 * Electrical choices: docs/acceptance/M1.md, "Modelling decisions".
 */
export type Device =
  | { kind: 'resistor'; id: string; a: string; b: string; ohms: number }
  /**
   * A supply (3V3, VBUS, a battery): `volts` from minus to plus through `ohms`, saturating smoothly at `limitA`
   * (decision 3). Current is reported out of plus, into the circuit.
   */
  | { kind: 'source'; id: string; plus: string; minus: string; volts: number; ohms: number; limitA: number }
  /** A board GPIO pin to the board's ground: driven, PWM, or an input with or without its pull resistor (decision 2). */
  | {
    kind: 'pin'; id: string; net: string; gnd: string; label: string;
    volts: number; ohms: number; limitA: number; pullOhms: number; noPulls?: boolean;
  }
  /** a: anode, k: cathode. Fixed forward voltage by colour plus a small series resistance (decision 1). */
  | { kind: 'led'; id: string; a: string; k: string; color: string };

export interface Netlist {
  nets: string[];
  /** The 0 V reference: the board's GND (or the first net). */
  ground?: string;
  devices: Device[];
}

export type PinState =
  | { mode: 'out'; value: 0 | 1 }
  /** PWM by its average (§1.7): duty 0–1. */
  | { mode: 'pwm'; duty: number }
  | { mode: 'in'; pull?: 'up' | 'down' | 'none' };

/** What changes while the program runs. A pin with no state is an input with no pull. */
export interface SimState {
  /** By pin label (GP15, D2, P0). */
  pins?: Record<string, PinState>;
}

/** Forward voltages as on screen 12b; rated 20 mA, burnt above 30 mA (decision 1). */
export const LED_COLORS: Record<string, { vf: number }> = {
  red: { vf: 2.0 },
  yellow: { vf: 2.1 },
  green: { vf: 2.2 },
  blue: { vf: 3.0 },
  white: { vf: 3.0 },
};

export const LED = {
  /** Series resistance. */
  ohms: 1,
  /** The forward voltage is exact at this current; the knee is this steep (thermal voltage × ideality). */
  refA: 0.01,
  nvt: 0.004,
  ratedA: 0.02,
  maxA: 0.03,
};
