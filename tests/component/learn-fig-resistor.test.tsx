import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BATTERIES, LED, LED_COLORS } from '../../src/lib/circuit';
import { stepE12 } from '../../src/lib/units';
import { ResistorInside } from '../../src/renderer/learn/figs/resistor';

/**
 * M8 Learn, the resistor's picture to play with: slide its resistance and the current through it thins, the LED
 * after it dims, its stripes change. The numbers are the simulator's (src/lib/circuit): a pack of four cells, a red
 * LED's volts, its rated and its greatest current; the values are the E12 series' (src/lib/units).
 */
const VOLTS = BATTERIES['4xAA']!.volts;
const VF = LED_COLORS.red!.vf;
const amps = (ohms: number) => (VOLTS - VF) / ohms;
const mA = (ohms: number) => String(Number((amps(ohms) * 1000).toFixed(1)));

/** The slider's values: the E12 series from 47 Ω to 10 kΩ. */
const VALUES: number[] = [];
for (let v = 47; v <= 10_000; v = stepE12(v, 1)) VALUES.push(v);

function setup() {
  const { container, unmount } = render(<ResistorInside />);
  const thumb = screen.getByRole('slider', { name: 'Resistance' });
  const at = () => Number(thumb.getAttribute('aria-valuenow'));
  return {
    container,
    unmount,
    thumb,
    picture: () => screen.getByRole('img'),
    drawn: () => [...container.querySelectorAll('svg[role="img"] text')].map((t) => t.textContent),
    flow: () => [...container.querySelectorAll('.lf-flow')],
    /** Slides to `ohms` one step at a time from the keyboard — through every value on the way. */
    slideTo: (ohms: number) => {
      const to = VALUES.indexOf(ohms);
      expect(to).toBeGreaterThanOrEqual(0);
      while (at() < to) fireEvent.keyDown(thumb, { key: 'ArrowRight' });
      while (at() > to) fireEvent.keyDown(thumb, { key: 'ArrowLeft' });
      expect(at()).toBe(to);
    },
  };
}

const says = () => screen.getByRole('status').textContent ?? '';

describe('the resistor, looked inside', () => {
  it('starts at the value the LED needs — 220 Ω on 6 V: 18.2 mA, bright; red, red, brown, gold', () => {
    const { thumb, picture, drawn } = setup();
    const start = stepE12((VOLTS - VF) / LED.ratedA, 1);
    expect(start).toBe(220);
    expect(thumb).toHaveAttribute('aria-valuenow', String(VALUES.indexOf(start)));
    expect(thumb).toHaveAttribute('aria-valuetext', '220 Ω');
    expect(thumb).toHaveAttribute('aria-valuemin', '0');
    expect(thumb).toHaveAttribute('aria-valuemax', String(VALUES.length - 1));
    expect(mA(220)).toBe('18.2');
    expect(says()).toBe('Through 220 Ω, 18.2 mA flows: the LED shines bright — just right. The stripes: red, red, brown, gold: 2, 2, one zero — 220 Ω.');
    expect(picture()).toHaveAccessibleName('A battery, a resistor and an LED in a loop: the resistor is 220 Ω — its stripes are red, red, brown and gold — so 18.2 mA flows and the LED shines bright');
    expect(drawn()).toEqual(expect.arrayContaining(['220 Ω', '18.2 mA', `${VOLTS} V`]));
  });

  it('slide it up: the current thins and the LED dims, the stripes change', () => {
    const { slideTo, picture, drawn, flow } = setup();
    const width = () => Number(flow()[0]!.getAttribute('stroke-width'));
    const before = width();
    slideTo(1000);
    expect(mA(1000)).toBe('4');
    expect(amps(1000)).toBeLessThan(LED.ratedA / 2);
    expect(says()).toBe('With 1 kΩ in the way only 4 mA gets through, so the LED is dim. The stripes: brown, black, red, gold: 1, 0, two zeros — 1 kΩ.');
    expect(picture()).toHaveAccessibleName(/the resistor is 1 kΩ — its stripes are brown, black, red and gold — so 4 mA flows and the LED is dim/);
    expect(drawn()).toEqual(expect.arrayContaining(['1 kΩ', '4 mA']));
    expect(width()).toBeLessThan(before);
  });

  it('the highest resistance: 10 kΩ, brown, black, orange — hardly any current', () => {
    const { thumb, slideTo, drawn } = setup();
    slideTo(10_000);
    expect(thumb).toHaveAttribute('aria-valuetext', '10 kΩ');
    expect(VALUES.at(-1)).toBe(10_000);
    expect(mA(10_000)).toBe('0.4');
    expect(says()).toBe('With 10 kΩ in the way only 0.4 mA gets through, so the LED is dim. The stripes: brown, black, orange, gold: 1, 0, three zeros — 10 kΩ.');
    expect(drawn()).toEqual(expect.arrayContaining(['10 kΩ', '0.4 mA']));
    fireEvent.keyDown(thumb, { key: 'ArrowRight' });               // no further
    expect(thumb).toHaveAttribute('aria-valuetext', '10 kΩ');
  });

  it('a little too small: more than the LED\'s 20 mA — it glares, too much, but is not burnt', () => {
    const { slideTo, picture, flow } = setup();
    slideTo(150);
    expect(amps(150)).toBeGreaterThan(LED.ratedA);
    expect(amps(150)).toBeLessThanOrEqual(LED.maxA);
    expect(says()).toBe(`150 Ω is too small: ${mA(150)} mA rushes through, more than the LED's ${LED.ratedA * 1000} mA. It glares — too much, it will not last. The stripes: brown, green, brown, gold: 1, 5, one zero — 150 Ω.`);
    expect(says()).not.toMatch(/burnt/);
    expect(picture()).toHaveAccessibleName(/so 26\.7 mA flows, more than its 20 mA: the LED glares — too much, it will not last/);
    expect(flow()[0]).toHaveClass('over');
    expect(screen.queryByRole('button', { name: 'New LED' })).toBeNull();
  });

  it('too small by far: past 30 mA the LED burns out, and stays burnt — for good — until a new LED is taken', () => {
    const { thumb, slideTo, picture, drawn, flow } = setup();
    slideTo(120);
    expect(amps(120)).toBeGreaterThan(LED.maxA);
    expect(says()).toBe(`More than ${LED.maxA * 1000} mA went through the LED: it burnt out, for good. No current flows now, whatever the resistance. Take a new LED to try again. The stripes: brown, red, brown, gold: 1, 2, one zero — 120 Ω.`);
    expect(picture()).toHaveAccessibleName('A battery, a resistor and an LED in a loop: the resistor is 120 Ω — its stripes are brown, red, brown and gold — the LED has burnt out, no current flows');
    expect(drawn()).toEqual(expect.arrayContaining(['120 Ω', '0 mA']));
    expect(flow()).toHaveLength(0);

    slideTo(470);                                                  // sliding back does not mend it
    expect(says()).toMatch(/it burnt out, for good/);
    expect(says()).toMatch(/yellow, violet, brown, gold: 4, 7, one zero — 470 Ω\.$/);
    expect(drawn()).toEqual(expect.arrayContaining(['470 Ω', '0 mA']));
    expect(picture()).toHaveAccessibleName(/the LED has burnt out, no current flows/);

    fireEvent.click(screen.getByRole('button', { name: 'New LED' }));
    expect(thumb).toHaveAttribute('aria-valuetext', '220 Ω');
    expect(says()).toMatch(/^Through 220 Ω, 18\.2 mA flows: the LED shines bright/);
    expect(flow().length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'New LED' })).toBeNull();
  });

  it('the lowest resistance: 47 Ω, yellow, violet, black — it burns the LED', () => {
    const { thumb, slideTo } = setup();
    slideTo(47);
    expect(thumb).toHaveAttribute('aria-valuenow', '0');
    expect(thumb).toHaveAttribute('aria-valuetext', '47 Ω');
    expect(amps(47)).toBeGreaterThan(LED.maxA);
    expect(says()).toMatch(/it burnt out, for good/);
    expect(says()).toMatch(/The stripes: yellow, violet, black, gold: 4, 7, no zeros — 47 Ω\.$/);
  });

  it('at every value the current is the simulator\'s: the battery\'s volts less the LED\'s, over the resistance', () => {
    for (const ohms of VALUES.filter((v) => amps(v) <= LED.maxA)) {
      const { slideTo, drawn, thumb, unmount } = setup();
      slideTo(ohms);
      const a = amps(ohms);
      expect(drawn()).toContain(`${mA(ohms)} mA`);
      expect(says()).toContain(`${mA(ohms)} mA`);
      expect(says()).toMatch(a < LED.ratedA / 2 ? /the LED is dim/ : a <= LED.ratedA ? /shines bright/ : /too much/);
      expect(says()).toContain(` — ${thumb.getAttribute('aria-valuetext')}.`);
      unmount();
    }
  });

  it('draws to fill its box, and says nothing broken', () => {
    const { container } = setup();
    const svg = container.querySelector('svg.lfig')!;
    expect(svg).toHaveAttribute('viewBox');
    expect(svg).not.toHaveAttribute('width');
    expect(container.innerHTML).not.toMatch(/NaN|undefined/);
    expect(container.querySelector('input, select')).toBeNull();
  });
});
