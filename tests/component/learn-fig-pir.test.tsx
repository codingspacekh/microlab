import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { sensorDrive, SENSORS } from '@lib/circuit';
import { PirInside } from '../../src/renderer/learn/figs/pir';

/**
 * M8 Learn's picture of the motion sensor: its dome lifted, the two halves under it and the zones each looks at. A warm
 * person in one half's zone and not the other's makes OUT go high (the simulator's 3.3 V); nobody, the person between
 * two zones, or a torch's light anywhere leaves it low.
 */

const HIGH = sensorDrive('pir', {}, { motion: true }, 5).volts;
const LOW = sensorDrive('pir', {}, { motion: false }, 5).volts;
const HOLD = SENSORS.pir.holdS;

/** Moves the slider to `to` from the keyboard: Home, then PageUp (ten steps) and ArrowRight (one). */
function slideTo(thumb: HTMLElement, to: number) {
  const now = () => Number(thumb.getAttribute('aria-valuenow'));
  fireEvent.keyDown(thumb, { key: 'Home' });
  while (now() + 10 <= to) fireEvent.keyDown(thumb, { key: 'PageUp' });
  while (now() < to) fireEvent.keyDown(thumb, { key: 'ArrowRight' });
  expect(now()).toBe(to);
}

function setup() {
  const { container } = render(<PirInside />);
  const svg = () => container.querySelector('svg.lfig')!;
  return {
    container,
    svg,
    thumb: screen.getByRole('slider', { name: 'Where it is' }),
    person: screen.getByRole('radio', { name: 'A person (warm)' }),
    torch: screen.getByRole('radio', { name: 'A torch\'s light' }),
    picture: () => screen.getByRole('img'),
    says: () => screen.getByRole('status').textContent ?? '',
    drawn: () => [...container.querySelectorAll('svg.lfig text')].map((t) => t.textContent),
    /** Where the thing is, what each half sees (0, 0.5 or 1) and OUT's volts, as drawn. */
    state: () => ({
      where: svg().getAttribute('data-where'),
      a: Number(svg().getAttribute('data-a')),
      b: Number(svg().getAttribute('data-b')),
      out: Number(svg().getAttribute('data-out')),
    }),
    /** How far each half's bar is filled, 0–1. */
    bar: (half: 'a' | 'b') => Number(container.querySelector(`[data-part="bar-${half}"]`)!.getAttribute('data-fill')),
    /** The zones drawn lit: the halves that see something now. */
    lit: () => [...new Set([...container.querySelectorAll('[data-zone][data-lit="true"]')].map((z) => z.getAttribute('data-zone')))].sort(),
  };
}

describe('the motion sensor, its dome lifted', () => {
  it('the simulator\'s sensor: OUT 3.3 V while it sees movement, 0 V otherwise, held for 3 s', () => {
    expect([HIGH, LOW, HOLD]).toEqual([3.3, 0, 3]);
  });

  it('starts with the person outside the view: neither half sees anything, OUT is low', () => {
    const { thumb, person, torch, picture, says, state, bar, lit, drawn } = setup();
    expect(thumb).toHaveAttribute('aria-valuenow', '0');
    expect(thumb).toHaveAttribute('aria-valuemin', '0');
    expect(thumb).toHaveAttribute('aria-valuemax', '100');
    expect(thumb).toHaveAttribute('aria-valuetext', 'outside the view');
    expect(person).toHaveAttribute('aria-checked', 'true');
    expect(torch).toHaveAttribute('aria-checked', 'false');
    expect(state()).toEqual({ where: 'outside', a: 0, b: 0, out: LOW });
    expect([bar('a'), bar('b')]).toEqual([0, 0]);
    expect(lit()).toEqual([]);
    expect(says()).toBe('The person is outside what the sensor can see. Neither half sees any warmth — both the same: OUT stays at 0 V.');
    expect(picture()).toHaveAccessibleName('A motion sensor with its dome lifted and the room in front of it: a person, outside the view. Half A sees nothing, half B sees nothing. OUT is at 0 V.');
    expect(drawn()).toEqual(expect.arrayContaining(['Half A', 'Half B', 'OUT', '0 V']));
  });

  it.each([[10, 'A'], [20, 'A'], [27, 'A'], [52, 'A'], [69, 'A'], [31, 'B'], [40, 'B'], [48, 'B'], [73, 'B'], [90, 'B']] as const)(
    'the person at %i is in front of half %s only: OUT goes high',
    (at, half) => {
      const { thumb, picture, says, state, bar, lit, drawn } = setup();
      slideTo(thumb, at);
      const other = half === 'A' ? 'B' : 'A';
      expect(thumb).toHaveAttribute('aria-valuetext', `in a zone of half ${half}`);
      expect(state()).toEqual({ where: half, a: half === 'A' ? 1 : 0, b: half === 'B' ? 1 : 0, out: HIGH });
      expect(bar(half === 'A' ? 'a' : 'b')).toBe(1);
      expect(bar(half === 'A' ? 'b' : 'a')).toBe(0);
      expect(lit()).toEqual([half]);
      expect(says()).toBe(
        `The person is in front of half ${half} only. The two halves see different warmth — something warm is moving across: `
        + `OUT goes to ${HIGH} V, and stays there for ${HOLD} s after the last movement.`,
      );
      expect(picture()).toHaveAccessibleName(
        `A motion sensor with its dome lifted and the room in front of it: a person, in a zone of half ${half}. `
        + `Half ${half} sees warmth, half ${other} sees nothing. OUT is at ${HIGH} V.`,
      );
      expect(drawn()).toEqual(expect.arrayContaining([`${HIGH} V`, `kept for ${HOLD} s after the last movement`]));
    },
  );

  it.each([28, 29, 30, 49, 50, 51, 70, 71, 72])('the person at %i is between two zones: both halves see the same, the sensor reads low', (at) => {
    const { thumb, picture, says, state, bar, lit, drawn } = setup();
    slideTo(thumb, at);
    expect(thumb).toHaveAttribute('aria-valuetext', 'between A and B');
    expect(state()).toEqual({ where: 'between', a: 0.5, b: 0.5, out: LOW });
    expect([bar('a'), bar('b')]).toEqual([0.5, 0.5]);
    expect(lit()).toEqual(['A', 'B']);
    expect(says()).toBe(
      'The person is half in front of A and half in front of B. Both halves see the same warmth, so they cancel: the sensor reads 0 V here. '
      + `The real part keeps OUT at ${HIGH} V for ${HOLD} s after the last movement, so you would not see this gap.`,
    );
    expect(picture()).toHaveAccessibleName(/a person, between A and B\. Half A sees half the warmth, half B sees half the warmth\. OUT is at 0 V\.$/);
    expect(drawn()).not.toContain(`kept for ${HOLD} s after the last movement`);
  });

  it.each([0, 9, 91, 100])('the person at %i is outside the view', (at) => {
    const { thumb, state } = setup();
    slideTo(thumb, at);
    expect(state()).toEqual({ where: 'outside', a: 0, b: 0, out: LOW });
  });

  it.each([0, 5, 10, 20, 29, 40, 50, 60, 71, 80, 90, 100])('a torch\'s light at %i is not warm: neither half sees it, OUT stays low', (at) => {
    const { thumb, torch, picture, says, state, bar, lit } = setup();
    fireEvent.click(torch);
    slideTo(thumb, at);
    expect(torch).toHaveAttribute('aria-checked', 'true');
    expect(state()).toMatchObject({ a: 0, b: 0, out: LOW });
    expect([bar('a'), bar('b')]).toEqual([0, 0]);
    expect(lit()).toEqual([]);
    expect(says()).toBe('A torch\'s light is bright but not warm: neither half sees it. OUT stays at 0 V.');
    expect(picture()).toHaveAccessibleName(/a torch's light, .*\. Half A sees nothing, half B sees nothing\. OUT is at 0 V\.$/);
  });

  it('the same place: the person is seen, the torch is not, and the person is again', () => {
    const { thumb, person, torch, state, container } = setup();
    slideTo(thumb, 40);
    expect(state().out).toBe(HIGH);
    expect(container.querySelector('[data-part="thing"]')).toHaveAttribute('data-what', 'person');
    fireEvent.click(torch);
    expect(state().out).toBe(LOW);
    expect(container.querySelector('[data-part="thing"]')).toHaveAttribute('data-what', 'torch');
    fireEvent.keyDown(torch, { key: 'ArrowLeft' });          // the choice from the keyboard
    expect(person).toHaveAttribute('aria-checked', 'true');
    expect(state().out).toBe(HIGH);
  });

  it('the person moves across the drawing with the slider', () => {
    const { thumb, container } = setup();
    const at = () => container.querySelector('[data-part="thing"]')!.getAttribute('transform');
    const seen = new Set([at()]);
    for (const to of [25, 50, 75, 100]) { slideTo(thumb, to); seen.add(at()); }
    expect(seen.size).toBe(5);
  });

  it('crossing the room: OUT is high in every zone, low at the seams and outside', () => {
    const { thumb, state } = setup();
    fireEvent.keyDown(thumb, { key: 'Home' });
    const highs: number[] = [];
    for (let at = 0; at <= 100; at += 1) {
      if (at > 0) fireEvent.keyDown(thumb, { key: 'ArrowRight' });
      const { a, b, out } = state();
      expect(out).toBe(sensorDrive('pir', {}, { motion: a !== b }, 5).volts);
      if (out > 0) highs.push(at);
    }
    expect(highs).toHaveLength(4 * 18);                       // four zones, A B A B, each 18 steps wide
  });

  it('draws to fill its box, with no board\'s name and only the app\'s own controls', () => {
    const { container, svg, thumb, torch } = setup();
    expect(svg()).toHaveAttribute('role', 'img');
    expect(svg()).toHaveAttribute('viewBox');
    expect(svg()).not.toHaveAttribute('width');
    for (const at of [0, 20, 29, 40]) {
      slideTo(thumb, at);
      expect(container.innerHTML).not.toMatch(/NaN|undefined/);
    }
    fireEvent.click(torch);
    expect(container.innerHTML).not.toMatch(/NaN|undefined/);
    expect(container.textContent).not.toMatch(/Pico|micro:bit|ESP32|GP\d/);
    expect(container.querySelector('input, select')).toBeNull();
  });
});
