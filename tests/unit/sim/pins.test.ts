import { describe, expect, it } from 'vitest';
import { PinBank, RP2040_RESET, VDD } from '../../../src/sim/pins';

describe('PinBank: the headless pins (M2.3–M2.5)', () => {
  it('a pin after reset reads its board\'s reset pull; an ESP32-style reset has none', () => {
    expect(new PinBank().get('5')).toEqual(RP2040_RESET);
    const esp = new PinBank([], () => 0, { mode: 'in', pull: 'up', out: 0 });
    expect(esp.level('5')).toBe(1);
  });

  it('volts: from outside, else a DAC, else PWM\'s average, else the logic level', () => {
    let t = 0;
    const b = new PinBank([{ atUs: 10, pin: '1', volts: 1.2 }], () => t);
    b.configure('2', 'out', 'none', 1);
    expect(b.volts('2')).toBe(VDD);
    b.setPwm('2', 1000, 0.25);
    expect(b.volts('2')).toBeCloseTo(VDD / 4);
    b.setAnalog('2', 2);
    expect(b.volts('2')).toBe(2);
    b.setAnalog('2', -1);   // DAC off: PWM again
    expect(b.volts('2')).toBeCloseTo(VDD / 4);
    expect(b.volts('1')).toBe(0);
    t = 10;
    expect(b.volts('1')).toBe(1.2);
    expect(b.level('1')).toBe(0);   // 1.2 V is below half the supply
  });

  it('PWM and DAC traces record changes only; turning off PWM that was never on records nothing', () => {
    const b = new PinBank();
    b.setPwm('3', 50, -1);
    b.setPwm('3', 50, 0.1);
    b.setPwm('3', 50, 0.1);
    b.setPwm('3', 50, -1);
    expect(b.pwmTrace).toEqual([[0, '3', 50, 0.1], [0, '3', 50, 0]]);
    b.setAnalog('25', 1);
    b.setAnalog('25', 1);
    expect(b.analogTrace).toEqual([[0, '25', 1]]);
  });

  it('touch: a finger on, then off; scripted digital and analog inputs in time order', () => {
    let t = 0;
    const b = new PinBank([{ atUs: 20, pin: '4', touched: false }, { atUs: 10, pin: '4', touched: true }, { atUs: 30, pin: '5', level: 1 }], () => t);
    expect(b.touched('4')).toBe(false);
    expect(b.nextChangeUs()).toBe(10);
    t = 10;
    expect(b.touched('4')).toBe(true);
    t = 20;
    expect(b.touched('4')).toBe(false);
    expect(b.nextChangeUs()).toBe(30);
    t = 30;
    expect(b.level('5')).toBe(1);
    expect(b.nextChangeUs()).toBe(Infinity);
  });

  it('an IRQ with no edges or no handler is removed', () => {
    let t = 0;
    const b = new PinBank([{ atUs: 5, pin: '6', level: 1 }], () => t);
    b.irq('6', false, false, () => {}, null);
    b.irq('7', true, true, null, null);
    t = 5;
    b.update();
    expect(b.hasPending()).toBe(false);
  });
});
