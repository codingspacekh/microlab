import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { POWER_SUPPLY } from '@lib/circuit';
import { DigitalAnalog } from '../../src/renderer/learn/figs/digital-analog';

/**
 * M8 Learn's picture of digital and analog: one voltage from 0 V to the supply's 3.3 V, read as 0 or 1 (1 from half
 * the supply up, as the simulator reads a pin), as a level, and as a number on a staircase of 4, 16, 256 or 1024 steps.
 */

const SUPPLY = Math.min(...POWER_SUPPLY.choices);
const LINE = SUPPLY / 2;
const numberAt = (volts: number, steps: number) => Math.min(steps - 1, Math.floor((volts / SUPPLY) * steps + 1e-9));
/** Rounded as on paper: 0.825 V is 0.83 V. */
const v = (volts: number) => `${Number((volts + 1e-9).toFixed(2))} V`;

function setup() {
  const { container } = render(<DigitalAnalog />);
  return {
    container,
    thumb: screen.getByRole('slider', { name: 'The voltage' }),
    steps: (name: string) => screen.getByRole('radio', { name }),
    picture: () => screen.getByRole('img'),
    says: () => screen.getByRole('status').textContent ?? '',
    drawn: () => [...container.querySelectorAll('svg[role="img"] text')].map((t) => t.textContent),
    part: (name: string) => container.querySelector(`[data-part="${name}"]`),
    stairs: () => container.querySelector('[data-stairs]')!,
  };
}

/** Moves the voltage from the keyboard: Home, then PageUp (ten steps) and ArrowRight (one). */
function slideTo(thumb: HTMLElement, volts: number) {
  const now = () => Number(thumb.getAttribute('aria-valuenow'));
  fireEvent.keyDown(thumb, { key: 'Home' });
  while (now() + 0.5 <= volts + 1e-9) fireEvent.keyDown(thumb, { key: 'PageUp' });
  while (now() < volts - 1e-9) fireEvent.keyDown(thumb, { key: 'ArrowRight' });
  expect(now()).toBeCloseTo(volts, 6);
}

describe('digital and analog: two levels, any level, and the staircase', () => {
  it('the supply is the simulator\'s 3.3 V and the line is half of it', () => {
    expect(SUPPLY).toBe(3.3);
    expect(LINE).toBe(1.65);
  });

  it('starts at 1.2 V with 1024 steps: digital 0, the number 372', () => {
    const { thumb, steps, picture, says, drawn, stairs } = setup();
    expect(thumb).toHaveAttribute('aria-valuemin', '0');
    expect(thumb).toHaveAttribute('aria-valuemax', String(SUPPLY));
    expect(thumb).toHaveAttribute('aria-valuenow', '1.2');
    expect(thumb).toHaveAttribute('aria-valuetext', '1.2 V');
    expect(screen.getByRole('radiogroup', { name: 'Steps' })).toBeInTheDocument();
    expect(steps('1024')).toBeChecked();
    expect(numberAt(1.2, 1024)).toBe(372);
    expect(says()).toBe('At 1.2 V a digital reading says 0: it is below the line. An analog reading with 1024 steps says 372 — it can tell 1.2 V from 1.3 V.');
    expect(picture()).toHaveAccessibleName(
      'A voltage of 1.2 V out of 3.3 V, read three ways. Digital: it is below the line at 1.65 V, so it reads 0, low. '
      + 'Analog: the level is 1.2 V. As a number with 1024 steps, so many that the staircase is drawn as a slope: 372, from 0 to 1023.',
    );
    expect(picture()).toHaveAttribute('data-digital', '0');
    expect(picture()).toHaveAttribute('data-number', '372');
    expect(drawn()).toEqual(expect.arrayContaining([
      'Digital: only two answers', 'Analog: any level', 'As a number: 1024 steps', 'the line: 1.65 V',
      '0', 'low — the switch is off', '1.2 V', '372', 'from 0 to 1023', 'so many steps that it looks like a slope',
    ]));
    expect(stairs()).toHaveAttribute('data-stairs', 'slope');
  });

  it('0 V: digital 0, an empty bar, the number 0 whatever the steps', () => {
    const { thumb, steps, picture, says, part } = setup();
    fireEvent.keyDown(thumb, { key: 'Home' });
    expect(thumb).toHaveAttribute('aria-valuenow', '0');
    expect(part('bar')).toHaveAttribute('data-share', '0');
    for (const n of ['4', '16', '256', '1024']) {
      fireEvent.click(steps(n));
      expect(picture()).toHaveAttribute('data-digital', '0');
      expect(picture()).toHaveAttribute('data-number', '0');
      expect(says()).toContain(`At 0 V a digital reading says 0: it is below the line. An analog reading with ${n} steps says 0 —`);
    }
  });

  it('just under the line reads 0, on the line and just over read 1', () => {
    const { thumb, picture, says, drawn } = setup();
    slideTo(thumb, 1.6);
    expect(picture()).toHaveAttribute('data-digital', '0');
    expect(says()).toContain('At 1.6 V a digital reading says 0: it is below the line.');
    expect(drawn()).toContain('low — the switch is off');

    fireEvent.keyDown(thumb, { key: 'ArrowRight' });
    expect(Number(thumb.getAttribute('aria-valuenow'))).toBe(LINE);
    expect(picture()).toHaveAttribute('data-digital', '1');
    expect(says()).toContain('At 1.65 V a digital reading says 1: it has just reached the line.');
    expect(picture()).toHaveAccessibleName(/Digital: it has just reached the line at 1\.65 V, so it reads 1, high\./);
    expect(drawn()).toContain('high — the switch is on');

    fireEvent.keyDown(thumb, { key: 'ArrowRight' });
    expect(thumb).toHaveAttribute('aria-valuenow', '1.7');
    expect(picture()).toHaveAttribute('data-digital', '1');
    expect(says()).toContain('At 1.7 V a digital reading says 1: it is above the line.');
  });

  it('the top: 3.3 V reads 1 and lands on the top step, steps − 1', () => {
    const { thumb, steps, picture, says, drawn, part } = setup();
    fireEvent.keyDown(thumb, { key: 'End' });
    expect(Number(thumb.getAttribute('aria-valuenow'))).toBe(SUPPLY);
    expect(part('bar')).toHaveAttribute('data-share', '1');
    for (const n of [4, 16, 256, 1024]) {
      fireEvent.click(steps(String(n)));
      expect(picture()).toHaveAttribute('data-digital', '1');
      expect(picture()).toHaveAttribute('data-number', String(n - 1));
      expect(drawn()).toEqual(expect.arrayContaining([String(n - 1), `from 0 to ${n - 1}`]));
      expect(says()).toContain(`At 3.3 V a digital reading says 1: it is above the line. An analog reading with ${n} steps says ${n - 1} —`);
    }
  });

  it('each choice of steps gives the simulator\'s arithmetic: floor(volts ÷ supply × steps)', () => {
    const { thumb, steps, picture, drawn } = setup();
    for (const volts of [0.4, 1.2, 1.65, 2.5, 3.25]) {
      slideTo(thumb, volts);
      for (const n of [4, 16, 256, 1024]) {
        fireEvent.click(steps(String(n)));
        expect(picture()).toHaveAttribute('data-number', String(numberAt(volts, n)));
        expect(drawn()).toContain(`As a number: ${n} steps`);
      }
    }
  });

  it('4 and 16 steps are drawn step by step, 256 and 1024 as a slope', () => {
    const { steps, stairs, part, picture, drawn } = setup();
    for (const n of [4, 16]) {
      fireEvent.click(steps(String(n)));
      expect(stairs()).toHaveAttribute('data-stairs', 'steps');
      expect(stairs()).toHaveAttribute('data-treads', String(n));
      // one flat tread a step, and a rise between each two
      expect(stairs().getAttribute('d')!.match(/H/g)).toHaveLength(n);
      expect(stairs().getAttribute('d')!.match(/V/g)).toHaveLength(n - 1);
      expect(part('tread')).not.toBeNull();
      expect(drawn()).toContain(`each step is ${v(SUPPLY / n)} wide`);
      if (n === 4) expect(drawn()).toContain('each step is 0.83 V wide');
      expect(picture()).toHaveAccessibleName(new RegExp(`As a number with ${n} steps, drawn step by step: ${numberAt(1.2, n)}, from 0 to ${n - 1}\\.`));
    }
    for (const n of [256, 1024]) {
      fireEvent.click(steps(String(n)));
      expect(stairs()).toHaveAttribute('data-stairs', 'slope');
      expect(part('tread')).toBeNull();
      expect(drawn()).toContain('so many steps that it looks like a slope');
    }
  });

  it('few steps cannot tell near voltages apart; many can', () => {
    const { steps, says } = setup();
    fireEvent.click(steps('4'));
    expect(numberAt(1.2, 4)).toBe(numberAt(1.3, 4));
    expect(says()).toBe('At 1.2 V a digital reading says 0: it is below the line. An analog reading with 4 steps says 1 — it cannot tell 1.2 V from 1.3 V: both land on the same step.');
    fireEvent.click(steps('16'));
    expect(numberAt(1.2, 16)).not.toBe(numberAt(1.3, 16));
    expect(says()).toContain('with 16 steps says 5 — it can tell 1.2 V from 1.3 V.');
  });

  it('the level, the bar and the landing point follow the slider', () => {
    const { thumb, part } = setup();
    const at = (volts: number) => {
      slideTo(thumb, volts);
      return {
        level: Number(part('level')!.getAttribute('d')!.match(/,([\d.]+) H/)![1]),
        share: Number(part('bar')!.getAttribute('data-share')),
        landed: Number(part('landed')!.getAttribute('cx')),
      };
    };
    const low = at(0.5), high = at(2.8);
    expect(high.level).toBeLessThan(low.level);            // higher on the page
    expect(low.share).toBeCloseTo(0.5 / SUPPLY, 3);
    expect(high.share).toBeCloseTo(2.8 / SUPPLY, 3);
    expect(high.landed).toBeGreaterThan(low.landed);
  });

  it('the steps are chosen from the keyboard too', () => {
    const { steps } = setup();
    fireEvent.keyDown(steps('1024'), { key: 'ArrowLeft' });
    expect(steps('256')).toBeChecked();
  });

  it('draws to fill its box, with the app\'s own controls, and names no board', () => {
    const { container, thumb, steps } = setup();
    for (const n of ['4', '1024']) {
      fireEvent.click(steps(n));
      for (const key of ['Home', 'End']) {
        fireEvent.keyDown(thumb, { key });
        const svg = container.querySelector('svg.lfig')!;
        expect(svg).toHaveAttribute('viewBox');
        expect(svg).not.toHaveAttribute('width');
        expect(container.innerHTML).not.toMatch(/NaN|undefined/);
        expect(container.querySelector('input, select')).toBeNull();
        expect(container.textContent).not.toMatch(/bits?\b|Pico|micro:bit|ESP32|GP\d/i);
      }
    }
  });
});
