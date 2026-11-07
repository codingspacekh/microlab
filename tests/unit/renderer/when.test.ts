import { describe, expect, it } from 'vitest';
import { whenText } from '../../../src/renderer/app/when';

/** M5.7 F-05: when a recent project was last used, as screen 01 says it. */
describe('M5.7 when', () => {
  const now = new Date(2026, 10, 7, 15, 30).getTime();
  it('today with the time; yesterday; this year by day and month; before that with the year', () => {
    expect(whenText(new Date(2026, 10, 7, 10, 42).getTime(), now)).toBe('Today 10:42');
    expect(whenText(new Date(2026, 10, 7, 9, 5).getTime(), now)).toBe('Today 09:05');
    expect(whenText(new Date(2026, 10, 6, 23, 59).getTime(), now)).toBe('Yesterday');
    expect(whenText(new Date(2026, 10, 3, 12, 0).getTime(), now)).toBe('3 Nov');
    expect(whenText(new Date(2025, 11, 25, 12, 0).getTime(), now)).toBe('25 Dec 2025');
  });
  it('the first of the month: yesterday was last month', () => {
    expect(whenText(new Date(2026, 9, 31, 20, 0).getTime(), new Date(2026, 10, 1, 8, 0).getTime())).toBe('Yesterday');
  });
});
