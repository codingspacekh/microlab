import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LED } from '@lib/circuit';
import { WaterLoop } from '../../src/renderer/learn/figs/water';

/**
 * M8 Learn, the big idea's picture to play with: voltage, current and resistance as water going round a loop of pipe.
 * Push (voltage) and Narrowing (resistance) are slid; the flow is the push over the holding back (Ohm's law), in mA,
 * and the pump, the narrow place and the flow are drawn to follow. What an LED can take is the simulator's.
 */
const mA = (volts: number, ohms: number) => String(Number(((volts / ohms) * 1000).toFixed(1)));
const SAME = 'The flow is the same all the way round the loop — what goes in comes back.';

function setup() {
  const { container, unmount } = render(<WaterLoop />);
  const svg = () => container.querySelector('svg.lfig')!;
  const hook = (name: string) => Number(svg().getAttribute(name));
  return {
    container,
    unmount,
    push: screen.getByRole('slider', { name: 'Push (voltage)' }),
    narrowing: screen.getByRole('slider', { name: 'Narrowing (resistance)' }),
    picture: () => screen.getByRole('img'),
    says: () => screen.getByRole('status').textContent ?? '',
    drawn: () => [...container.querySelectorAll('svg[role="img"] text')].map((t) => t.textContent),
    /** How long the pump's push is drawn, how wide the narrow place is left, how thick the flow is. */
    pushDrawn: () => hook('data-push'),
    gap: () => hook('data-gap'),
    flow: () => hook('data-flow'),
    flowParts: () => [...container.querySelectorAll('[data-part="flow"]')],
  };
}

const key = (thumb: HTMLElement, name: string, times = 1) => {
  for (let i = 0; i < times; i++) fireEvent.keyDown(thumb, { key: name });
};

describe('voltage, current and resistance as water in a loop', () => {
  it('starts as approved: 3 V pushing through 150 Ω — 20 mA', () => {
    const { push, narrowing, picture, says, drawn } = setup();
    expect(push).toHaveAttribute('aria-valuenow', '3');
    expect(push).toHaveAttribute('aria-valuemin', '1');
    expect(push).toHaveAttribute('aria-valuemax', '9');
    expect(push).toHaveAttribute('aria-valuetext', '3 V');
    expect(narrowing).toHaveAttribute('aria-valuenow', '150');
    expect(narrowing).toHaveAttribute('aria-valuemin', '50');
    expect(narrowing).toHaveAttribute('aria-valuemax', '1000');
    expect(narrowing).toHaveAttribute('aria-valuetext', '150 Ω');
    expect(mA(3, 150)).toBe('20');
    expect(says()).toBe(`Flow (current): 20 mA. Push harder and more flows. Narrow the pipe and less flows. ${SAME}`);
    expect(picture()).toHaveAccessibleName(
      'Water going round a loop of pipe: the pump pushes with 3 V, the narrow place holds back with 150 Ω, so 20 mA flows, the same all the way round. '
      + 'Under it the same loop as a circuit: a battery of 3 V and a resistor of 150 Ω.',
    );
    expect(drawn()).toEqual(expect.arrayContaining(['20 mA', '3 V', '150 Ω', 'The pump: voltage', 'The narrow pipe: resistance', 'The flow: current']));
  });

  it('push harder: the pump is drawn pushing harder and more flows, half a volt at a time', () => {
    const { push, says, drawn, pushDrawn, flow, gap } = setup();
    const before = { push: pushDrawn(), flow: flow(), gap: gap() };
    key(push, 'ArrowRight');
    expect(push).toHaveAttribute('aria-valuetext', '3.5 V');
    expect(mA(3.5, 150)).toBe('23.3');
    expect(says()).toMatch(/^Flow \(current\): 23\.3 mA\. Push harder and more flows\./);
    expect(drawn()).toEqual(expect.arrayContaining(['23.3 mA', '3.5 V']));
    expect(pushDrawn()).toBeGreaterThan(before.push);
    expect(flow()).toBeGreaterThan(before.flow);
    expect(gap()).toBe(before.gap);                                  // the pipe is as narrow as it was
  });

  it('narrow the pipe: the narrow place is drawn narrower and less flows', () => {
    const { narrowing, says, drawn, pushDrawn, flow, gap, picture } = setup();
    const before = { push: pushDrawn(), flow: flow(), gap: gap() };
    key(narrowing, 'PageUp', 3);
    expect(narrowing).toHaveAttribute('aria-valuetext', '450 Ω');
    expect(mA(3, 450)).toBe('6.7');
    expect(says()).toBe(`Flow (current): 6.7 mA. Push harder and more flows. Narrow the pipe and less flows. ${SAME}`);
    expect(picture()).toHaveAccessibleName(/the narrow place holds back with 450 Ω, so 6\.7 mA flows/);
    expect(drawn()).toEqual(expect.arrayContaining(['6.7 mA', '450 Ω']));
    expect(gap()).toBeLessThan(before.gap);
    expect(flow()).toBeLessThan(before.flow);
    expect(pushDrawn()).toBe(before.push);                           // the pump pushes as it did
  });

  it('more than an LED can take is said so — from just past its most, not at it', () => {
    const { push, narrowing, says } = setup();
    key(push, 'PageDown', 2);                                        // 3 V → 1 V … Home is the same
    key(push, 'Home');
    key(narrowing, 'Home');
    key(push, 'ArrowRight');                                         // 1.5 V over 50 Ω: 30 mA, just what it can take
    expect(1.5 / 50).toBeLessThanOrEqual(LED.maxA);
    expect(says()).toBe(`Flow (current): 30 mA. Push harder and more flows. Narrow the pipe and less flows. ${SAME}`);
    key(push, 'ArrowRight');                                         // 2 V over 50 Ω: 40 mA
    expect(2 / 50).toBeGreaterThan(LED.maxA);
    expect(says()).toBe(`Flow (current): 40 mA. That is more than an LED can take: ${LED.maxA * 1000} mA at most. Push less or narrow the pipe and less flows. ${SAME}`);
  });

  it('the most push through the widest pipe: 9 V over 50 Ω — 180 mA, the most of everything', () => {
    const { push, narrowing, says, drawn, pushDrawn, flow, gap, picture } = setup();
    const before = { push: pushDrawn(), flow: flow(), gap: gap() };
    key(push, 'End');
    key(narrowing, 'Home');
    expect(push).toHaveAttribute('aria-valuetext', '9 V');
    expect(narrowing).toHaveAttribute('aria-valuetext', '50 Ω');
    expect(mA(9, 50)).toBe('180');
    expect(says()).toMatch(/^Flow \(current\): 180 mA\. That is more than an LED can take/);
    expect(picture()).toHaveAccessibleName(/the pump pushes with 9 V, the narrow place holds back with 50 Ω, so 180 mA flows/);
    expect(drawn()).toEqual(expect.arrayContaining(['180 mA', '9 V', '50 Ω']));
    expect(pushDrawn()).toBeGreaterThan(before.push);
    expect(gap()).toBeGreaterThan(before.gap);
    expect(flow()).toBeGreaterThan(before.flow);
    key(push, 'ArrowRight');                                         // no further
    key(narrowing, 'ArrowLeft');
    expect(push).toHaveAttribute('aria-valuetext', '9 V');
    expect(narrowing).toHaveAttribute('aria-valuetext', '50 Ω');
  });

  it('the least push through the narrowest pipe: 1 V over 1000 Ω — 1 mA, still drawn flowing', () => {
    const { push, narrowing, says, drawn, pushDrawn, flow, gap, flowParts } = setup();
    const before = { push: pushDrawn(), flow: flow(), gap: gap() };
    key(push, 'Home');
    key(narrowing, 'End');
    expect(push).toHaveAttribute('aria-valuetext', '1 V');
    expect(narrowing).toHaveAttribute('aria-valuetext', '1000 Ω');
    expect(mA(1, 1000)).toBe('1');
    expect(says()).toBe(`Flow (current): 1 mA. Push harder and more flows. Narrow the pipe and less flows. ${SAME}`);
    expect(drawn()).toEqual(expect.arrayContaining(['1 mA', '1 V', '1000 Ω']));
    expect(pushDrawn()).toBeLessThan(before.push);
    expect(pushDrawn()).toBeGreaterThan(0);
    expect(gap()).toBeLessThan(before.gap);
    expect(gap()).toBeGreaterThan(0);
    expect(flow()).toBeLessThan(before.flow);
    expect(flow()).toBeGreaterThan(0);
    expect(flowParts().length).toBeGreaterThan(0);
  });

  it('the flow is drawn the same all the way round — and in the circuit under it', () => {
    const { push, flowParts, flow } = setup();
    key(push, 'ArrowRight', 4);
    const widths = flowParts().map((p) => Number(p.getAttribute('stroke-width')));
    expect(widths.length).toBeGreaterThanOrEqual(2);                 // the pipe's, the circuit's
    for (const w of widths) expect(w).toBe(flow());
  });

  it('at every push the flow is the push over the holding back', () => {
    for (const ohms of [50, 150, 1000]) {
      const { push, narrowing, says, drawn, flow, unmount } = setup();
      key(push, 'Home');
      key(narrowing, 'Home');
      while (Number(narrowing.getAttribute('aria-valuenow')) < ohms) key(narrowing, 'ArrowRight');
      expect(narrowing).toHaveAttribute('aria-valuenow', String(ohms));
      let last = 0;
      for (let volts = 1; volts <= 9; volts += 0.5) {
        expect(push).toHaveAttribute('aria-valuenow', String(volts));
        expect(says()).toContain(`Flow (current): ${mA(volts, ohms)} mA. `);
        expect(says()).toMatch(volts / ohms > LED.maxA ? /more than an LED can take/ : /Push harder and more flows/);
        expect(drawn()).toContain(`${mA(volts, ohms)} mA`);
        expect(flow()).toBeGreaterThan(last);
        last = flow();
        key(push, 'ArrowRight');
      }
      unmount();
    }
  });

  it('draws to fill its box, and says nothing broken', () => {
    const { container, push, narrowing } = setup();
    const svg = container.querySelector('svg.lfig')!;
    expect(svg).toHaveAttribute('viewBox');
    expect(svg).not.toHaveAttribute('width');
    for (const [a, b] of [['Home', 'Home'], ['Home', 'End'], ['End', 'Home'], ['End', 'End']] as const) {
      key(push, a);
      key(narrowing, b);
      expect(container.innerHTML).not.toMatch(/NaN|undefined|Infinity/);
    }
    expect(container.querySelector('input, select')).toBeNull();
    expect(push).toHaveAttribute('tabindex', '0');
    expect(narrowing).toHaveAttribute('tabindex', '0');
  });
});
