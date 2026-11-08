import { describe, expect, it } from 'vitest';
import { apiFor, completeAt, signatureAt } from '@lib/editor';

/** M5.5 F-20: autocomplete from each board's modules, with a short explanation (screen 02b). */
const at = (board: string, code: string) => completeAt(board, code, code.length);
const labels = (board: string, code: string) => at(board, code)?.options.map((o) => o.label) ?? [];
const option = (board: string, code: string, label: string) => at(board, code)?.options.find((o) => o.label === label);

describe('M5.5 the catalogue', () => {
  it('each board has its own modules', () => {
    expect([...apiFor('pico-w').keys()].sort()).toEqual(['gc', 'machine', 'math', 'micropython', 'neopixel', 'os', 'random', 'sys', 'time']);   // M7: neopixel
    expect([...apiFor('microbit-v2').keys()].sort()).toEqual(['gc', 'machine', 'math', 'microbit', 'micropython', 'music', 'neopixel', 'os', 'radio', 'random', 'time', 'utime']);   // M7: radio, neopixel
    expect(apiFor('esp32-devkit-v1-ext')).toBe(apiFor('esp32-devkit-v1'));
  });

  it('a name only one board has is only on that board', () => {
    expect(apiFor('pico-w').get('machine')!.members.get('Pin')!.members.has('ALT_PWM')).toBe(true);
    expect(apiFor('esp32-devkit-v1').get('machine')!.members.get('Pin')!.members.has('ALT_PWM')).toBe(false);
    expect(apiFor('esp32-devkit-v1').get('machine')!.members.has('DAC')).toBe(true);
    expect(apiFor('pico-w').get('machine')!.members.has('DAC')).toBe(false);
  });
});

describe('M5.5 what is offered where', () => {
  it('on the Pico: machine.Pin(id, mode=-1, pull=-1, …) with what a pin is', () => {
    const pin = option('pico-w', 'import machine\nmachine.P', 'Pin')!;
    expect(pin.detail).toBe('(id, mode=-1, pull=-1, …)');
    expect(pin.kind).toBe('class');
    expect(pin.info).toMatch(/^Pin\(id, mode=-1, pull=-1, \*, value=None, alt=-1\)\n.*GPIO pin/);
    expect(at('pico-w', 'import machine\nmachine.P')!.from).toBe('import machine\nmachine.'.length);
  });

  it('on the micro:bit: pin0, pin1 … after from microbit import *', () => {
    const l = labels('microbit-v2', 'from microbit import *\npin');
    expect(l.slice(0, 3)).toEqual(['pin0', 'pin1', 'pin2']);
    expect(l).toContain('pin_logo');
    expect(labels('microbit-v2', 'from microbit import *\ndisplay.')).toEqual(expect.arrayContaining(['show', 'scroll', 'clear', 'set_pixel']));
    expect(labels('microbit-v2', 'from microbit import *\npin0.')).toEqual(expect.arrayContaining(['read_analog', 'is_touched', 'write_digital']));
    expect(labels('microbit-v2', 'from microbit import *\npin5.')).not.toContain('read_analog');
    expect(labels('microbit-v2', 'from microbit import *\nImage.')).toContain('HEART');
    expect(labels('microbit-v2', 'from microbit import *\nImage.')).not.toContain('Display');
  });

  it('import and from offer the board\'s modules; from … import its names, not the hidden classes', () => {
    expect(labels('pico-w', 'import ')).toEqual(['gc', 'machine', 'math', 'micropython', 'neopixel', 'os', 'random', 'sys', 'time']);
    expect(labels('microbit-v2', 'from m')).toEqual(['machine', 'math', 'microbit', 'micropython', 'music']);
    expect(labels('pico-w', 'from machine import Pin, ')).toContain('PWM');
    expect(labels('microbit-v2', 'from microbit import ')).not.toContain('Display');
  });

  it('names from the code: an alias, a from-import, a variable made from a class', () => {
    expect(labels('pico-w', 'import machine as m\nm.')).toContain('Pin');
    expect(labels('pico-w', 'from machine import Pin\nPin.')).toEqual(expect.arrayContaining(['OUT', 'IN', 'PULL_UP', 'value', 'toggle']));
    expect(labels('pico-w', 'from machine import Pin\nled = Pin(15, Pin.OUT)\nled.')).toEqual(expect.arrayContaining(['on', 'off', 'toggle', 'value']));
    expect(labels('pico-w', 'import machine\nled = machine.Pin("LED", machine.Pin.OUT)\nled.t')).toEqual(['toggle']);
    expect(labels('pico-w', 'from machine import Pin, PWM\nfrom time import sleep\nsl')).toEqual(['sleep']);
    expect(labels('pico-w', 'import time\ntime.sleep_')).toEqual(['sleep_ms', 'sleep_us']);
  });

  it('an ESP32 PWM has duty; a Pico one does not', () => {
    expect(labels('esp32-devkit-v1', 'from machine import PWM, Pin\np = PWM(Pin(2))\np.')).toContain('duty');
    expect(labels('pico-w', 'from machine import PWM, Pin\np = PWM(Pin(2))\np.')).not.toContain('duty');
  });

  it('nothing is offered for a name the board does not have, or after a number', () => {
    expect(at('pico-w', 'import microbit\nmicrobit.')).toBeNull();
    expect(at('pico-w', 'x = 3.')).toBeNull();
    expect(at('pico-w', 'print(')).toBeNull();
  });
});

describe('M5.5 the arguments while typing a call (F-20: "machine.Pin( shows its arguments")', () => {
  it('Pin( on the Pico: its signature, and which argument is being typed', () => {
    const s = signatureAt('pico-w', 'from machine import Pin\nled = Pin(15, ', 'from machine import Pin\nled = Pin(15, '.length)!;
    expect(s.label).toBe('Pin');
    expect(s.params).toEqual(['id', 'mode=-1', 'pull=-1', '*', 'value=None', 'alt=-1']);
    expect(s.active).toBe(1);
    expect(s.doc).toMatch(/GPIO pin/);
  });

  it('nested calls: the innermost; a closed call: none', () => {
    const code = 'import machine\np = machine.PWM(machine.Pin(15), freq=';
    expect(signatureAt('pico-w', code, code.length)!.label).toBe('PWM');
    expect(signatureAt('pico-w', 'import machine\nmachine.Pin(15)', 30)).toBeNull();
    const mb = 'from microbit import *\ndisplay.scroll("hi", ';
    expect(signatureAt('microbit-v2', mb, mb.length)).toMatchObject({ label: 'scroll', active: 1 });
  });

  it('a comma inside a string or a list does not move to the next argument', () => {
    const code = 'from microbit import *\nmusic_notes = ["C4:4", "E"]\ndisplay.scroll("a, b", ';
    expect(signatureAt('microbit-v2', code, code.length)!.active).toBe(1);
  });
});

describe('the teacher (2026-11-08): a call is taken with its brackets', () => {
  it('a method, function or class says whether its call takes arguments; a constant or a module isn\'t called', () => {
    expect(option('microbit-v2', 'from microbit import *\ndisplay.', 'scroll')!.call).toBe('args');
    expect(option('microbit-v2', 'from microbit import *\nbutton_a.', 'is_pressed')!.call).toBe('empty');
    expect(option('pico-w', 'import machine\nmachine.P', 'Pin')!.call).toBe('args');
    expect(option('pico-w', 'from machine import Pin\nPin.', 'OUT')!.call).toBeUndefined();
    expect(option('pico-w', 'import ', 'machine')!.call).toBeUndefined();
  });

  it('a name being imported gets no brackets', () => {
    expect(option('pico-w', 'from machine import P', 'Pin')!.call).toBeUndefined();
    expect(option('pico-w', 'from time import sl', 'sleep')!.call).toBeUndefined();
  });
});
