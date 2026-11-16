import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MODELS } from '@lib/circuit';
import { ButtonInside } from '../../src/renderer/learn/figs/button';

/**
 * M8 Learn's picture of the push button, cut open: holding it brings the dome down on the two contacts and closes the
 * loop, letting go springs it back; the legs it joins are the ones the simulator's model joins.
 */

const says = () => screen.getByRole('status').textContent ?? '';

function setup() {
  const { container } = render(<ButtonInside />);
  const svg = () => container.querySelector('svg.lfig')!;
  return {
    container,
    svg,
    picture: () => screen.getByRole('img', { name: /push button cut open/ }),
    button: screen.getByRole('button', { name: 'Press the button' }),
    drawing: () => container.querySelector('svg.lfig .lf-knob')!,
    /** The groups of legs joined now, as the picture says: "1a+1b 2a+2b". */
    joined: () => svg().getAttribute('data-joined'),
    led: () => container.querySelector('[data-led]')!.getAttribute('data-led'),
    flows: () => container.querySelectorAll('svg.lfig .lf-flow').length,
  };
}

/** What the simulator's model joins: its pairs always, and the two legs of its switch while pressed. */
function model() {
  const button = MODELS.button!;
  const pairs = (button.internal ?? []).map((pair) => [...pair]);
  const switches = button.devices({ id: 'b', leg: (name) => name, props: {} }).filter((d) => d.kind === 'switch');
  return { legs: button.legs, pairs, switches };
}

/** The picture's groups, as sets of legs. */
const groups = (joined: string | null) => (joined ?? '').split(' ').map((g) => g.split('+').sort());

describe('the push button, cut open', () => {
  it('starts let go: the dome is up, there is a gap, the LED is dark', () => {
    const { picture, button, led, flows, svg } = setup();
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveAttribute('type', 'button');
    expect(picture()).toHaveAccessibleName(/not pressed, the dome is up, there is a gap between the two contacts and the LED is dark/);
    expect(says()).toMatch(/^Let go: the dome springs up\. There is a gap, so no current flows\./);
    expect(led()).toBe('off');
    expect(flows()).toBe(0);
    expect(svg()).toHaveAttribute('data-pressed', 'false');
  });

  it('held with the pointer on the button it is pressed; let go, it springs back', () => {
    const { picture, button, led, flows } = setup();
    fireEvent.pointerDown(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(picture()).toHaveAccessibleName(/: pressed, the dome touches both contacts, the loop is closed and the LED is lit/);
    expect(says()).toBe('Pressed: the dome touches both contacts, the loop is closed and the current flows.');
    expect(led()).toBe('on');
    expect(flows()).toBeGreaterThan(0);

    fireEvent.pointerUp(button);
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(picture()).toHaveAccessibleName(/not pressed/);
    expect(says()).toMatch(/^Let go: the dome springs up/);
    expect(led()).toBe('off');
    expect(flows()).toBe(0);
  });

  it.each([' ', 'Enter'])('held with the key "%s" it is pressed; let go, it springs back', (key) => {
    const { button, led } = setup();
    fireEvent.keyDown(button, { key });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(says()).toMatch(/^Pressed:/);
    expect(led()).toBe('on');
    fireEvent.keyDown(button, { key, repeat: true });       // the key repeating while held changes nothing
    expect(led()).toBe('on');
    fireEvent.keyUp(button, { key });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(says()).toMatch(/^Let go:/);
    expect(led()).toBe('off');
  });

  it('another key does not press it', () => {
    const { button, led } = setup();
    fireEvent.keyDown(button, { key: 'a' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(led()).toBe('off');
  });

  it('held on the drawing itself it is pressed; let go, or slid off it, it springs back', () => {
    const { drawing, button, picture, led } = setup();
    fireEvent.pointerDown(drawing());
    expect(picture()).toHaveAccessibleName(/: pressed,/);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(led()).toBe('on');
    fireEvent.pointerUp(drawing());
    expect(picture()).toHaveAccessibleName(/not pressed/);
    expect(led()).toBe('off');

    fireEvent.pointerDown(drawing());
    expect(led()).toBe('on');
    fireEvent.pointerLeave(drawing());
    expect(led()).toBe('off');

    fireEvent.pointerDown(drawing());
    fireEvent.pointerCancel(drawing());
    expect(led()).toBe('off');
  });

  it('springs back when the button loses the keyboard while held', () => {
    const { button, led } = setup();
    fireEvent.keyDown(button, { key: ' ' });
    expect(led()).toBe('on');
    fireEvent.blur(button);
    expect(led()).toBe('off');
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('the model: four legs in two pairs joined inside, and one switch closed while pressed, from one pair to the other', () => {
    const { legs, pairs, switches } = model();
    expect(legs).toEqual(['1a', '1b', '2a', '2b']);
    expect(pairs).toEqual([['1a', '1b'], ['2a', '2b']]);
    expect(switches).toHaveLength(1);
    expect(switches[0]).toMatchObject({ a: '1a', b: '2a', closedWhen: 'pressed' });
  });

  it('let go, the legs joined are the model\'s pairs; pressed, the model\'s switch joins the two pairs', () => {
    const { pairs, switches, legs } = model();
    const { joined, button } = setup();
    expect(groups(joined())).toEqual(pairs.map((p) => [...p].sort()));

    fireEvent.pointerDown(button);
    const sw = switches[0]!;
    const merged = pairs.filter((p) => p.includes(sw.a) || p.includes(sw.b)).flat().sort();
    const rest = pairs.filter((p) => !p.includes(sw.a) && !p.includes(sw.b)).map((p) => [...p].sort());
    expect(groups(joined())).toEqual([merged, ...rest]);
    expect(groups(joined())).toEqual([[...legs].sort()]);    // all four are one piece of metal now

    fireEvent.pointerUp(button);
    expect(groups(joined())).toEqual(pairs.map((p) => [...p].sort()));
  });

  it('names the legs as the model does, in the drawing and in what it says of itself', () => {
    const { container, picture } = setup();
    const drawn = [...container.querySelectorAll('svg.lfig text')].map((t) => t.textContent);
    for (const leg of MODELS.button!.legs) expect(drawn).toContain(leg);
    expect(picture()).toHaveAccessibleName(/Legs 1a and 1b are always joined, and so are legs 2a and 2b; the two pairs join only while it is pressed/);
  });

  it('the view from above shows the pairs joined always, and the two pairs joined only while pressed', () => {
    const { container, button } = setup();
    const always = () => [...container.querySelectorAll('[data-always]')].map((e) => e.getAttribute('data-always'));
    const across = () => container.querySelector('[data-when-pressed]')!;
    expect(always()).toEqual(['1a+1b', '2a+2b']);
    expect(across()).toHaveAttribute('data-when-pressed', 'open');
    fireEvent.pointerDown(button);
    expect(always()).toEqual(['1a+1b', '2a+2b']);
    expect(across()).toHaveAttribute('data-when-pressed', 'closed');
  });

  it('draws to fill its box, says what it shows, and uses only the app\'s own controls', () => {
    const { container, svg, button } = setup();
    expect(svg()).toHaveAttribute('role', 'img');
    expect(svg()).toHaveAttribute('viewBox');
    expect(svg()).not.toHaveAttribute('width');
    expect(button).toHaveClass('btn');
    expect(container.querySelector('input, select')).toBeNull();
    fireEvent.pointerDown(button);
    expect(container.innerHTML).not.toMatch(/NaN|undefined/);
  });
});
