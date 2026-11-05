import { describe, expect, it } from 'vitest';
import { E12, formatValue, parseValue, stepE12 } from '@lib/units';

/** M4.1b: the stepper's − / + walk the standard resistor values (E12) across the decades. */
describe('E12 steps', () => {
  it('has the twelve values of a decade', () => {
    expect(E12).toEqual([1, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2]);
  });

  it.each([
    [220, 1, 270], [220, -1, 180], [820, 1, 1000], [1000, -1, 820], [8200, 1, 10_000], [10, -1, 8.2], [4700, 1, 5600],
  ])('from %d a step of %d gives %d', (from, dir, to) => {
    expect(stepE12(from, dir as 1 | -1)).toBeCloseTo(to, 9);
  });

  it('a value between two E12 values steps to the next one each way', () => {
    expect(stepE12(250, 1)).toBeCloseTo(270, 9);
    expect(stepE12(250, -1)).toBeCloseTo(220, 9);
  });
});

describe('values written with k and M', () => {
  it.each([['220', 220], ['1k', 1000], ['4.7k', 4700], ['4k7', 4700], ['10 k', 10_000], ['1M', 1e6], ['2.2 MΩ', 2.2e6], ['330Ω', 330]])(
    'reads %s as %d', (text, value) => { expect(parseValue(text)).toBeCloseTo(value, 6); },
  );

  it.each([['abc'], [''], ['1x'], ['-']])('refuses %j', (text) => { expect(parseValue(text)).toBeUndefined(); });

  it.each([[220, '220'], [1000, '1k'], [4700, '4.7k'], [10_000, '10k'], [1e6, '1M'], [2.2e6, '2.2M'], [8.2, '8.2']])(
    'writes %d as %s', (value, text) => { expect(formatValue(value)).toBe(text); },
  );
});
