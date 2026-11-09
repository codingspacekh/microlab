import type { CircuitSpec, SimState } from '@lib/circuit';
import { parseBoard } from '@lib/boards';
import picoJson from '../../library/boards/pico-w/board.json';
import { fortyPartsLayout } from './forty-parts';

/** A Pico W on a full breadboard with 40 parts: 14 LEDs each with its resistor, 4 buttons, 3 pots, 2 LDR dividers, a servo. */
export function fortyParts(): { spec: CircuitSpec; state: SimState } {
  const { pins, ...layout } = fortyPartsLayout();
  return { spec: { board: { data: parseBoard(picoJson) }, ...layout }, state: { pins } };
}
