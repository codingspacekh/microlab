import type { BoardData } from '../boards';
import type { BreadboardSize } from './breadboard';

/**
 * A circuit as the engine sees it: the board, the breadboards, the parts and the wires (architecture §2.5).
 * Points are named `<owner>.<name>`:
 *   bb1.a5, bb1.T+1      a breadboard hole
 *   board.GP15, board.GND@38, board.GND    a board pin, by id or label
 *   r1.a, btn1.1a        a part's leg
 */
export type PointRef = string;

export interface PartSpec {
  id: string;
  /** A part type from the models (resistor, led, button …). */
  type: string;
  props?: Record<string, number | string | boolean>;
  /** Leg name → the hole or pin it is plugged into. */
  legs: Record<string, PointRef>;
}

export interface WireSpec {
  id: string;
  a: PointRef;
  b: PointRef;
}

export interface CircuitSpec {
  /** The board is always the point owner `board`. `plugs`: pin id or label → the hole it is pushed into. */
  board?: { data: BoardData; usb?: boolean; plugs?: Record<string, PointRef> };
  breadboards: { id: string; size: BreadboardSize }[];
  parts: PartSpec[];
  wires: WireSpec[];
}

/** Wiring problems found while connecting (the wiring check, F-18), instead of a crash. */
export type Problem =
  | { kind: 'unknown-point'; point: PointRef; by: string }
  | { kind: 'unknown-part-type'; part: string; type: string }
  | { kind: 'unknown-leg'; part: string; leg: string }
  | { kind: 'leg-not-placed'; part: string; leg: string };
