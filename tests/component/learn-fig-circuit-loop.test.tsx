import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BATTERIES, LED, LED_COLORS } from '@lib/circuit';
import { stepE12 } from '@lib/units';
import { CircuitLoop } from '../../src/renderer/learn/figs/circuit-loop';

/**
 * M8 Learn, the big idea's picture to play with: a circuit is a loop — open it anywhere and everything stops. A
 * battery, switch A, a resistor, an LED, switch B and a wire that can be pulled out, all in one loop. The numbers are
 * the simulator's: two cells' volts, a red LED's, and the common resistor (E12) for about 15 mA.
 */
const VOLTS = BATTERIES['2xAA']!.volts;
const PUSH = VOLTS - LED_COLORS.red!.vf;
const OHMS = stepE12(PUSH / (LED.ratedA * 0.75), 1);
const MA = String(Number(((PUSH / OHMS) * 1000).toFixed(1)));

type Break = 'a' | 'b' | 'wire';
const BREAKS: Break[] = ['a', 'b', 'wire'];
const CONTROL: Record<Break, string> = { a: 'Switch A closed', b: 'Switch B closed', wire: 'The wire is in' };
const OPEN: Record<Break, string> = { a: 'Switch A is open.', b: 'Switch B is open.', wire: 'The wire is pulled out.' };
const STOPS = 'There is a gap in the loop, so the current stops everywhere — not just after the gap. The LED is dark.';

function setup() {
  const { container, unmount } = render(<CircuitLoop />);
  const svg = () => container.querySelector('svg.lfig')!;
  return {
    container,
    unmount,
    control: (which: Break) => screen.getByRole('switch', { name: CONTROL[which] }),
    /** The break as it is drawn: click it to open or close it. */
    drawnBreak: (which: Break) => container.querySelector(`svg.lfig [data-break="${which}"]`)!,
    picture: () => screen.getByRole('img'),
    says: () => screen.getByRole('status').textContent ?? '',
    drawn: () => [...container.querySelectorAll('svg[role="img"] text')].map((t) => t.textContent),
    loop: () => svg().getAttribute('data-loop'),
    led: () => container.querySelector('[data-led]')!.getAttribute('data-led'),
    flow: () => container.querySelectorAll('.lf-flow').length,
    /** Which breaks are drawn open. */
    open: () => BREAKS.filter((b) => container.querySelector(`[data-break="${b}"]`)!.getAttribute('data-open') === 'true'),
  };
}

describe('a circuit is a loop', () => {
  it('the numbers are the simulator\'s: 3 V, a red LED\'s 2 V, 68 Ω — 14.7 mA', () => {
    expect(VOLTS).toBe(3);
    expect(OHMS).toBe(68);
    expect(MA).toBe('14.7');
    expect(PUSH / OHMS).toBeLessThanOrEqual(LED.ratedA);
  });

  it('starts closed all the way round: the current is drawn all round and the LED is lit', () => {
    const { control, picture, says, drawn, loop, led, flow, open } = setup();
    for (const b of BREAKS) expect(control(b)).toHaveAttribute('aria-checked', 'true');
    expect(loop()).toBe('closed');
    expect(open()).toEqual([]);
    expect(led()).toBe('on');
    expect(flow()).toBeGreaterThan(0);
    expect(says()).toBe(`The loop is closed all the way round: the current flows — ${MA} mA — and the LED is lit.`);
    expect(picture()).toHaveAccessibleName(
      `A loop of wire: a battery of ${VOLTS} V, switch A closed, a resistor of ${OHMS} Ω, an LED, switch B closed, and a wire pushed in, back to the battery. `
      + `The loop is closed all the way round: ${MA} mA flows and the LED is lit.`,
    );
    expect(drawn()).toEqual(expect.arrayContaining([`${MA} mA`, `${VOLTS} V`, `${OHMS} Ω`, 'Switch A', 'Switch B', 'LED']));
  });

  it.each(BREAKS)('one break (%s) open: no current is drawn anywhere — not even up to the gap — and the LED is dark', (which) => {
    const { control, picture, says, drawn, loop, led, flow, open } = setup();
    fireEvent.click(control(which));
    expect(control(which)).toHaveAttribute('aria-checked', 'false');
    for (const other of BREAKS.filter((b) => b !== which)) expect(control(other)).toHaveAttribute('aria-checked', 'true');
    expect(loop()).toBe('open');
    expect(open()).toEqual([which]);
    expect(led()).toBe('off');
    expect(flow()).toBe(0);
    expect(says()).toBe(`${OPEN[which]} ${STOPS}`);
    expect(picture()).toHaveAccessibleName(/The loop has a gap: no current flows anywhere and the LED is dark\.$/);
    expect(picture()).toHaveAccessibleName(which === 'wire' ? /a wire pulled out/ : new RegExp(`switch ${which.toUpperCase()} open`));
    expect(drawn()).toContain('0 mA');
    expect(drawn()).not.toContain(`${MA} mA`);

    fireEvent.click(control(which));                                 // closed again: it all comes back
    expect(loop()).toBe('closed');
    expect(led()).toBe('on');
    expect(flow()).toBeGreaterThan(0);
    expect(says()).toMatch(/^The loop is closed all the way round/);
  });

  it.each(BREAKS)('clicking the break (%s) in the drawing opens and closes it, and its control follows', (which) => {
    const { control, drawnBreak, loop, led, flow, open } = setup();
    fireEvent.click(drawnBreak(which));
    expect(control(which)).toHaveAttribute('aria-checked', 'false');
    expect(open()).toEqual([which]);
    expect(loop()).toBe('open');
    expect(led()).toBe('off');
    expect(flow()).toBe(0);
    fireEvent.click(drawnBreak(which));
    expect(control(which)).toHaveAttribute('aria-checked', 'true');
    expect(open()).toEqual([]);
    expect(loop()).toBe('closed');
    expect(led()).toBe('on');
  });

  it('the keyboard opens and closes a break', () => {
    const { control, loop } = setup();
    expect(control('b')).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(control('b'), { key: ' ' });
    expect(control('b')).toHaveAttribute('aria-checked', 'false');
    expect(loop()).toBe('open');
    fireEvent.keyDown(control('b'), { key: 'Enter' });
    expect(loop()).toBe('closed');
  });

  it('two gaps: closing one of them is not enough', () => {
    const { control, says, loop, led, flow, open } = setup();
    fireEvent.click(control('a'));
    fireEvent.click(control('wire'));
    expect(open()).toEqual(['a', 'wire']);
    expect(says()).toBe('Switch A is open and the wire is pulled out. There are 2 gaps in the loop. One gap is enough to stop the current everywhere: close every gap to light the LED.');
    expect(flow()).toBe(0);
    fireEvent.click(control('a'));                                   // one gap left
    expect(loop()).toBe('open');
    expect(led()).toBe('off');
    expect(flow()).toBe(0);
    expect(says()).toBe(`${OPEN.wire} ${STOPS}`);
    fireEvent.click(control('wire'));
    expect(loop()).toBe('closed');
    expect(led()).toBe('on');
  });

  it('both switches open, then all three', () => {
    const { control, says, picture, loop, led, flow, open } = setup();
    fireEvent.click(control('a'));
    fireEvent.click(control('b'));
    expect(says()).toMatch(/^Switch A and switch B are open\. There are 2 gaps in the loop\./);
    fireEvent.click(control('wire'));
    expect(open()).toEqual(BREAKS);
    expect(says()).toBe('Switch A and switch B are open and the wire is pulled out. There are 3 gaps in the loop. One gap is enough to stop the current everywhere: close every gap to light the LED.');
    expect(picture()).toHaveAccessibleName(/switch A open, .* switch B open, and a wire pulled out, .* The loop has 3 gaps: no current flows anywhere and the LED is dark\.$/);
    expect(loop()).toBe('open');
    expect(led()).toBe('off');
    expect(flow()).toBe(0);
  });

  it('every one of the eight ways: the current is drawn only when nothing is open', () => {
    for (let mask = 0; mask < 8; mask++) {
      const { control, loop, led, flow, drawn, unmount } = setup();
      BREAKS.forEach((b, i) => { if (mask & (1 << i)) fireEvent.click(control(b)); });
      const closed = mask === 0;
      expect(loop()).toBe(closed ? 'closed' : 'open');
      expect(led()).toBe(closed ? 'on' : 'off');
      expect(flow() > 0).toBe(closed);
      expect(drawn()).toContain(closed ? `${MA} mA` : '0 mA');
      unmount();
    }
  });

  it('draws to fill its box, and says nothing broken', () => {
    const { container, control } = setup();
    const svg = container.querySelector('svg.lfig')!;
    expect(svg).toHaveAttribute('viewBox');
    expect(svg).not.toHaveAttribute('width');
    expect(container.innerHTML).not.toMatch(/NaN|undefined/);
    for (const b of BREAKS) fireEvent.click(control(b));
    expect(container.innerHTML).not.toMatch(/NaN|undefined/);
    expect(container.querySelector('input, select')).toBeNull();
  });
});
