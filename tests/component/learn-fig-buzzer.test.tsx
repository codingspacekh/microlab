import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BUZZER } from '@lib/circuit';
import { noteName } from '../../src/renderer/audio';
import { BuzzerInside } from '../../src/renderer/learn/figs/buzzer';

/**
 * M8 Learn's picture of the buzzer, cut open: Kind switches between the active one (its own tiny circuit, one note —
 * the simulator's 2300 Hz, from 2 V) and the passive one (pushed from outside, at the slider's pitch); the waves in
 * the air close up and the pushes come faster as the pitch rises.
 */

const ACTIVE_HZ = BUZZER.active.hz;

function setup() {
  const { container } = render(<BuzzerInside />);
  return {
    container,
    kind: (name: 'Active' | 'Passive') => screen.getByRole('radio', { name }),
    pitch: () => screen.queryByRole('slider', { name: 'Pitch' }),
    picture: () => screen.getByRole('img', { name: /buzzer cut open/ }),
    says: () => screen.getByRole('status').textContent ?? '',
    drawn: () => [...container.querySelectorAll('svg[role="img"] text')].map((t) => t.textContent),
    waves: () => container.querySelectorAll('[data-wave]').length,
    pushes: () => Number(container.querySelector('[data-pushes]')!.getAttribute('data-pushes')),
  };
}

/** Moves the pitch from the keyboard: Home or End, then PageUp / PageDown (ten steps) and the arrows (one). */
function slideTo(thumb: HTMLElement, value: number) {
  const now = () => Number(thumb.getAttribute('aria-valuenow'));
  fireEvent.keyDown(thumb, { key: 'Home' });
  while (now() + 100 <= value) fireEvent.keyDown(thumb, { key: 'PageUp' });
  while (now() < value) fireEvent.keyDown(thumb, { key: 'ArrowRight' });
  expect(now()).toBe(value);
}

describe('the buzzer, cut open', () => {
  it('starts passive, pushed 440 times a second: the note A', () => {
    const { kind, pitch, picture, says, drawn } = setup();
    expect(screen.getByRole('radiogroup', { name: 'Kind' })).toBeInTheDocument();
    expect(kind('Passive')).toBeChecked();
    expect(kind('Active')).not.toBeChecked();
    expect(pitch()).toHaveAttribute('aria-valuenow', '440');
    expect(pitch()).toHaveAttribute('aria-valuemin', '200');
    expect(pitch()).toHaveAttribute('aria-valuemax', '4000');
    expect(pitch()).toHaveAttribute('aria-valuetext', '440 Hz');
    expect(noteName(440)).toBe('A4');
    expect(says()).toBe('Passive, pushed 440 times a second: the disc bends and springs back 440 times, and you hear the note A. Push it faster and the note is higher.');
    expect(picture()).toHaveAccessibleName('A buzzer cut open, passive: pushed from outside 440 times a second, the disc bends 440 times a second and you hear the note A');
    expect(drawn()).toEqual(expect.arrayContaining(['440 Hz', 'the note A']));
    expect(drawn()).not.toContain('Its own tiny circuit');
  });

  it('active: its own tiny circuit pushes at the simulator\'s one pitch, and there is no pitch to slide', () => {
    const { kind, pitch, picture, says, drawn } = setup();
    fireEvent.click(kind('Active'));
    expect(kind('Active')).toBeChecked();
    expect(pitch()).toBeNull();
    expect(says()).toBe(`Active: its own tiny circuit pushes the disc ${ACTIVE_HZ} times a second. Give it steady volts, at least ${BUZZER.active.minVolts} V, and it hums one note.`);
    expect(says()).toContain('2300 times a second');
    expect(says()).toContain('at least 2 V');
    expect(picture()).toHaveAccessibleName(`A buzzer cut open, active: its own tiny circuit pushes the disc ${ACTIVE_HZ} times a second, it hums one note`);
    expect(drawn()).toEqual(expect.arrayContaining([`${ACTIVE_HZ} Hz`, 'Its own tiny circuit']));
  });

  it('the kind is chosen from the keyboard too, and passive keeps its pitch', () => {
    const { kind, pitch, says } = setup();
    slideTo(pitch()!, 880);
    fireEvent.keyDown(kind('Passive'), { key: 'ArrowLeft' });
    expect(kind('Active')).toBeChecked();
    expect(says()).toMatch(/^Active:/);
    fireEvent.keyDown(kind('Active'), { key: 'ArrowRight' });
    expect(kind('Passive')).toBeChecked();
    expect(pitch()).toHaveAttribute('aria-valuenow', '880');
    expect(says()).toMatch(/^Passive, pushed 880 times a second/);
  });

  it('the lowest pitch: 200 pushes a second, a note between two', () => {
    const { pitch, picture, says, drawn } = setup();
    fireEvent.keyDown(pitch()!, { key: 'Home' });
    expect(pitch()).toHaveAttribute('aria-valuenow', '200');
    expect(noteName(200)).toBe('');
    expect(says()).toBe('Passive, pushed 200 times a second: the disc bends and springs back 200 times, and you hear a note between G and G♯. Push it faster and the note is higher.');
    expect(picture()).toHaveAccessibleName(/pushed from outside 200 times a second.*a note between G and G♯/);
    expect(drawn()).toEqual(expect.arrayContaining(['200 Hz', 'between G and G♯']));
  });

  it('the highest pitch: 4000 pushes a second', () => {
    const { pitch, picture, says, drawn } = setup();
    fireEvent.keyDown(pitch()!, { key: 'End' });
    expect(pitch()).toHaveAttribute('aria-valuenow', '4000');
    const note = noteName(4000).replace(/\d+$/, '');
    expect(note).toBe('B');
    expect(says()).toBe(`Passive, pushed 4000 times a second: the disc bends and springs back 4000 times, and you hear the note ${note}. That is as fast as this slider goes.`);
    expect(picture()).toHaveAccessibleName(/pushed from outside 4000 times a second/);
    expect(drawn()).toContain('4000 Hz');
  });

  it('a higher pitch: the waves in the air close up and the pushes come faster', () => {
    const { kind, pitch, waves, pushes } = setup();
    const at = (hz: number) => {
      slideTo(pitch()!, hz);
      return { waves: waves(), pushes: pushes() };
    };
    const low = at(200), a = at(440), high = at(4000);
    expect(low.waves).toBeGreaterThan(0);
    expect(a.waves).toBeGreaterThan(low.waves);
    expect(high.waves).toBeGreaterThan(a.waves);
    // the strip is a hundredth of a second: 2 pushes at 200 Hz, 40 at 4000 Hz
    expect(low.pushes).toBe(2);
    expect(a.pushes).toBeCloseTo(4.4);
    expect(high.pushes).toBe(40);

    // the active one's waves and pushes are those of its own pitch
    slideTo(pitch()!, ACTIVE_HZ);
    const same = { waves: waves(), pushes: pushes() };
    slideTo(pitch()!, 200);
    fireEvent.click(kind('Active'));
    expect({ waves: waves(), pushes: pushes() }).toEqual(same);
    expect(pushes()).toBe(ACTIVE_HZ / 100);
  });

  it('the passive one\'s pushes must swing by the simulator\'s least', () => {
    const { drawn } = setup();
    expect(BUZZER.passive.minSwing).toBe(1);
    expect(drawn()).toContain(`pushed from outside, by ${BUZZER.passive.minSwing} V or more`);
  });

  it('draws to fill its box, says what it shows, and plays no sound', () => {
    const { container, kind } = setup();
    for (const name of ['Passive', 'Active'] as const) {
      fireEvent.click(kind(name));
      const svg = container.querySelector('svg.lfig')!;
      expect(svg).toHaveAttribute('role', 'img');
      expect(svg).toHaveAttribute('viewBox');
      expect(svg).not.toHaveAttribute('width');
      expect(container.innerHTML).not.toMatch(/NaN|undefined/);
      expect(container.querySelector('input, select, audio')).toBeNull();
    }
  });
});
