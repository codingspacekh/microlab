import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { echoUs, SENSORS, SENSOR_START } from '@lib/circuit';
import { SonarInside } from '../../src/renderer/learn/figs/sonar';

/**
 * M8 Learn's picture of the ultrasonic distance sensor: slide the wall away — the echo takes longer, by the
 * simulator's echoUs (58 µs a cm); past 400 cm, or facing a curtain, no echo comes back and it gives up after 38 ms.
 */

const S = SENSORS['hc-sr04'];

function slideTo(thumb: HTMLElement, cm: number) {
  const now = () => Number(thumb.getAttribute('aria-valuenow'));
  fireEvent.keyDown(thumb, { key: 'Home' });
  while (now() + 10 <= cm) fireEvent.keyDown(thumb, { key: 'PageUp' });
  while (now() < cm) fireEvent.keyDown(thumb, { key: 'ArrowRight' });
  expect(now()).toBe(cm);
}

function setup() {
  const { container } = render(<SonarInside />);
  return {
    container,
    thumb: screen.getByRole('slider', { name: 'How far' }),
    picture: () => screen.getByRole('img'),
    says: () => screen.getByRole('status').textContent ?? '',
    drawn: () => [...container.querySelectorAll('svg[role="img"] text')].map((t) => t.textContent),
    count: (name: string) => container.querySelectorAll(`[data-part="${name}"]`).length,
    pulse: () => Number(container.querySelector('[data-part="pulse"]')!.getAttribute('data-us')),
  };
}

describe('the ultrasonic sensor, its click and its echo', () => {
  it('the numbers are the simulator\'s', () => {
    expect(S).toMatchObject({ usPerCm: 58, minCm: 2, maxCm: 400, noneUs: 38_000 });
    expect(echoUs(100)).toBe(5800);
  });

  it('starts with a wall 1 m away: the echo takes 5 800 µs', () => {
    const { thumb, picture, says, drawn, count } = setup();
    expect(SENSOR_START.cm).toBe(100);
    expect(thumb).toHaveAttribute('aria-valuenow', '100');
    expect(thumb).toHaveAttribute('aria-valuetext', '100 cm');
    expect(says()).toBe('The click goes 100 cm to the wall and 100 cm back: the echo takes 5 800 µs — 5.8 ms. Echo stays high that long: 5 800 ÷ 58 = 100 cm.');
    expect(picture()).toHaveAccessibleName('An ultrasonic distance sensor facing a wall 100 cm away. The echo comes back after 5 800 µs, and Echo stays high at 5 V that long.');
    expect(drawn()).toEqual(expect.arrayContaining(['T', 'R', 'Clicks', 'Listens', '100 cm', '5 800 µs', 'The Echo leg']));
    expect(count('wall')).toBe(1);
    expect(count('echo')).toBe(3);
  });

  it.each([2, 37, 150, 400])('a wall at %i cm: the simulator\'s echo time', (cm) => {
    const { thumb, says, pulse, picture } = setup();
    slideTo(thumb, cm);
    expect(pulse()).toBe(echoUs(cm));
    expect(says()).toContain(`÷ 58 = ${cm} cm.`);
    expect(picture()).toHaveAttribute('data-heard', 'echo');
  });

  it('farther: the wall moves away and the pulse gets longer', () => {
    const { thumb, container, pulse } = setup();
    let before = { x: -Infinity, us: 0 };
    for (const cm of [2, 50, 120, 300, 400]) {
      slideTo(thumb, cm);
      const now = { x: Number(container.querySelector('[data-part="wall"]')!.getAttribute('x')), us: pulse() };
      expect(now.x).toBeGreaterThan(before.x);
      expect(now.us).toBeGreaterThan(before.us);
      before = now;
    }
  });

  it('past 400 cm no echo comes back: it gives up after 38 ms', () => {
    const { thumb, says, count, pulse, drawn } = setup();
    slideTo(thumb, 401);
    expect(says()).toBe('The wall is 401 cm away: farther than 400 cm, the echo is too faint to hear. After 38 ms the sensor gives up.');
    expect(count('echo')).toBe(0);
    expect(pulse()).toBe(38_000);
    expect(drawn()).toContain('no echo: it gives up');
    fireEvent.keyDown(thumb, { key: 'End' });
    expect(thumb).toHaveAttribute('aria-valuenow', '450');
  });

  it('a curtain swallows the click: no echo, however near', () => {
    const { thumb, says, count, pulse, picture } = setup();
    fireEvent.click(screen.getByRole('radio', { name: 'A curtain' }));
    expect(count('curtain')).toBe(1);
    expect(count('wall')).toBe(0);
    expect(count('echo')).toBe(0);
    expect(count('click')).toBe(3);
    expect(pulse()).toBe(38_000);
    expect(says()).toBe('The curtain is soft: it swallows the click, and no echo comes back. After 38 ms the sensor gives up — it looks as if nothing is there.');
    expect(picture()).toHaveAccessibleName('An ultrasonic distance sensor facing a curtain 100 cm away. No echo comes back: after 38 000 µs it gives up.');
    fireEvent.keyDown(thumb, { key: 'Home' });
    expect(count('echo')).toBe(0);
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
