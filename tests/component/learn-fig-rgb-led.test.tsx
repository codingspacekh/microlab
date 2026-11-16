import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LED, RGB_DIES } from '@lib/circuit';
import { RgbInside } from '../../src/renderer/learn/figs/rgb-led';

/**
 * M8 Learn's picture of the RGB LED: three sliders, one for each chip's current, and the colour they mix to. The
 * sliders end at the simulator's rated current (20 mA) and the chips' volts are the simulator's (RGB_DIES).
 */

const RATED_MA = Math.round(LED.ratedA * 1000);

/** Moves a kit slider to `value` from the keyboard: Home, then PageUp (ten steps) and ArrowRight (one). */
function slideTo(thumb: HTMLElement, value: number) {
  const now = () => Number(thumb.getAttribute('aria-valuenow'));
  fireEvent.keyDown(thumb, { key: 'Home' });
  while (now() + 10 <= value) fireEvent.keyDown(thumb, { key: 'PageUp' });
  while (now() < value) fireEvent.keyDown(thumb, { key: 'ArrowRight' });
  expect(now()).toBe(value);
}

function setup() {
  const { container } = render(<RgbInside />);
  const thumb = (name: string) => screen.getByRole('slider', { name });
  return {
    container,
    red: thumb('Red'), green: thumb('Green'), blue: thumb('Blue'),
    mix(r: number, g: number, b: number) {
      slideTo(thumb('Red'), r);
      slideTo(thumb('Green'), g);
      slideTo(thumb('Blue'), b);
    },
    picture: () => screen.getByRole('img'),
    says: () => screen.getByRole('status').textContent ?? '',
    drawn: () => [...container.querySelectorAll('svg[role="img"] text')].map((t) => t.textContent),
    swatch: () => container.querySelector('[data-part="swatch"]')!,
    chip: (colour: string) => container.querySelector(`[data-part="chip-${colour}"]`)!,
  };
}

describe('the RGB LED, cut open', () => {
  it('has three sliders in mA, from 0 to the simulator\'s rated current', () => {
    expect(RATED_MA).toBe(20);
    const { red, green, blue } = setup();
    for (const thumb of [red, green, blue]) {
      expect(thumb).toHaveAttribute('aria-valuemin', '0');
      expect(thumb).toHaveAttribute('aria-valuemax', String(RATED_MA));
    }
    expect(red).toHaveAttribute('aria-valuetext', `${red.getAttribute('aria-valuenow')} mA`);
  });

  it('starts with red and green together: yellow', () => {
    const { red, green, blue, picture, says, drawn, swatch } = setup();
    expect(red).toHaveAttribute('aria-valuenow', '15');
    expect(green).toHaveAttribute('aria-valuenow', '15');
    expect(blue).toHaveAttribute('aria-valuenow', '0');
    expect(says()).toBe('Red and green together: your eye sees yellow. Each chip has its own leg; all three share the longest one.');
    expect(picture()).toHaveAccessibleName('An RGB LED cut open, three chips in one case: red chip 15 mA, green chip 15 mA, blue chip 0 mA. Together they look yellow.');
    expect(drawn()).toContain('yellow');
    expect(swatch()).toHaveAttribute('fill', 'rgb(191,191,0)');
  });

  it('all off: dark', () => {
    const { mix, picture, says, drawn, swatch } = setup();
    mix(0, 0, 0);
    expect(says()).toMatch(/No current in any chip: all three are dark/);
    expect(picture()).toHaveAccessibleName(/red chip 0 mA, green chip 0 mA, blue chip 0 mA\. All three are dark\./);
    expect(drawn()).toContain('dark');
    expect(swatch()).toHaveAttribute('fill', 'rgb(0,0,0)');
  });

  it('all on: white', () => {
    const { mix, picture, says, drawn, swatch } = setup();
    mix(RATED_MA, RATED_MA, RATED_MA);
    expect(says()).toBe('Red, green and blue together: your eye sees white. Each chip has its own leg; all three share the longest one.');
    expect(picture()).toHaveAccessibleName(/red chip 20 mA, green chip 20 mA, blue chip 20 mA\. Together they look white\./);
    expect(drawn()).toContain('white');
    expect(swatch()).toHaveAttribute('fill', 'rgb(255,255,255)');
  });

  it.each([
    ['red', [12, 0, 0]],
    ['green', [0, 12, 0]],
    ['blue', [0, 0, 12]],
  ] as const)('one colour alone: %s', (name, [r, g, b]) => {
    const { mix, picture, says, drawn } = setup();
    mix(r, g, b);
    expect(says()).toBe(`Only the ${name} chip is lit, at 12 mA: you see ${name}. Slide another colour up to mix them.`);
    expect(picture()).toHaveAccessibleName(new RegExp(`Only the ${name} chip is lit: it looks ${name}\\.$`));
    expect(drawn()).toContain(name);
  });

  it.each([
    ['green and blue', [0, 20, 20], 'cyan', 'rgb(0,255,255)'],
    ['red and blue', [20, 0, 20], 'magenta', 'rgb(255,0,255)'],
    ['red and green', [10, 10, 0], 'yellow', 'rgb(128,128,0)'],
  ] as const)('two together, %s: %s', (pair, [r, g, b], name, fill) => {
    const { mix, picture, says, swatch } = setup();
    mix(r, g, b);
    expect(says().toLowerCase()).toContain(`${pair} together: your eye sees ${name}`);
    expect(picture()).toHaveAccessibleName(new RegExp(`Together they look ${name}\\.$`));
    expect(swatch()).toHaveAttribute('fill', fill);
  });

  it('magenta is also said as pink', () => {
    const { mix, says, drawn } = setup();
    mix(20, 0, 20);
    expect(says()).toMatch(/magenta — a strong pink/);
    expect(drawn()).toContain('magenta');
  });

  it('an uneven mix has no everyday name: it says which way it leans', () => {
    const { mix, picture, says, drawn } = setup();
    mix(20, 4, 0);
    expect(says()).toBe('Red and green, but not the same of each: the mix leans towards red. Make them the same and your eye sees yellow.');
    expect(picture()).toHaveAccessibleName(/red chip 20 mA, green chip 4 mA, blue chip 0 mA\. Together they make a mix that leans towards red\.$/);
    expect(drawn()).toContain('a mix');
    mix(20, 20, 4);
    expect(says()).toBe('Red, green and blue, but not the same of each: the mix leans towards yellow. Make them the same and your eye sees white.');
  });

  it('each chip glows by its own slider', () => {
    const { mix, chip } = setup();
    mix(20, 0, 5);
    expect(chip('red')).toHaveAttribute('data-lit', '1');
    expect(chip('green')).toHaveAttribute('data-lit', '0');
    expect(chip('blue')).toHaveAttribute('data-lit', '0.25');
  });

  it('names the four legs, with each chip\'s volts as the simulator has them', () => {
    const { drawn } = setup();
    expect(RGB_DIES.map(([, colour, vf]) => `${colour} ${vf}`)).toEqual(['red 2', 'green 3', 'blue 3']);
    for (const [, colour, vf] of RGB_DIES) {
      expect(drawn()).toContain(`${colour[0]!.toUpperCase()}${colour.slice(1)} leg`);
      expect(drawn()).toContain(`${colour} chip · about ${vf} V`);
    }
    expect(drawn()).toContain('Shared leg');
    expect(drawn()).toContain('the longest · for all three');
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
