import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { POWER_SUPPLY } from '@lib/circuit';
import { PwmDimming } from '../../src/renderer/learn/figs/pwm';

/**
 * M8 Learn's picture of PWM: a voltage switched between 0 V and the supply's 3.3 V; "On for" sets the share of each
 * blink that is on, and it adds up to that share of the supply (the average the simulator's circuit sees). Slow, the
 * LED is seen to blink; fast, it looks steady and dimmer.
 */

const SUPPLY = Math.min(...POWER_SUPPLY.choices);
/** Rounded as on paper: 0.825 V is 0.83 V. */
const adds = (percent: number) => `${Number(((percent / 100) * SUPPLY + 1e-9).toFixed(2))} V`;
const NAME = 'This is called PWM — pulse-width modulation: changing how wide each pulse is.';
const SLOW = 'Slow (2 a second)', FAST = 'Fast (1000 a second)';

function setup() {
  const { container } = render(<PwmDimming />);
  return {
    container,
    thumb: screen.getByRole('slider', { name: 'On for' }),
    speed: (name: string) => screen.getByRole('radio', { name }),
    picture: () => screen.getByRole('img'),
    says: () => screen.getByRole('status').textContent ?? '',
    drawn: () => [...container.querySelectorAll('svg[role="img"] text')].map((t) => t.textContent),
    part: (name: string) => container.querySelector(`[data-part="${name}"]`)!,
    blocks: (kind: 'on' | 'off') => [...container.querySelectorAll(`[data-block="${kind}"]`)],
    bright: () => Number(container.querySelector('[data-part="lamp"]')!.getAttribute('data-bright')),
  };
}

/** Moves "On for" from the keyboard: Home, then PageUp (ten steps) and ArrowRight (one). */
function slideTo(thumb: HTMLElement, percent: number) {
  const now = () => Number(thumb.getAttribute('aria-valuenow'));
  fireEvent.keyDown(thumb, { key: 'Home' });
  while (now() + 10 <= percent) fireEvent.keyDown(thumb, { key: 'PageUp' });
  while (now() < percent) fireEvent.keyDown(thumb, { key: 'ArrowRight' });
  expect(now()).toBe(percent);
}

describe('PWM: on and off too fast to see', () => {
  it('starts on for 50 %, fast: half as bright, adding up to 1.65 V', () => {
    const { thumb, speed, picture, says, drawn, part, blocks, bright } = setup();
    expect(SUPPLY).toBe(3.3);
    expect(thumb).toHaveAttribute('aria-valuemin', '0');
    expect(thumb).toHaveAttribute('aria-valuemax', '100');
    expect(thumb).toHaveAttribute('aria-valuenow', '50');
    expect(thumb).toHaveAttribute('aria-valuetext', '50 %');
    expect(screen.getByRole('radiogroup', { name: 'Speed' })).toBeInTheDocument();
    expect(speed(FAST)).toBeChecked();
    expect(adds(50)).toBe('1.65 V');
    expect(says()).toBe(`On for 50 % of each blink, 1000 blinks a second: too fast to see, so the LED looks half as bright. It adds up to 1.65 V of 3.3 V. ${NAME}`);
    expect(picture()).toHaveAccessibleName(
      'A voltage switched on and off 1000 times a second, between 0 V and 3.3 V, on for 50 % of each blink: it adds up to 1.65 V. '
      + 'Too fast to see: the LED looks steady, half as bright.',
    );
    expect(picture()).toHaveAttribute('data-look', 'dimmer');
    expect(drawn()).toEqual(expect.arrayContaining([
      'what it adds up to: 1.65 V', '3.3 V', '0 V', 'Slowed right down', 'on', 'off', 'half as bright', 'a steady, dimmer light',
      'one blink: a thousandth of a second',
    ]));
    expect(part('average')).toHaveAttribute('data-volts', '1.65');
    expect(blocks('on')).toHaveLength(4);
    expect(blocks('off')).toHaveLength(4);
    expect(bright()).toBe(0.5);
  });

  it('on for 25 %, fast: a quarter as bright, 0.83 V', () => {
    const { thumb, says, drawn, bright, blocks } = setup();
    slideTo(thumb, 25);
    expect(adds(25)).toBe('0.83 V');
    expect(says()).toBe(`On for 25 % of each blink, 1000 blinks a second: too fast to see, so the LED looks a quarter as bright. It adds up to 0.83 V of 3.3 V. ${NAME}`);
    expect(drawn()).toEqual(expect.arrayContaining(['what it adds up to: 0.83 V', 'a quarter as bright']));
    expect(bright()).toBe(0.25);
    // the on-block is a quarter of a blink, the off-block the rest
    const on = Number(blocks('on')[0]!.getAttribute('width')), off = Number(blocks('off')[0]!.getAttribute('width'));
    expect(on / (on + off)).toBeCloseTo(0.25, 2);
  });

  it('0 %: no pulses, the LED is off, 0 V — at either speed', () => {
    const { thumb, speed, picture, says, drawn, part, blocks, bright } = setup();
    fireEvent.keyDown(thumb, { key: 'Home' });
    for (const name of [FAST, SLOW]) {
      fireEvent.click(speed(name));
      expect(says()).toBe(`On for 0 % of the time: there are no pulses, so the LED is off. It adds up to 0 V. ${NAME}`);
      expect(picture()).toHaveAttribute('data-look', 'off');
      expect(picture()).toHaveAccessibleName(/on for 0 % of each blink: it adds up to 0 V\. It is never on: the LED is off\./);
      expect(part('average')).toHaveAttribute('data-volts', '0');
      expect(part('wave').getAttribute('d')).not.toContain('V');   // a flat line
      expect(blocks('on')).toHaveLength(0);
      expect(blocks('off')).toHaveLength(4);
      expect(bright()).toBe(0);
      expect(drawn()).toEqual(expect.arrayContaining(['off', 'always off', 'what it adds up to: 0 V']));
    }
  });

  it('100 %: it never switches off, the LED is simply on at 3.3 V — at either speed', () => {
    const { thumb, speed, picture, says, drawn, part, blocks, bright } = setup();
    fireEvent.keyDown(thumb, { key: 'End' });
    for (const name of [FAST, SLOW]) {
      fireEvent.click(speed(name));
      expect(says()).toBe(`On for 100 % of the time: it never switches off, so the LED is simply on, at the full ${SUPPLY} V. ${NAME}`);
      expect(picture()).toHaveAttribute('data-look', 'on');
      expect(picture()).toHaveAccessibleName(/it adds up to 3\.3 V\. It is never off: the LED is simply on\./);
      expect(part('average')).toHaveAttribute('data-volts', String(SUPPLY));
      expect(part('wave').getAttribute('d')).not.toContain('V');
      expect(blocks('on')).toHaveLength(4);
      expect(blocks('off')).toHaveLength(0);
      expect(bright()).toBe(1);
      expect(drawn()).toEqual(expect.arrayContaining(['simply on', 'always on']));
    }
  });

  it('slow: you would see it blink; fast again: steady and dimmer', () => {
    const { speed, picture, says, drawn, bright } = setup();
    fireEvent.click(speed(SLOW));
    expect(speed(SLOW)).toBeChecked();
    expect(says()).toBe(`On for 50 % of each blink, 2 blinks a second: slow enough to see, so the LED blinks on and off. Make it fast and it looks steady. It adds up to 1.65 V of 3.3 V. ${NAME}`);
    expect(picture()).toHaveAttribute('data-look', 'blinks');
    expect(picture()).toHaveAccessibleName(/switched on and off 2 times a second.*Slow enough to see: the LED blinks on and off\./);
    expect(drawn()).toEqual(expect.arrayContaining(['you see it blink', 'on, off, on, off', 'one blink: half a second']));
    expect(bright()).toBe(1);                               // drawn in the on-part of its blink

    fireEvent.keyDown(speed(SLOW), { key: 'ArrowRight' });  // from the keyboard
    expect(speed(FAST)).toBeChecked();
    expect(picture()).toHaveAttribute('data-look', 'dimmer');
    expect(bright()).toBe(0.5);
  });

  it('the wave, the average and the LED follow the slider', () => {
    const { thumb, part, bright, says } = setup();
    const at = (percent: number) => {
      slideTo(thumb, percent);
      expect(part('wave')).toHaveAttribute('data-on', String(percent));
      expect(part('average')).toHaveAttribute('data-volts', adds(percent).replace(' V', ''));
      expect(says()).toContain(`It adds up to ${adds(percent)} of 3.3 V.`);
      return { y: Number(part('average').getAttribute('d')!.match(/,([\d.]+) H/)![1]), bright: bright() };
    };
    const low = at(10), mid = at(37), high = at(90);
    expect(mid.y).toBeLessThan(low.y);                      // higher on the page
    expect(high.y).toBeLessThan(mid.y);
    expect([low.bright, mid.bright, high.bright]).toEqual([0.1, 0.37, 0.9]);
    expect(says()).toContain('the LED looks 90 % as bright');
    // four blinks are drawn: four rises
    expect(part('wave').getAttribute('d')!.match(/V84/g)).toHaveLength(4);
  });

  it('draws to fill its box, with the app\'s own controls, nothing moving, and names no board', () => {
    const { container, thumb, speed } = setup();
    for (const name of [SLOW, FAST]) {
      fireEvent.click(speed(name));
      for (const key of ['Home', 'ArrowRight', 'End', 'ArrowLeft']) {
        fireEvent.keyDown(thumb, { key });
        const svg = container.querySelector('svg.lfig')!;
        expect(svg).toHaveAttribute('viewBox');
        expect(svg).not.toHaveAttribute('width');
        expect(container.innerHTML).not.toMatch(/NaN|undefined/);
        expect(container.querySelector('input, select, animate, animateTransform')).toBeNull();
        expect(container.textContent).not.toMatch(/Pico|micro:bit|ESP32|GP\d/i);
        expect(screen.getByRole('status').textContent).toContain(NAME);
      }
    }
  });
});
