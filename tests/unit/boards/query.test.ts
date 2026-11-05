import { describe, expect, it } from 'vitest';
import { functionKind, parseBoard, findPin, pinsWith } from '@lib/boards';
import picoJson from '../../../library/boards/pico-w/board.json';
import espJson from '../../../library/boards/esp32-devkit-v1/board.json';
import mbitJson from '../../../library/boards/microbit-v2/board.json';

const pico = parseBoard(picoJson);
const esp = parseBoard(espJson);
const mbit = parseBoard(mbitJson);
const labels = (pins: { label: string }[]) => pins.map((p) => p.label);

describe('pin queries (§1.3, screen 10)', () => {
  it('pins with ADC: Pico GP26–28; micro:bit P0–P4 and P10', () => {
    expect(labels(pinsWith(pico, 'adc'))).toEqual(['GP26', 'GP27', 'GP28']);
    expect(labels(pinsWith(mbit, 'adc'))).toEqual(['P10', 'P0', 'P1', 'P2', 'P3', 'P4']);   // header order: P10 is on the top row
  });

  it('ESP32 ADC pins: ADC1 (32–39) and ADC2 (not usable while Wi-Fi is on)', () => {
    expect(labels(pinsWith(esp, 'adc1'))).toEqual(['VP', 'VN', 'D34', 'D35', 'D32', 'D33']);
    expect(labels(pinsWith(esp, 'adc2'))).toEqual(['D25', 'D26', 'D27', 'D14', 'D12', 'D13', 'D4', 'D2', 'D15']);
    expect(pinsWith(esp, 'adc')).toHaveLength(15);
  });

  it('PWM on every Pico GP pin; on the ESP32 not on the input-only pins', () => {
    expect(pinsWith(pico, 'pwm')).toHaveLength(26);
    expect(labels(pinsWith(esp, 'pwm'))).not.toContain('D34');
  });

  it('touch and DAC', () => {
    expect(labels(pinsWith(esp, 'dac'))).toEqual(['D25', 'D26']);
    expect(labels(pinsWith(mbit, 'touch'))).toEqual(['P0', 'P1', 'P2']);
  });

  it('functionKind reads the kind from a function name', () => {
    expect(['ADC0', 'ADC1_CH6', 'ADC2_CH0', 'PWM7B', 'I2C1 SCL', 'SPI SCK', 'UART0 TX', 'TOUCH9', 'DAC1', 'TOUCH'].map(functionKind))
      .toEqual(['adc', 'adc1', 'adc2', 'pwm', 'i2c', 'spi', 'uart', 'touch', 'dac', 'touch']);
  });

  it('findPin by id or label; a label shared by several pins (GND) gives the first', () => {
    expect(findPin(pico, 'GP15')?.number).toBe(20);
    expect(findPin(pico, 'GND@38')?.number).toBe(38);
    expect(findPin(pico, 'GND')?.number).toBe(3);
    expect(findPin(pico, 'GP99')).toBeUndefined();
  });

  it('the GPIO limits the warnings use (screen 04, 10)', () => {
    expect(pico.gpio).toMatchObject({ safeMa: 12, shortCircuitMa: 48, pullOhms: 50_000, totalMa: 50 });
    expect(pico.supplies.find((s) => s.pin === '3V3')).toMatchObject({ volts: 3.3, maxMa: 300 });
  });
});
