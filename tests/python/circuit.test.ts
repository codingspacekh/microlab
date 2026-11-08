import { describe, expect, it } from 'vitest';
import { parseBoard } from '@lib/boards';
import type { CircuitSpec, PartSpec, WireSpec } from '@lib/circuit';
import picoJson from '../../library/boards/pico-w/board.json';
import espJson from '../../library/boards/esp32-devkit-v1/board.json';
import mbitJson from '../../library/boards/microbit-v2/board.json';
import { VirtualClock } from '../../src/sim/clock';
import { Control } from '../../src/sim/control';
import type { PartChange } from '../../src/sim/circuit';
import { runProject, type SimBoard } from '../../src/sim/run';
import { nodeLoader } from './vm';

/** M3 slice 1: the circuit engine behind the pins — reads come from the solved circuit, part inputs drive it. */
const DATA = { 'pico-w': parseBoard(picoJson), 'esp32-devkit-v1': parseBoard(espJson), 'microbit-v2': parseBoard(mbitJson) } as const;

function circuit(board: SimBoard, parts: PartSpec[], wires: WireSpec[]): CircuitSpec {
  return { board: { data: DATA[board as keyof typeof DATA] }, breadboards: [{ id: 'bb1', size: 'half' }], parts, wires };
}
const w = (id: string, a: string, b: string): WireSpec => ({ id, a, b });

async function run(board: SimBoard, spec: CircuitSpec, main: string, partInputs: PartChange[] = []) {
  return runProject(await nodeLoader(), { board, files: { 'main.py': main }, clock: new VirtualClock(), circuit: spec, partInputs });
}

describe('M3.1 pin reads come from the circuit', () => {
  it('a wire from an output to an input: the input reads what the output writes', async () => {
    const spec = circuit('pico-w', [], [w('w1', 'board.GP15', 'board.GP14')]);
    const r = await run('pico-w', spec, 'from machine import Pin\no = Pin(15, Pin.OUT)\ni = Pin(14, Pin.IN)\no.on()\na = i.value()\no.off()\nprint(a, i.value())\n');
    expect(r.output).toBe('1 0\n');
  });

  it('a button to GND with the pull-up: 1, then 0 while pressed; the press is an IRQ', async () => {
    const spec = circuit('pico-w', [{ id: 'btn1', type: 'button', legs: { '1a': 'bb1.e10', '2a': 'bb1.e12', '1b': 'bb1.f10', '2b': 'bb1.f12' } }],
      [w('w1', 'board.GP14', 'bb1.a10'), w('w2', 'board.GND', 'bb1.j12')]);
    const r = await run('pico-w', spec, [
      'from machine import Pin', 'import time',
      'presses = []',
      'b = Pin(14, Pin.IN, Pin.PULL_UP)',
      'b.irq(lambda p: presses.append(1), Pin.IRQ_FALLING)',
      'print(b.value())', 'time.sleep(0.4)', 'print(b.value(), len(presses))', 'time.sleep(0.4)', 'print(b.value())',
    ].join('\n'), [{ atUs: 200_000, part: 'btn1', pressed: true }, { atUs: 600_000, part: 'btn1', pressed: false }]);
    expect(r.output).toBe('1\n0 1\n1\n');
  });

  it('a knob on an ADC pin reads its wiper (3V3 – wiper – GND)', async () => {
    const spec = circuit('pico-w', [{ id: 'pot1', type: 'potentiometer', legs: { '1': 'bb1.a20', '2': 'bb1.a22', '3': 'bb1.a24' } }],
      [w('w1', 'board.3V3', 'bb1.e20'), w('w2', 'board.GP26', 'bb1.e22'), w('w3', 'board.GND', 'bb1.e24')]);
    const r = await run('pico-w', spec, 'from machine import ADC\nimport time\na = ADC(26)\nprint(round(a.read_u16() / 65535, 2))\ntime.sleep(1)\nprint(round(a.read_u16() / 65535, 2))\n',
      [{ atUs: 0, part: 'pot1', position: 0.25 }, { atUs: 500_000, part: 'pot1', position: 0.9 }]);
    // position is from leg 1 (3V3): 0.25 of the way from 3V3 to GND is 75 % of 3.3 V
    expect(r.output).toBe('0.75\n0.1\n');
  });

  it('an LED from a driven pin: the anode sits at its forward voltage (red 2.0 V), read by an ADC', async () => {
    const spec = circuit('pico-w', [
      { id: 'r1', type: 'resistor', props: { ohms: 220 }, legs: { a: 'bb1.a5', b: 'bb1.a8' } },
      { id: 'led1', type: 'led', props: { color: 'red' }, legs: { a: 'bb1.b8', k: 'bb1.b10' } },
    ], [w('w1', 'board.GP15', 'bb1.e5'), w('w2', 'board.GP26', 'bb1.e8'), w('w3', 'board.GND', 'bb1.e10')]);
    const r = await run('pico-w', spec, 'from machine import Pin, ADC\nPin(15, Pin.OUT).on()\nprint(round(ADC(26).read_u16() * 3.3 / 65535, 1))\n');
    expect(r.output).toBe('2.0\n');
  });

  it('the micro:bit\'s own button A (P5, its pull-up on the board) pressed through the circuit', async () => {
    const r = await run('microbit-v2', circuit('microbit-v2', [], []), 'from microbit import *\nprint(button_a.is_pressed())\nsleep(300)\nprint(button_a.is_pressed(), button_a.was_pressed())\n',
      [{ atUs: 100_000, part: 'board.A', pressed: true }]);
    expect(r.output).toBe('False\nTrue True\n');
  });

  it('ESP32: a knob at the top end reads 4095 at 11 dB', async () => {
    const spec = circuit('esp32-devkit-v1', [{ id: 'pot1', type: 'potentiometer', legs: { '1': 'bb1.a20', '2': 'bb1.a22', '3': 'bb1.a24' } }],
      [w('w1', 'board.3V3', 'bb1.e20'), w('w2', 'board.D34', 'bb1.e22'), w('w3', 'board.GND', 'bb1.e24')]);
    const r = await run('esp32-devkit-v1', spec, 'from machine import ADC, Pin\nprint(ADC(Pin(34)).read())\n', [{ atUs: 0, part: 'pot1', position: 0 }]);
    expect(r.output).toBe('4095\n');
  });

  it('part inputs from the window\'s live slots: pressed, position (lux too)', async () => {
    const spec = circuit('pico-w', [
      { id: 'btn1', type: 'button', legs: { '1a': 'bb1.e10', '2a': 'bb1.e12', '1b': 'bb1.f10', '2b': 'bb1.f12' } },
      { id: 'pot1', type: 'potentiometer', legs: { '1': 'bb1.a20', '2': 'bb1.a22', '3': 'bb1.a24' } },
      { id: 'ldr1', type: 'ldr', legs: { a: 'bb1.a26', b: 'bb1.a28' } },
    ], [w('w1', 'board.GP14', 'bb1.a10'), w('w2', 'board.GND', 'bb1.j12'), w('w3', 'board.3V3', 'bb1.e20'), w('w4', 'board.GP26', 'bb1.e22'), w('w5', 'board.GND', 'bb1.e24')]);
    const control = new Control(['pressed:btn1', 'position:pot1', 'lux:ldr1', 'level:9']);
    control.setInput('pressed:btn1', 1);
    control.setInput('position:pot1', 0.5);
    control.setInput('lux:ldr1', 100);
    const r = await runProject(await nodeLoader(), {
      board: 'pico-w', circuit: spec, control, clock: new VirtualClock(),
      files: { 'main.py': 'from machine import Pin, ADC\nprint(Pin(14, Pin.IN, Pin.PULL_UP).value(), round(ADC(26).read_u16() / 65535, 2))\n' },
    });
    expect(r.output).toBe('0 0.5\n');
  });
});

describe('M3.2 inputs drive IRQs and wake the program', () => {
  const button = () => circuit('pico-w', [{ id: 'btn1', type: 'button', legs: { '1a': 'bb1.e10', '2a': 'bb1.e12', '1b': 'bb1.f10', '2b': 'bb1.f12' } }],
    [w('w1', 'board.GP14', 'bb1.a10'), w('w2', 'board.GND', 'bb1.j12')]);
  const counter = 'from machine import Pin\nimport time\ncount = 0\ndef pressed(p):\n    global count\n    count += 1\nPin(14, Pin.IN, Pin.PULL_UP).irq(pressed, Pin.IRQ_FALLING)\n';

  it('an IRQ counter counts three simulated presses, during sleeps and a busy loop', async () => {
    const presses = [100, 400, 700].flatMap((ms) => [{ atUs: ms * 1000, part: 'btn1', pressed: true }, { atUs: ms * 1000 + 80_000, part: 'btn1', pressed: false }]);
    const r = await run('pico-w', button(), `${counter}time.sleep(0.5)\nt = time.ticks_ms()\nwhile time.ticks_diff(time.ticks_ms(), t) < 500:\n    pass\nprint(count)\n`, presses);
    expect(r.output).toBe('3\n');
  });
});

describe('M3.5 faults stop the run with their message', () => {
  const noResistor = () => circuit('pico-w', [{ id: 'led1', type: 'led', props: { color: 'red' }, legs: { a: 'bb1.a5', k: 'bb1.a7' } }],
    [w('w1', 'board.GP15', 'bb1.e5'), w('w2', 'board.GND', 'bb1.e7')]);

  it('Blink with the resistor taken out: the LED burns and the run stops — no traceback, the fault and its message', async () => {
    const r = await run('pico-w', noResistor(), 'from machine import Pin\nimport time\nprint("start")\nled = Pin(15, Pin.OUT)\nwhile True:\n    led.toggle()\n    time.sleep(0.5)\n');
    expect(r.ended).toBe('fault');
    expect(r.output).toBe('start\n');
    expect(r.fault).toMatchObject({ kind: 'led-burnt', on: 'led1', severity: 'damage' });
    expect(r.fault!.message).toMatch(/^led1: the LED burnt out — \d+ mA through it, it takes 30 mA at most$/);
    expect(r.error).toBeUndefined();
  });

  it('a fault in a busy loop (no sleep, no reads) is found at the VM hook', async () => {
    const r = await run('pico-w', noResistor(), 'from machine import Pin\nled = Pin(15, Pin.OUT)\nwhile True:\n    led.on()\n');
    expect(r.ended).toBe('fault');
  });

  it('a program that ends before the next solve still reports the damage', async () => {
    const r = await run('pico-w', noResistor(), 'from machine import Pin\nPin(15, Pin.OUT).on()\n');
    expect(r.ended).toBe('fault');
  });

  it('a warning (a servo on 3V3) is reported, and the program goes on', async () => {
    const spec = circuit('pico-w', [{ id: 's1', type: 'servo', legs: { gnd: 'bb1.a5', vcc: 'bb1.a6', signal: 'bb1.a7' } }],
      [w('w1', 'board.GND', 'bb1.e5'), w('w2', 'board.3V3', 'bb1.e6'), w('w3', 'board.GP16', 'bb1.e7')]);
    const r = await run('pico-w', spec, 'from machine import Pin, PWM\nimport time\nPWM(Pin(16), freq=50, duty_u16=4915)\ntime.sleep(0.1)\nprint("still running")\n');
    expect(r.ended).toBe('done');
    expect(r.output).toBe('still running\n');
    expect(r.faults.map((f) => `${f.kind} ${f.on}`)).toContain('servo-underpowered s1');
  });
});

describe('M9 slice 2: faults told as they happen (screen 04)', () => {
  const noResistor = () => circuit('pico-w', [{ id: 'led1', type: 'led', props: { color: 'red' }, legs: { a: 'bb1.a5', k: 'bb1.a7' } }],
    [w('w1', 'board.GP15', 'bb1.e5'), w('w2', 'board.GND', 'bb1.e7')]);

  it('each fault is told once as it is first seen, with its time; the damage carries when the run stopped', async () => {
    const told: string[] = [];
    const r = await runProject(await nodeLoader(), {
      board: 'pico-w', clock: new VirtualClock(), circuit: noResistor(),
      files: { 'main.py': 'from machine import Pin\nimport time\nled = Pin(15, Pin.OUT)\ntime.sleep(1.4)\nled.on()\ntime.sleep(1)\n' },
      onFault: (f) => told.push(`${f.kind} ${f.on} ${Math.round(f.atMs ?? -1)}`),
    });
    expect(r.ended).toBe('fault');
    expect(told).toEqual(['led-burnt led1 1400', 'pin-over-current GP15 1400']);
    expect(r.fault).toMatchObject({ kind: 'led-burnt', atMs: expect.closeTo(1400, 0) });
  });

  it('a burnt LED stays dark in the next run until it is replaced (spec.burnt): the program runs on', async () => {
    const r = await run('pico-w', { ...noResistor(), burnt: ['led1'] }, 'from machine import Pin\nimport time\nPin(15, Pin.OUT).on()\ntime.sleep(0.1)\nprint("on")\n');
    expect(r.ended).toBe('done');
    expect(r.output).toBe('on\n');
    expect(r.faults).toEqual([]);
  });
});

