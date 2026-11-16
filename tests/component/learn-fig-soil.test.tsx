import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { POWER_SUPPLY, sensorDrive, SENSORS, SENSOR_START } from '@lib/circuit';
import { SoilInside } from '../../src/renderer/learn/figs/soil';

/**
 * M8 Learn's picture of the soil moisture sensor (the capacitive kind): slide the soil from dry to in water — the soil
 * darkens, the drops multiply, the sealed plates hold more charge and OUT falls, by the simulator's sensorDrive:
 * 2.4 V dry, 0.9 V in water.
 */

const SUPPLY = Math.min(...POWER_SUPPLY.choices);
/** What OUT must show at `percent`, worked out from the simulator. */
const volts = (percent: number) => String(Number(sensorDrive('soil-moisture', {}, { position: percent / 100 }, SUPPLY).volts.toFixed(2)));

/** Moves the slider from the keyboard: Home, then PageUp (ten steps) and ArrowRight (one). */
function slideTo(thumb: HTMLElement, percent: number) {
  const now = () => Number(thumb.getAttribute('aria-valuenow'));
  fireEvent.keyDown(thumb, { key: 'Home' });
  while (now() + 10 <= percent) fireEvent.keyDown(thumb, { key: 'PageUp' });
  while (now() < percent) fireEvent.keyDown(thumb, { key: 'ArrowRight' });
  expect(now()).toBe(percent);
}

function setup() {
  const { container } = render(<SoilInside />);
  const part = (name: string) => container.querySelector(`[data-part="${name}"]`)!;
  return {
    container,
    thumb: screen.getByRole('slider', { name: 'How wet the soil is' }),
    picture: () => screen.getByRole('img'),
    says: () => screen.getByRole('status').textContent ?? '',
    drawn: () => [...container.querySelectorAll('svg[role="img"] text')].map((t) => t.textContent),
    count: (name: string) => container.querySelectorAll(`[data-part="${name}"]`).length,
    out: () => Number(part('out').getAttribute('data-share')),
    held: () => Number(part('held').getAttribute('data-share')),
    soil: () => part('soil').getAttribute('fill'),
  };
}

describe('the soil moisture sensor, its sealed plates and its OUT', () => {
  it('the numbers are the simulator\'s: 2.4 V dry, 0.9 V in water, on 3.3 V', () => {
    expect(SUPPLY).toBe(3.3);
    expect(SUPPLY).toBeGreaterThanOrEqual(SENSORS['soil-moisture'].minVolts);
    expect([volts(0), volts(50), volts(100)]).toEqual(['2.4', '1.65', '0.9']);
  });

  it('starts in damp soil, 50 %: OUT 1.65 V', () => {
    const { thumb, picture, says, drawn } = setup();
    expect(SENSOR_START.moisture).toBe(0.5);
    expect(thumb).toHaveAttribute('aria-valuenow', '50');
    expect(thumb).toHaveAttribute('aria-valuemin', '0');
    expect(thumb).toHaveAttribute('aria-valuemax', '100');
    expect(thumb).toHaveAttribute('aria-valuetext', '50 % · damp');
    expect(says()).toBe('Damp soil: the water lets the plates hold more charge, and OUT comes down to 1.65 V. Wetter means lower volts.');
    expect(picture()).toHaveAccessibleName(
      'A soil moisture sensor pushed into a pot of damp soil (50 % wet). The two metal plates sealed inside its blade never touch the soil; '
      + 'they hold more charge. OUT gives 1.65 V: between 2.4 V in dry soil and 0.9 V in water.',
    );
    expect(drawn()).toEqual(expect.arrayContaining(['1.65 V', 'dry soil: 2.4 V', 'in water: 0.9 V', '3.3 V', '0 V', 'Charge held', 'AOUT', 'VCC', 'GND']));
  });

  it('0 %: dry soil, little charge, OUT high — 2.4 V', () => {
    const { thumb, picture, says, drawn, count } = setup();
    fireEvent.keyDown(thumb, { key: 'Home' });
    expect(thumb).toHaveAttribute('aria-valuetext', '0 % · dry');
    expect(says()).toBe(`Dry soil: the plates hold little charge, and OUT is high — ${volts(0)} V.`);
    expect(picture()).toHaveAccessibleName(/a pot of dry soil \(0 % wet\)\..*they hold little charge\. OUT gives 2\.4 V:/);
    expect(drawn()).toContain('2.4 V');
    expect(count('drop')).toBe(0);
  });

  it('100 %: in water, a lot of charge, OUT low — 0.9 V', () => {
    const { thumb, picture, says, drawn, held } = setup();
    fireEvent.keyDown(thumb, { key: 'End' });
    expect(thumb).toHaveAttribute('aria-valuenow', '100');
    expect(thumb).toHaveAttribute('aria-valuetext', '100 % · in water');
    expect(says()).toBe(`Soaked: the plates hold a lot of charge, and OUT is low — ${volts(100)} V. Wetter means LOWER volts.`);
    expect(picture()).toHaveAccessibleName(/a pot of soaked soil \(100 % wet\)\..*they hold a lot of charge\. OUT gives 0\.9 V:/);
    expect(drawn()).toContain('0.9 V');
    expect(held()).toBe(1);
  });

  it('wet soil, 80 %', () => {
    const { thumb, says } = setup();
    slideTo(thumb, 80);
    expect(thumb).toHaveAttribute('aria-valuetext', '80 % · wet');
    expect(says()).toBe(`Wet soil: the plates hold a lot of charge, and OUT is down to ${volts(80)} V. Wetter means lower volts.`);
  });

  it.each([7, 23, 37, 64, 91])('anywhere between (%s %%) OUT is the simulator\'s', (percent) => {
    const { thumb, says, drawn, out, picture } = setup();
    slideTo(thumb, percent);
    const v = volts(percent);
    expect(says()).toContain(`${v} V`);
    expect(drawn()).toContain(`${v} V`);
    expect(picture()).toHaveAccessibleName(new RegExp(`OUT gives ${v.replace('.', '\\.')} V:`));
    expect(out()).toBeCloseTo(Number(v) / SUPPLY, 2);
  });

  it('wetter: darker soil, more drops, more charge held, lower OUT', () => {
    const { thumb, count, out, held, soil } = setup();
    let before = { drops: -1, charges: 0, out: Infinity, held: 0 };
    const colours = new Set<string | null>();
    for (const percent of [0, 20, 40, 60, 80, 100]) {
      slideTo(thumb, percent);
      const now = { drops: count('drop'), charges: count('charge'), out: out(), held: held() };
      expect(now.drops).toBeGreaterThan(before.drops);
      expect(now.charges).toBeGreaterThan(before.charges);
      expect(now.held).toBeGreaterThan(before.held);
      expect(now.out).toBeLessThan(before.out);
      colours.add(soil());
      before = now;
    }
    expect(colours.size).toBe(6);
    slideTo(thumb, 0);
    expect(soil()).toBe('#8a5b34');
    fireEvent.keyDown(thumb, { key: 'End' });
    expect(soil()).toBe('#4a2f1c');
  });

  it('says the plates are sealed in and never rust', () => {
    const { drawn } = setup();
    expect(drawn()).toEqual(expect.arrayContaining(['Two metal plates', 'sealed inside: nothing rusts', 'The chip']));
  });

  it('draws to fill its box, with the app\'s own controls, and names no board', () => {
    const { container, thumb } = setup();
    for (const key of ['Home', 'End']) {
      fireEvent.keyDown(thumb, { key });
      const svg = container.querySelector('svg.lfig')!;
      expect(svg).toHaveAttribute('viewBox');
      expect(svg).not.toHaveAttribute('width');
      expect(container.innerHTML).not.toMatch(/NaN|undefined/);
      expect(container.textContent).not.toMatch(/Pico|micro:bit|ESP32|GP\d/);
      expect(container.querySelector('input, select')).toBeNull();
    }
  });
});
