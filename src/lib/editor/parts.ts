import { PART_ART } from './library';

/**
 * The parts of the walking skeleton (M4.3; the rest come in M6, M7): their names in the parts panel, their legs as
 * offsets from the first leg (in drawing units, so a footprint lands on holes), the id prefix and first props.
 * Resistors and LEDs have no fixed picture — they are drawn from their holes — so their footprints are set here;
 * the push button's and the potentiometer's come from their art.json.
 */
export type PartType = 'resistor' | 'led' | 'button' | 'potentiometer';

export interface PartKind {
  type: PartType;
  name: string;
  detail: string;
  prefix: string;
  /** Leg name → offset from the first leg. */
  legs: Record<string, [number, number]>;
  props: Record<string, number | string | boolean>;
  /** Rows the first leg tries, in order, when the part is put in a free spot. */
  rows: string;
}

function fromArt(type: 'button' | 'potentiometer'): Record<string, [number, number]> {
  const legs = Object.entries(PART_ART[type].legs);
  const [, [x0, y0]] = legs[0]!;
  return Object.fromEntries(legs.map(([k, [x, y]]) => [k, [x - x0, y - y0]]));
}

export const PART_KINDS: PartKind[] = [
  { type: 'resistor', name: 'Resistor', detail: '220 Ω', prefix: 'r', legs: { a: [0, 0], b: [48, 0] }, props: { ohms: 220 }, rows: 'abcdefghij' },
  { type: 'led', name: 'LED', detail: 'red, 5 mm', prefix: 'led', legs: { a: [0, 0], k: [32, 0] }, props: { color: 'red' }, rows: 'abcdefghij' },
  // across the channel, so its two sides are not joined by the breadboard
  { type: 'button', name: 'Push button', detail: '12 mm', prefix: 'btn', legs: fromArt('button'), props: {}, rows: 'e' },
  { type: 'potentiometer', name: 'Potentiometer', detail: '10 kΩ knob', prefix: 'pot', legs: fromArt('potentiometer'), props: { ohms: 10_000 }, rows: 'abcdefghij' },
];

export function partKind(type: string): PartKind {
  const k = PART_KINDS.find((p) => p.type === type);
  if (!k) throw new Error(`there is no part "${type}"`);
  return k;
}

/** Where the legs' middle is from the first leg: the point a part is held by while it is dragged. */
export function legsCentre(type: string): [number, number] {
  const offs = Object.values(partKind(type).legs);
  return [offs.reduce((s, [x]) => s + x, 0) / offs.length, offs.reduce((s, [, y]) => s + y, 0) / offs.length];
}
