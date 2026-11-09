import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseBoard, type BoardId } from '@lib/boards';
import { boardData } from '@lib/editor';
import { checkBeforeRun, parseProject, type Project } from '@lib/project';
import picoJson from '../../../library/boards/pico-w/board.json';
import mbitJson from '../../../library/boards/microbit-v2/board.json';
import espJson from '../../../library/boards/esp32-devkit-v1/board.json';

/** M9 slice 3 (F-18, screen 29b): what Run looks over first — a leg alone in its column, a wire that ends where nothing
 *  is, a pin the code uses with nothing wired to it. */
const pico = parseBoard(picoJson);
const mbit = parseBoard(mbitJson);
const esp = parseBoard(espJson);
const project = (parts: Project['parts'], wires: Project['wires'] = [], board = 'pico-w'): Project =>
  ({ format: 1, board, breadboards: [{ id: 'bb1', size: 'half' }], parts, wires });
const w = (id: string, a: string, b: string) => ({ id, a, b });
const titles = (items: { title: string }[]) => items.map((i) => i.title);

// screen 29b: GP15 → 220 Ω → red LED → − rail; GP13 → 220 Ω → green LED, its short leg alone in column 19;
// GP11's wire to column 24, where nothing is; main.py reads a button on GP12, which isn't wired
const SCREEN = project([
  { id: 'r1', type: 'resistor', props: { ohms: 220 }, legs: { a: 'bb1.f5', b: 'bb1.f8' } },
  { id: 'led1', type: 'led', props: { color: 'red' }, legs: { a: 'bb1.g8', k: 'bb1.g10' } },
  { id: 'r2', type: 'resistor', props: { ohms: 220 }, legs: { a: 'bb1.f14', b: 'bb1.f17' } },
  { id: 'led2', type: 'led', props: { color: 'green' }, legs: { a: 'bb1.g17', k: 'bb1.g19' } },
], [
  w('w1', 'board.GP15', 'bb1.j5'), w('w2', 'board.GND@38', 'bb1.B-3'), w('w3', 'bb1.j10', 'bb1.B-10'),
  w('w4', 'board.GP13', 'bb1.j14'), w('w5', 'board.GP11', 'bb1.j24'),
]);
const CODE = ['from machine import Pin', 'import time', '', 'red = Pin(15, Pin.OUT)', 'green = Pin(13, Pin.OUT)',
  'button = Pin(12, Pin.IN, Pin.PULL_UP)', '', 'while True:', '    if button.value() == 0:      # pressed', '        red.toggle()', ''].join('\n');

describe('screen 29b: three things to look at', () => {
  const items = checkBeforeRun(SCREEN, pico, { 'main.py': CODE }, 'main.py');

  it('in order: the leg, the wire, the pin', () => {
    expect(titles(items)).toEqual(["LED2's short leg is alone in column 19.", "GP11's wire ends in column 24", 'main.py uses GP12']);
  });

  it("the green LED's short leg: nothing joins it to GND — Show rings its hole", () => {
    expect(items[0]).toMatchObject({
      key: 'leg:led2.k', text: "Nothing joins it to GND, so it can't light. Wire column 19 to the − rail.",
      show: { part: 'led2', point: 'bb1.g19' },
    });
  });

  it("GP11's wire, where nothing else is", () => {
    expect(items[1]).toMatchObject({ key: 'wire:w5.b', text: ', where nothing else is.', show: { point: 'bb1.j24' } });
  });

  it('GP12, read on line 6, with nothing wired — Line 6', () => {
    expect(items[2]).toMatchObject({ key: 'pin:GP12', text: ' (line 6), but nothing is wired to it.', show: { pin: 'GP12', line: { file: 'main.py', line: 6 } } });
  });

  it('wired right, nothing to say', () => {
    const fixed = project([...SCREEN.parts], [
      ...SCREEN.wires.filter((x) => x.id !== 'w5'),
      w('w6', 'bb1.j19', 'bb1.B-19'), w('w7', 'board.GP12', 'bb1.a25'), w('w8', 'bb1.e27', 'bb1.T-27'),
    ]);
    fixed.parts.push({ id: 'btn1', type: 'button', legs: { '1a': 'bb1.e25', '2a': 'bb1.e27' } });
    fixed.wires.push(w('w9', 'board.GND@3', 'bb1.T-1'));
    expect(checkBeforeRun(fixed, pico, { 'main.py': CODE }, 'main.py')).toEqual([]);
  });
});

describe('legs alone', () => {
  it("an LED's long leg alone: nothing joins it to a pin or 3V3", () => {
    const [i] = checkBeforeRun(project([{ id: 'led1', type: 'led', legs: { a: 'bb1.e5', k: 'bb1.e7' } }], [w('w1', 'board.GND@3', 'bb1.a7')]), pico, {});
    expect(i).toMatchObject({ title: "LED1's long leg is alone in column 5.", text: "Nothing joins it to a pin or 3V3, so it can't light. Wire column 5 to a pin through a resistor." });
  });

  it("a resistor's end; a module's VCC and GND; a motor's tab", () => {
    const items = checkBeforeRun(project([
      { id: 'r1', type: 'resistor', legs: { a: 'bb1.a5', b: 'bb1.a8' } },
      { id: 'pir1', type: 'pir', legs: { vcc: 'bb1.e20', out: 'bb1.e21', gnd: 'bb1.e22' } },
      { id: 'motor1', type: 'motor', legs: {} },
    ], [w('w1', 'board.GP15', 'bb1.e5'), w('w2', 'board.GP14', 'bb1.a21'), w('w3', 'board.GP16', 'motor1.+')]), pico, {});
    expect(titles(items)).toEqual(["R1's leg is alone in column 8.", "PIR1's VCC is alone in column 20.", "PIR1's GND is alone in column 22.", "MOTOR1's − tab has nothing wired to it."]);
    expect(items[0]!.text).toBe('Nothing joins that end to anything, so no current flows through R1.');
    expect(items[1]!.text).toBe('It has no power: wire it to 3V3, or 5 V if it needs it.');
    expect(items[2]!.text).toBe('Wire it to GND.');
    expect(items[3]!.text).toBe("Nothing comes back from it, so the motor can't turn.");
  });

  it('a part lying unwired, an unused RGB colour, a button\'s second leg of a pair: nothing to say', () => {
    expect(checkBeforeRun(project([
      { id: 'led1', type: 'led', legs: { a: 'bb1.e5', k: 'bb1.e7' } },
      { id: 'rgb1', type: 'rgb-led', legs: { r: 'bb1.a20', common: 'bb1.a21', g: 'bb1.a22', b: 'bb1.a23' } },
      { id: 'btn1', type: 'button', legs: { '1a': 'bb1.e25', '2a': 'bb1.e27' } },
    ], [w('w1', 'board.GP2', 'bb1.e20'), w('w2', 'board.GND@3', 'bb1.e21'), w('w3', 'board.GP3', 'bb1.a25'), w('w4', 'board.GND@8', 'bb1.a27')]), pico, {})).toEqual([]);
  });

  it("an LED's leg in the rail with nothing else on it: alone on the − rail", () => {
    const [i] = checkBeforeRun(project([
      { id: 'r1', type: 'resistor', legs: { a: 'bb1.a5', b: 'bb1.a8' } },
      { id: 'led1', type: 'led', legs: { a: 'bb1.e8', k: 'bb1.B-9' } },
    ], [w('w1', 'board.GP15', 'bb1.e5')]), pico, {});
    expect(i!.title).toBe("LED1's short leg is alone on the bottom − rail.");
    expect(i!.text).toBe("Nothing joins it to GND, so it can't light. Wire the bottom − rail to GND.");
  });
});

describe('wires that end where nothing is', () => {
  it('a wire between two empty columns joins nothing: said once', () => {
    const items = checkBeforeRun(project([], [w('w1', 'bb1.a5', 'bb1.a9')]), pico, {});
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ key: 'wire:w1', title: 'The wire from column 5 to column 9', text: ' joins nothing.' });
  });
  it("a wire from a motor's tab to an empty column: the motor's wire", () => {
    const items = checkBeforeRun(project([{ id: 'motor1', type: 'motor', legs: {} }], [w('w1', 'motor1.+', 'bb1.a5'), w('w2', 'motor1.-', 'board.GND@3')]), pico, {});
    expect(titles(items)).toEqual(["MOTOR1's wire ends in column 5"]);
  });
});

describe('pins the code uses', () => {
  const none = project([]);
  it('Pin("GP12"), ADC(1) (GP27), PWM(Pin(16)); a comment and Pin("LED") are not', () => {
    const code = ['from machine import Pin, ADC, PWM', 'a = Pin("GP12", Pin.IN)', 'k = ADC(1)', '# Pin(9) in a comment', 'p = PWM(Pin(16))', 'led = Pin("LED", Pin.OUT)', ''].join('\n');
    expect(checkBeforeRun(none, pico, { 'main.py': code }, 'main.py').map((i) => `${i.show.pin} ${i.show.line!.line}`)).toEqual(['GP12 2', 'GP27 3', 'GP16 5']);
  });
  it('each pin once, at its first line; a pin wired straight to GND counts as wired', () => {
    const code = 'from machine import Pin\na = Pin(14, Pin.IN)\nb = Pin(14)\nc = Pin(15)\n';
    expect(checkBeforeRun(project([], [w('w1', 'board.GP15', 'board.GND@3')]), pico, { 'main.py': code }, 'main.py').map((i) => i.key)).toEqual(['pin:GP14']);
  });
  it("the micro:bit's pin1; buttons A and B (P5, P11) are the board's own", () => {
    const code = 'from microbit import *\nwhile True:\n    if pin5.read_digital() == 0 or button_a.is_pressed():\n        pin1.write_digital(1)\n';
    expect(titles(checkBeforeRun(project([], [], 'microbit-v2'), mbit, { 'main.py': code }, 'main.py'))).toEqual(['main.py uses P1']);
  });
  it("the ESP32's GPIO 2 has its blue LED; GPIO 4 is D4", () => {
    const code = 'from machine import Pin\nPin(2, Pin.OUT).on()\nPin(4, Pin.OUT).on()\n';
    expect(titles(checkBeforeRun(project([], [], 'esp32-devkit-v1'), esp, { 'main.py': code }, 'main.py'))).toEqual(['main.py uses D4']);
  });
  it('another file run (Run led_test.py) is the one read', () => {
    const items = checkBeforeRun(none, pico, { 'main.py': 'Pin(3)', 'led_test.py': 'from machine import Pin\nPin(7, Pin.OUT)\n' }, 'led_test.py');
    expect(items.map((i) => `${i.title} ${i.show.line!.file}`)).toEqual(['led_test.py uses GP7 led_test.py']);
  });
});

describe('no false alarms', () => {
  it('every example, on every board, is wired right: the check finds nothing', () => {
    let checked = 0;
    for (const ex of readdirSync('library/examples')) {
      for (const b of readdirSync(`library/examples/${ex}`)) {
        const dir = `library/examples/${ex}/${b}`;
        if (!existsSync(`${dir}/project.json`)) continue;
        const p = parseProject(JSON.parse(readFileSync(`${dir}/project.json`, 'utf8')));
        const files = existsSync(`${dir}/files/main.py`) ? { 'main.py': readFileSync(`${dir}/files/main.py`, 'utf8') } : {};
        expect(checkBeforeRun(p, boardData(p.board as BoardId), files, 'main.py').map((i) => `${ex}/${b}: ${i.title}`)).toEqual([]);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(150);
  });
});
