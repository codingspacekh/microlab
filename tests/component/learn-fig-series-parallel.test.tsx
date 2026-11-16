import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BATTERIES } from '../../src/lib/circuit';
import { LAMP_OHMS, SeriesParallel } from '../../src/renderer/learn/figs/series-parallel';

/**
 * M8 Learn, a big idea — series and parallel: two lamps one after the other, then side by side; take one out of its
 * holder. The battery's volts are the simulator's (src/lib/circuit, a pack of four cells); a lamp is a plain
 * resistance (the picture's own constant), and the rest is Ohm's law, worked out here again.
 */
const VOLTS = BATTERIES['4xAA']!.volts;
const n = (value: number) => String(Number(value.toFixed(1)));
const mA = (amps: number) => n(amps * 1000);
/** One lamp alone on the battery. */
const ALONE = VOLTS / LAMP_OHMS;
const WATTS_ALONE = VOLTS * ALONE;

function setup() {
  const { container } = render(<SeriesParallel />);
  const lamp = (k: 1 | 2) => container.querySelector(`[data-lamp="${k}"]`)!;
  return {
    container,
    series: screen.getByRole('radio', { name: 'In series' }),
    parallel: screen.getByRole('radio', { name: 'In parallel' }),
    in1: screen.getByRole('switch', { name: 'Lamp 1 is in' }),
    in2: screen.getByRole('switch', { name: 'Lamp 2 is in' }),
    picture: () => screen.getByRole('img'),
    drawn: () => [...container.querySelectorAll('svg[role="img"] text')].map((t) => t.textContent),
    state: (k: 1 | 2) => lamp(k).getAttribute('data-state'),
    volts: (k: 1 | 2) => Number(lamp(k).getAttribute('data-volts')),
    bright: (k: 1 | 2) => Number(lamp(k).getAttribute('data-bright')),
    glows: (k: 1 | 2) => lamp(k).querySelector('[data-glow]') !== null,
    battery: () => Number(container.querySelector('[data-battery-ma]')!.getAttribute('data-battery-ma')),
    flow: () => [...container.querySelectorAll('.lf-flow')].map((e) => e.getAttribute('data-flow')!).sort(),
    width: (name: string) => Number(container.querySelector(`.lf-flow[data-flow="${name}"]`)!.getAttribute('stroke-width')),
  };
}

const says = () => screen.getByRole('status').textContent ?? '';
const press = (control: HTMLElement) => fireEvent.keyDown(control, { key: ' ' });

describe('series and parallel: two lamps', () => {
  it('starts in series: the lamps share the push — half the volts each, a quarter as bright, one current through both', () => {
    const { series, in1, in2, picture, drawn, state, volts, bright, glows, battery, flow } = setup();
    expect(screen.getByRole('radiogroup', { name: 'Join them' })).toBeInTheDocument();
    expect(series).toHaveAttribute('aria-checked', 'true');
    expect(in1).toHaveAttribute('aria-checked', 'true');
    expect(in2).toHaveAttribute('aria-checked', 'true');
    const amps = VOLTS / (2 * LAMP_OHMS);
    for (const k of [1, 2] as const) {
      expect(state(k)).toBe('dim');
      expect(volts(k)).toBeCloseTo(VOLTS / 2);
      expect(bright(k)).toBeCloseTo(((VOLTS / 2) * amps) / WATTS_ALONE);
      expect(bright(k)).toBeCloseTo(0.25);
      expect(glows(k)).toBe(true);
    }
    expect(battery()).toBeCloseTo(amps * 1000);
    expect(flow()).toEqual(['loop']);
    expect(says()).toBe(`In series the two lamps share the push: ${n(VOLTS / 2)} V each, so each is dimmer. The same ${mA(amps)} mA goes through both.`);
    expect(says()).toBe('In series the two lamps share the push: 3 V each, so each is dimmer. The same 30 mA goes through both.');
    expect(picture()).toHaveAccessibleName(`A ${n(VOLTS)} V battery and two lamps in series, one after the other in one loop. Lamp 1 has ${n(VOLTS / 2)} V and is dim. Lamp 2 has ${n(VOLTS / 2)} V and is dim. The battery gives ${mA(amps)} mA.`);
    expect(drawn()).toEqual(expect.arrayContaining([`${n(VOLTS)} V`, `gives ${mA(amps)} mA`, 'Lamp 1', 'Lamp 2', `${n(VOLTS / 2)} V · ${mA(amps)} mA`]));
  });

  it('in parallel each lamp has the whole push: both as bright as one alone, the battery gives twice the current', () => {
    const { parallel, picture, drawn, state, volts, bright, battery, flow, width } = setup();
    fireEvent.click(parallel);
    expect(parallel).toHaveAttribute('aria-checked', 'true');
    for (const k of [1, 2] as const) {
      expect(state(k)).toBe('bright');
      expect(volts(k)).toBeCloseTo(VOLTS);
      expect(bright(k)).toBeCloseTo(1);
    }
    expect(battery()).toBeCloseTo(2 * ALONE * 1000);
    expect(flow()).toEqual(['lamp1', 'lamp2', 'trunk']);
    expect(width('trunk')).toBeGreaterThan(width('lamp1'));     // the two branches' currents add up
    expect(width('lamp1')).toBe(width('lamp2'));
    expect(says()).toBe(`In parallel each lamp has its own path and the whole ${n(VOLTS)} V: both are bright, and the battery gives ${mA(2 * ALONE)} mA — twice as much.`);
    expect(says()).toBe('In parallel each lamp has its own path and the whole 6 V: both are bright, and the battery gives 120 mA — twice as much.');
    expect(picture()).toHaveAccessibleName(`A ${n(VOLTS)} V battery and two lamps in parallel, side by side, each on its own path. Lamp 1 has ${n(VOLTS)} V and is bright. Lamp 2 has ${n(VOLTS)} V and is bright. The battery gives ${mA(2 * ALONE)} mA.`);
    expect(drawn()).toEqual(expect.arrayContaining([`gives ${mA(2 * ALONE)} mA`, `${n(VOLTS)} V · ${mA(ALONE)} mA`]));
  });

  it('from the keyboard: the arrows choose how they are joined', () => {
    const { series, parallel, state } = setup();
    fireEvent.keyDown(series, { key: 'ArrowRight' });
    expect(parallel).toHaveAttribute('aria-checked', 'true');
    expect(state(1)).toBe('bright');
    fireEvent.keyDown(parallel, { key: 'ArrowLeft' });
    expect(series).toHaveAttribute('aria-checked', 'true');
    expect(state(1)).toBe('dim');
  });

  it('in series, a lamp out is a gap in the only loop: the other goes dark too', () => {
    const { in1, in2, picture, drawn, state, volts, bright, glows, battery, flow } = setup();
    press(in1);
    expect(in1).toHaveAttribute('aria-checked', 'false');
    expect(state(1)).toBe('out');
    expect(state(2)).toBe('dark');
    expect(volts(2)).toBe(0);
    expect(bright(2)).toBe(0);
    expect(glows(2)).toBe(false);
    expect(battery()).toBe(0);
    expect(flow()).toEqual([]);
    expect(says()).toBe('Lamp 1 is out. In series that is a gap in the only loop: lamp 2 goes dark too. No current flows.');
    expect(picture()).toHaveAccessibleName(`A ${n(VOLTS)} V battery and two lamps in series, one after the other in one loop. Lamp 1 is out of its holder. Lamp 2 is in, but dark. The battery gives 0 mA.`);
    expect(drawn()).toEqual(expect.arrayContaining(['gives 0 mA', 'out', '0 V · 0 mA']));

    press(in1);
    press(in2);
    expect(state(1)).toBe('dark');
    expect(state(2)).toBe('out');
    expect(says()).toBe('Lamp 2 is out. In series that is a gap in the only loop: lamp 1 goes dark too. No current flows.');
    press(in2);
    expect(state(1)).toBe('dim');                               // back in: the loop is whole again
    expect(flow()).toEqual(['loop']);
  });

  it('in parallel, a lamp out leaves the other its own path: it stays as bright, the battery gives half as much', () => {
    const { parallel, in1, in2, picture, state, volts, bright, glows, battery, flow } = setup();
    fireEvent.click(parallel);
    press(in1);
    expect(state(1)).toBe('out');
    expect(state(2)).toBe('bright');
    expect(volts(2)).toBeCloseTo(VOLTS);
    expect(bright(2)).toBeCloseTo(1);
    expect(glows(2)).toBe(true);
    expect(battery()).toBeCloseTo(ALONE * 1000);
    expect(flow()).toEqual(['lamp2', 'trunk']);
    expect(says()).toBe(`Lamp 1 is out. In parallel lamp 2 still has its own path and the whole ${n(VOLTS)} V: it stays bright. The battery gives ${mA(ALONE)} mA now — only one lamp's worth.`);
    expect(picture()).toHaveAccessibleName(`A ${n(VOLTS)} V battery and two lamps in parallel, side by side, each on its own path. Lamp 1 is out of its holder. Lamp 2 has ${n(VOLTS)} V and is bright. The battery gives ${mA(ALONE)} mA.`);

    press(in1);
    press(in2);
    expect(state(1)).toBe('bright');
    expect(state(2)).toBe('out');
    expect(flow()).toEqual(['lamp1', 'trunk']);
    expect(says()).toMatch(/^Lamp 2 is out\. In parallel lamp 1 still has its own path/);
  });

  it('both out: nothing flows, joined either way', () => {
    const { parallel, series, in1, in2, picture, state, battery, flow } = setup();
    press(in1);
    press(in2);
    expect(state(1)).toBe('out');
    expect(state(2)).toBe('out');
    expect(battery()).toBe(0);
    expect(flow()).toEqual([]);
    expect(says()).toBe('Both lamps are out. The loop has two gaps: no current flows.');
    expect(picture()).toHaveAccessibleName(`A ${n(VOLTS)} V battery and two lamps in series, one after the other in one loop. Lamp 1 is out of its holder. Lamp 2 is out of its holder. The battery gives 0 mA.`);
    fireEvent.click(parallel);
    expect(battery()).toBe(0);
    expect(flow()).toEqual([]);
    expect(says()).toBe('Both lamps are out. Each path has a gap: no current flows.');
    fireEvent.click(series);
    press(in1);
    expect(state(1)).toBe('dark');                              // lamp 2 is still out
    expect(says()).toMatch(/^Lamp 2 is out\./);
  });

  it('draws to fill its box, and says nothing broken', () => {
    const { container, parallel, series, in1, in2 } = setup();
    const svg = container.querySelector('svg.lfig')!;
    expect(svg).toHaveAttribute('viewBox');
    expect(svg).not.toHaveAttribute('width');
    for (const join of [series, parallel]) {
      fireEvent.click(join);
      for (let i = 0; i < 4; i++) {
        press(i % 2 ? in2 : in1);
        expect(container.innerHTML).not.toMatch(/NaN|undefined|Infinity/);
      }
    }
    expect(container.querySelector('input, select')).toBeNull();
  });
});
