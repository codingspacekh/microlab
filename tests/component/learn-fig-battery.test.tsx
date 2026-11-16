import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BATTERIES, LED } from '@lib/circuit';
import { AA_CELL_MAH, BatteryInside, NINE_VOLT_MAH } from '../../src/renderer/learn/figs/battery';

/**
 * M8 Learn's picture of the battery pack, opened: Pack chooses 2 × AA, 4 × AA or the 9 V battery — its cells in a row
 * add their volts to the simulator's (3, 6, 9 V) — and What it feeds, in mA, says how long it lasts: what a cell
 * holds (about 2000 mAh for an AA, about 500 mAh for a 9 V battery) over the current.
 */

const PACKS = [
  { kind: '2xAA', name: '2 × AA', cells: 2, mAh: AA_CELL_MAH },
  { kind: '4xAA', name: '4 × AA', cells: 4, mAh: AA_CELL_MAH },
  { kind: '9V', name: '9 V', cells: 6, mAh: NINE_VOLT_MAH },
] as const;

/** One LED's best current, as the LED's page has it: between half its rated current and all of it. */
const LED_MA = (LED.ratedA * 1000 * 3) / 4;

/** "about 130 hours": two figures are all a battery's life is known to. */
const about = (hours: number) => {
  const h = Number(hours.toPrecision(2));
  return `about ${h} ${h === 1 ? 'hour' : 'hours'}`;
};

function setup() {
  const { container } = render(<BatteryInside />);
  return {
    container,
    pack: (name: string) => screen.getByRole('radio', { name }),
    feeds: screen.getByRole('slider', { name: 'What it feeds' }),
    picture: () => screen.getByRole('img', { name: /opened/ }),
    says: () => screen.getByRole('status').textContent ?? '',
    drawn: () => [...container.querySelectorAll('svg[role="img"] text')].map((t) => t.textContent),
    cells: () => container.querySelectorAll('[data-cell]').length,
    gauge: () => Number(container.querySelector('[data-lasts]')!.getAttribute('width')),
  };
}

/** Moves the slider (steps of 5 mA) from the keyboard. */
function slideTo(thumb: HTMLElement, value: number) {
  const now = () => Number(thumb.getAttribute('aria-valuenow'));
  fireEvent.keyDown(thumb, { key: 'Home' });
  while (now() + 50 <= value) fireEvent.keyDown(thumb, { key: 'PageUp' });
  while (now() < value) fireEvent.keyDown(thumb, { key: 'ArrowRight' });
  expect(now()).toBe(value);
}

describe('the battery pack, opened', () => {
  it('what the cells hold is what the page says', () => {
    expect(AA_CELL_MAH).toBe(2000);
    expect(NINE_VOLT_MAH).toBe(500);
    expect(LED_MA).toBe(15);
  });

  it('starts with 4 × AA feeding one LED: 6 V, about 130 hours', () => {
    const { pack, feeds, picture, says, drawn, cells } = setup();
    expect(screen.getByRole('radiogroup', { name: 'Pack' })).toBeInTheDocument();
    expect(pack('4 × AA')).toBeChecked();
    expect(feeds).toHaveAttribute('aria-valuenow', '15');
    expect(feeds).toHaveAttribute('aria-valuemin', '5');
    expect(feeds).toHaveAttribute('aria-valuemax', '500');
    expect(feeds).toHaveAttribute('aria-valuetext', '15 mA');
    expect(BATTERIES['4xAA']!.volts).toBe(6);
    expect(says()).toBe('4 × AA: four cells in a row push together — 6 V. Feeding 15 mA (one LED) it lasts about 130 hours.');
    expect(picture()).toHaveAccessibleName('A 4 × AA battery pack opened: 4 cells in a row, + to −, 1.5 V each, add up to 6 V; feeding 15 mA it lasts about 130 hours');
    expect(cells()).toBe(4);
    expect(drawn().filter((t) => t === '1.5 V')).toHaveLength(4 + 1);       // on each cell, and the sum after the first
    expect(drawn()).toEqual(expect.arrayContaining(['0 V', '3 V', '4.5 V', '6 V', 'Lasts about 130 hours']));
  });

  it.each(PACKS)('$name: its cells add up to the simulator\'s volts, and it lasts what it holds over the current', ({ kind, name, cells: n, mAh }) => {
    const { pack, picture, says, drawn, cells } = setup();
    fireEvent.click(pack(name));
    expect(pack(name)).toBeChecked();
    const volts = BATTERIES[kind]!.volts;
    const each = volts / n;
    expect(each).toBe(1.5);
    expect(cells()).toBe(n);
    // the running sum along the row, to the total
    const sums = Array.from({ length: n }, (_, i) => `${Number(((i + 1) * each).toFixed(2))} V`);
    expect(drawn()).toEqual(expect.arrayContaining(['0 V', ...sums]));
    expect(sums.at(-1)).toBe(`${volts} V`);
    expect(drawn().filter((t) => t === `${each} V`)).toHaveLength(n + 1);
    const lasts = about(mAh / LED_MA);
    expect(says()).toContain(`push together — ${volts} V.`);
    expect(says()).toContain(`Feeding ${LED_MA} mA (one LED) it lasts ${lasts}`);
    expect(drawn()).toContain(`Lasts ${lasts}`);
    expect(picture()).toHaveAccessibleName(new RegExp(`${n} (small )?cells in .*, 1\\.5 V each, add up to ${volts} V; feeding ${LED_MA} mA it lasts ${lasts}$`));
  });

  it('2 × AA and the 9 V battery say what they are', () => {
    const { pack, picture, says } = setup();
    fireEvent.click(pack('2 × AA'));
    expect(says()).toBe('2 × AA: two cells in a row push together — 3 V. Feeding 15 mA (one LED) it lasts about 130 hours.');
    expect(picture()).toHaveAccessibleName('A 2 × AA battery pack opened: 2 cells in a row, + to −, 1.5 V each, add up to 3 V; feeding 15 mA it lasts about 130 hours');
    fireEvent.click(pack('9 V'));
    expect(says()).toBe('9 V battery: six small cells in one case push together — 9 V. Feeding 15 mA (one LED) it lasts about 33 hours: small cells hold less.');
    expect(picture()).toHaveAccessibleName('A 9 V battery opened: 6 small cells in one case, + to −, 1.5 V each, add up to 9 V; feeding 15 mA it lasts about 33 hours');
  });

  it('cells in a row add their volts, not what they hold: 2 × AA lasts as long as 4 × AA', () => {
    const { pack, drawn } = setup();
    slideTo(screen.getByRole('slider', { name: 'What it feeds' }), 100);
    const lasts = `Lasts ${about(AA_CELL_MAH / 100)}`;
    expect(lasts).toBe('Lasts about 20 hours');
    expect(drawn()).toContain(lasts);
    fireEvent.click(pack('2 × AA'));
    expect(drawn()).toContain(lasts);
    fireEvent.click(pack('9 V'));
    expect(drawn()).toContain(`Lasts ${about(NINE_VOLT_MAH / 100)}`);
  });

  it('the smallest load: 5 mA, less than one LED takes — the longest life', () => {
    const { pack, feeds, picture, says, drawn } = setup();
    fireEvent.keyDown(feeds, { key: 'Home' });
    expect(feeds).toHaveAttribute('aria-valuenow', '5');
    expect(says()).toBe(`4 × AA: four cells in a row push together — 6 V. Feeding 5 mA (less than one LED takes) it lasts ${about(AA_CELL_MAH / 5)}.`);
    expect(says()).toContain('about 400 hours');
    expect(picture()).toHaveAccessibleName(/feeding 5 mA it lasts about 400 hours$/);
    fireEvent.click(pack('9 V'));
    expect(drawn()).toContain(`Lasts ${about(NINE_VOLT_MAH / 5)}`);
    expect(says()).toContain('about 100 hours');
  });

  it('the largest load: 500 mA — soon empty, the 9 V battery in about 1 hour', () => {
    const { pack, feeds, picture, says, drawn } = setup();
    fireEvent.keyDown(feeds, { key: 'End' });
    expect(feeds).toHaveAttribute('aria-valuenow', '500');
    expect(feeds).toHaveAttribute('aria-valuetext', '500 mA');
    const leds = Math.round(500 / LED_MA);
    expect(says()).toBe(`4 × AA: four cells in a row push together — 6 V. Feeding 500 mA (about ${leds} LEDs) it lasts ${about(AA_CELL_MAH / 500)}.`);
    expect(says()).toContain('about 4 hours');
    fireEvent.click(pack('9 V'));
    expect(drawn()).toContain('Lasts about 1 hour');
    expect(says()).toContain('it lasts about 1 hour: small cells hold less.');
    expect(picture()).toHaveAccessibleName(/feeding 500 mA it lasts about 1 hour$/);
  });

  it('the more it feeds, the shorter the gauge', () => {
    const { pack, feeds, gauge } = setup();
    const at = (ma: number) => {
      slideTo(feeds, ma);
      return gauge();
    };
    const little = at(5), led = at(15), much = at(500);
    expect(little).toBeGreaterThan(led);
    expect(led).toBeGreaterThan(much);
    expect(much).toBeGreaterThan(0);
    fireEvent.click(pack('9 V'));
    expect(gauge()).toBeLessThan(much);
    expect(gauge()).toBeGreaterThan(0);
  });

  it('the pack is chosen from the keyboard too', () => {
    const { pack, says } = setup();
    fireEvent.keyDown(pack('4 × AA'), { key: 'ArrowRight' });
    expect(pack('9 V')).toBeChecked();
    expect(says()).toMatch(/^9 V battery:/);
    fireEvent.keyDown(pack('9 V'), { key: 'Home' });
    expect(pack('2 × AA')).toBeChecked();
    expect(says()).toMatch(/^2 × AA: two cells/);
  });

  it('draws to fill its box and says what it shows', () => {
    const { container, pack } = setup();
    for (const { name } of PACKS) {
      fireEvent.click(pack(name));
      const svg = container.querySelector('svg.lfig')!;
      expect(svg).toHaveAttribute('role', 'img');
      expect(svg).toHaveAttribute('viewBox');
      expect(svg).not.toHaveAttribute('width');
      expect(container.innerHTML).not.toMatch(/NaN|undefined/);
      expect(container.querySelector('input, select')).toBeNull();
    }
  });
});
