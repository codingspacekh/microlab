import { describe, expect, it } from 'vitest';
import { VirtualClock } from '../../src/sim/clock';
import type { InputChange } from '../../src/sim/pins';
import { runProject, type ProjectFiles } from '../../src/sim/run';
import { nodeLoader } from './vm';

/** M2 slice 6a: the micro:bit V2's pins, buttons and the rest of `microbit` (micropython-microbit-v2 v2.1.2:
 *  src/codal_port/modmicrobit.c, microbit_pin.c, microbit_pinmode.c, microbit_button.c, modos.c, microbitfs.c,
 *  modutime.c; src/codal_app/microbithal.cpp). */
const run = async (main: string, inputs: InputChange[] = [], files: ProjectFiles = {}) =>
  runProject(await nodeLoader(), { board: 'microbit-v2', files: { 'main.py': `from microbit import *\n${main}`, ...files }, clock: new VirtualClock(), inputs });
const at = (line: number) => line + 1;
const ms = (trace: [number, string, number][]) => trace.map(([t, p, v]) => [Math.round(t / 1000), p, v]);

describe('M2.6 micro:bit pins', () => {
  it('write_digital is traced; read_digital reads the outside (pulled down when nothing drives it)', async () => {
    const r = await run('pin0.write_digital(1)\nsleep(200)\npin0.write_digital(0)\nprint(pin1.read_digital(), pin2.read_digital())\n', [{ atUs: 0, pin: '1', level: 1 }]);
    expect(ms(r.trace)).toEqual([[0, '0', 1], [200, '0', 0]]);
    expect(r.output).toBe('1 0\n');
  });

  it('write_digital takes 0 or 1 (True / False too)', async () => {
    expect((await run('pin0.write_digital(True)\npin0.write_digital(2)\n')).error).toEqual({ type: 'ValueError', message: 'value must be 0 or 1', file: 'main.py', line: at(2) });
  });

  it('a pin the board is using: "Pin 3 in display mode", "Pin 5 in button mode", "Pin 19 in i2c mode"', async () => {
    expect((await run('pin3.read_analog()\n')).error).toMatchObject({ type: 'ValueError', message: 'Pin 3 in display mode', line: at(1) });
    expect((await run('pin5.write_digital(1)\n')).error).toMatchObject({ message: 'Pin 5 in button mode' });
    expect((await run('pin19.write_digital(1)\n')).error).toMatchObject({ message: 'Pin 19 in i2c mode' });
  });

  it('read_digital is allowed on a button pin (pulled up on the board); get_mode tells the mode', async () => {
    const r = await run('print(pin5.read_digital(), pin5.get_mode(), pin0.get_mode(), pin3.get_mode())\npin0.write_digital(1)\nprint(pin0.get_mode())\npin0.read_analog()\nprint(pin0.get_mode())\n');
    expect(r.output).toBe('1 button unused display\nwrite_digital\nunused\n');
  });

  it('read_analog is 0–1023 of 3.3 V', async () => {
    const r = await run('print(pin0.read_analog(), pin1.read_analog(), pin2.read_analog())\n', [{ atUs: 0, pin: '0', volts: 0 }, { atUs: 0, pin: '1', volts: 3.3 }, { atUs: 0, pin: '2', volts: 1.65 }]);
    expect(r.output).toBe('0 1023 512\n');
  });

  it('write_analog is PWM at 20 ms by default; set_analog_period changes it; 0 frees the pin', async () => {
    const r = await run('pin0.write_analog(511)\nprint(pin0.get_analog_period_microseconds())\npin0.set_analog_period(10)\npin0.write_analog(1023.0)\npin0.write_analog(0)\nprint(pin0.get_mode())\n');
    expect(r.output).toBe('20000\nunused\n');
    expect(r.pwm.map(([, pin, f, d]) => [pin, f, Math.round(d * 1000) / 1000])).toEqual([['0', 50, 0.5], ['0', 100, 0.5], ['0', 100, 1], ['0', 100, 0]]);
    expect((await run('pin0.write_analog(1024)\n')).error).toMatchObject({ message: 'value must be between 0 and 1023' });
  });

  it('is_touched on pins 0–2 and the logo', async () => {
    const r = await run('print(pin0.is_touched(), pin_logo.is_touched())\nsleep(500)\nprint(pin0.is_touched(), pin_logo.is_touched())\n', [{ atUs: 100_000, pin: '0', touched: true }, { atUs: 100_000, pin: 'LOGO', touched: true }]);
    expect(r.output).toBe('False False\nTrue True\n');
  });

  it('pull: the HAL reports PULL_UP until one is set (its pull state starts at 0); set_pull changes the reading', async () => {
    const r = await run('pin8.read_digital()\nprint(pin8.get_pull() == pin8.PULL_UP)\npin8.set_pull(pin8.PULL_UP)\nprint(pin8.read_digital(), pin8.PULL_UP, pin8.PULL_DOWN, pin8.NO_PULL)\n');
    expect(r.output).toBe('True\n1 0 1 2\n');
  });

  it('pins print as their type', async () => {
    const r = await run('print(pin0, pin3, pin5, pin_logo, pin_speaker)\n');
    expect(r.output).toBe('<MicroBitTouchPin> <MicroBitAnalogDigitalPin> <MicroBitDigitalPin> <MicroBitTouchOnlyPin> <MicroBitDigitalPin>\n');
  });
});

describe('M2.6 micro:bit buttons', () => {
  const pressA = (at: number): InputChange[] => [{ atUs: at, pin: '5', level: 0 }, { atUs: at + 100_000, pin: '5', level: 1 }];

  it('is_pressed while held; was_pressed once per press; get_presses counts and resets', async () => {
    const r = await run('print(button_a.is_pressed(), button_a.was_pressed())\nsleep(250)\nprint(button_a.is_pressed())\nsleep(1000)\nprint(button_a.was_pressed(), button_a.was_pressed(), button_a.get_presses(), button_a.get_presses())\n',
      [...pressA(200_000), ...pressA(600_000)]);
    expect(r.output).toBe('False False\nTrue\nTrue False 2 0\n');
  });

  it('was_pressed between two presses leaves the count for get_presses (the HAL adds them up)', async () => {
    const r = await run('sleep(300)\nprint(button_a.was_pressed())\nsleep(500)\nprint(button_a.get_presses())\n', [...pressA(100_000), ...pressA(500_000)]);
    expect(r.output).toBe('True\n2\n');
  });

  it('button_b is pin 11; buttons print as MicroBitButton', async () => {
    const r = await run('sleep(500)\nprint(button_b.get_presses(), button_b)\n', [{ atUs: 100_000, pin: '11', level: 0 }, { atUs: 150_000, pin: '11', level: 1 }]);
    expect(r.output).toBe('1 <MicroBitButton>\n');
  });
});

describe('M2.6 the rest of microbit, and its own os and utime', () => {
  it('sleep (ms, a float too), running_time, temperature, scale', async () => {
    const r = await run('t = running_time()\nsleep(250.7)\nprint(running_time() - t, temperature())\nprint(scale(512, from_=(0, 1023), to=(0, 255)), scale(0.5, from_=(0, 1), to=(0.0, 10.0)))\n');
    expect(r.output).toBe('250 25\n128 5.0\n');
  });

  it('a flat file system: os.listdir, size, remove; no folders; open takes r / w / b / t only', async () => {
    const r = await run('import os\nprint(sorted(os.listdir()), os.size("data.txt"), hasattr(os, "mkdir"), os.uname().sysname)\nos.remove("data.txt")\nprint(os.listdir())\nopen("log.txt", "a")\n', [], { 'data.txt': 'hello' });
    expect(r.output).toBe("['data.txt', 'main.py'] 5 False microbit\n['main.py']\nTraceback (most recent call last):\n  File \"main.py\", line 6, in <module>\nValueError: illegal mode\n");
  });

  it('utime has no date: time.time() does not exist; it prints as utime', async () => {
    const r = await run('import time\nprint(time, time.ticks_ms() >= 0, hasattr(time, "time"), hasattr(time, "localtime"))\n');
    expect(r.output).toBe("<module 'utime'> True False False\n");
  });
});
