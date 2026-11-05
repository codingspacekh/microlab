import { describe, expect, it } from 'vitest';
import { VirtualClock } from '../../src/sim/clock';
import type { InputChange } from '../../src/sim/pins';
import { runProject, type SimBoard } from '../../src/sim/run';
import { nodeLoader } from './vm';

/** M2 slice 5: the ESP32 DevKit V1 (MicroPython v1.29.0 ports/esp32: machine_pin.c, machine_adc.c, machine_pwm.c,
 *  machine_dac.c, machine_touchpad.c, machine_timer.c). The extension board runs the same firmware. */
const run = async (main: string, inputs: InputChange[] = [], board: SimBoard = 'esp32-devkit-v1') =>
  runProject(await nodeLoader(), { board, files: { 'main.py': `from machine import Pin, ADC, PWM, DAC, TouchPad, Timer\nimport machine, time\n${main}` }, clock: new VirtualClock(), inputs });
const at = (line: number) => line + 2;

describe('M2.5 ESP32 Pin', () => {
  it('Blink on GPIO 2 (the DevKit\'s blue LED), traced', async () => {
    const r = await run('led = Pin(2, Pin.OUT)\nled.value(1)\ntime.sleep_ms(300)\nled.toggle()\nprint(led)\n');
    expect(r.output).toBe('Pin(2, mode=Pin.OUT)\n');
    expect(r.trace.map(([t, p, v]) => [Math.round(t / 1000), p, v])).toEqual([[0, '2', 1], [300, '2', 0]]);
  });

  it('the ESP32\'s constants, and no high() / low()', async () => {
    const r = await run('print(Pin.IN, Pin.OUT, Pin.OPEN_DRAIN, Pin.PULL_UP, Pin.PULL_DOWN, Pin.IRQ_RISING, Pin.IRQ_FALLING)\nprint(hasattr(Pin, "high"), hasattr(Pin, "on"), hasattr(Pin, "toggle"))\n');
    expect(r.output).toBe('1 3 7 2 1 1 2\nFalse True True\n');
  });

  it('pull is left as it is unless given (unlike the Pico); None removes it', async () => {
    const r = await run('p = Pin(4, Pin.IN, Pin.PULL_UP)\np.init(Pin.IN)\nprint(p, p.value())\np.init(pull=None)\nprint(p)\n');
    expect(r.output).toBe('Pin(4, mode=Pin.IN, pull=Pin.PULL_UP) 1\nPin(4, mode=Pin.IN)\n');
  });

  it('GPIO 34–39 are input only: "pin can only be input"', async () => {
    expect((await run('Pin(34, Pin.OUT)\n')).error).toEqual({ type: 'ValueError', message: 'pin can only be input', file: 'main.py', line: at(1) });
    expect((await run('print(Pin(36, Pin.IN).value())\n')).output).toBe('0\n');
  });

  it('pins that don\'t exist (24, 28–31, 40) and names: "invalid pin"', async () => {
    for (const id of ['24', '30', '40', '"D2"']) {
      expect((await run(`Pin(${id})\n`)).error, id).toMatchObject({ type: 'ValueError', message: 'invalid pin' });
    }
  });

  it('IRQ on a button (soft, scheduled)', async () => {
    const r = await run('b = Pin(4, Pin.IN, Pin.PULL_UP)\nb.irq(lambda p: print("pressed", p), Pin.IRQ_FALLING)\ntime.sleep(1)\n', [{ atUs: 200_000, pin: '4', level: 0 }]);
    expect(r.output).toBe('pressed Pin(4, mode=Pin.IN, pull=Pin.PULL_UP)\n');
  });
});

describe('M2.5 ESP32 ADC: 12 bits, 11 dB by default; ADC1 (32–39) and ADC2 pins', () => {
  it('read() is the raw 12-bit value, read_u16() scaled, read_uv() calibrated; repr', async () => {
    const r = await run('a = ADC(Pin(34))\nprint(a, a.read(), a.read_u16(), a.read_uv())\n', [{ atUs: 0, pin: '34', volts: 3.3 }]);
    expect(r.output).toBe('ADC(Pin(34), atten=3) 4095 65535 3100000\n');
  });

  it('atten narrows the range (0 dB: about 0–0.95 V); width shortens read()', async () => {
    const r = await run('a = ADC(Pin(32), atten=ADC.ATTN_0DB)\nprint(a.read())\na.width(ADC.WIDTH_9BIT)\nprint(a.read())\n', [{ atUs: 0, pin: '32', volts: 0.95 }]);
    expect(r.output).toBe('4095\n511\n');
  });

  it('a pin with no ADC: "invalid pin"; a bad atten: "invalid attenuation"', async () => {
    expect((await run('ADC(Pin(5))\n')).error).toMatchObject({ type: 'ValueError', message: 'invalid pin' });
    expect((await run('ADC(Pin(34), atten=9)\n')).error).toMatchObject({ type: 'ValueError', message: 'invalid attenuation' });
  });
});

describe('M2.5 ESP32 PWM (LEDC)', () => {
  it('5 kHz and 50 % by default; output starts at once; repr', async () => {
    const r = await run('p = PWM(Pin(15))\nprint(p, p.freq(), p.duty(), p.duty_u16())\n');
    expect(r.output).toBe('PWM(Pin(15), freq=5000, duty_u16=32768) 5000 512 32768\n');
    expect(r.pwm.map(([, pin, f, d]) => [pin, f, d])).toEqual([['15', 5000, 0.5]]);
  });

  it('duty() is 10-bit (0–1023), duty_u16 16-bit; both are rounded to the timer\'s resolution (13 bits at 5 kHz)', async () => {
    const r = await run('p = PWM(Pin(15), freq=5000, duty=256)\nprint(p, p.duty_u16())\np.duty_u16(1001)\nprint(p.duty_u16())\n');
    expect(r.output).toBe('PWM(Pin(15), freq=5000, duty=256) 16384\n1000\n');
  });

  it('a servo at 50 Hz (16-bit resolution)', async () => {
    const r = await run('s = PWM(Pin(13), freq=50, duty_u16=4915)\nprint(s.freq(), s.duty_u16())\n');
    expect(r.output).toBe('50 4915\n');
  });

  it('the board\'s range errors; deinit makes it inactive', async () => {
    expect((await run('PWM(Pin(15), duty=1024)\n')).error).toMatchObject({ message: 'duty must be from 0 to 1023' });
    expect((await run('PWM(Pin(15), freq=0)\n')).error).toMatchObject({ message: 'frequency must be from 1Hz to 40MHz' });
    const r = await run('p = PWM(Pin(15))\np.deinit()\np.freq()\n');
    expect(r.error).toMatchObject({ type: 'RuntimeError', message: 'PWM is inactive', line: at(3) });
  });
});

describe('M2.5 ESP32 DAC, TouchPad, Timer, time', () => {
  it('DAC on GPIO 25 / 26: 0–255 → 0–3.3 V', async () => {
    const r = await run('d = DAC(Pin(25))\nd.write(128)\nprint(d)\n');
    expect(r.output).toBe('DAC(Pin(25))\n');
    expect(r.analog.map(([, pin, v]) => [pin, Math.round(v * 100) / 100])).toEqual([['25', 1.66]]);
    expect((await run('DAC(Pin(4))\n')).error).toMatchObject({ message: 'invalid Pin for DAC' });
    expect((await run('DAC(Pin(25)).write(256)\n')).error).toMatchObject({ message: 'value out of range' });
  });

  it('TouchPad: a touch makes read() drop', async () => {
    const r = await run('t = TouchPad(Pin(4))\nprint(t.read() > 400)\ntime.sleep(1)\nprint(t.read() < 200)\n', [{ atUs: 500_000, pin: '4', touched: true }]);
    expect(r.output).toBe('True\nTrue\n');
    expect((await run('TouchPad(Pin(5))\n')).error).toMatchObject({ message: 'invalid pin for touchpad' });
  });

  it('Timer: hardware 0–3 or virtual -1; periodic callbacks; the firmware\'s repr (its mode names are swapped)', async () => {
    const r = await run('n = 0\ndef tick(t):\n    global n\n    n += 1\nt = Timer(0)\nt.init(period=100, mode=Timer.PERIODIC, callback=tick)\ntime.sleep(0.55)\nprint(n, t)\n');
    expect(r.output).toBe('5 Timer(0, mode=ONE_SHOT, period=100)\n');
    expect((await run('Timer(4)\n')).error).toMatchObject({ message: "Timer(4) doesn't exist, there are only 4 hardware timers" });
    expect((await run('Timer(0).init(period=10, callback=print, hard=True)\n')).error).toMatchObject({ message: 'hard Timers are not implemented' });
  });

  it('the clock counts from 2000-01-01 (this port\'s epoch is 2000)', async () => {
    const r = await run('print(time.time(), time.localtime()[:3], time.mktime((2000, 1, 2, 0, 0, 0, 0, 0)))\n');
    expect(r.output).toBe('0 (2000, 1, 1) 86400\n');
  });

  it('the extension board has the same ESP32', async () => {
    const r = await run('print(Pin(2, Pin.OUT))\n', [], 'esp32-devkit-v1-ext');
    expect(r.output).toBe('Pin(2, mode=Pin.OUT)\n');
  });
});
