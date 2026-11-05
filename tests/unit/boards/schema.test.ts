import { describe, expect, it } from 'vitest';
import { parseBoard } from '@lib/boards';
import picoJson from '../../../library/boards/pico-w/board.json';
import espJson from '../../../library/boards/esp32-devkit-v1/board.json';
import mbitJson from '../../../library/boards/microbit-v2/board.json';
import extJson from '../../../library/boards/esp32-devkit-v1-ext/board.json';

const clone = <T>(v: T): T => structuredClone(v);

describe('board.json schema', () => {
  it.each([
    ['pico-w', picoJson],
    ['esp32-devkit-v1', espJson],
    ['microbit-v2', mbitJson],
    ['esp32-devkit-v1-ext', extJson],
  ])('%s passes', (id, json) => {
    expect(parseBoard(json).id).toBe(id);
  });

  it('refuses a board with no pins, naming the field', () => {
    const bad = clone(picoJson) as Record<string, unknown>;
    delete bad.pins;
    expect(() => parseBoard(bad)).toThrow(/pins/);
  });

  it('refuses a function it does not know', () => {
    const bad = clone(picoJson);
    bad.pins[0]!.functions = ['PWM0A', 'WIFI'];
    expect(() => parseBoard(bad)).toThrow(/pins\.0\.functions\.1/);
  });

  it('refuses two pins with the same id', () => {
    const bad = clone(picoJson);
    bad.pins[1]!.id = bad.pins[0]!.id;
    expect(() => parseBoard(bad)).toThrow(/duplicate pin id "GP0"/);
  });

  it('refuses a supply on a pin that is not there', () => {
    const bad = clone(picoJson);
    bad.supplies[0]!.pin = 'NOPE';
    expect(() => parseBoard(bad)).toThrow(/supply on unknown pin "NOPE"/);
  });

  it('refuses a built-in part on a pin that is not there', () => {
    const bad = clone(espJson);
    bad.builtIn[0] = { kind: 'led', id: 'LED', pin: 'D99', color: 'blue', ohms: 1000 };
    expect(() => parseBoard(bad)).toThrow(/built-in LED on unknown pin "D99"/);
    const bad2 = clone(mbitJson);
    bad2.builtIn[0] = { kind: 'button', id: 'A', a: 'P5', b: 'NOPE' };
    expect(() => parseBoard(bad2)).toThrow(/built-in A on unknown pin "NOPE"/);
  });

  it('refuses a board with no ground pin', () => {
    const bad = clone(picoJson);
    bad.pins = bad.pins.filter((p) => p.role !== 'ground');
    expect(() => parseBoard(bad)).toThrow(/no ground pin/);
  });

  it('refuses a GPIO pin without its GPIO number', () => {
    const bad = clone(picoJson) as { pins: Record<string, unknown>[] };
    delete bad.pins[0]!.gpio;
    expect(() => parseBoard(bad)).toThrow(/GP0.*gpio number/);
  });

  it('refuses a "same connection" pin that names a pin that is not there, or one of another kind', () => {
    const bad = clone(mbitJson);
    bad.pins.find((p) => p.id === 'SDA')!.same = 'P99';
    expect(() => parseBoard(bad)).toThrow(/SDA is the same as unknown pin "P99"/);
    const bad2 = clone(mbitJson);
    bad2.pins.find((p) => p.id === 'SDA')!.same = '3.3V';
    expect(() => parseBoard(bad2)).toThrow(/SDA is the same as 3.3V but not the same kind of pin/);
    const bad3 = clone(mbitJson);
    bad3.pins.find((p) => p.id === 'SDA')!.same = 'SCL';
    expect(() => parseBoard(bad3)).toThrow(/SDA is the same as SCL, which is itself the same as another pin/);
  });

  it('refuses a jumper-chosen supply whose volts are not one of its choices', () => {
    const bad = clone(extJson);
    bad.supplies[0]!.volts = 9;
    expect(() => parseBoard(bad)).toThrow(/supply V is 9 V, not one of its choices 3.3, 5/);
  });
});
