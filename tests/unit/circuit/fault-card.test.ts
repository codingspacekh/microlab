import { describe, expect, it } from 'vitest';
import { analyse, faultCard, faultCards, faultSummary, runTime, stoppedBy, type CircuitSpec, type Fault, type SimState } from '@lib/circuit';
import { parseBoard } from '@lib/boards';
import picoJson from '../../../library/boards/pico-w/board.json';
import mbitJson from '../../../library/boards/microbit-v2/board.json';
import espJson from '../../../library/boards/esp32-devkit-v1/board.json';

/**
 * M9 slice 2 (F-37, §1.3 Teaching faults): one test per fault, from the circuit to what the card and Problems say
 * (screens 04, 25c, 26c, 27c, 28d).
 */
const pico = parseBoard(picoJson);
const mbit = parseBoard(mbitJson);
const esp = parseBoard(espJson);
type Parts = CircuitSpec['parts'];
const onPico = (parts: Parts, wires: CircuitSpec['wires'] = []): CircuitSpec => ({ board: { data: pico }, breadboards: [], parts, wires });
const HIGH = (label: string): SimState => ({ pins: { [label]: { mode: 'out', value: 1 } } });
/** The engine's faults on this circuit, each as its card. */
const cards = (spec: CircuitSpec, state: SimState = {}, atMs?: number) =>
  analyse(spec, state).faults.map((f) => faultCard({ ...f, ...(atMs !== undefined ? { atMs } : {}) }, { board: spec.board?.data, parts: spec.parts }));
const numbers = (c: { numbers: { label: string; value: string }[] }) => c.numbers.map((n) => `${n.label} ${n.value}`);

describe('§1.3 LED with no resistor (screen 04)', () => {
  const traffic = onPico([{ id: 'led1', type: 'led', props: { color: 'green' }, legs: { a: 'board.GP13', k: 'board.GND' } }]);
  const [burnt, pin] = cards(traffic, HIGH('GP13'), 1400);

  it('the card: LED1 burnt out, GP13 straight to the green LED, its numbers and the fix', () => {
    expect(burnt).toMatchObject({
      key: 'led-burnt:led1', severity: 'damage', title: 'LED1 burnt out', heading: 'LED1 (green) burnt out',
      why: 'GP13 goes straight to the green LED with no resistor, so far too much current flowed. A real LED would now be dead.',
      fix: 'put a 220 Ω resistor between GP13 and the LED.',
      show: { part: 'led1' }, hurt: { led: 'led1' },
    });
    expect(numbers(burnt!)).toEqual(['Current ≈ 48 mA', 'LED can take 20 mA', 'Pin can give 12 mA']);
    expect(burnt!.numbers[0]!.bad).toBe(true);
  });

  it('Problems: about 48 mA from GP13, no resistor, and when the run stopped', () => {
    expect(burnt!.line).toBe('About 48 mA from GP13 — no resistor. The simulation stopped at 00:01.4.');
  });

  it('and GP13 gave more than it should (a warning)', () => {
    expect(pin).toMatchObject({ severity: 'warning', title: 'GP13 gave more than it should', show: { pin: 'GP13' } });
    expect(pin!.line).toBe('48 mA from one pin; a Pico W pin should give at most 12 mA.');
    expect(pin!.hurt).toBeUndefined();
  });

  it('the status bar: "1 part damaged · 1 warning", "Stopped: a part was damaged"', () => {
    expect(faultSummary([burnt!, pin!])).toBe('1 part damaged · 1 warning');
    expect(stoppedBy(burnt!)).toBe('Stopped: a part was damaged');
  });

  it('too small a resistor (47 Ω from 3V3): a warning, a bigger resistor', () => {
    const [c] = cards(onPico([
      { id: 'r1', type: 'resistor', props: { ohms: 47 }, legs: { a: 'board.3V3', b: 'led1.a' } },
      { id: 'led1', type: 'led', props: { color: 'red' }, legs: { k: 'board.GND' } },
    ]));
    expect(c).toMatchObject({ severity: 'warning', title: 'LED1 gets too much current', heading: 'LED1 (red) gets too much current', fix: 'a bigger resistor: 220 Ω or more.' });
    expect(numbers(c!)).toEqual(['Current ≈ 27 mA', 'LED is made for 20 mA']);
  });

  it("an RGB LED's red die on a pin: RGB1 (red), a resistor on each colour leg", () => {
    const [c] = cards(onPico([{ id: 'rgb1', type: 'rgb-led', legs: { r: 'board.GP13', common: 'board.GND' } }]), HIGH('GP13'));
    expect(c).toMatchObject({ title: 'RGB1 (red) burnt out', fix: 'a 220 Ω on each of its colour legs.', show: { part: 'rgb1' }, hurt: { led: 'rgb1:r' } });
    expect(c!.why).toContain('GP13 goes straight to the red LED');
  });

  it("screen 26c: a 7-segment digit's segment with COM straight on GND — a 220 Ω on COM", () => {
    const f: Fault = { kind: 'led-burnt', severity: 'damage', on: 'digit1:a', amps: 0.048, limitA: 0.03, ratedA: 0.02, partType: 'seven-segment', via: 'GP18' };
    const c = faultCard(f, { board: pico });
    expect(c.title).toBe("DIGIT1's segment a burnt out");
    expect(c.why).toBe('GP18 goes straight to segment a with no resistor, so far too much current flowed. A real LED would now be dead.');
    expect(c.fix).toBe('a 220 Ω from COM to GND, or one on each segment.');
  });
});

describe('§1.3 LED the wrong way round', () => {
  it('stays dark: a warning, turn it round', () => {
    const [c] = cards(onPico([
      { id: 'r1', type: 'resistor', props: { ohms: 220 }, legs: { a: 'board.GP13', b: 'led1.k' } },
      { id: 'led1', type: 'led', legs: { a: 'board.GND' } },
    ]), HIGH('GP13'));
    expect(c).toMatchObject({ severity: 'warning', title: 'LED1 is the wrong way round', show: { part: 'led1' } });
    expect(c!.fix).toBe('turn it round: the long leg towards the pin, the short leg (the flat side) towards GND.');
    expect(numbers(c!)).toEqual(['Across it, backwards 3.3 V']);
  });
});

describe('§1.3 3V3 or a HIGH pin straight to GND', () => {
  it('3V3 to GND: a short circuit, the run stops', () => {
    const [c] = cards(onPico([], [{ id: 'w1', a: 'board.3V3', b: 'board.GND' }]), {}, 200);
    expect(c).toMatchObject({ severity: 'damage', title: 'A short circuit on 3V3', show: { pin: '3V3' } });
    expect(c!.why).toBe('3V3 is wired straight to GND, with nothing between: as much current flows as the board can give. A real board would reset, or be damaged.');
    expect(c!.fix).toBe('take away the wire between 3V3 and GND, or put a part between them (a resistor, an LED with its resistor).');
    expect(c!.line).toBe('3V3 straight to GND: about 800 mA. The simulation stopped at 00:00.2.');
    expect(faultSummary([c!])).toBe('1 short circuit');
    expect(stoppedBy(c!)).toBe('Stopped: a short circuit');
  });

  it('GP15 HIGH to GND: the pin is hurt; LOW to 3V3 says so', () => {
    const [high] = cards(onPico([], [{ id: 'w1', a: 'board.GP15', b: 'board.GND' }]), HIGH('GP15'));
    expect(high).toMatchObject({ title: 'A short circuit on GP15', hurt: { pin: 'GP15' } });
    expect(high!.why).toMatch(/^GP15 is HIGH and wired straight to GND/);
    expect(numbers(high!)).toEqual(['Current ≈ 48 mA', 'Pin can give 12 mA']);
    expect(faultSummary([high!])).toBe('1 pin damaged');
    const low = cards(onPico([], [{ id: 'w1', a: 'board.GP15', b: 'board.3V3' }]), { pins: { GP15: { mode: 'out', value: 0 } } }).find((c) => c.title.startsWith('A short'));
    expect(low!.why).toMatch(/^GP15 is LOW and wired straight to 3V3/);
  });

  it("a battery's + to its −", () => {
    const [c] = cards({ breadboards: [], parts: [{ id: 'bat1', type: 'battery', props: { kind: '9V' }, legs: { '+': 'bat1.-' } }], wires: [] });
    expect(c).toMatchObject({ title: 'A short circuit on BAT1', show: { part: 'bat1' } });
    expect(c!.why).toBe("BAT1's + is wired straight to its −: as much current flows as it can give. A real battery gets hot.");
  });
});

describe('§1.3 5 V into a GPIO pin', () => {
  it('VBUS on GP2: GP2 was damaged, it takes 3.3 V at most, a divider', () => {
    const [c] = cards(onPico([], [{ id: 'w1', a: 'board.VBUS', b: 'board.GP2' }]), { pins: { GP2: { mode: 'in' } } });
    expect(c).toMatchObject({ severity: 'damage', title: 'GP2 was damaged', hurt: { pin: 'GP2' } });
    expect(numbers(c!)).toEqual(['On the pin 5.0 V', 'Pin takes 3.3 V']);
    expect(c!.fix).toContain('divider');
  });
});

describe('§1.3 an input with nothing connected', () => {
  it('floating: PULL_UP or PULL_DOWN', () => {
    const [c] = cards(onPico([]), { pins: { GP14: { mode: 'in' } } });
    expect(c).toMatchObject({ severity: 'warning', title: 'GP14 reads chance', show: { pin: 'GP14' } });
    expect(c!.fix).toBe('Pin.PULL_UP in the code (the button to GND), or Pin.PULL_DOWN (the button to 3V3).');
  });
  it("on the ESP32's D34, which has no pulls: a 10 kΩ resistor", () => {
    const [c] = cards({ board: { data: esp }, breadboards: [], parts: [], wires: [] }, { pins: { D34: { mode: 'in', pull: 'up' } } });
    expect(c!.fix).toMatch(/^D34 has no pull-up of its own: wire a 10 kΩ/);
  });
});

describe('§1.3 a motor straight on a pin (screen 25c)', () => {
  it('GP15 was damaged, the motor draws more than a pin gives, drive it through a driver on VBUS', () => {
    const spec: CircuitSpec = {
      board: { data: pico }, breadboards: [], parts: [{ id: 'motor1', type: 'motor', legs: {} }],
      wires: [{ id: 'w1', a: 'board.GP15', b: 'motor1.+' }, { id: 'w2', a: 'motor1.-', b: 'board.GND' }],
    };
    const c = cards(spec, HIGH('GP15'), 200).find((x) => x.severity === 'damage')!;
    expect(c).toMatchObject({ title: 'GP15 was damaged', show: { pin: 'GP15' }, hurt: { pin: 'GP15' } });
    expect(c.why).toBe("MOTOR1 is wired straight to GP15. A motor needs far more current than a pin can give — a real pin would now be dead, and the motor wouldn't turn.");
    expect(c.fix).toBe("drive it through an L9110S or L298N (Actuators): the pin to the driver's input, the motor to its screws, the driver on VBUS.");
    expect(c.line).toMatch(/^MOTOR1 straight on the pin drew about \d+ mA; a Pico W pin should give at most 12 mA\. The simulation stopped at 00:00\.2\.$/);
    expect(stoppedBy(c)).toBe('Stopped: a pin was damaged');
  });
});

describe('§1.3 a servo on 3V3 (screen 25c)', () => {
  it('SERVO1 gets 3.3 V: give its + VBUS (5 V)', () => {
    const [c] = cards(onPico([{ id: 'servo1', type: 'servo', legs: { gnd: 'board.GND', vcc: 'board.3V3', signal: 'board.GP16' } }]));
    expect(c).toMatchObject({ severity: 'warning', title: 'SERVO1 gets 3.3 V', fix: 'Give its + VBUS (5 V).' });
    expect(c!.line).toBe("An SG90 needs 4.8–6 V: on 3.3 V it twitches and can't hold its angle. Give its + VBUS (5 V).");
  });
  it("on the micro:bit, its 5V pin; the ESP32's VIN", () => {
    const f: Fault = { kind: 'servo-underpowered', severity: 'warning', on: 'servo1', volts: 3.3 };
    expect(faultCard(f, { board: mbit }).fix).toBe('Give its + 5V.');
    expect(faultCard(f, { board: esp }).fix).toBe('Give its + VIN (5 V).');
  });
});

describe('the M7 faults on their cards', () => {
  it('screen 26c: LCD1 gets 3.3 V — too faint to read', () => {
    const c = faultCard({ kind: 'display-underpowered', severity: 'warning', on: 'lcd1', partType: 'lcd1602', volts: 3.3, limitV: 4.5 }, { board: pico });
    expect(c.title).toBe('LCD1 gets 3.3 V');
    expect(c.line).toBe('A 16×2 LCD needs 5 V: on 3.3 V its letters are too faint to read. Give its VCC VBUS (5 V).');
  });

  it('screen 27c: the stick\'s data on DOUT; the ring asks 1.46 A of USB', () => {
    const back = faultCard({ kind: 'neopixel-backwards', severity: 'warning', on: 'strip1', part: 'GP0' }, { board: pico });
    expect(back.title).toBe("STRIP1's data goes in at DOUT");
    expect(back.line).toBe("GP0's wire is on STRIP1's DOUT. A NeoPixel takes data only at DIN, so none of its LEDs light. Move the wire to DIN, at the end the arrows point away from.");
    const ring = faultCard({ kind: 'neopixel-over-current', severity: 'warning', on: 'ring1', part: 'VBUS', amps: 1.46, limitA: 0.5 }, { board: pico, parts: [{ id: 'ring1', type: 'neopixel' }] });
    expect(ring.title).toBe('RING1 asks 1.46 A of USB');
    expect(numbers(ring)).toEqual(['It asks ≈ 1.46 A', 'USB gives 500 mA']);
  });

  it('screen 28d: GP4 (TX) is wired to USB2\'s TXD', () => {
    const c = faultCard({ kind: 'uart-tx-to-tx', severity: 'warning', on: 'GP4', part: "USB2's TXD" }, { board: pico });
    expect(c.title).toBe("GP4 (TX) is wired to USB2's TXD");
    expect(c.line).toBe("Two outputs on one wire: neither hears the other, and they fight when one sends a 0. A TX goes to the other side's RX — swap the wires.");
  });

  it('a sensor on 3V3 that needs 5 V; 3V3 asked too much; the pins together', () => {
    expect(faultCard({ kind: 'sensor-underpowered', severity: 'warning', on: 'sonar1', volts: 3.3, limitV: 4.5 }, { board: pico }).title).toBe('SONAR1 gets 3.3 V');
    expect(faultCard({ kind: 'supply-over-current', severity: 'warning', on: '3V3', amps: 0.33, limitA: 0.3 }, { board: pico }).line).toBe('330 mA drawn from 3V3; it gives at most 300 mA.');
    expect(faultCard({ kind: 'board-over-current', severity: 'warning', on: 'board', amps: 0.055, limitA: 0.05 }, { board: pico }).line).toBe('55 mA from all the pins together; a Pico W gives at most 50 mA.');
  });
});

describe('the wording without a board, or with less to go on', () => {
  it('a burnt LED with no pin straight on it (a resistor too small): no pin named, the fix says in line', () => {
    const c = faultCard({ kind: 'led-burnt', severity: 'damage', on: 'led2', amps: 0.035, limitA: 0.03, ratedA: 0.02 });
    expect(c.why).toBe('Nothing held back the current through the LED: far too much flowed. A real LED would now be dead.');
    expect(numbers(c)).toEqual(['Current ≈ 35 mA', 'LED can take 20 mA']);
    expect(c.fix).toBe('put a 220 Ω resistor in line with the LED, or a bigger one than it has.');
    expect(c.line).toBe('About 35 mA. The simulation stopped at 00:00.0.');
  });

  it('an LED over its 20 mA straight on a pin: the resistor between them; an unknown die by its letter', () => {
    expect(faultCard({ kind: 'led-over-current', severity: 'warning', on: 'led1', amps: 0.025, ratedA: 0.02, via: 'GP2' }).fix)
      .toBe('put a 220 Ω resistor between GP2 and the LED.');
    expect(faultCard({ kind: 'led-over-current', severity: 'warning', on: 'mod1:w', amps: 0.025, ratedA: 0.02 }).title).toBe('MOD1 w gets too much current');
  });

  it('no board: "a board pin", 5 V from a battery pack, 3.3 V pins, a driver on 5 V', () => {
    expect(faultCard({ kind: 'pin-over-current', severity: 'warning', on: 'GP2', amps: 0.02, limitA: 0.012 }).line).toBe('20 mA from one pin; a board pin should give at most 12 mA.');
    expect(faultCard({ kind: 'servo-underpowered', severity: 'warning', on: 's1', volts: 3.3 }).fix).toMatch(/^Give its \+ 5 V — a battery pack/);
    expect(numbers(faultCard({ kind: 'over-voltage', severity: 'damage', on: 'GP2', volts: 5, limitV: 3.8 }))).toEqual(['On the pin 5.0 V', 'Pin takes 3.3 V']);
    const m = faultCard({ kind: 'motor-on-pin', severity: 'damage', on: 'GP15', amps: 0.046, limitA: 0.012 });
    expect(m.fix).toMatch(/the driver on 5 V\.$/);
    expect(m.why).toMatch(/^The motor is wired straight to GP15\./);
    expect(faultCard({ kind: 'short', severity: 'damage', on: 'bat1', amps: 2 }).why).toBe("BAT1's + is wired straight to its −: as much current flows as it can give. A real battery gets hot.");
  });

  it("a MAX7219's dots, an OLED, a sensor's need", () => {
    const max = faultCard({ kind: 'display-underpowered', severity: 'warning', on: 'mx1', partType: 'max7219', volts: 3.3, limitV: 4 }, { board: pico });
    expect(max.why).toBe('It needs 4.0 V at least: on 3.3 V its dots may stay dark.');
    expect(numbers(max)).toEqual(['It gets 3.3 V', 'It needs 4.0 V+']);
    expect(faultCard({ kind: 'display-underpowered', severity: 'warning', on: 'oled1', partType: 'ssd1306', volts: 2, limitV: 3 }).why).toBe('It needs 3.0 V at least: on 2.0 V it may stay dark.');
  });

  it("NeoPixels on a supply that isn't USB (3V3): named, no port to lose", () => {
    const c = faultCard({ kind: 'neopixel-over-current', severity: 'warning', on: 'strip1', part: '3V3', amps: 0.9, limitA: 0.3 }, { board: pico, parts: [{ id: 'strip1', type: 'other' }] });
    expect(c.title).toBe('STRIP1 asks 900 mA of 3V3');
    expect(c.why).toBe('Its LEDs together ask 900 mA; 3V3 gives 300 mA. A real Pico W would reset.');
    expect(numbers(c)).toEqual(['It asks ≈ 900 mA', '3V3 gives 300 mA']);
    expect(faultCard({ kind: 'neopixel-over-current', severity: 'warning', on: 'ring1', amps: 1.2, limitA: 0.5 }).title).toBe('RING1 asks 1.20 A of USB');
  });

  it('several of each, counted', () => {
    const led = faultCard({ kind: 'led-burnt', severity: 'damage', on: 'led1', amps: 0.05 });
    const led2 = faultCard({ kind: 'led-burnt', severity: 'damage', on: 'led2', amps: 0.05 });
    const w = faultCard({ kind: 'floating', severity: 'warning', on: 'GP2' });
    const w2 = faultCard({ kind: 'floating', severity: 'warning', on: 'GP3' });
    expect(faultSummary([led, led2, w, w2])).toBe('2 parts damaged · 2 warnings');
    expect(faultSummary([])).toBe('');
  });
});

describe('faultCards: the run\'s faults, and the LEDs still burnt from an earlier one', () => {
  it('an LED burnt before and not replaced stays a damaged part, with Replace, until it is', () => {
    const parts = [{ id: 'led1', type: 'led', props: { color: 'green' } }, { id: 'rgb1', type: 'rgb-led' }];
    const cs = faultCards([{ kind: 'floating', severity: 'warning', on: 'GP14' }], ['led1', 'rgb1:r'], { board: pico, parts });
    expect(cs.map((c) => c.key)).toEqual(['floating:GP14', 'dead:led1', 'dead:rgb1:r']);
    expect(cs[1]).toMatchObject({
      severity: 'damage', title: 'LED1 is still burnt out', heading: 'LED1 (green) is still burnt out',
      why: 'It burnt out in an earlier run: a real LED stays dead, so it stays dark until it is replaced.',
      fix: 'replace it — and put a resistor in line with it first.', show: { part: 'led1' }, hurt: { led: 'led1' },
    });
    expect(cs[1]!.line).toBe('It burnt out in an earlier run and stays dark until it is replaced.');
    expect(cs[2]!.title).toBe('RGB1 (red) is still burnt out');
    expect(faultSummary(cs)).toBe('2 parts damaged · 1 warning');
  });
  it('burnt in this run: only its own card', () => {
    const cs = faultCards([{ kind: 'led-burnt', severity: 'damage', on: 'led1', amps: 0.048 }], ['led1'], { board: pico });
    expect(cs.map((c) => c.key)).toEqual(['led-burnt:led1']);
  });
});

describe('runTime', () => {
  it('minutes, seconds and tenths', () => {
    expect(runTime(0)).toBe('00:00.0');
    expect(runTime(1400)).toBe('00:01.4');
    expect(runTime(83_250)).toBe('01:23.2');
  });
});
