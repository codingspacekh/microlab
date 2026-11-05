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
  | { kind: 'led'; id: string; a: string; k: string; color: string }
  /** Closed while the part is pressed, or while its position is `closedWhen` (a slide switch). */
  | { kind: 'switch'; id: string; a: string; b: string; part: string; closedWhen: 'pressed' | number }
  /** Ends e1, e2 and wiper w; position 0–1 from e1 (state), 0.5 when not set. */
  | { kind: 'pot'; id: string; e1: string; w: string; e2: string; ohms: number; part: string }
  /** Resistance from the light level (state lux), 300 lux when not set. */
  | { kind: 'ldr'; id: string; a: string; b: string; part: string };

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

/** A part's inputs from the user (the inspector's sliders, clicking a button). */
export interface PartState {
  pressed?: boolean;
  /** Potentiometer 0–1 from leg 1; slide switch 0 (2 joined to 1) or 1 (2 joined to 3). */
  position?: number;
  lux?: number;
}

/** What changes while the program runs. A pin with no state is an input with no pull. */
export interface SimState {
  /** By pin label (GP15, D2, P0). */
  pins?: Record<string, PinState>;
  /** By part id; the board's own parts as board.<id> (board.A). */
  parts?: Record<string, PartState>;
}

/** A closed switch or button contact. */
export const CONTACT_OHMS = 0.05;
/** A potentiometer's wiper contact, so the ends are never 0 Ω. */
export const WIPER_OHMS = 0.5;

/** A GL5528-type light-dependent resistor: ≈ 15 kΩ at 10 lux, R ∝ lux^−0.7, between 100 Ω and 1 MΩ. */
export function ldrOhms(lux: number): number {
  if (lux <= 0) return 1e6;
  return Math.min(1e6, Math.max(100, 15_000 * (lux / 10) ** -0.7));
}

/** Battery packs: voltage, internal resistance, the current they can push at most. */
export const BATTERIES: Record<string, { volts: number; ohms: number; limitA: number }> = {
  '2xAA': { volts: 3.0, ohms: 0.3, limitA: 2 },
  '4xAA': { volts: 6.0, ohms: 0.6, limitA: 2 },
  '9V': { volts: 9.0, ohms: 1.5, limitA: 0.5 },
};

/** An SG90 at rest draws about 10 mA from 5 V. */
export const SERVO_IDLE_OHMS = 500;

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
