import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { legsCentre, partKind } from '@lib/editor';
import { App } from '../../src/renderer/app/App';
import type { MicrolabApi } from '../../src/renderer/app/api';

/** M4.3 the workspace (screens 02, 03): the board and breadboard drawn, parts dragged in (F-10), moved (F-11),
 *  wires from pin to pin (F-13, basic). In jsdom the canvas has no screen matrix: client = world − viewBox corner. */
function fakeApi(): MicrolabApi {
  const stored: Record<string, unknown> = {};
  return {
    versions: { app: '0.4.0', electron: '0' },
    settings: { get: async (k) => stored[k], set: async (k, v) => { stored[k] = v; } },
    project: { open: vi.fn(async () => ({ ok: false as const, canceled: true as const })) },
  };
}

function setup(board = 'New Pico W project') {
  render(<App api={fakeApi()} width={1440} />);
  fireEvent.click(screen.getByRole('button', { name: board }));
  const svg = screen.getByRole('application', { name: 'Circuit canvas' }) as unknown as SVGSVGElement;
  const [vx, vy] = svg.getAttribute('viewBox')!.split(' ').map(Number) as [number, number];
  /** The client position of a world point. */
  const client = (x: number, y: number) => ({ clientX: x - vx, clientY: y - vy, button: 0 });
  const point = (ref: string) => {
    const c = svg.querySelector(`[data-point="${ref}"]`);
    if (!c) throw new Error(`no free point ${ref}`);
    return { x: Number(c.getAttribute('cx')), y: Number(c.getAttribute('cy')) };
  };
  const parts = () => [...svg.querySelectorAll('[data-part]')].map((g) => `${g.getAttribute('data-part')} ${g.getAttribute('data-legs')}`);
  const wires = () => [...svg.querySelectorAll('[data-wire]')].map((g) => `${g.getAttribute('data-wire')} ${g.getAttribute('data-ends')}`);
  const panel = screen.getByRole('region', { name: 'Parts' });
  const item = (name: RegExp) => within(panel).getByRole('button', { name });
  return { svg, client, point, parts, wires, item };
}

/** Drag a part from the panel and let go with its legs' middle at `at` (world). */
function dragIn(s: ReturnType<typeof setup>, name: RegExp, type: string, firstLeg: { x: number; y: number }) {
  const [cx, cy] = legsCentre(type);
  const at = s.client(firstLeg.x + cx + 3, firstLeg.y + cy - 2);   // a little off: it snaps
  fireEvent.mouseDown(s.item(name), { clientX: 5, clientY: 5, button: 0 });
  fireEvent.mouseMove(s.svg, at);
  fireEvent.mouseUp(s.svg, at);
}

describe('M4.3 the workspace draws the project', () => {
  it.each([
    ['New Pico W project', 'Raspberry Pi Pico W'],
    ['New micro:bit project', 'BBC micro:bit V2'],
    ['New ESP32 project', 'ESP32 DevKit V1 (30 pins)'],
  ])('%s: the board\'s picture and a half breadboard, every pin and hole free to wire', (button, name) => {
    const s = setup(button);
    expect(within(s.svg as unknown as HTMLElement).getByRole('img', { name })).toBeInTheDocument();
    expect(within(s.svg as unknown as HTMLElement).getByRole('img', { name: 'Breadboard bb1 (half)' })).toBeInTheDocument();
    expect(s.svg.querySelectorAll('[data-point^="bb1."]')).toHaveLength(400);   // 300 holes + 100 rail holes
    expect(s.svg.querySelectorAll('[data-point^="board."]').length).toBeGreaterThanOrEqual(30);
  });

  it('the parts panel names the board and lists the parts of M4', () => {
    const s = setup();
    const panel = screen.getByRole('region', { name: 'Parts' });
    expect(within(panel).getByText('Raspberry Pi Pico W')).toBeInTheDocument();
    for (const name of [/^Resistor/, /^LED/, /^Push button/, /^Potentiometer/]) expect(s.item(name)).toBeInTheDocument();
  });
});

describe('M4.3 F-10 parts from the parts panel', () => {
  it('a part dropped on the breadboard snaps to holes', () => {
    const s = setup();
    dragIn(s, /^LED/, 'led', s.point('bb1.c10'));
    expect(s.parts()).toEqual(['led1 bb1.c10 bb1.c12']);
    expect(s.svg.querySelector('[data-point="bb1.c10"]')).toBeNull();   // the hole is used now
  });

  it('a push button dropped across the channel takes e and f', () => {
    const s = setup();
    dragIn(s, /^Push button/, 'button', s.point('bb1.e20'));
    expect(s.parts()).toEqual(['btn1 bb1.e20 bb1.e22 bb1.f20 bb1.f22']);
  });

  it('a part dropped where it can\'t go is not added, and the canvas says why', () => {
    const s = setup();
    dragIn(s, /^Resistor/, 'resistor', { x: -900, y: -900 });
    dragIn(s, /^Resistor/, 'resistor', s.point('bb1.a29'));   // its second leg would be off the end
    expect(s.parts()).toEqual([]);
    expect(screen.getByText(/every leg needs an empty hole/)).toBeInTheDocument();
  });

  it('let go outside the canvas: nothing is added', () => {
    const s = setup();
    fireEvent.mouseDown(s.item(/^Resistor/), { clientX: 5, clientY: 5, button: 0 });
    fireEvent.mouseMove(s.svg, s.client(100, 100));
    fireEvent.mouseUp(document.body, { clientX: 5, clientY: 5 });
    expect(s.parts()).toEqual([]);
  });

  it('a part clicked (or chosen with Enter) goes in the first free place', () => {
    const s = setup();
    fireEvent.click(s.item(/^Resistor/));
    fireEvent.click(s.item(/^Resistor/));
    expect(s.parts()).toEqual(['r1 bb1.a1 bb1.a4', 'r2 bb1.b1 bb1.b4']);
    expect(within(screen.getByRole('status')).getByText(/2 parts · 0 wires/)).toBeInTheDocument();
  });

  it('while dragged over the canvas, the part is shown where it would go', () => {
    const s = setup();
    const a5 = s.point('bb1.a5');
    const [cx, cy] = legsCentre('resistor');
    fireEvent.mouseDown(s.item(/^Resistor/), { clientX: 5, clientY: 5, button: 0 });
    fireEvent.mouseMove(s.svg, s.client(a5.x + cx, a5.y + cy));
    expect(s.svg.querySelector('[data-ghost="ok"]')).not.toBeNull();
    fireEvent.mouseMove(s.svg, s.client(-900, -900));
    expect(s.svg.querySelector('[data-ghost="blocked"]')).not.toBeNull();
    fireEvent.mouseUp(document.body);
    expect(s.svg.querySelector('[data-ghost]')).toBeNull();
  });
});

describe('M4.3 F-11 moving', () => {
  it('a part dragged moves by whole holes, its legs staying in holes', () => {
    const s = setup();
    fireEvent.click(s.item(/^Resistor/));
    const part = s.svg.querySelector('[data-part="r1"]')!;
    fireEvent.mouseDown(part, s.client(100, 100));
    fireEvent.mouseMove(s.svg, s.client(100 + 16 * 4 + 3, 100 + 16 * 2 - 2));
    fireEvent.mouseUp(s.svg, s.client(100 + 16 * 4 + 3, 100 + 16 * 2 - 2));
    expect(s.parts()).toEqual(['r1 bb1.c5 bb1.c8']);
  });

  it('a part dragged onto used holes goes back where it was', () => {
    const s = setup();
    fireEvent.click(s.item(/^Resistor/));   // a1–a4
    fireEvent.click(s.item(/^Resistor/));   // b1–b4
    const part = s.svg.querySelector('[data-part="r2"]')!;
    fireEvent.mouseDown(part, s.client(100, 100));
    fireEvent.mouseMove(s.svg, s.client(100, 84));
    fireEvent.mouseUp(s.svg, s.client(100, 84));
    expect(s.parts()).toEqual(['r1 bb1.a1 bb1.a4', 'r2 bb1.b1 bb1.b4']);
  });

  it('the breadboard dragged takes its parts with it (they stay in their holes)', () => {
    const s = setup();
    fireEvent.click(s.item(/^LED/));
    const before = s.point('bb1.j30');
    const body = within(s.svg as unknown as HTMLElement).getByRole('img', { name: 'Breadboard bb1 (half)' });
    fireEvent.mouseDown(body, s.client(0, 300));
    fireEvent.mouseMove(s.svg, s.client(40, 340));
    fireEvent.mouseUp(s.svg, s.client(40, 340));
    expect(s.parts()).toEqual(['led1 bb1.a1 bb1.a3']);
    expect(s.point('bb1.j30')).toEqual({ x: before.x + 40, y: before.y + 40 });
  });

  it('the board dragged moves, and its pins with it', () => {
    const s = setup();
    const before = s.point('board.GP15');
    const board = within(s.svg as unknown as HTMLElement).getByRole('img', { name: 'Raspberry Pi Pico W' });
    fireEvent.mouseDown(board, s.client(100, 50));
    fireEvent.mouseMove(s.svg, s.client(90, 30));
    fireEvent.mouseUp(s.svg, s.client(90, 30));
    expect(s.point('board.GP15')).toEqual({ x: before.x - 10, y: before.y - 20 });
  });
});

describe('M4.3 F-13 wires from pin to pin', () => {
  it('dragged from a board pin to a hole, a wire joins them', () => {
    const s = setup();
    const from = s.point('board.GP15');
    const to = s.point('bb1.a5');
    fireEvent.mouseDown(s.svg.querySelector('[data-point="board.GP15"]')!, s.client(from.x, from.y));
    fireEvent.mouseMove(s.svg, s.client(to.x + 3, to.y + 2));
    expect(s.svg.querySelector('[data-drawing-wire]')).not.toBeNull();
    fireEvent.mouseUp(s.svg, s.client(to.x + 3, to.y + 2));
    expect(s.wires()).toEqual(['w1 board.GP15 bb1.a5']);
    expect(s.svg.querySelector('[data-drawing-wire]')).toBeNull();
  });

  it('a wire dropped on empty space is not created', () => {
    const s = setup();
    const from = s.point('bb1.a5');
    fireEvent.mouseDown(s.svg.querySelector('[data-point="bb1.a5"]')!, s.client(from.x, from.y));
    fireEvent.mouseMove(s.svg, s.client(from.x + 900, from.y + 900));
    fireEvent.mouseUp(s.svg, s.client(from.x + 900, from.y + 900));
    expect(s.wires()).toEqual([]);
    expect(screen.getByText(/A wire must end on a hole or a pin/)).toBeInTheDocument();
  });

  it('a wire to the hole it started from, or to a used hole, is not created', () => {
    const s = setup();
    fireEvent.click(s.item(/^Resistor/));   // a1–a4
    const from = s.point('bb1.c9');
    const a1 = { x: from.x - 8 * 16, y: from.y - 32 };
    fireEvent.mouseDown(s.svg.querySelector('[data-point="bb1.c9"]')!, s.client(from.x, from.y));
    fireEvent.mouseUp(s.svg, s.client(a1.x, a1.y));
    fireEvent.mouseDown(s.svg.querySelector('[data-point="bb1.c9"]')!, s.client(from.x, from.y));
    fireEvent.mouseUp(s.svg, s.client(from.x, from.y));
    expect(s.wires()).toEqual([]);
  });

  it('a wire to ground is black, to a supply red, others coloured', () => {
    const s = setup();
    const wire = (a: string, b: string) => {
      const p = s.point(a);
      const q = s.point(b);
      fireEvent.mouseDown(s.svg.querySelector(`[data-point="${a}"]`)!, s.client(p.x, p.y));
      fireEvent.mouseUp(s.svg, s.client(q.x, q.y));
    };
    wire('board.GND@38', 'bb1.T-1');
    wire('board.3V3', 'bb1.T+1');
    wire('board.GP15', 'bb1.a5');
    const colours = [...s.svg.querySelectorAll('[data-wire]')].map((g) => g.getAttribute('data-colour'));
    expect(colours).toEqual(['black', 'red', expect.not.stringMatching(/^(black|red)$/)]);
  });
});

describe('M4.3 the part kinds', () => {
  it('the LED is drawn with its anode in the first hole', () => {
    expect(Object.keys(partKind('led').legs)).toEqual(['a', 'k']);
  });
});
