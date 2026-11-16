import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BATTERIES, ldrOhms } from '@lib/circuit';
import { LdrInside } from '../../src/renderer/learn/figs/ldr';

/**
 * M8 Learn's picture of the light sensor: slide the light from dark to bright, its resistance falls (the simulator's
 * ldrOhms) and, with a 10 kΩ resistor after it on a 3 V battery, the volts at the point between them rise.
 */

const PARTNER = 10_000;
const VOLTS = BATTERIES['2xAA']!.volts;

/** What the picture must show at `lux`, worked out from the simulator. */
function expected(lux: number) {
  const ohms = ldrOhms(lux);
  const [div, suffix] = ohms >= 1e6 ? [1e6, 'M'] : ohms >= 1e3 ? [1e3, 'k'] : [1, ''];
  return {
    ohms: `${Number((ohms / div).toPrecision(2))} ${suffix}Ω`,
    volts: String(Number(((VOLTS * PARTNER) / (ohms + PARTNER)).toFixed(2))),
  };
}

/** Moves the light slider to 10^`log` lux from the keyboard: Home, then PageUp (ten steps) and ArrowRight (one). */
function slideTo(thumb: HTMLElement, log: number) {
  const now = () => Number(thumb.getAttribute('aria-valuenow'));
  fireEvent.keyDown(thumb, { key: 'Home' });
  while (now() + 0.5 <= log + 1e-9) fireEvent.keyDown(thumb, { key: 'PageUp' });
  while (now() < log - 1e-9) fireEvent.keyDown(thumb, { key: 'ArrowRight' });
  expect(now()).toBeCloseTo(log, 6);
}

function setup() {
  const { container } = render(<LdrInside />);
  return {
    container,
    thumb: screen.getByRole('slider', { name: 'Light' }),
    picture: () => screen.getByRole('img'),
    says: () => screen.getByRole('status').textContent ?? '',
    drawn: () => [...container.querySelectorAll('svg[role="img"] text')].map((t) => t.textContent),
    count: (part: string) => container.querySelectorAll(`[data-part="${part}"]`).length,
    point: () => Number(container.querySelector('[data-part="point"]')!.getAttribute('data-share')),
  };
}

describe('the light sensor, its face and its divider', () => {
  it('the battery is the simulator\'s 3 V pack', () => {
    expect(VOLTS).toBe(3);
  });

  it('starts in a bright room, 100 lux: about 3 kΩ, 2.31 V of 3 V', () => {
    const { thumb, picture, says, drawn } = setup();
    const { ohms, volts } = expected(100);
    expect([ohms, volts]).toEqual(['3 kΩ', '2.31']);
    expect(thumb).toHaveAttribute('aria-valuenow', '2');
    expect(thumb).toHaveAttribute('aria-valuemin', '-1');
    expect(thumb).toHaveAttribute('aria-valuemax', '4');
    expect(thumb).toHaveAttribute('aria-valuetext', '100 lux · bright room');
    expect(says()).toBe('In a bright room (100 lux) the track lets current through easily: about 3 kΩ. The point between the two reads 2.31 V of 3 V.');
    expect(picture()).toHaveAccessibleName('A light sensor\'s face in a bright room (100 lux): its track resists about 3 kΩ. With a 10 kΩ resistor after it on a 3 V battery, the point between them reads 2.31 V.');
    expect(drawn()).toEqual(expect.arrayContaining(['Light sensor: 3 kΩ', 'Resistor: 10 kΩ', '2.31 V', 'battery + · 3 V', 'battery − · 0 V']));
  });

  it('the darkest: 0.1 lux, the track holds the current back hard', () => {
    const { thumb, picture, says, drawn } = setup();
    slideTo(thumb, -1);
    const { ohms, volts } = expected(0.1);
    expect([ohms, volts]).toEqual(['380 kΩ', '0.08']);
    expect(thumb).toHaveAttribute('aria-valuetext', '0.1 lux · dark');
    expect(says()).toBe(`In the dark (0.1 lux) the track holds the current back hard: about ${ohms}. The point between the two reads only ${volts} V of 3 V.`);
    expect(picture()).toHaveAccessibleName(new RegExp(`in the dark \\(0\\.1 lux\\): its track resists about ${ohms}\\..*reads ${volts.replace('.', '\\.')} V\\.$`));
    expect(drawn()).toEqual(expect.arrayContaining([`Light sensor: ${ohms}`, `${volts} V`]));
  });

  it('the brightest: sunlight, 10 000 lux, under 1 kΩ', () => {
    const { thumb, picture, says, drawn } = setup();
    fireEvent.keyDown(thumb, { key: 'End' });
    const { ohms, volts } = expected(10_000);
    expect([ohms, volts]).toEqual(['120 Ω', '2.96']);
    expect(thumb).toHaveAttribute('aria-valuenow', '4');
    expect(thumb).toHaveAttribute('aria-valuetext', '10 000 lux · sunlight');
    expect(says()).toBe(`In sunlight (10 000 lux) the track hardly holds the current back: about ${ohms}. The point between the two reads ${volts} V of 3 V.`);
    expect(picture()).toHaveAccessibleName(/in sunlight \(10 000 lux\): its track resists about 120 Ω\./);
    expect(drawn()).toEqual(expect.arrayContaining([`Light sensor: ${ohms}`, `${volts} V`]));
  });

  it('dim light, 10 lux: about 15 kΩ, as the page\'s numbers say', () => {
    const { thumb, says, drawn } = setup();
    slideTo(thumb, 1);
    const { ohms, volts } = expected(10);
    expect([ohms, volts]).toEqual(['15 kΩ', '1.2']);
    expect(thumb).toHaveAttribute('aria-valuetext', '10 lux · dim');
    expect(says()).toBe(`In dim light (10 lux) the track lets a little current through: about ${ohms}. The point between the two reads ${volts} V of 3 V.`);
    expect(drawn()).toEqual(expect.arrayContaining([`Light sensor: ${ohms}`, `${volts} V`]));
  });

  it.each([-0.5, 0.35, 1.5, 2.75, 3.4])('anywhere between (10^%s lux) the numbers are the simulator\'s', (log) => {
    const { thumb, says, drawn } = setup();
    slideTo(thumb, log);
    const lux = Number((10 ** log).toPrecision(log < 1 ? 1 : 2));     // as the app's own light slider rounds it
    const { ohms, volts } = expected(lux);
    expect(says()).toContain(`about ${ohms}.`);
    expect(says()).toContain(`${volts} V of 3 V`);
    expect(drawn()).toEqual(expect.arrayContaining([`Light sensor: ${ohms}`, `${volts} V`]));
  });

  it('more light: more rays, more loose charges, less resistance, more volts at the point', () => {
    const { thumb, count, point } = setup();
    let before = { rays: -1, charges: 0, share: -1, ohms: Infinity };
    for (const log of [-1, 0, 1, 2, 3, 4]) {
      slideTo(thumb, log);
      const now = { rays: count('ray'), charges: count('charge'), share: point(), ohms: ldrOhms(10 ** log) };
      expect(now.rays).toBeGreaterThan(before.rays);
      expect(now.charges).toBeGreaterThan(before.charges);
      expect(now.share).toBeGreaterThan(before.share);
      expect(now.ohms).toBeLessThan(before.ohms);
      expect(now.share).toBeCloseTo(PARTNER / (now.ohms + PARTNER), 2);
      before = now;
    }
  });

  it('draws to fill its box, with no board\'s name and nothing unworked', () => {
    const { container } = setup();
    const svg = container.querySelector('svg.lfig')!;
    expect(svg).toHaveAttribute('viewBox');
    expect(svg).not.toHaveAttribute('width');
    expect(container.innerHTML).not.toMatch(/NaN|undefined/);
    expect(container.textContent).not.toMatch(/Pico|micro:bit|ESP32|GP\d/);
    expect(container.querySelector('input, select')).toBeNull();
  });
});
