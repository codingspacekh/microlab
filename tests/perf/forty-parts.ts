import type { CircuitSpec, PartSpec, SimState } from '../../src/lib/circuit';

/** The 40-part circuit's layout, without the board's data (no JSON imported: the e2e tests' loader reads this too —
 *  tests/e2e/perf.spec.ts saves it as a project). A Pico W on a full breadboard: 14 LEDs each with its resistor,
 *  4 buttons, 3 pots, 2 LDR dividers, a servo; every pin's state for the solver. */
export function fortyPartsLayout(): Pick<CircuitSpec, 'breadboards' | 'parts' | 'wires'> & { pins: NonNullable<SimState['pins']> } {
  const parts: PartSpec[] = [];
  const wires: CircuitSpec['wires'] = [
    { id: 'gnd', a: 'board.GND', b: 'bb1.B-1' },
    { id: '3v3', a: 'board.3V3', b: 'bb1.T+1' },
  ];
  const pins: SimState['pins'] = {};
  const colors = ['red', 'yellow', 'green', 'blue', 'white'];
  for (let i = 0; i < 14; i++) {
    const col = 1 + i * 3;
    parts.push(
      { id: `r${i}`, type: 'resistor', props: { ohms: 220 }, legs: { a: `bb1.a${col}`, b: `bb1.a${col + 1}` } },
      { id: `led${i}`, type: 'led', props: { color: colors[i % 5]! }, legs: { a: `bb1.b${col + 1}`, k: `bb1.B-${[1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 13, 14, 15, 16][i]}` } },
    );
    wires.push({ id: `wp${i}`, a: `board.GP${i}`, b: `bb1.c${col}` });
    pins[`GP${i}`] = { mode: 'out', value: (i % 2) as 0 | 1 };
  }
  for (let i = 0; i < 4; i++) {
    const col = 44 + i * 4;
    parts.push({ id: `btn${i}`, type: 'button', legs: { '1a': `bb1.e${col}`, '1b': `bb1.f${col}`, '2a': `bb1.e${col + 2}`, '2b': `bb1.f${col + 2}` } });
    wires.push({ id: `wb${i}`, a: `board.GP${14 + i}`, b: `bb1.a${col}` }, { id: `wg${i}`, a: `bb1.j${col + 2}`, b: 'bb1.B-25' });
    pins[`GP${14 + i}`] = { mode: 'in', pull: 'up' };
  }
  ['GP26', 'GP27', 'GP28'].forEach((label, i) => {
    parts.push({ id: `pot${i}`, type: 'potentiometer', legs: { 1: 'bb1.T+31', 2: `board.${label}`, 3: 'bb1.B-31' } });
    pins[label] = { mode: 'in' };
  });
  ['GP18', 'GP19'].forEach((label, i) => {
    parts.push(
      { id: `ldr${i}`, type: 'ldr', legs: { a: 'bb1.T+37', b: `board.${label}` } },
      { id: `rl${i}`, type: 'resistor', props: { ohms: 10_000 }, legs: { a: `board.${label}`, b: 'bb1.B-37' } },
    );
    pins[label] = { mode: 'in' };
  });
  parts.push({ id: 'servo', type: 'servo', legs: { gnd: 'bb1.B-43', vcc: 'board.VBUS', signal: 'board.GP20' } });
  return { breadboards: [{ id: 'bb1', size: 'full' }], parts, wires, pins };
}
