import { BATTERIES, RGB_DIES, SERVO_IDLE_OHMS, type Device } from './devices';

/** What a part's devices are built from: its id, the net each leg is in, its properties. */
export interface PartContext {
  id: string;
  leg: (name: string) => string;
  props: Record<string, number | string | boolean>;
}

/**
 * The electrical side of each part type (architecture §2.5): its legs, which legs are joined inside the part,
 * and the devices it becomes in the solver. Behaviours (brightness, angle …) are in src/lib/parts, later.
 */
export interface PartModel {
  legs: readonly string[];
  /** Legs joined inside the part, always (a push button's legs on one side). */
  internal?: readonly (readonly [string, string])[];
  devices: (p: PartContext) => Device[];
}

export const MODELS: Record<string, PartModel> = {
  resistor: {
    legs: ['a', 'b'],
    devices: ({ id, leg, props }) => [{ kind: 'resistor', id, a: leg('a'), b: leg('b'), ohms: Number(props.ohms ?? 220) }],
  },
  /** a: anode (long leg), k: cathode. */
  led: {
    legs: ['a', 'k'],
    devices: ({ id, leg, props }) => [{ kind: 'led', id, a: leg('a'), k: leg('k'), color: String(props.color ?? 'red') }],
  },
  /** RGB LED: legs red, the common (the longest), green, blue — three LEDs (`<id>:r`, `:g`, `:b`) sharing the common
   *  leg, their cathodes (common: 'cathode', the default) or their anodes ('anode'). */
  'rgb-led': {
    legs: ['r', 'common', 'g', 'b'],
    devices: ({ id, leg, props }) => RGB_DIES.map(([l, color, vf]): Device => (props.common === 'anode'
      ? { kind: 'led', id: `${id}:${l}`, a: leg('common'), k: leg(l), color, vf }
      : { kind: 'led', id: `${id}:${l}`, a: leg(l), k: leg('common'), color, vf })),
  },
  /** Across the channel: 1a–1b and 2a–2b are joined inside; pressing joins 1 and 2. */
  button: {
    legs: ['1a', '1b', '2a', '2b'],
    internal: [['1a', '1b'], ['2a', '2b']],
    devices: ({ id, leg }) => [{ kind: 'switch', id, a: leg('1a'), b: leg('2a'), part: id, closedWhen: 'pressed' }],
  },
  /** Slide switch: the common leg 2 goes to 1 (position 0) or to 3 (position 1). */
  'slide-switch': {
    legs: ['1', '2', '3'],
    devices: ({ id, leg }) => [
      { kind: 'switch', id: `${id}:1`, a: leg('2'), b: leg('1'), part: id, closedWhen: 0 },
      { kind: 'switch', id: `${id}:3`, a: leg('2'), b: leg('3'), part: id, closedWhen: 1 },
    ],
  },
  /** Ends 1 and 3, wiper 2. */
  potentiometer: {
    legs: ['1', '2', '3'],
    devices: ({ id, leg, props }) => [{ kind: 'pot', id, e1: leg('1'), w: leg('2'), e2: leg('3'), ohms: Number(props.ohms ?? 10_000), part: id }],
  },
  ldr: {
    legs: ['a', 'b'],
    devices: ({ id, leg }) => [{ kind: 'ldr', id, a: leg('a'), b: leg('b'), part: id }],
  },
  battery: {
    legs: ['+', '-'],
    devices: ({ id, leg, props }) => {
      const b = BATTERIES[String(props.kind)] ?? BATTERIES['9V']!;
      return [{ kind: 'source', id, plus: leg('+'), minus: leg('-'), ...b }];
    },
  },
  /** Power between vcc and gnd; the signal leg is an input (its pulses are the behaviour's, M7). */
  servo: {
    legs: ['gnd', 'vcc', 'signal'],
    devices: ({ id, leg }) => [{ kind: 'resistor', id, a: leg('vcc'), b: leg('gnd'), ohms: SERVO_IDLE_OHMS }],
  },
};
