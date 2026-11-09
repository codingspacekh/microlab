import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { legsCentre, partKind } from '@lib/editor';
import { App } from '../../src/renderer/app/App';
import { fakeApi } from './fake-api';
import { partsPanel, startBuilding } from './start-building';
import { newProjectFromStart } from './new-project';

/** M4.3 the workspace (screens 02, 03): the board and breadboard drawn, parts dragged in (F-10), moved (F-11),
 *  wires from pin to pin (F-13, basic). In jsdom the canvas has no screen matrix: client = world − viewBox corner. */

async function setup(board = 'New Pico W project') {
  render(<App api={fakeApi()} width={1440} />);
  await newProjectFromStart(board);
  startBuilding();
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
  const item = (name: RegExp) => within(partsPanel()).getByRole('button', { name });   // M7: it folds once the canvas is used
  return { svg, client, point, parts, wires, item };
}

/** Drag a part from the panel and let go with its legs' middle at `at` (world). */
function dragIn(s: Awaited<ReturnType<typeof setup>>, name: RegExp, type: string, firstLeg: { x: number; y: number }) {
  const [cx, cy] = legsCentre(type);
  const at = s.client(firstLeg.x + cx + 3, firstLeg.y + cy - 2);   // a little off: it snaps
  fireEvent.mouseDown(s.item(name), { clientX: 5, clientY: 5, button: 0 });
  fireEvent.mouseMove(s.svg, at);
  fireEvent.mouseUp(s.svg, at);
}

/** Put a part with its first leg in `hole`, by dragging it in. */
function place(s: Awaited<ReturnType<typeof setup>>, name: RegExp, type: string, hole: string) {
  dragIn(s, name, type, s.point(hole));
}

describe('M4.3 the workspace draws the project', () => {
  it.each([
    ['New Pico W project', 'Raspberry Pi Pico W', 40],
    ['New micro:bit project', 'BBC micro:bit V2', 5],   // M6.9: the micro:bit alone, its five rings
    ['New ESP32 project', 'ESP32 DevKit V1 (30 pins)', 30],
  ])('%s: the board\'s picture and a half breadboard, every pin and hole free to wire', async (button, name, pins) => {
    const s = await setup(button);
    expect(within(s.svg as unknown as HTMLElement).getByRole('img', { name })).toBeInTheDocument();
    expect(within(s.svg as unknown as HTMLElement).getByRole('img', { name: 'Breadboard bb1 (half)' })).toBeInTheDocument();
    expect(s.svg.querySelectorAll('[data-point^="bb1."]')).toHaveLength(400);   // 300 holes + 100 rail holes
    expect(s.svg.querySelectorAll('[data-point^="board."]')).toHaveLength(pins);
  });

  it('the rail names the board; the parts panel lists the parts of M4', async () => {
    const s = await setup();
    expect(within(screen.getByRole('navigation', { name: 'Board and parts' })).getByTitle('Raspberry Pi Pico W')).toBeInTheDocument();
    for (const name of [/^Resistor/, /^LED/, /^Push button/, /^Potentiometer(?! module)/]) expect(s.item(name)).toBeInTheDocument();
  });
});

describe('M4.3 F-10 parts from the parts panel', () => {
  it('a part dropped on the breadboard snaps to holes', async () => {
    const s = await setup();
    dragIn(s, /^LED/, 'led', s.point('bb1.c10'));
    expect(s.parts()).toEqual(['led1 bb1.c10 bb1.c12']);
    expect(s.svg.querySelector('[data-point="bb1.c10"]')).toBeNull();   // the hole is used now
  });

  it('a push button dropped across the channel takes e and f', async () => {
    const s = await setup();
    dragIn(s, /^Push button/, 'button', s.point('bb1.e20'));
    expect(s.parts()).toEqual(['btn1 bb1.e20 bb1.e22 bb1.f20 bb1.f22']);
  });

  it('a part dropped where it can\'t go is not added, and the canvas says why', async () => {
    const s = await setup();
    dragIn(s, /^Resistor/, 'resistor', { x: -900, y: -900 });
    dragIn(s, /^Resistor/, 'resistor', s.point('bb1.a29'));   // its second leg would be off the end
    expect(s.parts()).toEqual([]);
    expect(screen.getByText(/every leg needs an empty hole/)).toBeInTheDocument();
  });

  it('let go outside the canvas: nothing is added', async () => {
    const s = await setup();
    fireEvent.mouseDown(s.item(/^Resistor/), { clientX: 5, clientY: 5, button: 0 });
    fireEvent.mouseMove(s.svg, s.client(100, 100));
    fireEvent.mouseUp(document.body, { clientX: 5, clientY: 5 });
    expect(s.parts()).toEqual([]);
  });

  it('the status bar counts the parts and wires', async () => {
    const s = await setup();
    place(s, /^Resistor/, 'resistor', 'bb1.a1');
    place(s, /^Resistor/, 'resistor', 'bb1.b1');
    expect(s.parts()).toEqual(['r1 bb1.a1 bb1.a4', 'r2 bb1.b1 bb1.b4']);
    expect(within(screen.getByRole('status')).getByText(/2 parts · 0 wires/)).toBeInTheDocument();
  });

  it('while dragged over the canvas, the part is shown where it would go', async () => {
    const s = await setup();
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
  it('a part dragged moves by whole holes, its legs staying in holes', async () => {
    const s = await setup();
    place(s, /^Resistor/, 'resistor', 'bb1.a1');
    const part = s.svg.querySelector('[data-part="r1"]')!;
    fireEvent.mouseDown(part, s.client(100, 100));
    fireEvent.mouseMove(s.svg, s.client(100 + 16 * 4 + 3, 100 + 16 * 2 - 2));
    fireEvent.mouseUp(s.svg, s.client(100 + 16 * 4 + 3, 100 + 16 * 2 - 2));
    expect(s.parts()).toEqual(['r1 bb1.c5 bb1.c8']);
  });

  it('a part dragged onto used holes goes back where it was', async () => {
    const s = await setup();
    place(s, /^Resistor/, 'resistor', 'bb1.a1');
    place(s, /^Resistor/, 'resistor', 'bb1.b1');
    const part = s.svg.querySelector('[data-part="r2"]')!;
    fireEvent.mouseDown(part, s.client(100, 100));
    fireEvent.mouseMove(s.svg, s.client(100, 84));
    fireEvent.mouseUp(s.svg, s.client(100, 84));
    expect(s.parts()).toEqual(['r1 bb1.a1 bb1.a4', 'r2 bb1.b1 bb1.b4']);
  });

  it('the breadboard dragged takes its parts with it (they stay in their holes)', async () => {
    const s = await setup();
    place(s, /^LED/, 'led', 'bb1.a1');
    const before = s.point('bb1.j30');
    const body = within(s.svg as unknown as HTMLElement).getByRole('img', { name: 'Breadboard bb1 (half)' });
    fireEvent.mouseDown(body, s.client(0, 300));
    fireEvent.mouseMove(s.svg, s.client(40, 340));
    fireEvent.mouseUp(s.svg, s.client(40, 340));
    expect(s.parts()).toEqual(['led1 bb1.a1 bb1.a3']);
    expect(s.point('bb1.j30')).toEqual({ x: before.x + 40, y: before.y + 40 });
  });

  it('the board dragged moves, and its pins with it', async () => {
    const s = await setup();
    const before = s.point('board.GP15');
    const board = within(s.svg as unknown as HTMLElement).getByRole('img', { name: 'Raspberry Pi Pico W' });
    fireEvent.mouseDown(board, s.client(100, 50));
    fireEvent.mouseMove(s.svg, s.client(84, 26));
    fireEvent.mouseUp(s.svg, s.client(84, 26));
    expect(s.point('board.GP15')).toEqual({ x: before.x - 16, y: before.y - 24 });   // on the 8-unit grid
  });
});

describe('M4.3 F-13 wires from pin to pin', () => {
  it('dragged from a board pin to a hole, a wire joins them', async () => {
    const s = await setup();
    const from = s.point('board.GP15');
    const to = s.point('bb1.a5');
    fireEvent.mouseDown(s.svg.querySelector('[data-point="board.GP15"]')!, s.client(from.x, from.y));
    fireEvent.mouseMove(s.svg, s.client(to.x + 3, to.y + 2));
    expect(s.svg.querySelector('[data-drawing-wire]')).not.toBeNull();
    fireEvent.mouseUp(s.svg, s.client(to.x + 3, to.y + 2));
    expect(s.wires()).toEqual(['w1 board.GP15 bb1.a5']);
    expect(s.svg.querySelector('[data-drawing-wire]')).toBeNull();
  });

  it('a wire dropped on empty space is not created', async () => {
    const s = await setup();
    const from = s.point('bb1.a5');
    fireEvent.mouseDown(s.svg.querySelector('[data-point="bb1.a5"]')!, s.client(from.x, from.y));
    fireEvent.mouseMove(s.svg, s.client(from.x + 900, from.y + 900));
    fireEvent.mouseUp(s.svg, s.client(from.x + 900, from.y + 900));
    expect(s.wires()).toEqual([]);
    expect(screen.getByText(/A wire must end on a hole or a pin/)).toBeInTheDocument();
  });

  it('a wire to the hole it started from, or to a used hole, is not created', async () => {
    const s = await setup();
    place(s, /^Resistor/, 'resistor', 'bb1.a1');
    const from = s.point('bb1.c9');
    const a1 = { x: from.x - 8 * 16, y: from.y - 32 };
    fireEvent.mouseDown(s.svg.querySelector('[data-point="bb1.c9"]')!, s.client(from.x, from.y));
    fireEvent.mouseMove(s.svg, s.client(a1.x, a1.y));
    fireEvent.mouseUp(s.svg, s.client(a1.x, a1.y));
    expect(s.wires()).toEqual([]);
    expect(screen.getByText(/each hole holds one leg or one wire/)).toBeInTheDocument();
  });

  it('a wire to ground is black, to a supply red, others coloured', async () => {
    const s = await setup();
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
  it('a part clicked in the panel follows the mouse, and a click on the breadboard places it', async () => {
    const s = await setup();
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

  it('a carried part: a click where it can\'t go keeps it; Esc puts it back', async () => {
    const s = await setup();
    fireEvent.mouseDown(s.item(/^LED/), { clientX: 5, clientY: 5, button: 0 });
    fireEvent.mouseUp(s.item(/^LED/), { clientX: 5, clientY: 5, button: 0 });
    fireEvent.mouseDown(s.svg, s.client(-900, -900));
    expect(screen.getByText(/every leg needs an empty hole/)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    const c10 = s.point('bb1.c10');
    fireEvent.mouseDown(s.svg, s.client(c10.x + 16, c10.y));
    expect(s.parts()).toEqual([]);
  });

  it('from the keyboard: Enter picks it up at the first free place, arrows move it hole by hole, Enter places it', async () => {
    const s = await setup();
    fireEvent.click(s.item(/^Resistor/), { detail: 0 });   // Enter on a button clicks it with detail 0
    expect(s.svg).toHaveFocus();
    expect(screen.getByText(/Arrow keys move it/)).toBeInTheDocument();
    fireEvent.keyDown(s.svg, { key: 'ArrowRight' });
    fireEvent.keyDown(s.svg, { key: 'ArrowRight' });
    fireEvent.keyDown(s.svg, { key: 'ArrowDown' });
    fireEvent.keyDown(s.svg, { key: 'Enter' });
    expect(s.parts()).toEqual(['r1 bb1.b3 bb1.b6']);
  });

  it('from the keyboard, Esc puts it back', async () => {
    const s = await setup();
    fireEvent.click(s.item(/^Resistor/), { detail: 0 });
    fireEvent.keyDown(s.svg, { key: 'Escape' });
    fireEvent.keyDown(s.svg, { key: 'Enter' });
    expect(s.parts()).toEqual([]);
  });
});

describe('M4.3b wires with bend points', () => {
  const click = (s: Awaited<ReturnType<typeof setup>>, el: Element, x: number, y: number) => {
    fireEvent.mouseDown(el, s.client(x, y));
    fireEvent.mouseUp(el, s.client(x, y));
  };

  it('click a pin, click twice on the canvas, click a hole: a wire through two bends on the grid', async () => {
    const s = await setup();
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

  it('Backspace takes back the last bend; Esc drops the wire', async () => {
    const s = await setup();
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
  const props = (s: Awaited<ReturnType<typeof setup>>, id: string) => JSON.parse(s.svg.querySelector(`[data-part="${id}"]`)!.getAttribute('data-props')!);
  const select = (s: Awaited<ReturnType<typeof setup>>, sel: string) => {
    fireEvent.mouseDown(s.svg.querySelector(sel)!, s.client(100, 100));
    fireEvent.mouseUp(s.svg, s.client(100, 100));
  };

  it('a part placed is selected; its inspector sets a resistor\'s value with the quick values or the stepper', async () => {
    const s = await setup();
    place(s, /^Resistor/, 'resistor', 'bb1.a1');
    expect(within(inspector()).getByText('R1 · Resistor')).toBeInTheDocument();
    fireEvent.click(within(inspector()).getByRole('button', { name: '1k' }));
    expect(props(s, 'r1')).toEqual({ ohms: 1000 });
    fireEvent.keyDown(within(inspector()).getByRole('spinbutton', { name: 'Resistance' }), { key: 'ArrowUp' });
    expect(props(s, 'r1')).toEqual({ ohms: 1200 });
    expect(within(inspector()).getByLabelText('Colour bands for 1.2k Ω')).toBeInTheDocument();
  });

  it('an LED shows which leg is which: + anode, − cathode, on the canvas and in the inspector', async () => {
    const s = await setup();
    place(s, /^LED/, 'led', 'bb1.c10');
    const led = s.svg.querySelector('[data-part="led1"]')!;
    expect(led.querySelector('.leg.anode title')!.textContent).toMatch(/^Anode \(\+\)/);
    expect(led.querySelector('.leg.cathode title')!.textContent).toMatch(/^Cathode \(−\).*flat edge.*GND/);
    expect([...led.querySelectorAll('text')].map((t) => t.textContent)).toEqual(['+', '−']);
    expect(within(inspector()).getByText(/anode/).textContent).toMatch(/\+ anode c10/);
    expect(within(inspector()).getByText(/cathode/, { selector: 'span' }).textContent).toMatch(/− cathode c12/);
  });

  it('an LED\'s colour, a potentiometer\'s value', async () => {
    const s = await setup();
    place(s, /^LED/, 'led', 'bb1.a1');
    fireEvent.click(within(inspector()).getByRole('radio', { name: 'Green' }));
    expect(props(s, 'led1')).toEqual({ color: 'green' });
    place(s, /^Potentiometer(?! module)/, 'potentiometer', 'bb1.a10');
    fireEvent.click(within(inspector()).getByRole('radio', { name: '100kΩ' }));
    expect(props(s, 'pot1')).toEqual({ ohms: 100_000 });
  });

  it('a click selects; a click on empty canvas, Esc or × closes the inspector', async () => {
    const s = await setup();
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

  it('a wire\'s colour; what it joins', async () => {
    const s = await setup();
    const p = s.point('board.GP15');
    const q = s.point('bb1.a5');
    fireEvent.mouseDown(s.svg.querySelector('[data-point="board.GP15"]')!, s.client(p.x, p.y));
    fireEvent.mouseMove(s.svg, s.client(q.x, q.y));
    fireEvent.mouseUp(s.svg, s.client(q.x, q.y));
    expect(within(inspector()).getByText('GP15 ↔ a5')).toBeInTheDocument();
    fireEvent.click(within(inspector()).getByRole('radio', { name: 'Purple' }));
    expect(s.svg.querySelector('[data-wire="w1"]')!.getAttribute('data-colour')).toBe('purple');
  });

  it('starting a wire or picking up a part closes the inspector, so it never covers the canvas', async () => {
    const s = await setup();
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

  it('Delete removes the selected part; the inspector\'s Delete removes a wire', async () => {
    const s = await setup();
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

  it('typing in the inspector\'s number field never deletes the part', async () => {
    const s = await setup();
    place(s, /^Resistor/, 'resistor', 'bb1.a1');
    fireEvent.keyDown(within(inspector()).getByRole('spinbutton', { name: 'Resistance' }), { key: 'Backspace' });
    expect(s.parts()).toHaveLength(1);
  });

  it('the breadboard: full has 63 columns; back to half is refused while a part uses column 40', async () => {
    const s = await setup();
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
  it('the LED is drawn with its anode in the first hole', async () => {
    expect(Object.keys(partKind('led').legs)).toEqual(['a', 'k']);
  });
});

describe('M5.1 rotate, duplicate, select several (F-11), undo / redo (F-16)', () => {
  const tools = () => screen.getByRole('toolbar', { name: 'Circuit tools' });
  const tool = (name: string) => (name === 'Undo' || name === 'Redo'
    ? within(screen.getByRole('group', { name: 'Undo and redo' })).getByRole('button', { name })   // the top bar (screen 02b)
    : within(tools()).getByRole('button', { name }));
  const hint = () => document.querySelector('.canvas-hint')?.textContent ?? '';
  const pick = (s: Awaited<ReturnType<typeof setup>>, id: string, shift = false) => {
    const g = s.svg.querySelector(`[data-part="${id}"]`)!;
    fireEvent.mouseDown(g, { ...s.client(0, 0), shiftKey: shift });
    fireEvent.mouseUp(s.svg, s.client(0, 0));
  };
  const key = (k: string, more: Partial<KeyboardEventInit> = {}) => fireEvent.keyDown(window, { key: k, ...more });

  it('R turns the selected resistor upright; Undo and Redo, by key and by the toolbar', async () => {
    const s = await setup();
    place(s, /^Resistor/, 'resistor', 'bb1.a5');
    expect(s.parts()).toEqual(['r1 bb1.a5 bb1.a8']);
    key('r');
    expect(s.parts()).toEqual(['r1 bb1.a6 bb1.d6']);
    fireEvent.click(tool('Rotate'));
    expect(s.parts()[0]).toMatch(/^r1 bb1\.(\w)(\d+) bb1\.\1(\d+)$/);   // lying down again, b left of a
    key('z', { ctrlKey: true });
    expect(s.parts()).toEqual(['r1 bb1.a6 bb1.d6']);
    fireEvent.click(tool('Undo'));
    expect(s.parts()).toEqual(['r1 bb1.a5 bb1.a8']);
    fireEvent.click(tool('Undo'));
    expect(s.parts()).toEqual([]);
    fireEvent.click(tool('Undo'));   // the breadboard put down first (M6.8: a new project is the board alone)
    expect(tool('Undo')).toBeDisabled();
    key('y', { ctrlKey: true });
    key('y', { ctrlKey: true });
    expect(s.parts()).toEqual(['r1 bb1.a5 bb1.a8']);
    key('z', { metaKey: true, shiftKey: true });
    expect(s.parts()).toEqual(['r1 bb1.a6 bb1.d6']);
  });

  it('every kind of edit undoes: a wire, a colour, a value, a delete, moving the breadboard', async () => {
    const s = await setup();
    place(s, /^Resistor/, 'resistor', 'bb1.a5');
    fireEvent.click(within(screen.getByRole('complementary', { name: 'Inspector' })).getByRole('button', { name: '1k' }));
    const a = s.point('bb1.c20');
    const b = s.point('bb1.c25');
    fireEvent.mouseDown(s.svg.querySelector('[data-point="bb1.c20"]')!, s.client(a.x, a.y));
    fireEvent.mouseMove(s.svg, s.client(b.x, b.y));
    fireEvent.mouseUp(s.svg, s.client(b.x, b.y));
    expect(s.wires()).toEqual(['w1 bb1.c20 bb1.c25']);
    key('Delete');
    expect(s.wires()).toEqual([]);
    for (let i = 0; i < 2; i++) fireEvent.click(tool('Undo'));
    expect(s.wires()).toEqual([]);
    expect(JSON.parse(s.svg.querySelector('[data-part="r1"]')!.getAttribute('data-props')!)).toEqual({ ohms: 1000 });
    fireEvent.click(tool('Undo'));
    expect(JSON.parse(s.svg.querySelector('[data-part="r1"]')!.getAttribute('data-props')!)).toEqual({ ohms: 220 });
  });

  it('shift-click selects a second part: no inspector, a note, Delete removes both, Undo brings both back', async () => {
    const s = await setup();
    place(s, /^Resistor/, 'resistor', 'bb1.a5');
    place(s, /^LED/, 'led', 'bb1.c10');
    pick(s, 'r1', true);
    expect(s.svg.querySelectorAll('[aria-selected="true"]')).toHaveLength(2);
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).toBeNull();
    expect(hint()).toMatch(/^2 selected/);
    pick(s, 'led1', true);
    expect(s.svg.querySelectorAll('[aria-selected="true"]')).toHaveLength(1);
    pick(s, 'led1', true);
    key('Delete');
    expect(s.parts()).toEqual([]);
    fireEvent.click(tool('Undo'));
    expect(s.parts()).toEqual(['r1 bb1.a5 bb1.a8', 'led1 bb1.c10 bb1.c12']);
  });

  it('a box drawn on the empty canvas selects the parts and wires inside it, and only those', async () => {
    const s = await setup();
    place(s, /^Resistor/, 'resistor', 'bb1.a5');
    place(s, /^LED/, 'led', 'bb1.c10');
    place(s, /^Resistor/, 'resistor', 'bb1.a25');
    const from = s.point('bb1.T-1');
    const to = s.point('bb1.j14');
    fireEvent.mouseDown(s.svg.querySelector('.bg')!, s.client(from.x - 20, from.y - 20));
    fireEvent.mouseMove(s.svg, s.client(to.x, to.y));
    expect(s.svg.querySelector('[data-marquee]')).not.toBeNull();
    fireEvent.mouseUp(s.svg, s.client(to.x, to.y));
    expect([...s.svg.querySelectorAll('[aria-selected="true"]')].map((g) => g.getAttribute('data-part'))).toEqual(['r1', 'led1']);
  });

  it('dragging one of the selected parts moves them all, hole by hole', async () => {
    const s = await setup();
    place(s, /^Resistor/, 'resistor', 'bb1.a5');
    place(s, /^LED/, 'led', 'bb1.c10');
    pick(s, 'r1', true);
    const a = s.point('bb1.b1');
    const r = { x: a.x + 4 * 16, y: 62 + 0 };   // a5's place
    fireEvent.mouseDown(s.svg.querySelector('[data-part="r1"]')!, s.client(r.x, r.y));
    fireEvent.mouseMove(s.svg, s.client(r.x + 32 + 2, r.y + 16 - 1));
    fireEvent.mouseUp(s.svg, s.client(r.x + 32 + 2, r.y + 16 - 1));
    expect(s.parts()).toEqual(['r1 bb1.b7 bb1.b10', 'led1 bb1.d12 bb1.d14']);
    expect(s.svg.querySelectorAll('[aria-selected="true"]')).toHaveLength(2);
  });

  it('Ctrl+D (⌘D) copies the selection beside it, with its values; the copy is selected', async () => {
    const s = await setup();
    place(s, /^Resistor/, 'resistor', 'bb1.a5');
    fireEvent.click(within(screen.getByRole('complementary', { name: 'Inspector' })).getByRole('button', { name: '4.7k' }));
    key('d', { ctrlKey: true });
    expect(s.parts()).toEqual(['r1 bb1.a5 bb1.a8', 'r2 bb1.a10 bb1.a13']);
    expect(within(screen.getByRole('complementary', { name: 'Inspector' })).getByText('R2 · Resistor')).toBeInTheDocument();
    expect(JSON.parse(s.svg.querySelector('[data-part="r2"]')!.getAttribute('data-props')!)).toEqual({ ohms: 4700 });
    fireEvent.click(tool('Duplicate'));
    expect(s.parts()).toHaveLength(3);
  });

  it('R while a part is carried turns it before it is placed', async () => {
    const s = await setup();
    fireEvent.mouseDown(s.item(/^Resistor/), { clientX: 5, clientY: 5, button: 0 });
    fireEvent.mouseUp(s.item(/^Resistor/), { clientX: 5, clientY: 5, button: 0 });   // a click: now it is carried
    key('r');
    const a5 = s.point('bb1.a5');
    fireEvent.mouseMove(s.svg, s.client(a5.x, a5.y + 24));
    expect(s.svg.querySelector('[data-ghost="ok"]')).not.toBeNull();
    fireEvent.mouseDown(s.svg, s.client(a5.x, a5.y + 24));
    expect(s.parts()).toEqual(['r1 bb1.a5 bb1.d5']);
  });

  it('nothing selected: Rotate, Duplicate and Delete are off; a part with no room to turn says so', async () => {
    const s = await setup();
    for (const name of ['Rotate', 'Duplicate', 'Delete', 'Redo']) expect(tool(name)).toBeDisabled();   // Undo: the breadboard put down
    place(s, /^LED/, 'led', 'bb1.T-1');
    expect(s.parts()).toEqual(['led1 bb1.T-1 bb1.T-3']);
    key('r');
    expect(hint()).toMatch(/No room to turn it/);
    expect(s.parts()).toEqual(['led1 bb1.T-1 bb1.T-3']);
  });

  it('undo in the code editor is the editor\'s: Ctrl+Z there never takes back a part', async () => {
    const s = await setup();
    place(s, /^Resistor/, 'resistor', 'bb1.a5');
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'main.py' }), { key: 'z', ctrlKey: true });
    expect(s.parts()).toHaveLength(1);
  });

  it('the history outlives a visit to Learn', async () => {
    const s = await setup();
    place(s, /^Resistor/, 'resistor', 'bb1.a5');
    fireEvent.click(screen.getByRole('tab', { name: /Learn/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Workspace/ }));
    expect(document.querySelectorAll('[data-part]')).toHaveLength(1);   // the canvas is drawn again, s.svg is gone
    fireEvent.click(tool('Undo'));
    expect(document.querySelectorAll('[data-part]')).toHaveLength(0);
  });
});

describe('M5.2 zoom, pan and fit (F-17); everything joined to a hole lights up (F-12)', () => {
  const tool = (name: string) => within(screen.getByRole('toolbar', { name: 'Circuit tools' })).getByRole('button', { name });
  const vb = (s: Awaited<ReturnType<typeof setup>>) => s.svg.getAttribute('viewBox')!.split(' ').map(Number) as [number, number, number, number];

  it('Zoom in shows less of the drawing about its middle, Zoom out more, Fit goes back to the whole circuit', async () => {
    const s = await setup();
    const [x, y, w, h] = vb(s);
    fireEvent.click(tool('Zoom in'));
    const [x1, y1, w1, h1] = vb(s);
    expect(w1).toBeCloseTo(w / 1.25);
    expect(x1 + w1 / 2).toBeCloseTo(x + w / 2);
    expect(y1 + h1 / 2).toBeCloseTo(y + h / 2);
    fireEvent.click(tool('Zoom out'));
    fireEvent.click(tool('Zoom out'));
    expect(vb(s)[2]).toBeCloseTo(w * 1.25);
    fireEvent.click(tool('Fit'));
    expect(vb(s)).toEqual([x, y, w, h]);
    expect(tool('Zoom to 100 %')).toHaveTextContent('%');
  });

  it('+, − and 0 on the canvas; typed in the code editor they are code', async () => {
    const s = await setup();
    const w = vb(s)[2];
    fireEvent.keyDown(window, { key: '+' });
    expect(vb(s)[2]).toBeCloseTo(w / 1.25);
    fireEvent.keyDown(window, { key: '0' });
    expect(vb(s)[2]).toBe(w);
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'main.py' }), { key: '-' });
    expect(vb(s)[2]).toBe(w);
  });

  it('the wheel zooms at the pointer, as in Tinkercad (the M5 gate), and so does Ctrl + wheel / a pinch; Shift + wheel pans', async () => {
    const s = await setup();
    const [x, y, w] = vb(s);
    fireEvent.wheel(s.svg, { ...s.client(x, y), deltaY: -100 });
    const [x1, y1, w1] = vb(s);
    expect(w1).toBeLessThan(w);
    expect([x1, y1]).toEqual([x, y]);   // the corner was under the pointer: it stays
    fireEvent.wheel(s.svg, { ...s.client(x, y), deltaY: -100, ctrlKey: true });
    expect(vb(s)[2]).toBeLessThan(w1);
    const [x2, y2, w2] = vb(s);
    fireEvent.wheel(s.svg, { deltaX: 30, deltaY: 50, shiftKey: true });
    const [x3, y3, w3] = vb(s);
    expect(w3).toBe(w2);
    expect(x3 - x2).toBeCloseTo(30);    // jsdom: 1 px = 1 unit
    expect(y3 - y2).toBeCloseTo(50);
  });

  it('a drag with the middle button, or with Space held, moves the view and changes nothing', async () => {
    const s = await setup();
    place(s, /^Resistor/, 'resistor', 'bb1.a5');
    const before = s.parts();
    const [x, y] = vb(s);
    fireEvent.mouseDown(s.svg.querySelector('[data-part="r1"]')!, { clientX: 100, clientY: 100, button: 1 });
    fireEvent.mouseMove(window, { clientX: 140, clientY: 90 });
    fireEvent.mouseUp(window, { clientX: 140, clientY: 90, button: 1 });
    expect(vb(s).slice(0, 2)).toEqual([x - 40, y + 10]);
    fireEvent.keyDown(window, { key: ' ' });
    fireEvent.mouseDown(s.svg.querySelector('.bg')!, { clientX: 100, clientY: 100, button: 0 });
    fireEvent.mouseMove(window, { clientX: 90, clientY: 100 });
    fireEvent.mouseUp(window, { clientX: 90, clientY: 100, button: 0 });
    fireEvent.keyUp(window, { key: ' ' });
    expect(vb(s).slice(0, 2)).toEqual([x - 30, y + 10]);
    expect(s.parts()).toEqual(before);
    expect(s.svg.querySelector('[data-marquee]')).toBeNull();
  });

  it('hovering a hole lights its strip and every hole in it; leaving puts it out', async () => {
    const s = await setup();
    fireEvent.mouseEnter(s.svg.querySelector('[data-point="bb1.c5"]')!);
    expect(s.svg.querySelector('[data-lit-strip]')?.getAttribute('data-lit-strip')).toBe('bb1.a5 bb1.e5');
    expect([...s.svg.querySelectorAll('[data-lit-point]')].map((c) => c.getAttribute('data-lit-point')).sort())
      .toEqual(['bb1.a5', 'bb1.b5', 'bb1.c5', 'bb1.d5', 'bb1.e5']);
    fireEvent.mouseLeave(s.svg.querySelector('[data-point="bb1.c5"]')!);
    expect(s.svg.querySelector('[data-lit-strip]')).toBeNull();
  });

  it('through a wire: the strip at its other end and the board pin light too', async () => {
    const s = await setup();
    const a = s.point('board.GP15');
    const b = s.point('bb1.e5');
    fireEvent.mouseDown(s.svg.querySelector('[data-point="board.GP15"]')!, s.client(a.x, a.y));
    fireEvent.mouseMove(s.svg, s.client(b.x, b.y));
    // while drawing, where it would end lights up (the prototype's screen 02)
    expect(s.svg.querySelector('[data-lit-strip]')?.getAttribute('data-lit-strip')).toBe('bb1.a5 bb1.e5');
    fireEvent.mouseUp(s.svg, s.client(b.x, b.y));
    fireEvent.mouseEnter(s.svg.querySelector('[data-point="bb1.a5"]')!);
    expect(s.svg.querySelector('[data-lit-point="board.GP15"]')).not.toBeNull();
  });
});

describe('M5.3 a wire\'s bends (F-13); the pin and hole cards (F-15, F-12; screen 02)', () => {
  const inspector = () => screen.getByRole('complementary', { name: 'Inspector' });
  /** A wire GP15 → a5 drawn with one bend, then selected. */
  function bentWire(s: Awaited<ReturnType<typeof setup>>) {
    const a = s.point('board.GP15');
    const b = s.point('bb1.a5');
    const bend = { x: Math.round(a.x / 8) * 8, y: Math.round((a.y + 64) / 8) * 8 };   // below the board, clear of every hole
    const click = (el: Element, x: number, y: number) => {
      fireEvent.mouseDown(el, s.client(x, y));
      fireEvent.mouseUp(s.svg, s.client(x, y));
    };
    click(s.svg.querySelector('[data-point="board.GP15"]')!, a.x, a.y);
    click(s.svg, bend.x, bend.y);
    click(s.svg.querySelector('[data-point="bb1.a5"]')!, b.x, b.y);
    return bend;
  }
  const via = (s: Awaited<ReturnType<typeof setup>>) => s.svg.querySelector('[data-wire="w1"]')!.getAttribute('data-via');

  it('the selected wire\'s bend is dragged to a new place on the grid, then double-clicked away', async () => {
    const s = await setup();
    const bend = bentWire(s);
    expect(via(s)).toBe(`${bend.x},${bend.y}`);
    const h = s.svg.querySelector('[data-bend="0"]')!;
    fireEvent.mouseDown(h, s.client(bend.x, bend.y));
    fireEvent.mouseMove(s.svg, s.client(bend.x + 33, bend.y + 2));
    fireEvent.mouseUp(s.svg, s.client(bend.x + 33, bend.y + 2));
    expect(via(s)).toBe(`${bend.x + 32},${bend.y}`);
    fireEvent.doubleClick(s.svg.querySelector('[data-bend="0"]')!);
    expect(via(s)).toBe('');
    expect(s.wires()).toEqual(['w1 board.GP15 bb1.a5']);
  });

  it('a dot in the middle of a stretch dragged out adds a bend there; Straighten takes them all away; undo puts them back', async () => {
    const s = await setup();
    const bend = bentWire(s);
    const dot = s.svg.querySelector('[data-insert="1"]')!;
    const at = { x: Number(dot.getAttribute('cx')), y: Number(dot.getAttribute('cy')) };
    fireEvent.mouseDown(dot, s.client(at.x, at.y));
    fireEvent.mouseMove(s.svg, s.client(at.x - 40, at.y));
    fireEvent.mouseUp(s.svg, s.client(at.x - 40, at.y));
    expect(via(s)!.split(' ')).toHaveLength(2);
    expect(via(s)!.split(' ')[0]).toBe(`${bend.x},${bend.y}`);
    expect(within(inspector()).getByText('2')).toBeInTheDocument();
    fireEvent.click(within(inspector()).getByRole('button', { name: 'Straighten' }));
    expect(via(s)).toBe('');
    expect(within(inspector()).getByRole('button', { name: 'Straighten' })).toBeDisabled();
    fireEvent.click(within(screen.getByRole('group', { name: 'Undo and redo' })).getByRole('button', { name: 'Undo' }));
    expect(via(s)!.split(' ')).toHaveLength(2);
  });

  it('hovering GP15 on the Pico W shows its card: name, pin, what it can do, logic and current', async () => {
    const s = await setup();
    fireEvent.mouseEnter(s.svg.querySelector('[data-point="board.GP15"]')!);
    const card = screen.getByRole('tooltip');
    expect(card).toHaveTextContent('GP15 · pin 20');
    expect([...card.querySelectorAll('.fn')].map((c) => c.textContent)).toEqual(['Digital in/out', 'PWM7B', 'I2C1 SCL', 'SPI1 TX']);
    expect(card).toHaveTextContent('3.3 V logic · up to 12 mA');
    fireEvent.mouseLeave(s.svg.querySelector('[data-point="board.GP15"]')!);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('hovering a hole shows its strip and what is in it; while a wire is drawn from GP15 both cards show', async () => {
    const s = await setup();
    place(s, /^Resistor/, 'resistor', 'bb1.e18');
    fireEvent.mouseEnter(s.svg.querySelector('[data-point="bb1.c18"]')!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Column 18, rows a–eThese 5 holes are joined inside the breadboard.R1 is already in row e.');
    fireEvent.mouseLeave(s.svg.querySelector('[data-point="bb1.c18"]')!);
    const a = s.point('board.GP15');
    const b = s.point('bb1.a18');
    fireEvent.mouseDown(s.svg.querySelector('[data-point="board.GP15"]')!, s.client(a.x, a.y));
    fireEvent.mouseMove(s.svg, s.client(b.x, b.y));
    const cards = screen.getAllByRole('tooltip').map((c) => c.textContent);
    expect(cards[0]).toMatch(/^GP15 · pin 20 · wire starts here/);
    expect(cards[1]).toMatch(/^Column 18, rows a–e/);
  });

  it('the micro:bit\'s pins and the ESP32\'s say what they are too', async () => {
    const s = await setup('New micro:bit project');
    fireEvent.mouseEnter(s.svg.querySelector('[data-point="board.P0"]')!);
    expect(screen.getByRole('tooltip')).toHaveTextContent(/^P0 · pin/);
    expect([...screen.getByRole('tooltip').querySelectorAll('.fn')].map((c) => c.textContent)).toContain('Digital in/out');
  });
});

describe('M5.4 the inspector (screen 02b): Joins, Rotate, Duplicate, Delete', () => {
  const inspector = () => screen.getByRole('complementary', { name: 'Inspector' });
  const wire = (s: Awaited<ReturnType<typeof setup>>, from: string, to: string) => {
    const a = s.point(from);
    const b = s.point(to);
    fireEvent.mouseDown(s.svg.querySelector(`[data-point="${from}"]`)!, s.client(a.x, a.y));
    fireEvent.mouseMove(s.svg, s.client(b.x, b.y));
    fireEvent.mouseUp(s.svg, s.client(b.x, b.y));
  };

  it('Blink: the resistor joins GP15 ↔ LED1, the LED joins R1 ↔ GND', async () => {
    const s = await setup();
    place(s, /^Resistor/, 'resistor', 'bb1.a5');
    place(s, /^LED/, 'led', 'bb1.b8');
    wire(s, 'board.GP15', 'bb1.e5');
    wire(s, 'board.GND@38', 'bb1.e10');
    fireEvent.mouseDown(s.svg.querySelector('[data-part="r1"]')!, s.client(0, 0));
    fireEvent.mouseUp(s.svg, s.client(0, 0));
    expect(within(inspector()).getByText('GP15 ↔ LED1')).toBeInTheDocument();
    fireEvent.mouseDown(s.svg.querySelector('[data-part="led1"]')!, s.client(0, 0));
    fireEvent.mouseUp(s.svg, s.client(0, 0));
    expect(within(inspector()).getByText('R1 ↔ GND')).toBeInTheDocument();
  });

  it('Rotate turns it; Duplicate copies it and shows the copy; Delete removes it', async () => {
    const s = await setup();
    place(s, /^Resistor/, 'resistor', 'bb1.a5');
    fireEvent.click(within(inspector()).getByRole('button', { name: 'Rotate' }));
    expect(s.parts()).toEqual(['r1 bb1.a6 bb1.d6']);
    fireEvent.click(within(inspector()).getByRole('button', { name: 'Duplicate' }));
    expect(s.parts()).toHaveLength(2);
    expect(within(inspector()).getByText('R2 · Resistor')).toBeInTheDocument();
    fireEvent.click(within(inspector()).getByRole('button', { name: 'Delete' }));
    expect(s.parts()).toEqual(['r1 bb1.a6 bb1.d6']);
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).toBeNull();
  });

  it('no room to turn: the inspector says so', async () => {
    const s = await setup();
    place(s, /^LED/, 'led', 'bb1.T-1');
    fireEvent.click(within(inspector()).getByRole('button', { name: 'Rotate' }));
    expect(within(inspector()).getByRole('alert')).toHaveTextContent('No room to turn it');
  });
});

describe('M5.4 a card never outlives its hole', () => {
  it('a wire ended on the hovered hole: its card goes', async () => {
    const s = await setup();
    const a = s.point('board.GP15');
    const b = s.point('bb1.e5');
    fireEvent.mouseEnter(s.svg.querySelector('[data-point="bb1.e5"]')!);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.mouseDown(s.svg.querySelector('[data-point="board.GP15"]')!, s.client(a.x, a.y));
    fireEvent.mouseMove(s.svg, s.client(b.x, b.y));
    fireEvent.mouseUp(s.svg, s.client(b.x, b.y));
    expect(s.wires()).toEqual(['w1 board.GP15 bb1.e5']);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
