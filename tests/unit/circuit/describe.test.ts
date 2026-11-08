import { describe, expect, it } from 'vitest';
import { describeFault, type Fault } from '@lib/circuit';

describe('M3.5 describeFault: one line per fault, with its numbers', () => {
  it.each<[Fault, string]>([
    [{ kind: 'short', severity: 'damage', on: '3V3', amps: 0.8, limitA: 0.8 }, '3V3: a short circuit — 800 mA, as much as it can give'],
    [{ kind: 'led-burnt', severity: 'damage', on: 'led1', amps: 0.048, limitA: 0.03 }, 'led1: the LED burnt out — 48 mA through it, it takes 30 mA at most'],
    [{ kind: 'led-over-current', severity: 'warning', on: 'led1', amps: 0.025, ratedA: 0.02 }, 'led1: 25 mA through the LED, more than its 20 mA'],
    [{ kind: 'pin-over-current', severity: 'warning', on: 'GP15', amps: 0.03, limitA: 0.012 }, 'GP15: the pin gives 30 mA, more than its safe 12 mA'],
    [{ kind: 'board-over-current', severity: 'warning', on: 'board', amps: 0.06, limitA: 0.05 }, "the board's pins give 60 mA together, more than 50 mA"],
    [{ kind: 'supply-over-current', severity: 'warning', on: '3V3', amps: 0.4, limitA: 0.3 }, '3V3: 400 mA drawn, more than its 300 mA'],
    [{ kind: 'over-voltage', severity: 'damage', on: 'GP2', volts: 5, limitV: 3.6 }, 'GP2: 5.0 V on a pin that takes 3.6 V at most'],
    [{ kind: 'floating', severity: 'warning', on: 'GP14' }, 'GP14: an input connected to nothing — what it reads is chance'],
    [{ kind: 'servo-underpowered', severity: 'warning', on: 's1', volts: 3.3 }, 's1: the servo has 3.3 V, it needs 4.8–6 V'],
    [{ kind: 'sensor-underpowered', severity: 'warning', on: 'pir1', volts: 3.3, limitV: 4.5 }, 'pir1: the sensor has 3.3 V, it needs 4.5 V at least'],
    [{ kind: 'short', severity: 'damage', on: 'X' }, 'X: a short circuit — 0 mA, as much as it can give'],
    // M6.1: an RGB LED's die by its colour
    [{ kind: 'led-burnt', severity: 'damage', on: 'rgb1:g', amps: 0.048, limitA: 0.03 }, 'rgb1 (green): the LED burnt out — 48 mA through it, it takes 30 mA at most'],
    [{ kind: 'led-over-current', severity: 'warning', on: 'rgb2:r', amps: 0.025, ratedA: 0.02 }, 'rgb2 (red): 25 mA through the LED, more than its 20 mA'],
    // M7 slice 2: a digit's segment by its letter (not an RGB LED's blue); a display too weak to show well
    [{ kind: 'led-burnt', severity: 'damage', on: 'digit1:b', amps: 0.048, limitA: 0.03, partType: 'seven-segment' }, 'digit1 (segment b): the LED burnt out — 48 mA through it, it takes 30 mA at most'],
    [{ kind: 'led-burnt', severity: 'damage', on: 'uln1:A', amps: 0.048, limitA: 0.03, partType: 'uln2003' }, 'uln1:A: the LED burnt out — 48 mA through it, it takes 30 mA at most'],
    [{ kind: 'display-underpowered', severity: 'warning', on: 'lcd1', volts: 3.3, limitV: 4.5, partType: 'lcd1602' }, 'lcd1: the display has 3.3 V, it needs 4.5 V at least — its letters are too faint to read'],
    [{ kind: 'display-underpowered', severity: 'warning', on: 'mx1', volts: 3.3, limitV: 4, partType: 'max7219' }, 'mx1: the display has 3.3 V, it needs 4.0 V at least — its dots may stay dark'],
    [{ kind: 'display-underpowered', severity: 'warning', on: 'oled1', volts: 2.5, limitV: 3 }, 'oled1: the display has 2.5 V, it needs 3.0 V at least'],
  ])('%j', (f, text) => {
    expect(describeFault(f)).toBe(text);
  });
});
