import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BATTERIES, COLUMNS, LED, LED_COLORS, railHole, strips } from '../../src/lib/circuit';
import { stepE12 } from '../../src/lib/units';
import { BreadboardCircuit } from '../../src/renderer/learn/figs/breadboard-circuit';

/**
 * M8 Learn, a big idea — inside a breadboard: the current followed through a whole small circuit, a step at a time.
 * At each step the strip of metal it is in lights up: which holes that strip joins is the simulator's
 * (src/lib/circuit `strips`), on the first 17 columns of a half breadboard.
 */
const COLS = COLUMNS.mini;
const column = (hole: string) => Number(/\d+$/.exec(hole)![0]);
const shown = (hole: string) => column(hole) <= COLS;
const STRIPS = strips('half').map((s) => s.filter(shown)).filter((s) => s.length > 0);
const stripOf = (hole: string) => STRIPS.find((s) => s.includes(hole))!;
const sorted = (list: string[]) => [...list].sort();

const VOLTS = BATTERIES['4xAA']!.volts;
const OHMS = stepE12((VOLTS - LED_COLORS.red!.vf) / LED.ratedA, 1);

/** The slider's steps: the whole circuit, then the current's way round it. */
const NAMES = [
  'the whole circuit', 'out of the battery', 'along the + rail', 'down the red wire', 'through the resistor',
  'through the LED', 'up the black wire', 'back to the battery',
];
/** A hole of the strip the current is in at each step. */
const IN = ['', 'T+2', 'T+5', 'a5', 'b9', 'c11', 'T-11', 'T-2'];
const LAST = NAMES.length - 1;

function setup() {
  const { container } = render(<BreadboardCircuit />);
  const thumb = screen.getByRole('slider', { name: 'Follow the current' });
  const stage = () => Number(thumb.getAttribute('aria-valuenow'));
  return {
    container,
    thumb,
    cover: screen.getByRole('switch', { name: 'Lift the cover' }),
    picture: () => screen.getByRole('img'),
    drawn: () => [...container.querySelectorAll('svg[role="img"] text')].map((t) => t.textContent),
    /** The first hole of each strip that is marked. */
    now: () => [...container.querySelectorAll('[data-now]')].map((e) => e.getAttribute('data-now')!).sort(),
    lit: () => [...container.querySelectorAll('[data-lit]')].map((e) => e.getAttribute('data-lit')!).sort(),
    flow: () => [...container.querySelectorAll('.lf-flow')].map((e) => Number(e.getAttribute('data-flow'))),
    metal: () => container.querySelectorAll('[data-strip]').length,
    stage,
    goTo: (to: number) => {
      while (stage() < to) fireEvent.keyDown(thumb, { key: 'ArrowRight' });
      while (stage() > to) fireEvent.keyDown(thumb, { key: 'ArrowLeft' });
      expect(stage()).toBe(to);
    },
  };
}

const says = () => screen.getByRole('status').textContent ?? '';

describe('inside a breadboard: the current through a whole circuit', () => {
  it('starts with the whole circuit: the current drawn all the way round, the five strips it uses marked', () => {
    const { thumb, picture, now, lit, flow, drawn, metal } = setup();
    expect(thumb).toHaveAttribute('aria-valuenow', '0');
    expect(thumb).toHaveAttribute('aria-valuemin', '0');
    expect(thumb).toHaveAttribute('aria-valuemax', String(LAST));
    expect(thumb).toHaveAttribute('aria-valuetext', NAMES[0]);
    expect(flow()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const used = [stripOf('T+2'), stripOf('a5'), stripOf('b9'), stripOf('c11'), stripOf('T-11')];
    expect(now()).toEqual(sorted(used.map((s) => s[0]!)));
    expect(lit()).toEqual(sorted(used.flat()));
    expect(metal()).toBe(0);
    expect(OHMS).toBe(220);
    expect(says()).toBe(`The whole circuit: the current leaves the battery's +, goes down the red wire, through the ${OHMS} Ω resistor and the LED, and comes back up the black wire to the battery's −. No two parts touch each other: each is joined to the next by a strip of metal under the holes — five strips on the way. Slide to follow the current, a step at a time.`);
    expect(picture()).toHaveAccessibleName(`A small circuit on a breadboard: a ${VOLTS} V battery pack on the top rails, a red wire, a ${OHMS} Ω resistor, an LED and a black wire. The whole circuit: the current goes all the way round, through five strips of metal: the + rail, a5–e5, a9–e9, a11–e11 and the − rail. The cover is on.`);
    expect(drawn()).toEqual(expect.arrayContaining([`${VOLTS} V`, `${OHMS} Ω`, 'LED', 'The whole circuit']));
  });

  it('every step names itself, marks one strip — the simulator\'s — and draws the way so far', () => {
    const { thumb, goTo, now, lit, flow, drawn } = setup();
    for (let s = 1; s <= LAST; s++) {
      goTo(s);
      expect(thumb).toHaveAttribute('aria-valuetext', NAMES[s]);
      const strip = stripOf(IN[s]!);
      expect(now()).toEqual([strip[0]]);
      expect(lit()).toEqual(sorted(strip));
      expect(flow()).toEqual(Array.from({ length: s }, (_, i) => i + 1));
      expect(drawn()).toContain(`Step ${s} of ${LAST}`);
    }
  });

  it('the first step: out of the battery, into the + rail\'s strip', () => {
    expect(railHole(2)).toBe(true);
    const { goTo, lit, picture, drawn } = setup();
    goTo(1);
    expect(lit().every((h) => h.startsWith('T+'))).toBe(true);
    expect(lit()).toContain(`T+${COLS}`);
    expect(says()).toBe('The battery\'s red lead is pushed into hole 2 of the + rail. The current comes out of the battery\'s + and into the strip of metal under that rail.');
    expect(picture()).toHaveAccessibleName(`A small circuit on a breadboard: a ${VOLTS} V battery pack on the top rails, a red wire, a ${OHMS} Ω resistor, an LED and a black wire. Step 1 of ${LAST}, out of the battery: the current is in the strip of metal under the + rail. The cover is on.`);
    expect(drawn()).toContain('Strip of metal: the + rail');
  });

  it('the rail, then the red wire: the wire and the resistor share the strip under column 5', () => {
    const { goTo, lit, picture, drawn } = setup();
    goTo(2);
    expect(says()).toBe('Under the + rail one long strip of metal joins every hole of the rail. The current runs along it from hole 2 to hole 5, where the red wire is pushed in.');
    goTo(3);
    expect(lit()).toEqual(['a5', 'b5', 'c5', 'd5', 'e5']);
    expect(says()).toBe('The red wire brings the current from the + rail down to a5. Under a5 one strip joins a5–e5, so the resistor\'s leg in b5 is joined to the wire. They share a strip: they do not touch.');
    expect(picture()).toHaveAccessibleName(/Step 3 of 7, down the red wire: the current is in the strip of metal a5–e5\. The cover is on\.$/);
    expect(drawn()).toContain('Strip of metal: a5–e5');
  });

  it('the resistor and the LED: each hands the current on through a strip', () => {
    const { goTo, lit } = setup();
    goTo(4);
    expect(lit()).toEqual(sorted(stripOf('c9')));
    expect(lit()).not.toContain('f9');                         // the gap: the other half of the column is not joined
    expect(says()).toBe(`The current goes through the ${OHMS} Ω resistor from b5 to b9. Under b9 one strip joins a9–e9, so the LED's long leg in c9 is joined to the resistor.`);
    goTo(5);
    expect(lit()).toEqual(sorted(stripOf('a11')));
    expect(says()).toBe('The current goes through the LED from its long leg in c9 to its short leg in c11, and the LED lights. Under c11 one strip joins a11–e11, so the black wire in a11 is joined to the LED.');
  });

  it('the last steps: up the black wire, along the − rail and back to the battery', () => {
    expect(railHole(11)).toBe(true);
    const { goTo, lit, picture, thumb } = setup();
    goTo(6);
    expect(says()).toBe('The black wire takes the current from a11 up to hole 11 of the − rail. One long strip of metal joins every hole of that rail.');
    goTo(LAST);
    expect(lit()).toEqual(sorted(stripOf('T-2')));
    expect(lit().every((h) => h.startsWith('T-'))).toBe(true);
    expect(says()).toBe('The current runs along the − rail\'s strip from hole 11 to hole 2, into the battery\'s black lead and back to the battery\'s −. The loop is closed: that is why the current flows.');
    expect(picture()).toHaveAccessibleName(/Step 7 of 7, back to the battery: the current is in the strip of metal under the − rail\. The cover is on\.$/);
    fireEvent.keyDown(thumb, { key: 'ArrowRight' });          // no step after the last
    expect(thumb).toHaveAttribute('aria-valuenow', String(LAST));
    fireEvent.keyDown(thumb, { key: 'Home' });
    expect(thumb).toHaveAttribute('aria-valuetext', NAMES[0]);
  });

  it('lift the cover: every strip of metal shows, the current\'s stays marked', () => {
    const { cover, metal, goTo, lit, picture, now } = setup();
    expect(cover).toHaveAttribute('aria-checked', 'false');
    goTo(3);
    fireEvent.keyDown(cover, { key: ' ' });
    expect(cover).toHaveAttribute('aria-checked', 'true');
    expect(metal()).toBe(STRIPS.length);
    expect(STRIPS.length).toBe(2 * COLS + 4);
    expect(now()).toEqual(['a5']);
    expect(lit()).toEqual(['a5', 'b5', 'c5', 'd5', 'e5']);
    expect(picture()).toHaveAccessibleName(/the current is in the strip of metal a5–e5\. The cover is lifted: the strips of metal under the holes show\.$/);
    expect(says()).toMatch(/They share a strip: they do not touch\. With the cover lifted you see the strips: a short one under each half of a column, a long one under each rail\.$/);
    goTo(LAST);                                               // the cover stays lifted from step to step
    expect(metal()).toBe(STRIPS.length);
    goTo(0);
    expect(metal()).toBe(STRIPS.length);
    expect(picture()).toHaveAccessibleName(/The cover is lifted: the strips of metal under the holes show\.$/);
    fireEvent.keyDown(cover, { key: 'Enter' });
    expect(metal()).toBe(0);
    expect(picture()).toHaveAccessibleName(/The cover is on\.$/);
  });

  it('draws to fill its box, and says nothing broken', () => {
    const { container, goTo } = setup();
    const svg = container.querySelector('svg.lfig')!;
    expect(svg).toHaveAttribute('viewBox');
    expect(svg).not.toHaveAttribute('width');
    for (let s = 0; s <= LAST; s++) {
      goTo(s);
      expect(container.innerHTML).not.toMatch(/NaN|undefined/);
    }
    expect(container.querySelector('input, select')).toBeNull();
  });
});
