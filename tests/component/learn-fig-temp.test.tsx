import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { POWER_SUPPLY, sensorDrive, SENSORS, SENSOR_START } from '@lib/circuit';
import { TempInside } from '../../src/renderer/learn/figs/temp';

/**
 * M8 Learn's picture of the temperature sensor: a TMP36 or an LM35 beside a thermometer, and the graph of its volts —
 * a straight line, 10 mV for each degree (the TMP36 starting 0.5 V up), by the simulator's sensorDrive on 5 V.
 */

type Kind = 'TMP36' | 'LM35';
const SUPPLY = Math.max(...POWER_SUPPLY.choices);
const T = SENSORS['temp-sensor'];
/** What Vout must show, worked out from the simulator: two decimals. */
const volts = (kind: Kind, celsius: number) => sensorDrive('temp-sensor', { kind }, { celsius }, SUPPLY).volts.toFixed(2);
const deg = (c: number) => `${c < 0 ? `−${-c}` : c} °C`;

/** Moves the temperature from the keyboard: Home, then PageUp (ten degrees) and ArrowRight (one). */
function slideTo(thumb: HTMLElement, celsius: number) {
  const now = () => Number(thumb.getAttribute('aria-valuenow'));
  fireEvent.keyDown(thumb, { key: 'Home' });
  while (now() + 10 <= celsius) fireEvent.keyDown(thumb, { key: 'PageUp' });
  while (now() < celsius) fireEvent.keyDown(thumb, { key: 'ArrowRight' });
  expect(now()).toBe(celsius);
}

function setup() {
  const { container } = render(<TempInside />);
  const part = (name: string) => container.querySelector(`[data-part="${name}"]`)!;
  return {
    container,
    thumb: () => screen.getByRole('slider', { name: 'Temperature' }),
    kind: (name: Kind) => screen.getByRole('radio', { name }),
    picture: () => screen.getByRole('img'),
    says: () => screen.getByRole('status').textContent ?? '',
    drawn: () => [...container.querySelectorAll('svg[role="img"] text')].map((t) => t.textContent),
    part,
    dot: () => ({ x: Number(part('dot').getAttribute('cx')), y: Number(part('dot').getAttribute('cy')) }),
    mercury: () => Number(part('mercury').getAttribute('data-share')),
  };
}

describe('the temperature sensor: its legs, a thermometer and the line of its volts', () => {
  it('the numbers are the simulator\'s', () => {
    expect(SUPPLY).toBe(5);
    expect(T.TMP36).toMatchObject({ offset: 0.5, min: -40, max: 125 });
    expect(T.LM35).toMatchObject({ offset: 0, min: 0, max: 150 });
    expect(SUPPLY).toBeGreaterThanOrEqual(T.LM35.minVolts);
    expect([volts('TMP36', 22), volts('LM35', 22)]).toEqual(['0.72', '0.22']);
  });

  it('starts as a TMP36 at 22 °C: 0.72 V', () => {
    const { thumb, kind, picture, says, drawn } = setup();
    expect(SENSOR_START.celsius).toBe(22);
    expect(screen.getByRole('radiogroup', { name: 'Kind' })).toBeInTheDocument();
    expect(kind('TMP36')).toBeChecked();
    expect(thumb()).toHaveAttribute('aria-valuenow', '22');
    expect(thumb()).toHaveAttribute('aria-valuemin', '-40');
    expect(thumb()).toHaveAttribute('aria-valuemax', '125');
    expect(thumb()).toHaveAttribute('aria-valuetext', '22 °C');
    expect(says()).toBe('At 22 °C the TMP36 gives 0.72 V: half a volt to start with, and 10 thousandths of a volt for each degree.');
    expect(picture()).toHaveAccessibleName(
      'A TMP36 temperature sensor at 22 °C: its Vout leg gives 0.72 V. On the graph the line climbs 10 thousandths of a volt '
      + 'for each degree, from 0.10 V at −40 °C to 1.75 V at 125 °C.',
    );
    expect(picture()).toHaveAttribute('data-kind', 'TMP36');
    expect(picture()).toHaveAttribute('data-volts', '0.72');
    expect(drawn()).toEqual(expect.arrayContaining(['TMP36', '+Vs', 'Vout', 'GND', '0.72 V', '22 °C', '(0.72 V − 0.5 V) × 100 = 22 °C', 'starts 0.5 V up']));
  });

  it('the LM35 at 22 °C: 0.22 V, no half volt', () => {
    const { thumb, kind, picture, says, drawn } = setup();
    fireEvent.click(kind('LM35'));
    expect(kind('LM35')).toBeChecked();
    expect(thumb()).toHaveAttribute('aria-valuenow', '22');
    expect(thumb()).toHaveAttribute('aria-valuemin', '0');
    expect(thumb()).toHaveAttribute('aria-valuemax', '150');
    expect(says()).toBe('At 22 °C the LM35 gives 0.22 V: 10 thousandths of a volt for each degree, starting from 0 V at 0 °C.');
    expect(picture()).toHaveAccessibleName(/^A LM35 temperature sensor at 22 °C: its Vout leg gives 0\.22 V\..*from 0\.00 V at 0 °C to 1\.50 V at 150 °C\.$/);
    expect(drawn()).toEqual(expect.arrayContaining(['LM35', '0.22 V', '0.22 V × 100 = 22 °C']));
    expect(drawn()).not.toContain('starts 0.5 V up');
  });

  it.each([['TMP36', -40], ['TMP36', 125], ['LM35', 0], ['LM35', 150]] as const)('the %s at its end, %s °C, says it cannot go further', (name, end) => {
    const { thumb, kind, says, drawn, picture, mercury } = setup();
    fireEvent.click(kind(name));
    const lowest = end === T[name].min;
    fireEvent.keyDown(thumb(), { key: lowest ? 'Home' : 'End' });
    expect(thumb()).toHaveAttribute('aria-valuenow', String(end));
    const v = volts(name, end);
    expect(says()).toContain(`At ${deg(end)} the ${name} gives ${v} V:`);
    expect(says()).toMatch(lowest ? /This is as cold as it goes: it cannot measure lower\.$/ : /This is as hot as it goes: it cannot measure higher\.$/);
    expect(drawn()).toEqual(expect.arrayContaining([`${v} V`, deg(end)]));
    expect(picture()).toHaveAttribute('data-volts', v);
    expect(mercury()).toBe(lowest ? 0 : 1);
    // pressing on changes nothing
    fireEvent.keyDown(thumb(), { key: lowest ? 'ArrowLeft' : 'ArrowRight' });
    expect(thumb()).toHaveAttribute('aria-valuenow', String(end));
  });

  it('below zero the TMP36 still gives more than 0 V', () => {
    const { thumb, says, drawn, picture } = setup();
    slideTo(thumb(), -10);
    expect(volts('TMP36', -10)).toBe('0.40');
    expect(thumb()).toHaveAttribute('aria-valuetext', '−10 °C');
    expect(says()).toBe('At −10 °C the TMP36 gives 0.40 V: half a volt to start with, and 10 thousandths of a volt for each degree. Below zero it still gives more than 0 V.');
    expect(drawn()).toEqual(expect.arrayContaining(['0.40 V', '−10 °C', '(0.40 V − 0.5 V) × 100 = −10 °C']));
    expect(picture()).toHaveAccessibleName(/at −10 °C: its Vout leg gives 0\.40 V\./);
  });

  it('0 °C on the TMP36 is 0.50 V', () => {
    const { thumb, says, drawn } = setup();
    slideTo(thumb(), 0);
    expect(says()).toBe('At 0 °C the TMP36 gives 0.50 V: half a volt to start with, and 10 thousandths of a volt for each degree.');
    expect(drawn()).toContain('(0.50 V − 0.5 V) × 100 = 0 °C');
  });

  it.each([['TMP36', -25], ['TMP36', 37], ['TMP36', 100], ['LM35', 5], ['LM35', 37], ['LM35', 99]] as const)('the %s at %s °C shows the simulator\'s volts and the sum backwards', (name, c) => {
    const { thumb, kind, says, drawn } = setup();
    fireEvent.click(kind(name));
    slideTo(thumb(), c);
    const v = volts(name, c);
    expect(says()).toContain(`At ${deg(c)} the ${name} gives ${v} V:`);
    expect(drawn()).toContain(`${v} V`);
    expect(drawn()).toContain(name === 'TMP36' ? `(${v} V − 0.5 V) × 100 = ${deg(c)}` : `${v} V × 100 = ${deg(c)}`);
  });

  it('changing the kind keeps the temperature inside what the kind measures', () => {
    const { thumb, kind, says } = setup();
    fireEvent.keyDown(thumb(), { key: 'Home' });
    expect(thumb()).toHaveAttribute('aria-valuenow', '-40');
    fireEvent.click(kind('LM35'));
    expect(thumb()).toHaveAttribute('aria-valuenow', '0');
    expect(says()).toContain('At 0 °C the LM35 gives 0.00 V:');
    fireEvent.keyDown(thumb(), { key: 'End' });
    expect(thumb()).toHaveAttribute('aria-valuenow', '150');
    fireEvent.click(kind('TMP36'));
    expect(thumb()).toHaveAttribute('aria-valuenow', '125');
    expect(says()).toContain('At 125 °C the TMP36 gives 1.75 V:');
    // a temperature both measure stays
    slideTo(thumb(), 60);
    fireEvent.click(kind('LM35'));
    expect(thumb()).toHaveAttribute('aria-valuenow', '60');
  });

  it('hotter: the mercury rises, the dot moves right and up along the line', () => {
    const { thumb, dot, mercury, part } = setup();
    let before = { x: -Infinity, y: Infinity, m: -1 };
    for (const c of [-40, -10, 22, 60, 125]) {
      slideTo(thumb(), c);
      const now = { ...dot(), m: mercury() };
      expect(now.x).toBeGreaterThan(before.x);
      expect(now.y).toBeLessThan(before.y);
      expect(now.m).toBeGreaterThan(before.m);
      before = now;
    }
    expect(part('line')).not.toBeNull();
    expect(part('drop-lines')).not.toBeNull();
  });

  it('the kind is chosen from the keyboard too', () => {
    const { kind } = setup();
    fireEvent.keyDown(kind('TMP36'), { key: 'ArrowRight' });
    expect(kind('LM35')).toBeChecked();
  });

  it('draws to fill its box, with the app\'s own controls, and names no board', () => {
    const { container, thumb, kind } = setup();
    for (const name of ['LM35', 'TMP36'] as const) {
      fireEvent.click(kind(name));
      for (const key of ['Home', 'End']) {
        fireEvent.keyDown(thumb(), { key });
        const svg = container.querySelector('svg.lfig')!;
        expect(svg).toHaveAttribute('viewBox');
        expect(svg).not.toHaveAttribute('width');
        expect(container.innerHTML).not.toMatch(/NaN|undefined/);
        expect(container.textContent).not.toMatch(/Pico|micro:bit|ESP32|GP\d/);
        expect(container.querySelector('input, select')).toBeNull();
      }
    }
  });
});
