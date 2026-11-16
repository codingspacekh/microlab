import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MODELS } from '@lib/circuit';
import { SwitchInside } from '../../src/renderer/learn/figs/slide-switch';

/**
 * M8 Learn's picture of the slide switch, cut open: slid left the bridge joins the middle leg to the left leg, slid
 * right to the right leg — the legs the simulator's model joins in each of its two positions.
 */

const says = () => screen.getByRole('status').textContent ?? '';

function setup() {
  const { container } = render(<SwitchInside />);
  const svg = () => container.querySelector('svg.lfig')!;
  return {
    container,
    svg,
    picture: () => screen.getByRole('img', { name: /slide switch cut open/ }),
    group: screen.getByRole('radiogroup', { name: 'Slide it' }),
    left: screen.getByRole('radio', { name: 'Left' }),
    right: screen.getByRole('radio', { name: 'Right' }),
    knob: () => container.querySelector('svg.lfig .lf-knob')!,
    /** The two legs the bridge joins now: "1+2". */
    joined: () => svg().getAttribute('data-joined'),
    /** Which LEDs are lit, by the leg they hang on: { '1': 'on', '3': 'off' }. */
    leds: () => Object.fromEntries([...container.querySelectorAll('[data-led]')].map((e) => [e.getAttribute('data-led'), e.getAttribute('data-lit')])),
    /** The legs drawn in the accent colour. */
    live: () => [...container.querySelectorAll('[data-leg][data-live="true"]')].map((e) => e.getAttribute('data-leg')).sort(),
  };
}

/** The legs the simulator's model joins with the switch in `position` (0 or 1). */
function modelJoins(position: number): string[] {
  const closed = MODELS['slide-switch']!.devices({ id: 's', leg: (name) => name, props: {} })
    .filter((d) => d.kind === 'switch')
    .filter((d) => d.closedWhen === position);
  expect(closed).toHaveLength(1);
  return [closed[0]!.a, closed[0]!.b].sort();
}

describe('the slide switch, cut open', () => {
  it('starts slid left: the bridge joins leg 2 to leg 1, the left LED is lit', () => {
    const { picture, left, right, joined, leds, live } = setup();
    expect(left).toHaveAttribute('aria-checked', 'true');
    expect(right).toHaveAttribute('aria-checked', 'false');
    expect(picture()).toHaveAccessibleName('A slide switch cut open: slid left, the metal bridge joins leg 2, the middle leg, to leg 1; the left LED is lit, the right LED is dark');
    expect(says()).toBe('Slid left: the bridge joins the middle leg to the left leg. The current goes out that way, so the left LED is lit. The right leg is left out.');
    expect(joined()).toBe('1+2');
    expect(live()).toEqual(['1', '2']);
    expect(leds()).toEqual({ 1: 'on', 3: 'off' });
  });

  it('slid right: the bridge joins leg 2 to leg 3, the right LED is lit', () => {
    const { picture, left, right, joined, leds, live } = setup();
    fireEvent.click(right);
    expect(right).toHaveAttribute('aria-checked', 'true');
    expect(left).toHaveAttribute('aria-checked', 'false');
    expect(picture()).toHaveAccessibleName('A slide switch cut open: slid right, the metal bridge joins leg 2, the middle leg, to leg 3; the right LED is lit, the left LED is dark');
    expect(says()).toBe('Slid right: the bridge joins the middle leg to the right leg. The current goes out that way, so the right LED is lit. The left leg is left out.');
    expect(joined()).toBe('2+3');
    expect(live()).toEqual(['2', '3']);
    expect(leds()).toEqual({ 1: 'off', 3: 'on' });

    fireEvent.click(left);                                  // and it stays where it is put, either way
    expect(joined()).toBe('1+2');
    expect(leds()).toEqual({ 1: 'on', 3: 'off' });
  });

  it('slides from the keyboard', () => {
    const { left, right, joined } = setup();
    fireEvent.keyDown(left, { key: 'ArrowRight' });
    expect(right).toHaveAttribute('aria-checked', 'true');
    expect(joined()).toBe('2+3');
    fireEvent.keyDown(right, { key: 'ArrowLeft' });
    expect(left).toHaveAttribute('aria-checked', 'true');
    expect(joined()).toBe('1+2');
  });

  it('a click on the knob in the drawing slides it the other way', () => {
    const { knob, left, right, joined, picture } = setup();
    fireEvent.click(knob());
    expect(joined()).toBe('2+3');
    expect(right).toHaveAttribute('aria-checked', 'true');
    expect(picture()).toHaveAccessibleName(/slid right/);
    fireEvent.click(knob());
    expect(joined()).toBe('1+2');
    expect(left).toHaveAttribute('aria-checked', 'true');
    expect(picture()).toHaveAccessibleName(/slid left/);
  });

  it('the knob and the bridge move with it', () => {
    const { container, right } = setup();
    const at = (what: string) => container.querySelector(`[data-part="${what}"]`)!.getAttribute('transform');
    const knob = at('knob'), bridge = at('bridge');
    fireEvent.click(right);
    expect(at('knob')).not.toBe(knob);
    expect(at('bridge')).not.toBe(bridge);
  });

  it('the model: three legs, leg 2 to leg 1 in position 0 and to leg 3 in position 1 — never the two outer legs', () => {
    expect(MODELS['slide-switch']!.legs).toEqual(['1', '2', '3']);
    expect(modelJoins(0)).toEqual(['1', '2']);
    expect(modelJoins(1)).toEqual(['2', '3']);
  });

  it('joins the legs the model joins: left is its position 0, right its position 1', () => {
    const { right, joined, live } = setup();
    expect(joined()).toBe(modelJoins(0).join('+'));
    expect(live()).toEqual(modelJoins(0));
    fireEvent.click(right);
    expect(joined()).toBe(modelJoins(1).join('+'));
    expect(live()).toEqual(modelJoins(1));
  });

  it('names the legs as the model does', () => {
    const { container } = setup();
    const drawn = [...container.querySelectorAll('svg.lfig text')].map((t) => t.textContent);
    for (const leg of MODELS['slide-switch']!.legs) expect(drawn).toContain(leg);
  });

  it('draws to fill its box, says what it shows, and uses only the app\'s own controls', () => {
    const { container, svg, right } = setup();
    expect(svg()).toHaveAttribute('role', 'img');
    expect(svg()).toHaveAttribute('viewBox');
    expect(svg()).not.toHaveAttribute('width');
    expect(container.querySelector('input, select')).toBeNull();
    fireEvent.click(right);
    expect(container.innerHTML).not.toMatch(/NaN|undefined/);
  });
});
