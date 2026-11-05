/**
 * The electrical side of each part type: its legs and which of them are joined inside the part.
 * (Slices 4–6 add the devices each part becomes in the solver.)
 */
export interface PartModel {
  legs: readonly string[];
  /** Legs joined inside the part, always (a push button's legs on one side). */
  internal?: readonly (readonly [string, string])[];
}

export const MODELS: Record<string, PartModel> = {
  resistor: { legs: ['a', 'b'] },
  /** a: anode (long leg), k: cathode. */
  led: { legs: ['a', 'k'] },
  /** Across the channel: 1a–1b and 2a–2b are joined inside; pressing joins 1 and 2. */
  button: { legs: ['1a', '1b', '2a', '2b'], internal: [['1a', '1b'], ['2a', '2b']] },
  /** Slide switch: common leg 2 goes to 1 or to 3. */
  'slide-switch': { legs: ['1', '2', '3'] },
  /** Ends 1 and 3, wiper 2. */
  potentiometer: { legs: ['1', '2', '3'] },
  ldr: { legs: ['a', 'b'] },
  battery: { legs: ['+', '-'] },
  servo: { legs: ['gnd', 'vcc', 'signal'] },
};
