import { describe, expect, it } from 'vitest';
import { parseBoard } from '@lib/boards';
import picoJson from '../../../library/boards/pico-w/board.json';
import espJson from '../../../library/boards/esp32-devkit-v1/board.json';
import mbitJson from '../../../library/boards/microbit-v2/board.json';

const clone = <T>(v: T): T => structuredClone(v);

describe('board.json schema', () => {
  it.each([
    ['pico-w', picoJson],
    ['esp32-devkit-v1', espJson],
    ['microbit-v2', mbitJson],
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

  it('refuses a GPIO pin without its GPIO number', () => {
    const bad = clone(picoJson) as { pins: Record<string, unknown>[] };
    delete bad.pins[0]!.gpio;
    expect(() => parseBoard(bad)).toThrow(/GP0.*gpio number/);
  });
});
