import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { dhtBytes, SENSORS, SENSOR_START } from '@lib/circuit';
import { DhtInside } from '../../src/renderer/learn/figs/dht';

/**
 * M8 Learn's picture of the DHT11 / DHT22: its case opened, and the five numbers its chip sends down DATA as forty
 * short and long pulses — the simulator's dhtBytes, the last number the check.
 */

function setup() {
  const { container } = render(<DhtInside />);
  return {
    container,
    warmth: () => screen.getByRole('slider', { name: 'Warmth' }),
    damp: () => screen.getByRole('slider', { name: 'Dampness' }),
    kind: (name: string) => screen.getByRole('radio', { name }),
    picture: () => screen.getByRole('img'),
    says: () => screen.getByRole('status').textContent ?? '',
    drawn: () => [...container.querySelectorAll('svg[role="img"] text')].map((t) => t.textContent),
    bytes: () => [...container.querySelectorAll('[data-part="byte"]')].map((b) => Number(b.getAttribute('data-value'))),
    ones: () => [...container.querySelectorAll('svg[role="img"] text')].filter((t) => t.textContent === '1').length,
  };
}
const popcount = (bytes: number[]) => bytes.reduce((n, b) => n + b.toString(2).split('').filter((d) => d === '1').length, 0);

describe('the DHT, its chip and its forty pulses', () => {
  it('starts as a DHT11 at 22 °C and 50 %: 50, 0, 22, 0 and the check 72', () => {
    const { warmth, damp, kind, picture, says, drawn, bytes, ones } = setup();
    expect([SENSOR_START.celsius, SENSOR_START.humidity]).toEqual([22, 50]);
    expect(kind('DHT11 (blue)')).toBeChecked();
    expect(warmth()).toHaveAttribute('aria-valuetext', '22 °C');
    expect(warmth()).toHaveAttribute('aria-valuemin', String(SENSORS.dht.DHT11.min));
    expect(damp()).toHaveAttribute('aria-valuetext', '50 %');
    expect(bytes()).toEqual([50, 0, 22, 0, 72]);
    expect(ones()).toBe(popcount([50, 0, 22, 0, 72]));
    expect(says()).toBe('The chip measures 22 °C and 50 % dampness, and sends them as forty pulses: short for 0, long for 1. The last number checks the others: 50 + 0 + 22 + 0 = 72.');
    expect(picture()).toHaveAccessibleName('A DHT11 opened up: a dampness sensor, a warmth sensor and a chip. It measures 22 °C and 50 % and sends five numbers down DATA — 50, 0, 22, 0, 72 — as forty short and long pulses.');
    expect(drawn()).toEqual(expect.arrayContaining(['VCC', 'DATA', 'GND', 'Feels dampness', 'Feels warmth', 'The chip', 'dampness', 'warmth', 'check']));
  });

  it('the DHT22 sends to a tenth, in two bytes each: its check keeps only the last 8 bits', () => {
    const { warmth, kind, says, drawn, bytes, picture } = setup();
    fireEvent.click(kind('DHT22 (white)'));
    expect(bytes()).toEqual(dhtBytes('DHT22', 22, 50));
    expect(bytes()).toEqual([1, 244, 0, 220, 209]);
    expect(drawn()).toEqual(expect.arrayContaining(['dampness × 10 = 500', 'warmth × 10 = 220']));
    expect(says()).toContain('1 + 244 + 0 + 220 = 465, and only its last 8 bits are sent: 209.');
    fireEvent.keyDown(warmth(), { key: 'ArrowRight' });
    expect(warmth()).toHaveAttribute('aria-valuetext', '22.5 °C');
    expect(bytes()).toEqual(dhtBytes('DHT22', 22.5, 50));
    expect(picture()).toHaveAccessibleName(/It measures 22\.5 °C and 50 %/);
  });

  it('below zero the DHT22 sets its top bit', () => {
    const { warmth, kind, bytes, drawn } = setup();
    fireEvent.click(kind('DHT22 (white)'));
    fireEvent.keyDown(warmth(), { key: 'Home' });
    expect(warmth()).toHaveAttribute('aria-valuetext', '−40 °C');
    expect(bytes()).toEqual(dhtBytes('DHT22', -40, 50));
    expect(bytes()[2]! & 0x80).toBe(0x80);
    expect(drawn()).toContain('warmth × 10 = 400, below 0');
  });

  it.each([[0, 20], [50, 90], [13, 77]])('the DHT11 at %i °C and %i %%: the simulator\'s bytes, as many long pulses as 1s', (c, h) => {
    const { warmth, damp, bytes, ones } = setup();
    fireEvent.keyDown(warmth(), { key: 'Home' });
    for (let i = 0; i < c; i++) fireEvent.keyDown(warmth(), { key: 'ArrowRight' });
    fireEvent.keyDown(damp(), { key: 'Home' });
    for (let i = 20; i < h; i++) fireEvent.keyDown(damp(), { key: 'ArrowRight' });
    expect(bytes()).toEqual(dhtBytes('DHT11', c, h));
    expect(ones()).toBe(popcount(bytes()));
  });

  it('changing the kind keeps warmth and dampness inside what it measures', () => {
    const { warmth, damp, kind } = setup();
    fireEvent.click(kind('DHT22 (white)'));
    fireEvent.keyDown(warmth(), { key: 'Home' });
    fireEvent.keyDown(damp(), { key: 'Home' });
    fireEvent.keyDown(warmth(), { key: 'ArrowRight' });
    fireEvent.click(kind('DHT11 (blue)'));
    expect(warmth()).toHaveAttribute('aria-valuenow', '0');
    expect(damp()).toHaveAttribute('aria-valuenow', '20');
  });

  it('draws to fill its box, with the app\'s own controls, and names no board', () => {
    const { container, kind, warmth } = setup();
    for (const name of ['DHT22 (white)', 'DHT11 (blue)']) {
      fireEvent.click(kind(name));
      for (const key of ['Home', 'End']) {
        fireEvent.keyDown(warmth(), { key });
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
