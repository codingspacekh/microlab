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

/** Put a part with its first leg in `hole`, by dragging it in. */
function place(s: ReturnType<typeof setup>, name: RegExp, type: string, hole: string) {
  dragIn(s, name, type, s.point(hole));
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

  it('the status bar counts the parts and wires', () => {
    const s = setup();
    place(s, /^Resistor/, 'resistor', 'bb1.a1');
    place(s, /^Resistor/, 'resistor', 'bb1.b1');
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
    place(s, /^Resistor/, 'resistor', 'bb1.a1');
    const part = s.svg.querySelector('[data-part="r1"]')!;
    fireEvent.mouseDown(part, s.client(100, 100));
    fireEvent.mouseMove(s.svg, s.client(100 + 16 * 4 + 3, 100 + 16 * 2 - 2));
    fireEvent.mouseUp(s.svg, s.client(100 + 16 * 4 + 3, 100 + 16 * 2 - 2));
    expect(s.parts()).toEqual(['r1 bb1.c5 bb1.c8']);
  });

  it('a part dragged onto used holes goes back where it was', () => {
    const s = setup();
    place(s, /^Resistor/, 'resistor', 'bb1.a1');
    place(s, /^Resistor/, 'resistor', 'bb1.b1');
    const part = s.svg.querySelector('[data-part="r2"]')!;
    fireEvent.mouseDown(part, s.client(100, 100));
    fireEvent.mouseMove(s.svg, s.client(100, 84));
    fireEvent.mouseUp(s.svg, s.client(100, 84));
    expect(s.parts()).toEqual(['r1 bb1.a1 bb1.a4', 'r2 bb1.b1 bb1.b4']);
  });

  it('the breadboard dragged takes its parts with it (they stay in their holes)', () => {
    const s = setup();
    place(s, /^LED/, 'led', 'bb1.a1');
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
    fireEvent.mouseMove(s.svg, s.client(84, 26));
    fireEvent.mouseUp(s.svg, s.client(84, 26));
    expect(s.point('board.GP15')).toEqual({ x: before.x - 16, y: before.y - 24 });   // on the 8-unit grid
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
    place(s, /^Resistor/, 'resistor', 'bb1.a1');
    const from = s.point('bb1.c9');
    const a1 = { x: from.x - 8 * 16, y: from.y - 32 };
    fireEvent.mouseDown(s.svg.querySelector('[data-point="bb1.c9"]')!, s.client(from.x, from.y));
    fireEvent.mouseMove(s.svg, s.client(a1.x, a1.y));
    fireEvent.mouseUp(s.svg, s.client(a1.x, a1.y));
    expect(s.wires()).toEqual([]);
    expect(screen.getByText(/each hole holds one leg or one wire/)).toBeInTheDocument();
  });

  it('a wire to ground is black, to a supply red, others coloured', () => {
    const s = setup();
    const wire = (a: string, b: string) => {
      const p = s.point(a);
      const q = s.point(b);
      fireEvent.mouseDown(s.svg.querySelector(`[data-point="${a}"]`)!, s.client(p.x, p.y));
      fireEvent.mouseMove(s.svg, s.client(q.x, q.y));
      fireEvent.mouseUp(s.svg, s.client(q.x, q.y));
    };
    wire('board.GND@38', 'bb1.T-1');
    wire('board.3V3', 'bb1.T+1');
    wire('board.GP15', 'bb1.a5');
    const colours = [...s.svg.querySelectorAll('[data-wire]')].map((g) => g.getAttribute('data-colour'));
    expect(colours).toEqual(['black', 'red', expect.not.stringMatching(/^(black|red)$/)]);
  });
});

describe('M4.3b placing like Tinkercad', () => {
  it('a part clicked in the panel follows the mouse, and a click on the breadboard places it', () => {
    const s = setup();
    fireEvent.mouseDown(s.item(/^LED/), { clientX: 5, clientY: 5, button: 0 });
    fireEvent.mouseUp(s.item(/^LED/), { clientX: 5, clientY: 5, button: 0 });
    expect(screen.getByText(/Click on the breadboard to place it/)).toBeInTheDocument();
    const c10 = s.point('bb1.c10');
    const [cx, cy] = legsCentre('led');
    fireEvent.mouseMove(s.svg, s.client(c10.x + cx, c10.y + cy));
    expect(s.svg.querySelector('[data-ghost="ok"]')).not.toBeNull();
    fireEvent.mouseDown(s.svg, s.client(c10.x + cx, c10.y + cy));
    fireEvent.mouseUp(s.svg, s.client(c10.x + cx, c10.y + cy));
    expect(s.parts()).toEqual(['led1 bb1.c10 bb1.c12']);
    expect(s.svg.querySelector('[data-ghost]')).toBeNull();
  });

  it('a carried part: a click where it can\'t go keeps it; Esc puts it back', () => {
    const s = setup();
    fireEvent.mouseDown(s.item(/^LED/), { clientX: 5, clientY: 5, button: 0 });
    fireEvent.mouseUp(s.item(/^LED/), { clientX: 5, clientY: 5, button: 0 });
    fireEvent.mouseDown(s.svg, s.client(-900, -900));
    expect(screen.getByText(/every leg needs an empty hole/)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    const c10 = s.point('bb1.c10');
    fireEvent.mouseDown(s.svg, s.client(c10.x + 16, c10.y));
    expect(s.parts()).toEqual([]);
  });

  it('from the keyboard: Enter picks it up at the first free place, arrows move it hole by hole, Enter places it', () => {
    const s = setup();
    fireEvent.click(s.item(/^Resistor/), { detail: 0 });   // Enter on a button clicks it with detail 0
    expect(s.svg).toHaveFocus();
    expect(screen.getByText(/Arrow keys move it/)).toBeInTheDocument();
    fireEvent.keyDown(s.svg, { key: 'ArrowRight' });
    fireEvent.keyDown(s.svg, { key: 'ArrowRight' });
    fireEvent.keyDown(s.svg, { key: 'ArrowDown' });
    fireEvent.keyDown(s.svg, { key: 'Enter' });
    expect(s.parts()).toEqual(['r1 bb1.b3 bb1.b6']);
  });

  it('from the keyboard, Esc puts it back', () => {
    const s = setup();
    fireEvent.click(s.item(/^Resistor/), { detail: 0 });
    fireEvent.keyDown(s.svg, { key: 'Escape' });
    fireEvent.keyDown(s.svg, { key: 'Enter' });
    expect(s.parts()).toEqual([]);
  });
});

describe('M4.3b wires with bend points', () => {
  const click = (s: ReturnType<typeof setup>, el: Element, x: number, y: number) => {
    fireEvent.mouseDown(el, s.client(x, y));
    fireEvent.mouseUp(el, s.client(x, y));
  };

  it('click a pin, click twice on the canvas, click a hole: a wire through two bends on the grid', () => {
    const s = setup();
    const gp15 = s.point('board.GP15');
    const a5 = s.point('bb1.a5');
    click(s, s.svg.querySelector('[data-point="board.GP15"]')!, gp15.x, gp15.y);
    expect(screen.getByText(/Click to bend the wire/)).toBeInTheDocument();
    click(s, s.svg, gp15.x + 1, gp15.y + 61);
    click(s, s.svg, a5.x - 2, gp15.y + 59);
    fireEvent.mouseMove(s.svg, s.client(a5.x + 40, a5.y));
    expect(s.svg.querySelector('[data-drawing-wire]')).not.toBeNull();
    click(s, s.svg, a5.x + 2, a5.y - 1);
    const snap = (v: number) => Math.round(v / 8) * 8;
    expect(s.wires()).toEqual(['w1 board.GP15 bb1.a5']);
    expect(s.svg.querySelector('[data-wire="w1"]')!.getAttribute('data-via')).toBe(`${snap(gp15.x + 1)},${snap(gp15.y + 61)} ${snap(a5.x - 2)},${snap(gp15.y + 59)}`);
  });

  it('Backspace takes back the last bend; Esc drops the wire', () => {
    const s = setup();
    const p = s.point('bb1.a5');
    click(s, s.svg.querySelector('[data-point="bb1.a5"]')!, p.x, p.y);
    click(s, s.svg, p.x, p.y - 80);
    click(s, s.svg, p.x + 80, p.y - 80);
    fireEvent.keyDown(window, { key: 'Backspace' });
    const q = s.point('bb1.a12');
    click(s, s.svg, q.x, q.y);
    expect(s.svg.querySelector('[data-wire="w1"]')!.getAttribute('data-via')!.split(' ')).toHaveLength(1);

    const r = s.point('bb1.c5');
    click(s, s.svg.querySelector('[data-point="bb1.c5"]')!, r.x, r.y);
    click(s, s.svg, r.x - 200, r.y);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(s.svg.querySelector('[data-drawing-wire]')).toBeNull();
    expect(s.wires()).toHaveLength(1);
  });
});

describe('M4.3b the inspector (screen 02b) and Delete', () => {
  const inspector = () => screen.getByRole('complementary', { name: 'Inspector' });
  const props = (s: ReturnType<typeof setup>, id: string) => JSON.parse(s.svg.querySelector(`[data-part="${id}"]`)!.getAttribute('data-props')!);
  const select = (s: ReturnType<typeof setup>, sel: string) => {
    fireEvent.mouseDown(s.svg.querySelector(sel)!, s.client(100, 100));
    fireEvent.mouseUp(s.svg, s.client(100, 100));
  };

  it('a part placed is selected; its inspector sets a resistor\'s value with the quick values or the stepper', () => {
    const s = setup();
    place(s, /^Resistor/, 'resistor', 'bb1.a1');
    expect(within(inspector()).getByText('R1 · Resistor')).toBeInTheDocument();
    fireEvent.click(within(inspector()).getByRole('button', { name: '1k' }));
    expect(props(s, 'r1')).toEqual({ ohms: 1000 });
    fireEvent.keyDown(within(inspector()).getByRole('spinbutton', { name: 'Resistance' }), { key: 'ArrowUp' });
    expect(props(s, 'r1')).toEqual({ ohms: 1200 });
    expect(within(inspector()).getByLabelText('Colour bands for 1.2k Ω')).toBeInTheDocument();
  });

  it('an LED\'s colour, a potentiometer\'s value', () => {
    const s = setup();
    place(s, /^LED/, 'led', 'bb1.a1');
    fireEvent.click(within(inspector()).getByRole('radio', { name: 'Green' }));
    expect(props(s, 'led1')).toEqual({ color: 'green' });
    place(s, /^Potentiometer/, 'potentiometer', 'bb1.a10');
    fireEvent.click(within(inspector()).getByRole('radio', { name: '100kΩ' }));
    expect(props(s, 'pot1')).toEqual({ ohms: 100_000 });
  });

  it('a click selects; a click on empty canvas, Esc or × closes the inspector', () => {
    const s = setup();
    place(s, /^Resistor/, 'resistor', 'bb1.a1');
    fireEvent.mouseDown(s.svg.querySelector('.bg')!, s.client(-500, -500));
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).toBeNull();
    select(s, '[data-part="r1"]');
    expect(inspector()).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).toBeNull();
    select(s, '[data-part="r1"]');
    fireEvent.click(within(inspector()).getByRole('button', { name: 'Close the inspector' }));
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).toBeNull();
  });

  it('a wire\'s colour; what it joins', () => {
    const s = setup();
    const p = s.point('board.GP15');
    const q = s.point('bb1.a5');
    fireEvent.mouseDown(s.svg.querySelector('[data-point="board.GP15"]')!, s.client(p.x, p.y));
    fireEvent.mouseMove(s.svg, s.client(q.x, q.y));
    fireEvent.mouseUp(s.svg, s.client(q.x, q.y));
    expect(within(inspector()).getByText('GP15 ↔ a5')).toBeInTheDocument();
    fireEvent.click(within(inspector()).getByRole('radio', { name: 'Purple' }));
    expect(s.svg.querySelector('[data-wire="w1"]')!.getAttribute('data-colour')).toBe('purple');
  });

  it('starting a wire or picking up a part closes the inspector, so it never covers the canvas', () => {
    const s = setup();
    place(s, /^Resistor/, 'resistor', 'bb1.a1');
    expect(inspector()).toBeInTheDocument();
    const p = s.point('bb1.c9');
    fireEvent.mouseDown(s.svg.querySelector('[data-point="bb1.c9"]')!, s.client(p.x, p.y));
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    select(s, '[data-part="r1"]');
    fireEvent.mouseDown(s.item(/^LED/), { clientX: 5, clientY: 5, button: 0 });
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).toBeNull();
  });

  it('Delete removes the selected part; the inspector\'s Delete removes a wire', () => {
    const s = setup();
    place(s, /^Resistor/, 'resistor', 'bb1.a1');
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(s.parts()).toEqual([]);
    const p = s.point('board.GP15');
    const q = s.point('bb1.a5');
    fireEvent.mouseDown(s.svg.querySelector('[data-point="board.GP15"]')!, s.client(p.x, p.y));
    fireEvent.mouseMove(s.svg, s.client(q.x, q.y));
    fireEvent.mouseUp(s.svg, s.client(q.x, q.y));
    fireEvent.click(within(inspector()).getByRole('button', { name: /Delete/ }));
    expect(s.wires()).toEqual([]);
  });

  it('typing in the inspector\'s number field never deletes the part', () => {
    const s = setup();
    place(s, /^Resistor/, 'resistor', 'bb1.a1');
    fireEvent.keyDown(within(inspector()).getByRole('spinbutton', { name: 'Resistance' }), { key: 'Backspace' });
    expect(s.parts()).toHaveLength(1);
  });

  it('the breadboard: full has 63 columns; back to half is refused while a part uses column 40', () => {
    const s = setup();
    select(s, '[aria-label="Breadboard bb1 (half)"]');
    fireEvent.click(within(inspector()).getByRole('radio', { name: 'Full · 63' }));
    expect(s.svg.querySelector('[data-point="bb1.a63"]')).not.toBeNull();
    place(s, /^Resistor/, 'resistor', 'bb1.a40');
    select(s, '[aria-label="Breadboard bb1 (full)"]');
    fireEvent.click(within(inspector()).getByRole('radio', { name: 'Half · 30' }));
    expect(within(inspector()).getByRole('alert')).toHaveTextContent('columns 31–63');
    expect(s.svg.querySelector('[data-point="bb1.a63"]')).not.toBeNull();
  });
});

describe('M4.3 the part kinds', () => {
  it('the LED is drawn with its anode in the first hole', () => {
    expect(Object.keys(partKind('led').legs)).toEqual(['a', 'k']);
  });
});
