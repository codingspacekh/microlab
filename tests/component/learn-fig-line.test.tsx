import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { POWER_SUPPLY, sensorDrive } from '@lib/circuit';
import { LineInside } from '../../src/renderer/learn/figs/line-sensor';

/**
 * M8 Learn's picture of the line sensor: slide it across a white floor with a black line — over white the light
 * bounces back and OUT is low (0 V), over black or held too high OUT is high: the simulator's sensorDrive on 3.3 V.
 */

const SUPPLY = Math.min(...POWER_SUPPLY.choices);
const out = (position: number) => String(Number(sensorDrive('line-sensor', {}, { position }, SUPPLY).volts.toFixed(1)));

function slideTo(thumb: HTMLElement, at: number) {
  fireEvent.keyDown(thumb, { key: 'Home' });
  for (let i = 0; i < at; i++) fireEvent.keyDown(thumb, { key: 'ArrowRight' });
}

function setup() {
  const { container } = render(<LineInside />);
  return {
    container,
    thumb: screen.getByRole('slider', { name: 'Across the floor' }),
    picture: () => screen.getByRole('img'),
    says: () => screen.getByRole('status').textContent ?? '',
    drawn: () => [...container.querySelectorAll('svg[role="img"] text')].map((t) => t.textContent),
    count: (name: string) => container.querySelectorAll(`[data-part="${name}"]`).length,
  };
}

describe('the line sensor, its lamp and its eye', () => {
  it('the simulator: low over white, the supply over black', () => {
    expect([out(0), out(1)]).toEqual(['0', '3.3']);
  });

  it('starts over white, just above the floor: the light comes back, OUT 0 V', () => {
    const { thumb, picture, says, drawn, count } = setup();
    expect(thumb).toHaveAttribute('aria-valuetext', 'over white');
    expect(says()).toBe('Over white the light bounces back up into the eye. OUT is low — 0 V — and the little lamp on the board is on.');
    expect(picture()).toHaveAccessibleName('A line sensor, seen from the side, just above the floor, over white. Much light comes back to the eye: OUT is low, 0 V.');
    expect(drawn()).toEqual(expect.arrayContaining(['The lamp', 'infrared: you cannot see it', 'The eye', 'OUT', '0 V', 'low']));
    expect(count('bounce')).toBe(1);
  });

  it.each([[0, false], [39, false], [40, true], [50, true], [60, true], [61, false], [100, false]])('at %i over black: %s', (at, black) => {
    const { thumb, says, drawn, count, picture } = setup();
    slideTo(thumb, at);
    expect(thumb).toHaveAttribute('aria-valuetext', black ? 'over the black line' : 'over white');
    const v = out(black ? 1 : 0);
    expect(drawn()).toContain(`${v} V`);
    expect(says()).toContain(`${v} V`);
    expect(count('bounce')).toBe(black ? 0 : 1);
    expect(count('swallowed')).toBe(black ? 1 : 0);
    expect(picture()).toHaveAttribute('data-back', String(!black));
  });

  it('held too high, even white looks black: OUT high', () => {
    const { says, count, picture } = setup();
    fireEvent.click(screen.getByRole('radio', { name: 'Too high' }));
    expect(count('bounce')).toBe(0);
    expect(says()).toBe('Held too high: the light spreads out and almost none gets back to the eye — even over white it looks black. OUT is high: 3.3 V.');
    expect(picture()).toHaveAccessibleName(/held too high, over white\. Little light comes back to the eye: OUT is high, 3\.3 V\.$/);
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
