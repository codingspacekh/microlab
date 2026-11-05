import type { BoardData, BoardPin } from './schema';

export type FunctionKind = 'adc' | 'adc1' | 'adc2' | 'pwm' | 'dac' | 'touch' | 'i2c' | 'spi' | 'uart';

/** ADC1_CH6 → adc1, ADC0 → adc, PWM7B → pwm, I2C1 SCL → i2c. */
export function functionKind(fn: string): FunctionKind {
  if (fn.startsWith('ADC1_')) return 'adc1';
  if (fn.startsWith('ADC2_')) return 'adc2';
  const head = /^[A-Z]+(?:2C)?/.exec(fn)?.[0] ?? '';
  return head.toLowerCase() as FunctionKind;
}

/** Pins that can do `kind`, in header order. `adc` includes the ESP32's adc1 and adc2 pins. */
export function pinsWith(board: BoardData, kind: FunctionKind): BoardPin[] {
  return board.pins.filter((p) =>
    p.functions.some((fn) => {
      const k = functionKind(fn);
      return k === kind || (kind === 'adc' && (k === 'adc1' || k === 'adc2'));
    }),
  );
}

/** A pin by id (GND@38), else the first pin with that label (GND, GP15). */
export function findPin(board: BoardData, ref: string): BoardPin | undefined {
  return board.pins.find((p) => p.id === ref) ?? board.pins.find((p) => p.label === ref);
}
