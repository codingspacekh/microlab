import { describe, expect, it } from 'vitest';
import { analyse, type CircuitSpec, type Fault, type SimState } from '@lib/circuit';
import { parseBoard } from '@lib/boards';
import picoJson from '../../../library/boards/pico-w/board.json';
import mbitJson from '../../../library/boards/microbit-v2/board.json';
import espJson from '../../../library/boards/esp32-devkit-v1/board.json';

const pico = parseBoard(picoJson);
const onPico = (parts: CircuitSpec['parts'], wires: CircuitSpec['wires'] = []): CircuitSpec =>
  ({ board: { data: pico }, breadboards: [], parts, wires });
const faults = (spec: CircuitSpec, state: SimState = {}) => analyse(spec, state).faults;
const kinds = (f: Fault[]) => f.map((x) => `${x.kind}:${x.on}`);
const HIGH = (label: string): SimState => ({ pins: { [label]: { mode: 'out', value: 1 } } });

describe('F-37 no false alarms', () => {
  it('Blink as on screen 03 (GP13 → 220 Ω → red LED → GND), HIGH and LOW: no faults', () => {
    const spec = onPico([
      { id: 'r1', type: 'resistor', props: { ohms: 220 }, legs: { a: 'board.GP13', b: 'led1.a' } },
      { id: 'led1', type: 'led', props: { color: 'red' }, legs: { k: 'board.GND' } },
    ]);
    expect(faults(spec, HIGH('GP13'))).toEqual([]);
    expect(faults(spec, { pins: { GP13: { mode: 'out', value: 0 } } })).toEqual([]);
  });

  it('a board on its own, every pin unused: no faults', () => {
    expect(faults(onPico([]))).toEqual([]);
  });
});

describe('F-37 short circuit (§1.3: "3V3 or a HIGH pin wired straight to GND")', () => {
  it('3V3 wired to GND', () => {
    const f = faults(onPico([], [{ id: 'w1', a: 'board.3V3', b: 'board.GND' }]));
    expect(kinds(f)).toEqual(['short:3V3']);
    expect(f[0]).toMatchObject({ severity: 'damage', amps: 0.8 });
  });

  it('a HIGH pin wired to GND is a short; the same pin LOW is not', () => {
    const spec = onPico([], [{ id: 'w1', a: 'board.GP15', b: 'board.GND' }]);
    expect(kinds(faults(spec, HIGH('GP15')))).toEqual(['short:GP15']);
    expect(faults(spec, { pins: { GP15: { mode: 'out', value: 0 } } })).toEqual([]);
  });

  it("a battery's + wired to its −: the short is on the battery", () => {
    const f = faults({ breadboards: [], parts: [{ id: 'bat1', type: 'battery', props: { kind: '9V' }, legs: { '+': 'bat1.-' } }], wires: [] });
    expect(kinds(f)).toEqual(['short:bat1']);
  });

  it('a button between 3V3 and GND shorts only while it is pressed', () => {
    const spec = onPico([{ id: 'btn1', type: 'button', legs: { '1a': 'board.3V3', '2a': 'board.GND' } }]);
    expect(faults(spec)).toEqual([]);
    expect(kinds(faults(spec, { parts: { btn1: { pressed: true } } }))).toEqual(['short:3V3']);
  });
});

describe('F-37 over-current (screen 04)', () => {
  const noResistor = onPico([{ id: 'led1', type: 'led', props: { color: 'green' }, legs: { a: 'board.GP13', k: 'board.GND' } }]);

  it('a green LED straight on GP13: the LED burns at ≈ 48 mA (it can take 20), and GP13 gave more than its 12 mA', () => {
    const f = faults(noResistor, HIGH('GP13'));
    expect(kinds(f)).toEqual(['led-burnt:led1', 'pin-over-current:GP13']);
    expect(f[0]).toMatchObject({ severity: 'damage', limitA: 0.03, ratedA: 0.02 });
    expect(Math.round(f[0]!.amps! * 1000)).toBe(48);
    expect(f[1]).toMatchObject({ severity: 'warning', limitA: 0.012 });
    expect(Math.round(f[1]!.amps! * 1000)).toBe(48);
  });

  it('an LED with too small a resistor (47 Ω): 1.3 / 48 ≈ 27 mA is over its 20 mA but not burnt', () => {
    const f = faults(onPico([
      { id: 'r1', type: 'resistor', props: { ohms: 47 }, legs: { a: 'board.3V3', b: 'led1.a' } },
      { id: 'led1', type: 'led', legs: { k: 'board.GND' } },
    ]));
    expect(kinds(f)).toEqual(['led-over-current:led1']);
    expect(f[0]!.severity).toBe('warning');
  });

  it('a pin sinking too much counts too (LOW pin, 100 Ω from 3V3: 33 mA in)', () => {
    const f = faults(onPico([{ id: 'r1', type: 'resistor', props: { ohms: 100 }, legs: { a: 'board.3V3', b: 'board.GP2' } }]),
      { pins: { GP2: { mode: 'out', value: 0 } } });
    expect(kinds(f)).toEqual(['pin-over-current:GP2']);
  });

  it('five pins each under 12 mA but 55 mA together: over the board\'s 50 mA', () => {
    const labels = ['GP2', 'GP3', 'GP4', 'GP5', 'GP6'];
    const spec = onPico(labels.map((l, i) => ({ id: `r${i}`, type: 'resistor', props: { ohms: 300 }, legs: { a: `board.${l}`, b: 'board.GND' } })));
    const f = faults(spec, { pins: Object.fromEntries(labels.map((l) => [l, { mode: 'out', value: 1 } as const])) });
    expect(kinds(f)).toEqual(['board-over-current:board']);
    expect(f[0]!.amps).toBeCloseTo(5 * 3.3 / 300, 3);
    expect(f[0]!.limitA).toBe(0.05);
  });

  it('3V3 asked for more than its 300 mA (10 Ω across it): a warning, not a short', () => {
    const f = faults(onPico([{ id: 'r1', type: 'resistor', props: { ohms: 10 }, legs: { a: 'board.3V3', b: 'board.GND' } }]));
    expect(kinds(f)).toEqual(['supply-over-current:3V3']);
    expect(f[0]).toMatchObject({ severity: 'warning', limitA: 0.3 });
  });
});

describe('F-37 5 V into a GPIO pin', () => {
  it('VBUS wired to GP2: the pin takes at most 3.3 V', () => {
    const f = faults(onPico([], [{ id: 'w1', a: 'board.VBUS', b: 'board.GP2' }]), { pins: { GP2: { mode: 'in' } } });
    expect(kinds(f)).toEqual(['over-voltage:GP2']);
    expect(f[0]).toMatchObject({ severity: 'damage', limitV: 3.8 });
    expect(f[0]!.volts).toBeCloseTo(5, 2);
  });
});

describe('F-37 floating input (§1.3)', () => {
  it('an input with no pull and nothing on it is floating; with its pull-up it is not', () => {
    expect(kinds(faults(onPico([]), { pins: { GP14: { mode: 'in' } } }))).toEqual(['floating:GP14']);
    expect(faults(onPico([]), { pins: { GP14: { mode: 'in', pull: 'up' } } })).toEqual([]);
  });

  it('a button to GND with no pull: floating while released, fine while pressed', () => {
    const spec = onPico([{ id: 'btn1', type: 'button', legs: { '1a': 'board.GP14', '2a': 'board.GND' } }]);
    const read: SimState = { pins: { GP14: { mode: 'in', pull: 'none' } } };
    expect(kinds(faults(spec, read))).toEqual(['floating:GP14']);
    expect(faults(spec, { ...read, parts: { btn1: { pressed: true } } })).toEqual([]);
  });

  it("a potentiometer's wiper holds an input (screen 03: the pot on GP26)", () => {
    const spec = onPico([{ id: 'pot1', type: 'potentiometer', legs: { 1: 'board.3V3', 2: 'board.GP26', 3: 'board.GND' } }]);
    expect(faults(spec, { pins: { GP26: { mode: 'in' } } })).toEqual([]);
  });

  it("the micro:bit's P5 has the board's own 10 k pull-up (button A): never floating", () => {
    expect(faults({ board: { data: parseBoard(mbitJson) }, breadboards: [], parts: [], wires: [] }, { pins: { P5: { mode: 'in' } } })).toEqual([]);
  });

  it('a pull-up asked for on a pin that has none (ESP32 GPIO 34–39) does not count: still floating', () => {
    const esp = { board: { data: parseBoard(espJson) }, breadboards: [], parts: [], wires: [] };
    expect(kinds(faults(esp, { pins: { D34: { mode: 'in', pull: 'up' } } }))).toEqual(['floating:D34']);
    expect(faults(esp, { pins: { D32: { mode: 'in', pull: 'up' } } })).toEqual([]);
  });

  it('an input through a lit LED is held by it, through a dark one it floats', () => {
    const spec = onPico([
      { id: 'r1', type: 'resistor', props: { ohms: 220 }, legs: { a: 'board.GP13', b: 'board.GP14' } },
      { id: 'led1', type: 'led', legs: { a: 'board.GP14', k: 'board.GND' } },
    ]);
    expect(faults(spec, { pins: { GP13: { mode: 'out', value: 1 }, GP14: { mode: 'in' } } })).toEqual([]);
    expect(kinds(faults(spec, { pins: { GP13: { mode: 'in' }, GP14: { mode: 'in' } } }))).toEqual(['floating:GP13', 'floating:GP14']);
  });
});

describe('F-37 servo on 3V3 (§1.3)', () => {
  const servo = (vcc: string) => onPico([{ id: 's1', type: 'servo', legs: { gnd: 'board.GND', vcc, signal: 'board.GP15' } }]);
  it('powered from 3V3: needs about 5 V', () => {
    const f = faults(servo('board.3V3'));
    expect(kinds(f)).toEqual(['servo-underpowered:s1']);
    expect(f[0]!.volts).toBeCloseTo(3.3, 1);
  });
  it('from VBUS (5 V): fine; not connected: nothing to say', () => {
    expect(faults(servo('board.VBUS'))).toEqual([]);
    expect(faults(onPico([{ id: 's1', type: 'servo', legs: { gnd: 'board.GND', signal: 'board.GP15' } }]))).toEqual([]);
  });
});

describe('analyse()', () => {
  it('gives the nets, the solution and the faults in one go', () => {
    const a = analyse(onPico([]), {});
    expect(a.solution.converged).toBe(true);
    expect(a.connectivity.netOf('board.GND')).toBe('GND');
    expect(a.faults).toEqual([]);
  });
});
