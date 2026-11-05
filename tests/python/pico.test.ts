import { describe, expect, it } from 'vitest';
import { VirtualClock } from '../../src/sim/clock';
import type { InputChange } from '../../src/sim/pins';
import { runProject } from '../../src/sim/run';
import { nodeLoader } from './vm';

/** M2 slice 4: the Pico W — LED, ADC, PWM, Timer (MicroPython v1.29.0 ports/rp2: machine_adc.c, machine_pwm.c,
 *  machine_timer.c, machine_pin_cyw43.c). */
const run = async (main: string, inputs: InputChange[] = []) =>
  runProject(await nodeLoader(), { board: 'pico-w', files: { 'main.py': `from machine import Pin, ADC, PWM, Timer\nimport machine, time\n${main}` }, clock: new VirtualClock(), inputs });

/** Errors are reported on the student's line; the two import lines come first. */
const at = (line: number) => line + 2;

describe('M2.4 the Pico W\'s LED (on the Wi-Fi chip)', () => {
  it('Pin("LED") is an output like any other, traced as "LED"', async () => {
    const r = await run('led = Pin("LED", Pin.OUT)\nled.toggle()\ntime.sleep(0.5)\nled.toggle()\nprint(led, led is Pin("WL_GPIO0"))\n');
    expect(r.output).toBe('Pin(EXT_GPIO0, mode=OUT) True\n');
    expect(r.trace.map(([t, p, v]) => [Math.round(t / 1000), p, v])).toEqual([[0, 'LED', 1], [500, 'LED', 0]]);
  });

  it('it takes no pull, no open drain, no IRQ: the board\'s errors', async () => {
    expect((await run('Pin("LED", Pin.IN, Pin.PULL_UP)\n')).error).toMatchObject({ message: 'pulls are not supported for external pins', line: at(1) });
    expect((await run('Pin("LED", Pin.OPEN_DRAIN)\n')).error).toMatchObject({ message: 'only Pin.OUT and Pin.IN are supported for this pin' });
    expect((await run('Pin("LED", Pin.OUT).irq(print)\n')).error).toMatchObject({ message: 'expecting a regular GPIO Pin' });
  });
});

describe('M2.4 ADC: GP26–28 (channels 0–2), channel 3 (VSYS/3), channel 4 (the temperature sensor)', () => {
  it('read_u16 is the 12-bit reading scaled to 16 bits, as the firmware scales it', async () => {
    const r = await run('a = ADC(26)\nprint(a.read_u16())\n', [{ atUs: 0, pin: '26', volts: 1.65 }]);
    expect(r.output).toBe(`${(2048 << 4) | (2048 >> 8)}\n`);
  });

  it('a pin, a board name or a channel number; the pin becomes analog', async () => {
    const r = await run('print(ADC(Pin(27)), ADC("GP28"), ADC(0), ADC(ADC.CORE_TEMP))\nprint(Pin(27))\n');
    expect(r.output).toBe('<ADC channel=1> <ADC channel=2> <ADC channel=0> <ADC channel=4>\nPin(GPIO27, mode=ALT, alt=31)\n');
  });

  it('a pin with no ADC: "Pin doesn\'t have ADC capabilities"', async () => {
    expect((await run('ADC(5)\n')).error).toMatchObject({ type: 'ValueError', message: "Pin doesn't have ADC capabilities", line: at(1) });
    expect((await run('ADC(Pin(15))\n')).error).toMatchObject({ message: "Pin doesn't have ADC capabilities" });
  });

  it('follows a knob turned during the run; 0 V and 3.3 V are the ends', async () => {
    const r = await run('a = ADC(26)\nprint(a.read_u16())\ntime.sleep(1)\nprint(a.read_u16())\n', [{ atUs: 0, pin: '26', volts: 0 }, { atUs: 500_000, pin: '26', volts: 3.3 }]);
    expect(r.output).toBe('0\n65535\n');
  });

  it('the temperature sensor gives about 25 °C with the datasheet formula', async () => {
    const r = await run('v = ADC(4).read_u16() * 3.3 / 65535\nprint(round(27 - (v - 0.706) / 0.001721))\n');
    expect(r.output).toBe('25\n');
  });
});

describe('M2.4 PWM', () => {
  it('freq and duty_u16 as set; repr gives slice and channel (GP15 = slice 7, B); the output is traced', async () => {
    const r = await run('p = PWM(Pin(15), freq=1000, duty_u16=32768)\nprint(p, p.freq(), p.duty_u16())\n');
    expect(r.output).toBe('<PWM slice=7 channel=1 invert=0> 1000 32768\n');
    expect(r.pwm).toHaveLength(1);
    expect(r.pwm[0]![1]).toBe('15');
    expect(r.pwm[0]![2]).toBe(1000);
    expect(r.pwm[0]![3]).toBeCloseTo(0.5, 3);
  });

  it('two pins on one slice share its frequency (GP14 and GP15 are slice 7); each keeps its duty', async () => {
    // 50 Hz and 1000 Hz give the slice different TOP values, so a's level must be worked out again
    const r = await run('a = PWM(Pin(14), freq=50, duty_u16=16384)\nb = PWM(Pin(15), freq=1000, duty_u16=49152)\nprint(a.freq(), a.duty_u16(), b.duty_u16())\n');
    expect(r.output).toBe('1000 16384 49152\n');
  });

  it('duty_ns, invert, and nothing comes out before both freq and duty are set', async () => {
    const r = await run('p = PWM(Pin(16))\np.duty_u16(1000)\nprint(p.freq(), p.duty_u16())\np.freq(1000)\np.duty_ns(250000)\nprint(p.duty_u16(), p.duty_ns())\np.init(invert=1)\nprint(p)\n');
    expect(r.output).toBe('0 0\n16384 250000\n<PWM slice=0 channel=0 invert=1>\n');
    expect(r.pwm.map(([, pin, f, d]) => [pin, f, Math.round(d * 100)])).toEqual([['16', 1000, 2], ['16', 1000, 25], ['16', 1000, 75]]);
  });

  it('too low a frequency: "freq too small"; deinit stops the output', async () => {
    expect((await run('PWM(Pin(15), freq=7)\n')).error).toMatchObject({ type: 'ValueError', message: 'freq too small' });
    const r = await run('p = PWM(Pin(15), freq=50, duty_u16=4915)\np.deinit()\n');
    expect(r.pwm.map(([, , , d]) => Math.round(d * 1000))).toEqual([75, 0]);
  });
});

describe('M2.4 Timer (soft, scheduled like an IRQ)', () => {
  it('periodic: every period, with the timer as the argument', async () => {
    const r = await run('n = 0\ndef tick(t):\n    global n\n    n += 1\nt = Timer(mode=Timer.PERIODIC, period=250, callback=tick)\ntime.sleep(1.01)\nprint(n, t)\n');
    expect(r.output).toBe('4 Timer(mode=PERIODIC, tick_hz=1000000, period=250000)\n');
  });

  it('one-shot: once; freq= instead of period=; deinit stops it', async () => {
    const r = await run('log = []\nTimer(mode=Timer.ONE_SHOT, period=100, callback=lambda t: log.append("once"))\nk = Timer(freq=10, callback=lambda t: log.append("k"))\ntime.sleep(0.35)\nk.deinit()\ntime.sleep(0.5)\nprint(log)\n');
    expect(r.output).toBe("['once', 'k', 'k', 'k']\n");
  });

  it('only the soft timer exists: Timer(0) is "Timer doesn\'t exist"', async () => {
    expect((await run('Timer(0)\n')).error).toMatchObject({ type: 'ValueError', message: "Timer doesn't exist", line: at(1) });
  });

  it('a callback runs during a busy loop too', async () => {
    const r = await run('hits = []\nTimer(period=100, callback=lambda t: hits.append(1))\nwhile len(hits) < 3 and time.ticks_ms() < 5000:   # a time limit, so a broken timer fails instead of hanging\n    pass\nprint(len(hits))\n');
    expect(r.output).toBe('3\n');
  });
});

describe('M2.4 the rest of the Pico W', () => {
  it('machine.freq() is 125 MHz; the clock starts at 2021-01-01 (no RTC set)', async () => {
    const r = await run('print(machine.freq())\nprint(time.time(), time.localtime()[:6])\n');
    expect(r.output).toBe('125000000\n1609459200 (2021, 1, 1, 0, 0, 0)\n');
  });
});
