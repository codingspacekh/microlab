import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { COLUMNS, holes, railHole, strips } from '../../src/lib/circuit';
import { BreadboardInside } from '../../src/renderer/learn/figs/breadboard';

/**
 * M8 Learn, the breadboard's picture to play with: push a wire into any hole and the holes joined to it light up;
 * lift the cover and every strip of metal shows. Which holes are joined is the simulator's (src/lib/circuit
 * `strips`): the picture is the first 17 columns of a half breadboard.
 */
const COLS = COLUMNS.mini;
const column = (hole: string) => Number(/\d+$/.exec(hole)![0]);
const shown = (hole: string) => column(hole) <= COLS;
const STRIPS = strips('half').map((s) => s.filter(shown)).filter((s) => s.length > 0);
const stripOf = (hole: string) => STRIPS.find((s) => s.includes(hole))!;

function setup() {
  const { container } = render(<BreadboardInside />);
  return {
    container,
    row: screen.getByRole('slider', { name: 'Row' }),
    col: screen.getByRole('slider', { name: 'Column' }),
    cover: screen.getByRole('switch', { name: 'Lift the cover' }),
    picture: () => screen.getByRole('img'),
    lit: () => [...container.querySelectorAll('[data-lit]')].map((e) => e.getAttribute('data-lit')!).sort(),
    chosen: () => container.querySelector('[data-wire]')?.getAttribute('data-wire'),
    metal: () => container.querySelectorAll('[data-strip]').length,
    push: (hole: string) => fireEvent.click(container.querySelector(`[data-hole="${hole}"]`)!),
  };
}

const says = () => screen.getByRole('status').textContent ?? '';

/** Moves a kit slider to the value whose text is `text`, from the keyboard. */
function slideToText(thumb: HTMLElement, text: string) {
  fireEvent.keyDown(thumb, { key: 'Home' });
  const max = Number(thumb.getAttribute('aria-valuemax'));
  while (thumb.getAttribute('aria-valuetext') !== text && Number(thumb.getAttribute('aria-valuenow')) < max) {
    fireEvent.keyDown(thumb, { key: 'ArrowRight' });
  }
  expect(thumb).toHaveAttribute('aria-valuetext', text);
}

describe('the breadboard, looked inside', () => {
  it('starts with a wire in c5: its four neighbours light up, and the gap cuts it off from f5–j5', () => {
    const { picture, lit, chosen, col, row } = setup();
    expect(chosen()).toBe('c5');
    expect(lit()).toEqual([...stripOf('c5')].sort());
    expect(lit()).toEqual(['a5', 'b5', 'c5', 'd5', 'e5']);
    expect(says()).toBe('c5 is joined to a5, b5, d5 and e5 — five holes, one piece of metal. The gap in the middle cuts it off from f5–j5.');
    expect(picture()).toHaveAccessibleName('A breadboard: a wire is pushed into c5; one strip of metal joins it to a5, b5, d5 and e5. The cover is on.');
    expect(col).toHaveAttribute('aria-valuetext', '5');
    expect(col).toHaveAttribute('aria-valuemax', String(COLS));
    expect(row).toHaveAttribute('aria-valuetext', 'c');
  });

  it('a click on a hole pushes the wire in there', () => {
    const { push, lit, chosen, picture, row, col } = setup();
    push('h9');
    expect(chosen()).toBe('h9');
    expect(lit()).toEqual([...stripOf('h9')].sort());
    expect(says()).toBe('h9 is joined to f9, g9, i9 and j9 — five holes, one piece of metal. The gap in the middle cuts it off from a9–e9.');
    expect(picture()).toHaveAccessibleName(/a wire is pushed into h9; one strip of metal joins it to f9, g9, i9 and j9/);
    expect(row).toHaveAttribute('aria-valuetext', 'h');
    expect(col).toHaveAttribute('aria-valuetext', '9');
  });

  it('every hole can be clicked, and lights the simulator\'s strip — never a hole of another one', () => {
    const { container, push, lit } = setup();
    const all = holes('half').filter(shown);
    expect(container.querySelectorAll('[data-hole]')).toHaveLength(all.length);
    for (const hole of all) {
      push(hole);
      expect(lit()).toEqual([...stripOf(hole)].sort());
    }
  });

  it('from the keyboard: the row and the column are chosen with the sliders', () => {
    const { row, col, lit, chosen } = setup();
    slideToText(col, '12');
    expect(chosen()).toBe('c12');
    slideToText(row, 'j');
    expect(chosen()).toBe('j12');
    expect(lit()).toEqual(['f12', 'g12', 'h12', 'i12', 'j12']);
    expect(says()).toMatch(/^j12 is joined to f12, g12, h12 and i12/);
    expect(says()).toMatch(/cuts it off from a12–e12\.$/);
  });

  it('the gap: e and f of one column are not joined', () => {
    const { push, lit } = setup();
    push('e3');
    expect(lit()).not.toContain('f3');
    push('f3');
    expect(lit()).not.toContain('e3');
    expect(stripOf('e3')).not.toBe(stripOf('f3'));
  });

  it('a rail hole is joined all the way along, and not to the other rail', () => {
    const { push, lit, picture, row } = setup();
    push('T+3');
    const rail = stripOf('T+3');
    expect(rail).toContain(`T+${COLS}`);
    expect(lit()).toEqual([...rail].sort());
    expect(lit().every((h) => h.startsWith('T+'))).toBe(true);
    expect(says()).toBe('Hole 3 of the top + rail is joined to every other hole of that rail: one long strip of metal, all the way along. It is not joined to the − rail beside it, nor to the columns.');
    expect(picture()).toHaveAccessibleName('A breadboard: a wire is pushed into hole 3 of the top + rail; one long strip of metal joins it to every hole of that rail, all the way along. The cover is on.');
    expect(row).toHaveAttribute('aria-valuetext', 'top +');

    push('B-17');
    expect(lit()).toEqual([...stripOf('B-17')].sort());
    expect(says()).toMatch(/^Hole 17 of the bottom − rail is joined to every other hole of that rail/);
    expect(says()).toMatch(/not joined to the \+ rail beside it/);
  });

  it('where a rail has no hole the picture says so, and nothing lights up', () => {
    expect(railHole(6)).toBe(false);
    const { row, col, lit, chosen, picture } = setup();
    slideToText(row, 'top −');
    slideToText(col, '6');
    expect(chosen()).toBeUndefined();
    expect(lit()).toEqual([]);
    expect(says()).toBe('There is no hole in column 6 of the top − rail: a rail\'s holes come in groups of five. The strip of metal runs on under the space — move one column along.');
    expect(picture()).toHaveAccessibleName(/there is no hole in column 6 of the top − rail/);
    slideToText(col, '7');
    expect(chosen()).toBe('T-7');
    expect(lit()).toEqual([...stripOf('T-7')].sort());
  });

  it('lift the cover: every strip of metal shows — two for each column and the four rails', () => {
    const { cover, metal, picture, lit } = setup();
    expect(cover).toHaveAttribute('aria-checked', 'false');
    expect(metal()).toBe(0);
    fireEvent.keyDown(cover, { key: ' ' });
    expect(cover).toHaveAttribute('aria-checked', 'true');
    expect(metal()).toBe(STRIPS.length);
    expect(STRIPS.length).toBe(2 * COLS + 4);
    expect(picture()).toHaveAccessibleName(`A breadboard: a wire is pushed into c5; one strip of metal joins it to a5, b5, d5 and e5. The cover is lifted: ${2 * COLS} short strips of five holes, cut in two by the gap in the middle, and 4 long rails along the edges.`);
    expect(says()).toMatch(/With the cover lifted you see every strip: the short ones under the columns, the long ones under the rails\.$/);
    expect(lit()).toEqual(['a5', 'b5', 'c5', 'd5', 'e5']);          // the chosen strip stays marked
    fireEvent.keyDown(cover, { key: 'Enter' });
    expect(metal()).toBe(0);
    expect(picture()).toHaveAccessibleName(/The cover is on\.$/);
  });

  it('draws to fill its box, and says nothing broken', () => {
    const { container } = setup();
    const svg = container.querySelector('svg.lfig')!;
    expect(svg).toHaveAttribute('viewBox');
    expect(svg).not.toHaveAttribute('width');
    expect(container.innerHTML).not.toMatch(/NaN|undefined/);
    expect(container.querySelector('input, select')).toBeNull();
  });
});
