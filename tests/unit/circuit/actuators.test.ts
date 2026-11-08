import { describe, expect, it } from 'vitest';
import { analyse, connect, logicPattern, MOTOR, RELAY, solve, toNetlist, type CircuitSpec, type Device, type SimState } from '@lib/circuit';
import { parseBoard } from '@lib/boards';
import picoJson from '../../../library/boards/pico-w/board.json';
import mbitJson from '../../../library/boards/microbit-v2/board.json';

/** M7 slice 1 (screens 25, 25b, 25c): the actuators, their drivers and the kit's output modules, electrically. */
const pico = parseBoard(picoJson);
const near = (got: number, want: number, tol = 0.02) => expect(Math.abs(got - want)).toBeLessThanOrEqual(Math.abs(want) * tol + 1e-6);
const onPico = (parts: CircuitSpec['parts'], wires: [string, string][] = []): CircuitSpec =>
  ({ board: { data: pico }, breadboards: [{ id: 'bb1', size: 'half' }], parts, wires: wires.map(([a, b], i) => ({ id: `w${i + 1}`, a, b })) });
const run = (spec: CircuitSpec, state: SimState = {}) => solve(toNetlist(spec).netlist, state);
const across = (spec: CircuitSpec, state: SimState, a: string, b: string) => {
  const { netlist, connectivity } = toNetlist(spec);
  const s = solve(netlist, state);
  return (s.volts[connectivity.netOf(a)!] ?? 0) - (s.volts[connectivity.netOf(b)!] ?? 0);
};
const out = (label: string, value: 0 | 1): SimState['pins'] => ({ [label]: { mode: 'out', value } });

describe('M7 terminals: a motor, a pump, an L298N lie beside the breadboard, wired to', () => {
  it('a part of terminals only needs no hole: no leg-not-placed', () => {
    const spec = onPico([{ id: 'm1', type: 'motor', legs: {} }, { id: 'l1', type: 'l298n', legs: {} }, { id: 'p1', type: 'pump', legs: {} }],
      [['board.VBUS', 'm1.+'], ['m1.-', 'board.GND']]);
    expect(connect(spec).problems).toEqual([]);
  });

  it('a TT motor on 5 V draws ≈ 160 mA', () => {
    const r = run(onPico([{ id: 'm1', type: 'motor', legs: {} }], [['board.VBUS', 'm1.+'], ['m1.-', 'board.GND']]));
    near(r.amps.m1!, 5 / MOTOR.ohms, 0.02);
    expect(r.amps.m1!).toBeGreaterThan(0.15);
  });

  it('a leg that is not a terminal still has to be placed', () => {
    expect(connect(onPico([{ id: 'r1', type: 'relay', legs: {} }])).problems.map((p) => p.kind === 'leg-not-placed' && p.leg)).toEqual(['s', 'vcc', 'gnd']);
  });
});

describe('M7 driver logic in the solver', () => {
  const logic = (power: number): Extract<Device, { kind: 'logic' }> => ({
    kind: 'logic', id: 'x', gnd: 'g', power: power ? [{ net: 'v', minVolts: power }] : [], threshold: 1.5, inputs: ['i', 'j'],
    switches: [{ id: 's', a: 'a', b: 'b', ohms: 1 }, { id: 't', a: 'a', b: 'c', ohms: 1 }], table: { 10: '10', '01': '01' }, rest: '00',
  });
  it('the inputs\' bits pick the switches; unlisted, or without power, the rest', () => {
    expect(logicPattern(logic(0), { i: 3.3, j: 0 })).toBe('10');
    expect(logicPattern(logic(0), { i: 0, j: 3.3 })).toBe('01');
    expect(logicPattern(logic(0), { i: 3.3, j: 3.3 })).toBe('00');
    expect(logicPattern(logic(4.5), { i: 3.3, j: 0, v: 3.3 })).toBe('00');
    expect(logicPattern(logic(4.5), { i: 3.3, j: 0, v: 5 })).toBe('10');
    expect(logicPattern({ ...logic(0), rest: undefined }, {})).toBe('00');
    // measured from its own ground
    expect(logicPattern(logic(0), { i: 3.3, j: 0, g: 2.5 })).toBe('00');
  });
});

describe('M7 L9110S (HG7881): two motors from two pins each', () => {
  // its header in row f, 8–13: B-IA B-IB GND VCC A-IA A-IB; MOTOR A to the motor's tabs
  const spec = onPico([
    { id: 'drv1', type: 'l9110s', legs: { 'b-ia': 'bb1.f8', 'b-ib': 'bb1.f9', gnd: 'bb1.f10', vcc: 'bb1.f11', 'a-ia': 'bb1.f12', 'a-ib': 'bb1.f13' } },
    { id: 'm1', type: 'motor', legs: {} },
  ], [['board.GND', 'bb1.j10'], ['board.VBUS', 'bb1.j11'], ['board.GP17', 'bb1.j12'], ['board.GP16', 'bb1.j13'], ['drv1.a1', 'm1.+'], ['drv1.a2', 'm1.-']]);
  const pins = (ia: 0 | 1, ib: 0 | 1): SimState => ({ pins: { ...out('GP17', ia), ...out('GP16', ib) } });

  it('A-IA high, A-IB low: the motor has ≈ 5 V forward; the other way round, backward', () => {
    near(across(spec, pins(1, 0), 'm1.+', 'm1.-'), 5 * MOTOR.ohms / (MOTOR.ohms + 2), 0.03);
    near(across(spec, pins(0, 1), 'm1.+', 'm1.-'), -5 * MOTOR.ohms / (MOTOR.ohms + 2), 0.03);
  });
  it('both low or both high: stopped', () => {
    expect(Math.abs(across(spec, pins(0, 0), 'm1.+', 'm1.-'))).toBeLessThan(0.01);
    expect(Math.abs(across(spec, pins(1, 1), 'm1.+', 'm1.-'))).toBeLessThan(0.01);
  });
  it('the motor\'s current comes from VBUS, not from the pins: no fault', () => {
    const a = analyse(spec, pins(1, 0));
    expect(a.faults).toEqual([]);
    expect(a.solution.amps['supply:VBUS']!).toBeGreaterThan(0.14);
    expect(a.solution.amps['pin:GP17']!).toBeLessThan(0.001);
  });
  it('with no VCC it does nothing', () => {
    const off = { ...spec, wires: spec.wires.filter((w) => w.a !== 'board.VBUS') };
    expect(Math.abs(across(off, pins(1, 0), 'm1.+', 'm1.-'))).toBeLessThan(0.01);
  });
});

describe('M7 L298N: beside the breadboard, its jumpers', () => {
  const parts = (props: Record<string, boolean> = {}): CircuitSpec['parts'] => [{ id: 'l1', type: 'l298n', props, legs: {} }, { id: 'm2', type: 'motor', legs: {} }];
  const wires: [string, string][] = [['board.VBUS', 'l1.12v'], ['board.GND', 'l1.gnd'], ['board.GP17', 'l1.in3'], ['board.GP16', 'l1.in4'], ['l1.out3', 'm2.+'], ['l1.out4', 'm2.-']];
  const st = (a: 0 | 1, b: 0 | 1): SimState => ({ pins: { ...out('GP17', a), ...out('GP16', b) } });

  it('ENB\'s jumper on: IN3 high, IN4 low turns motor B forward, IN3 low, IN4 high backward — its bridge loses ≈ 1–2 V', () => {
    const v = across(onPico(parts(), wires), st(1, 0), 'm2.+', 'm2.-');
    expect(v).toBeGreaterThan(3);
    expect(v).toBeLessThan(4.2);
    expect(across(onPico(parts(), wires), st(0, 1), 'm2.+', 'm2.-')).toBeLessThan(-3);
  });
  it('both the same: a brake, 0 V', () => {
    expect(Math.abs(across(onPico(parts(), wires), st(1, 1), 'm2.+', 'm2.-'))).toBeLessThan(0.01);
  });
  it('ENB\'s jumper off: ENB must be high (a PWM there sets the speed); low, the outputs let go', () => {
    const spec = onPico(parts({ enb: false }), [...wires, ['board.GP18', 'l1.enb']]);
    expect(Math.abs(across(spec, { pins: { ...st(1, 0).pins, ...out('GP18', 0) } }, 'm2.+', 'm2.-'))).toBeLessThan(0.01);
    expect(across(spec, { pins: { ...st(1, 0).pins, ...out('GP18', 1) } }, 'm2.+', 'm2.-')).toBeGreaterThan(3);
  });
  it('its 5V-EN jumper off and nothing on 5V: its logic has no power', () => {
    expect(Math.abs(across(onPico(parts({ regulator: false }), wires), st(1, 0), 'm2.+', 'm2.-'))).toBeLessThan(0.01);
    // its logic fed on its 5V screw instead
    const fed = onPico(parts({ regulator: false }), [...wires, ['board.VSYS', 'l1.5v']]);
    expect(across(fed, st(1, 0), 'm2.+', 'm2.-')).toBeGreaterThan(3);
  });
});

describe('M7 relay module: S switches COM from NC to NO', () => {
  // header S + − in row f, 19–21; COM from 3V3, an LED... the pump on NO, apart from the board
  const spec = (vcc = 'board.VBUS') => onPico([
    { id: 'rel1', type: 'relay', legs: { s: 'bb1.f19', vcc: 'bb1.f20', gnd: 'bb1.f21' } },
    { id: 'p1', type: 'pump', legs: {} },
    { id: 'bat1', type: 'battery', props: { kind: '4xAA' }, legs: { '+': 'bb1.T+26', '-': 'bb1.T-25' } },
  ], [['board.GP15', 'bb1.j19'], [vcc, 'bb1.j20'], ['board.GND', 'bb1.j21'], ['rel1.com', 'bb1.T+27'], ['rel1.no', 'p1.+'], ['p1.-', 'bb1.T-28']]);

  it('S high on 5 V: the coil (≈ 71 mA) pulls in, the pump runs on the pack\'s 6 V; S low: it stops', () => {
    const on = run(spec(), { pins: out('GP15', 1) });
    near(on.amps['rel1:coil']!, 5 / RELAY.coilOhms, 0.03);
    expect(on.amps.p1!).toBeGreaterThan(0.17);
    expect(on.amps['pin:GP15']!).toBeLessThan(0.001);
    const off = run(spec(), { pins: out('GP15', 0) });
    expect(off.amps['rel1:coil']).toBeUndefined();
    expect(Math.abs(off.amps.p1!)).toBeLessThan(1e-6);
  });
  it('on 3.3 V its coil can\'t pull in: nothing switches', () => {
    expect(Math.abs(run(spec('board.3V3'), { pins: out('GP15', 1) }).amps.p1!)).toBeLessThan(1e-6);
  });
  it('a low-level trigger switches on S low', () => {
    const low = spec();
    low.parts[0]!.props = { trigger: 'low' };
    expect(run(low, { pins: out('GP15', 0) }).amps.p1!).toBeGreaterThan(0.17);
  });
  it('without power COM stays on NC', () => {
    const s = onPico([{ id: 'rel1', type: 'relay', legs: { s: 'bb1.f19', vcc: 'bb1.f20', gnd: 'bb1.f21' } }, { id: 'r1', type: 'resistor', props: { ohms: 1000 }, legs: { a: 'bb1.a3', b: 'bb1.a6' } }],
      [['board.3V3', 'rel1.com'], ['rel1.nc', 'bb1.e3'], ['bb1.e6', 'board.GND']]);
    near(run(s).amps.r1!, 3.3 / 1000, 0.01);
  });
});

describe('M7 ULN2003 and a 28BYJ-48', () => {
  const spec = onPico([
    { id: 'uln1', type: 'uln2003', legs: { in1: 'bb1.f4', in2: 'bb1.f5', in3: 'bb1.f6', in4: 'bb1.f7', '-': 'bb1.f8', '+': 'bb1.f9' } },
    { id: 'step1', type: 'stepper', legs: { blue: 'uln1.a', pink: 'uln1.b', yellow: 'uln1.c', orange: 'uln1.d', red: 'uln1.m' } },
  ], [['board.GP2', 'bb1.j4'], ['board.GP3', 'bb1.j5'], ['board.GP4', 'bb1.j6'], ['board.GP5', 'bb1.j7'], ['board.GND', 'bb1.j8'], ['board.VBUS', 'bb1.j9']]);

  it('IN1 and IN2 high: coils A and B take ≈ 90 mA each, LEDs A and B light; C and D are off', () => {
    const r = run(spec, { pins: { ...out('GP2', 1), ...out('GP3', 1), ...out('GP4', 0), ...out('GP5', 0) } });
    for (const c of ['A', 'B']) expect(r.amps[`step1:${c}`]!).toBeGreaterThan(0.08);
    for (const c of ['C', 'D']) expect(Math.abs(r.amps[`step1:${c}`]!)).toBeLessThan(1e-4);
    expect(r.amps['uln1:A']!).toBeGreaterThan(0.002);
    expect(r.amps['uln1:C']!).toBeLessThan(1e-5);
    expect(r.amps['pin:GP2']!).toBeLessThan(0.002);   // ≈ 1 mA into its 2.7 kΩ
    expect(connect(spec).problems).toEqual([]);
  });
});

describe('M7 the kit\'s output modules', () => {
  it('traffic light: R high lights the red LED through its resistor, a few mA', () => {
    const r = run(onPico([{ id: 'tl1', type: 'traffic-module', legs: { r: 'bb1.f13', y: 'bb1.f14', g: 'bb1.f15', gnd: 'bb1.f16' } }],
      [['board.GP13', 'bb1.j13'], ['board.GND', 'bb1.j16']]), { pins: out('GP13', 1) });
    expect(r.amps['tl1:r']!).toBeGreaterThan(0.003);
    expect(r.amps['tl1:r']!).toBeLessThan(0.006);
    expect(r.amps['tl1:g']!).toBeLessThan(1e-6);
  });
  it('RGB module: its blue die lights from a pin, its resistor on the board', () => {
    const r = run(onPico([{ id: 'rgb1', type: 'rgb-module', legs: { r: 'bb1.f25', g: 'bb1.f26', b: 'bb1.f27', gnd: 'bb1.f28' } }],
      [['board.GP19', 'bb1.j27'], ['board.GND', 'bb1.j28']]), { pins: out('GP19', 1) });
    expect(r.amps['rgb1:b']!).toBeGreaterThan(0.0005);
    expect(r.amps['rgb1:r']!).toBeLessThan(1e-6);
  });
  it('passive buzzer module: I/O high switches its buzzer across VCC; a pin gives only its base current', () => {
    const spec = onPico([{ id: 'bzm1', type: 'buzzer-module', legs: { io: 'bb1.f20', vcc: 'bb1.f21', gnd: 'bb1.f22' } }],
      [['board.GP12', 'bb1.j20'], ['board.3V3', 'bb1.j21'], ['board.GND', 'bb1.j22']]);
    const on = run(spec, { pins: out('GP12', 1) });
    expect(on.amps.bzm1!).toBeGreaterThan(0.06);
    expect(on.amps['pin:GP12']!).toBeLessThan(0.004);
    expect(Math.abs(run(spec, { pins: out('GP12', 0) }).amps.bzm1!)).toBeLessThan(1e-6);
  });
});

describe('M7 breadboard power supply: each rail pair 5 V or 3.3 V', () => {
  const psu = (props: Record<string, number | boolean> = {}) => onPico([
    { id: 'psu1', type: 'power-supply', props, legs: { 't-1': 'bb1.T-1', 't-2': 'bb1.T-2', 't+1': 'bb1.T+1', 't+2': 'bb1.T+2', 'b+1': 'bb1.B+1', 'b+2': 'bb1.B+2', 'b-1': 'bb1.B-1', 'b-2': 'bb1.B-2' } },
    { id: 'r1', type: 'resistor', props: { ohms: 100 }, legs: { a: 'bb1.T+10', b: 'bb1.T-10' } },
    { id: 'r2', type: 'resistor', props: { ohms: 100 }, legs: { a: 'bb1.B+10', b: 'bb1.B-10' } },
  ]);
  it('as it comes: the top rails 5 V, the bottom 3.3 V', () => {
    const r = run(psu());
    near(r.amps.r1!, 0.05, 0.01);
    near(r.amps.r2!, 0.033, 0.01);
  });
  it('its jumpers: the top on 3.3 V, the bottom on 5 V; switched off, nothing', () => {
    const r = run(psu({ top: 3.3, bottom: 5 }));
    near(r.amps.r1!, 0.033, 0.01);
    near(r.amps.r2!, 0.05, 0.01);
    expect(Math.abs(run(psu({ on: false })).amps.r1!)).toBeLessThan(1e-9);
  });
  it('its two GNDs are one, and the board\'s GND joins them by a wire', () => {
    const c = connect(psu());
    expect(c.netOf('bb1.T-5')).toBe(c.netOf('bb1.B-5'));
  });
});

describe('M7 screen 25c: a motor needs a driver', () => {
  const direct = (data = pico, pin = 'board.GP15', gnd = 'board.GND') => ({
    board: { data }, breadboards: [], parts: [{ id: 'motor1', type: 'motor', legs: {} }],
    wires: [{ id: 'w1', a: pin, b: 'motor1.+' }, { id: 'w2', a: 'motor1.-', b: gnd }],
  }) as CircuitSpec;

  it('a TT motor straight on GP15: the pin is damaged (all it can give, more than its 12 mA)', () => {
    const a = analyse(direct(), { pins: out('GP15', 1) });
    expect(a.faults).toEqual([{ kind: 'motor-on-pin', severity: 'damage', on: 'GP15', part: 'motor1', amps: expect.closeTo(0.046, 2), limitA: 0.012 }]);
  });
  it('on the micro:bit\'s P0 too; with the pin low, nothing happens', () => {
    const mbit = parseBoard(mbitJson);
    expect(analyse(direct(mbit, 'board.P0', 'board.GND'), { pins: out('P0', 1) }).faults.map((f) => `${f.kind} ${f.on}`)).toEqual(['motor-on-pin P0']);
    expect(analyse(direct(), { pins: out('GP15', 0) }).faults).toEqual([]);
  });
  it('a servo on 3V3 is a warning, as before', () => {
    const a = analyse(onPico([{ id: 's1', type: 'servo', legs: { gnd: 'bb1.a22', vcc: 'bb1.a21', signal: 'bb1.a20' } }],
      [['board.3V3', 'bb1.e21'], ['board.GND', 'bb1.e22']]), {});
    expect(a.faults.map((f) => `${f.kind} ${f.on} ${f.severity}`)).toEqual(['servo-underpowered s1 warning']);
  });
  it('a servo turning draws more (its load from the sim): ≈ 200 mA on VBUS', () => {
    const spec = onPico([{ id: 's1', type: 'servo', legs: { gnd: 'bb1.a22', vcc: 'bb1.a21', signal: 'bb1.a20' } }], [['board.VBUS', 'bb1.e21'], ['board.GND', 'bb1.e22']]);
    near(run(spec).amps.s1!, 5 / 500, 0.02);
    near(run(spec, { parts: { s1: { ohms: 25 } } }).amps.s1!, 5 / 25, 0.02);
  });
});
