import { afterEach, describe, expect, it, vi } from 'vitest';
import { newProject } from '@lib/project';
import { addPart } from '@lib/editor';
import { inputSlots, startRun, type WorkerLike } from '../../../src/renderer/sim-client';
import type { StartMessage, WorkerMessage } from '../../../src/sim/worker-core';

/** M4.5 F-22: the window's side of a run — the worker started with the project, its messages passed on, Stop. */
class FakeWorker implements WorkerLike {
  sent: StartMessage[] = [];
  terminated = false;
  onmessage: ((e: MessageEvent<WorkerMessage>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  postMessage(m: StartMessage) { this.sent.push(m); }
  terminate() { this.terminated = true; }
  say(m: WorkerMessage) { this.onmessage?.({ data: m } as MessageEvent<WorkerMessage>); }
}

const events = () => ({ onOutput: vi.fn(), onParts: vi.fn(), onBoard: vi.fn(), onEnd: vi.fn() });
const doc = () => {
  const d = newProject('pico-w');
  d.project = addPart(addPart(d.project, 'button', { '1a': 'bb1.e20', '2a': 'bb1.e22', '1b': 'bb1.f20', '2b': 'bb1.f22' }).project,
    'potentiometer', { 1: 'bb1.a1', 2: 'bb1.a3', 3: 'bb1.a5' }).project;
  return d;
};

afterEach(() => vi.useRealTimers());

describe('M4.5 starting a run', () => {
  it('sends the board, the files, the circuit, the entry file and the input slots of the parts that take input', () => {
    const w = new FakeWorker();
    startRun({ doc: doc(), entry: 'main.py' }, events(), () => w);
    const m = w.sent[0]!;
    expect(m).toMatchObject({ type: 'start', board: 'pico-w', entry: 'main.py', inputs: ['pressed:btn1', 'position:pot1'] });
    expect(m.files['main.py']).toContain('Pin("LED"');
    expect(m.circuit!.parts.map((p) => p.id)).toEqual(['btn1', 'pot1']);
    expect(m.circuit!.board!.data.id).toBe('pico-w');
    expect(m.control).toBeInstanceOf(SharedArrayBuffer);
  });

  it('the input slots: a button is pressed or not, a knob has a position', () => {
    expect(inputSlots(doc().project)).toEqual(['pressed:btn1', 'position:pot1']);
  });

  it('M6.1: a slide switch has a position (0 / 1), a light sensor the light on it (lux); an RGB LED and a battery take none', () => {
    const p = newProject('pico-w').project;
    p.parts = [
      { id: 'sw1', type: 'slide-switch', legs: { 1: 'bb1.a1', 2: 'bb1.a2', 3: 'bb1.a3' } },
      { id: 'ldr1', type: 'ldr', legs: { a: 'bb1.a10', b: 'bb1.a12' } },
      { id: 'rgb1', type: 'rgb-led', legs: { r: 'bb1.f1', common: 'bb1.f2', g: 'bb1.f3', b: 'bb1.f4' } },
      { id: 'bat1', type: 'battery', props: { kind: '9V' }, legs: { '+': 'bb1.T+1', '-': 'bb1.T-1' } },
    ];
    expect(inputSlots(p)).toEqual(['position:sw1', 'lux:ldr1']);
  });

  it('M6.3: a PIR sees motion (pressed), a line sensor its surface and a soil sensor its moisture (position), a temperature sensor °C', () => {
    const p = newProject('pico-w').project;
    const legs = { vcc: 'bb1.a1', out: 'bb1.a2', gnd: 'bb1.a3' };
    p.parts = [
      { id: 'pir1', type: 'pir', legs }, { id: 'line1', type: 'line-sensor', legs }, { id: 'soil1', type: 'soil-moisture', legs },
      { id: 'tmp1', type: 'temp-sensor', props: { kind: 'TMP36' }, legs },
    ];
    expect(inputSlots(p)).toEqual(['pressed:pir1', 'position:line1', 'position:soil1', 'celsius:tmp1']);
  });

  it('M6.4: a DHT has a temperature and a humidity, an HC-SR04 how far its object is (cm), an MPU6050 its tilt', () => {
    const p = newProject('pico-w').project;
    p.parts = [
      { id: 'dht1', type: 'dht', props: { kind: 'DHT22' }, legs: { vcc: 'bb1.a1', out: 'bb1.a2', gnd: 'bb1.a3' } },
      { id: 'sonar1', type: 'hc-sr04', legs: { vcc: 'bb1.a5', trig: 'bb1.a6', echo: 'bb1.a7', gnd: 'bb1.a8' } },
      { id: 'mpu1', type: 'mpu6050', legs: Object.fromEntries(['vcc', 'gnd', 'scl', 'sda', 'xda', 'xcl', 'ad0', 'int'].map((l, i) => [l, `bb1.f${i + 1}`])) },
    ];
    expect(inputSlots(p)).toEqual(['celsius:dht1', 'humidity:dht1', 'cm:sonar1', 'tiltx:mpu1', 'tilty:mpu1']);   // M6.4b: its tilt
  });

  it('M6.5a: the kit\'s modules — held, a position 0–1, the light; a joystick\'s axes and button, an encoder\'s steps and button, a wheel\'s rpm', () => {
    const p = newProject('pico-w').project;
    const three = { out: 'bb1.a1', vcc: 'bb1.a2', gnd: 'bb1.a3' };
    p.parts = [
      { id: 'btn1', type: 'button-module', legs: three }, { id: 'ldr1', type: 'ldr-module', legs: three }, { id: 'pot1', type: 'pot-module', legs: three },
      { id: 'touch1', type: 'touch', legs: three }, { id: 'vib1', type: 'vibration', legs: three }, { id: 'ir1', type: 'ir-obstacle', legs: three },
      { id: 'hall1', type: 'hall', legs: three }, { id: 'water1', type: 'water-level', legs: three },
      { id: 'flame1', type: 'flame', legs: { ...three, ao: 'bb1.a4' } }, { id: 'rain1', type: 'raindrop', legs: { ...three, ao: 'bb1.a4' } }, { id: 'gas1', type: 'mq2', legs: { ...three, ao: 'bb1.a4' } },
      { id: 'joy1', type: 'joystick', legs: { gnd: 'bb1.f1', vcc: 'bb1.f2', vrx: 'bb1.f3', vry: 'bb1.f4', sw: 'bb1.f5' } },
      { id: 'enc1', type: 'rotary-encoder', legs: { clk: 'bb1.f6', dt: 'bb1.f7', sw: 'bb1.f8', vcc: 'bb1.f9', gnd: 'bb1.f10' } },
      { id: 'speed1', type: 'speed-sensor', legs: { vcc: 'bb1.f11', gnd: 'bb1.f12', out: 'bb1.f13' } },
    ];
    expect(inputSlots(p)).toEqual([
      'pressed:btn1', 'lux:ldr1', 'position:pot1', 'pressed:touch1', 'pressed:vib1', 'position:ir1', 'position:hall1', 'position:water1',
      'position:flame1', 'position:rain1', 'position:gas1', 'x:joy1', 'y:joy1', 'pressed:joy1', 'steps:enc1', 'pressed:enc1', 'rpm:speed1',
    ]);
  });

  it('M6.6: a micro:bit project has its own inputs too — A, B, the logo, the tilt, a shake, the temperature, the light, the sound', () => {
    expect(inputSlots(newProject('microbit-v2').project)).toEqual([
      'pressed:board.A', 'pressed:board.B', 'touch:LOGO', 'board:accelx', 'board:accely', 'board:shake', 'board:celsius', 'board:light', 'board:sound',
    ]);
  });

  it('M6.5b: a BMP280 has the air\'s temperature and pressure, a DS18B20 °C; a PCF8591 and a DS1302 take none (they read the circuit, the clock)', () => {
    const p = newProject('pico-w').project;
    p.parts = [
      { id: 'baro1', type: 'bmp280', legs: { vcc: 'bb1.a1', gnd: 'bb1.a2', scl: 'bb1.a3', sda: 'bb1.a4', csb: 'bb1.a5', sdo: 'bb1.a6' } },
      { id: 'temp1', type: 'ds18b20', legs: { out: 'bb1.a8', vcc: 'bb1.a9', gnd: 'bb1.a10' } },
      { id: 'rtc1', type: 'ds1302', legs: { vcc: 'bb1.f1', gnd: 'bb1.f2', clk: 'bb1.f3', dat: 'bb1.f4', rst: 'bb1.f5' } },
    ];
    expect(inputSlots(p)).toEqual(['celsius:baro1', 'hpa:baro1', 'celsius:temp1']);
  });

  it('passes on what the worker says, and ends the worker with the run', () => {
    const w = new FakeWorker();
    const e = events();
    startRun({ doc: doc(), entry: 'main.py' }, e, () => w);
    w.say({ type: 'output', text: 'hi\n' });
    w.say({ type: 'parts', states: { led1: { kind: 'led', amps: 0.01, brightness: 0.5 } } });
    w.say({ type: 'board', pins: { LED: 1 } });
    w.say({ type: 'end', result: { ended: 'done' } as never });
    expect(e.onOutput).toHaveBeenCalledWith('hi\n');
    expect(e.onParts).toHaveBeenCalledWith({ led1: { kind: 'led', amps: 0.01, brightness: 0.5 } });
    expect(e.onBoard).toHaveBeenCalledWith({ pins: { LED: 1 } });
    expect(e.onEnd).toHaveBeenCalledWith(expect.objectContaining({ ended: 'done' }));
    expect(w.terminated).toBe(true);
  });

  it('a button pressed while running: its slot is set in the shared buffer', () => {
    const w = new FakeWorker();
    const run = startRun({ doc: doc(), entry: 'main.py' }, events(), () => w);
    run.setInput('pressed:btn1', 1);
    const slots = new Float64Array(w.sent[0]!.control, 8, 2);
    expect(slots[0]).toBe(1);
    expect(Number.isNaN(slots[1])).toBe(true);   // the knob: nothing drives it yet
  });
});

describe('M4.5 Stop (N-03)', () => {
  it('Stop asks the program to stop through the shared buffer; its end is passed on once', () => {
    const w = new FakeWorker();
    const e = events();
    const run = startRun({ doc: doc(), entry: 'main.py' }, e, () => w);
    run.stop();
    expect(new Int32Array(w.sent[0]!.control, 0, 1)[0]).toBe(1);
    w.say({ type: 'end', result: { ended: 'stopped' } as never });
    run.stop();
    expect(e.onEnd).toHaveBeenCalledTimes(1);
  });

  it('a program that ignores Stop for 300 ms: the worker is ended and the run reported stopped', () => {
    vi.useFakeTimers();
    const w = new FakeWorker();
    const e = events();
    startRun({ doc: doc(), entry: 'main.py' }, e, () => w).stop();
    vi.advanceTimersByTime(299);
    expect(w.terminated).toBe(false);
    vi.advanceTimersByTime(2);
    expect(w.terminated).toBe(true);
    expect(e.onEnd).toHaveBeenCalledWith(expect.objectContaining({ ended: 'stopped', output: '' }));
  });

  it('a worker that fails to start: the run ends with its message', () => {
    const w = new FakeWorker();
    const e = events();
    startRun({ doc: doc(), entry: 'main.py' }, e, () => w);
    w.onerror?.({ message: 'no wasm' } as ErrorEvent);
    expect(e.onEnd).toHaveBeenCalledWith(expect.objectContaining({ ended: 'error', error: expect.objectContaining({ message: expect.stringContaining('no wasm') }) }));
  });
});
