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
  /** a: anode, k: cathode. Fixed forward voltage by colour plus a small series resistance (decision 1); `vf` when
   *  the die is not the plain LED's of that colour (an RGB LED's green). */
  | { kind: 'led'; id: string; a: string; k: string; color: string; vf?: number }
  /** Closed while the part is pressed, or while its position is `closedWhen` (a slide switch). */
  | { kind: 'switch'; id: string; a: string; b: string; part: string; closedWhen: 'pressed' | number }
  /** Ends e1, e2 and wiper w; position 0–1 from e1 (state), 0.5 when not set; a joystick's axis reads `x` or `y`. */
  | { kind: 'pot'; id: string; e1: string; w: string; e2: string; ohms: number; part: string; axis?: 'x' | 'y' }
  /** Resistance from the light level (state lux), 300 lux when not set. */
  | { kind: 'ldr'; id: string; a: string; b: string; part: string }
  /** A sensor module's output (M6.3): OUT driven from GND by the part's `drive` (state; the sim works it out, see
   *  sensors.ts), weakly to GND when not set. */
  | { kind: 'drive'; id: string; out: string; gnd: string; part: string; key?: string }
  /** A load whose resistance the part sets as it works (M7): a servo draws more while it turns (state `ohms`). */
  | { kind: 'load'; id: string; a: string; b: string; part: string; ohms: number }
  /**
   * A driver's logic (M7): switches that open and close as its inputs say — a motor driver's outputs, a relay's coil and
   * contacts, a Darlington's sink. Each input is high from `threshold` above `gnd`; `table` gives, for the inputs' bits
   * ('10': the first high, the second low), which switches are closed ('1001': the first and the fourth). Unlisted, or
   * with no supply (none of `power` has its `minVolts` above `gnd`; an empty list needs none), the switches are as
   * `rest` (all open when not given). The solver solves again until the switches agree with what it solved.
   */
  | {
    kind: 'logic'; id: string; gnd: string; power: { net: string; minVolts: number }[]; threshold: number;
    inputs: string[]; switches: { id: string; a: string; b: string; ohms: number }[]; table: Record<string, string>; rest?: string;
  };

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
  /** A temperature sensor's °C (M6.3); a DHT's too, and its humidity %; how far an HC-SR04's object is, cm (M6.4). */
  celsius?: number;
  humidity?: number;
  cm?: number;
  /** A module's several outputs, by leg (M6.5a): what drives each now. */
  drives?: Record<string, { volts: number; ohms: number }>;
  /** A joystick's two axes 0–1 (0.5 at rest); an encoder's steps (counted on, + one way, − the other); a wheel's rpm. */
  x?: number;
  y?: number;
  steps?: number;
  rpm?: number;
  /** A BMP280's air pressure, hPa; a MAX30102's heart rate and oxygen (M6.5b). */
  hpa?: number;
  bpm?: number;
  spo2?: number;
  /** An MPU6050's tilt, degrees (M6.4b). */
  tiltx?: number;
  tilty?: number;
  /** What drives a sensor module's OUT now (M6.3): worked out by the sim from its input and its supply. */
  drive?: { volts: number; ohms: number };
  /** A load's resistance now (M7): a servo turning. */
  ohms?: number;
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

/** An SG90 (M7): 0.5 ms → 0°, 2.5 ms → 180°, every 20 ms; it turns 60° in 0.1 s (at 4.8 V), drawing ≈ 200 mA from
 *  5 V while it turns (`turningOhms`); below `minVolts` it can't turn. */
export const SERVO = { minUs: 500, maxUs: 2500, minVolts: 4.5, rest: 90, degPerS: 600, turningOhms: 25, periodUs: 20_000 } as const;

/**
 * The actuators of M7 (screens 25, 25b), from their datasheets and common modules:
 *   a TT gear motor (1:48, 3–6 V): ≈ 160 mA turning on 5 V; 36 rpm a volt (180 rpm on 5 V), stalled below 0.8 V;
 *   a small submersible pump (3–6 V): ≈ 180 mA on 6 V, pumping from 2.5 V;
 *   a 28BYJ-48 (5 V): four 50 Ω coils from its red common, 4096 half steps a turn; a coil is on from 20 mA.
 */
export const MOTOR = { ohms: 31, rpmPerVolt: 36, startVolts: 0.8 } as const;
export const PUMP = { ohms: 33, startVolts: 2.5 } as const;
export const STEPPER = { coilOhms: 50, onA: 0.02, halfSteps: 4096 } as const;

/**
 * The drivers and modules of M7:
 *   L9110S (HG7881): 2.5–12 V, inputs high from 2 V, each output a ≈ 1 Ω switch to VCC or GND;
 *   L298N module: its logic from 5V (4.5 V at least) or, with its 5V-EN jumper on (the regulator), from its 12V screw;
 *     inputs high from 2.3 V; each output a ≈ 5 Ω switch (its bipolar bridge loses ≈ 1–2 V on a motor);
 *   relay module (SRD-05VDC, a transistor on S): its 70 Ω coil pulls in from 3.75 V on + (not on 3.3 V), S high from 1.5 V;
 *   ULN2003 board: Darlington sinks of ≈ 8 Ω, inputs high from 2 V (2.7 kΩ each), an LED (1 kΩ) on each output;
 *   breadboard power supply (MB102): 5 V or 3.3 V on each rail pair, up to 700 mA.
 */
export const L9110S = { minVolts: 2.5, threshold: 2.0, ohms: 1, inputOhms: 10_000 } as const;
export const L298N = { minVolts: 4.5, threshold: 2.3, ohms: 5 } as const;
export const RELAY = { coilOhms: 70, pullInVolts: 3.75, threshold: 1.5, inputOhms: 10_000 } as const;
export const ULN2003 = { threshold: 2.0, ohms: 8, inputOhms: 2700, ledOhms: 1000 } as const;
export const POWER_SUPPLY = { ohms: 0.1, limitA: 1.0, maxA: 0.7, choices: [5, 3.3] } as const;
/** The kit's output modules: their LEDs' resistors on the board; the passive buzzer module's 42 Ω buzzer, switched by a
 *  transistor from I/O (high from 1.2 V; ≈ 1.2 kΩ into its base). */
export const KIT_LED_OHMS = { traffic: 330, rgb: 220 } as const;
export const BUZZER_MODULE = { ohms: 42, threshold: 1.2, inputOhms: 1200, minVolts: 2.5 } as const;

/**
 * Piezo buzzers, as a kit wires straight to a pin (M6.2). An active one (TMB12A03-type, 3–5 V self-drive) has its own
 * oscillator: from `minVolts` (+ above −) it sounds at `hz`, drawing ≈ 7 mA at 3.3 V (as `ohms`). A passive one is a
 * bare piezo disc: it draws next to nothing and sounds only with a square wave across it, at the wave's frequency,
 * from a swing of `minSwing`. (A magnetic buzzer, 16–42 Ω, would need a transistor: M7.)
 */
export const BUZZER = {
  active: { ohms: 470, hz: 2300, minVolts: 2.0 },
  passive: { ohms: 10_000, minSwing: 1.0 },
} as const;

/** Forward voltages as on screen 12b; rated 20 mA, burnt above 30 mA (decision 1). */
export const LED_COLORS: Record<string, { vf: number }> = {
  red: { vf: 2.0 },
  yellow: { vf: 2.1 },
  green: { vf: 2.2 },
  blue: { vf: 3.0 },
  white: { vf: 3.0 },
};

/** A 5 mm RGB LED's three dies (typical datasheet values, at 20 mA): its green and blue are InGaN, ≈ 3.0 V — not
 *  the 2.2 V of a plain green LED — so on 3.3 V through 220 Ω they are dim. */
export const RGB_DIES: [leg: 'r' | 'g' | 'b', color: string, vf: number][] = [['r', 'red', 2.0], ['g', 'green', 3.0], ['b', 'blue', 3.0]];

export const LED = {
  /** Series resistance. */
  ohms: 1,
  /** The forward voltage is exact at this current; the knee is this steep (thermal voltage × ideality). */
  refA: 0.01,
  nvt: 0.004,
  ratedA: 0.02,
  maxA: 0.03,
};
