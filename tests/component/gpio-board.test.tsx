import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../../src/renderer/app/App';
import { fakeApi } from './fake-api';
import { addGpioBoard, startBuilding } from './start-building';
import { newProjectFromStart } from './new-project';

/** M6.9 (screens 24, 24b): a new micro:bit project is the micro:bit alone, wired at its five rings; the GPIO board
 *  from the parts panel puts it into its slot, and its inspector takes it out again — one undo step each way. */
async function setup(board = 'New micro:bit project') {
  render(<App api={fakeApi()} width={1440} />);
  await newProjectFromStart(board);
  startBuilding();
  const svg = () => screen.getByRole('application', { name: 'Circuit canvas' }) as unknown as SVGSVGElement;
  const client = (x: number, y: number) => {
    const [vx, vy] = svg().getAttribute('viewBox')!.split(' ').map(Number) as [number, number];
    return { clientX: x - vx, clientY: y - vy, button: 0 };
  };
  const point = (ref: string) => {
    const c = svg().querySelector(`[data-point="${ref}"]`);
    if (!c) throw new Error(`no free point ${ref}`);
    return { x: Number(c.getAttribute('cx')), y: Number(c.getAttribute('cy')) };
  };
  const wire = (a: string, b: string) => {
    const p = point(a);
    const q = point(b);
    fireEvent.mouseDown(svg().querySelector(`[data-point="${a}"]`)!, client(p.x, p.y));
    fireEvent.mouseMove(svg(), client(q.x, q.y));
    fireEvent.mouseUp(svg(), client(q.x, q.y));
  };
  const wires = () => [...svg().querySelectorAll('[data-wire]')].map((g) => g.getAttribute('data-ends'));
  const boardPins = () => svg().querySelectorAll('[data-point^="board."]').length;
  const hint = () => document.querySelector('.canvas-hint')?.textContent ?? '';
  const undo = () => fireEvent.click(within(screen.getByRole('group', { name: 'Undo and redo' })).getByRole('button', { name: 'Undo' }));
  const clickBoard = () => {
    const b = svg().querySelector('image.board')!;
    fireEvent.mouseDown(b, client(0, 0));
    fireEvent.mouseUp(svg(), client(0, 0));
  };
  return { svg, wire, wires, boardPins, hint, undo, clickBoard };
}

const microbitGroup = () => screen.queryByRole('group', { name: 'micro:bit' });

describe('M6.9 the micro:bit alone (screen 24)', () => {
  it('is drawn alone, with five rings to wire, and named as the micro:bit', async () => {
    const s = await setup();
    expect(s.boardPins()).toBe(5);
    expect(within(s.svg() as unknown as HTMLElement).getByRole('img', { name: 'BBC micro:bit V2' })).toHaveClass('alone');
    expect(within(screen.getByRole('group', { name: 'Project' })).getByText(/^BBC micro:bit V2$/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/BBC micro:bit V2 \+ 0 parts/);
    expect(screen.getByRole('status')).not.toHaveTextContent(/GPIO board/);
  });

  it('a wire goes straight to a ring', async () => {
    const s = await setup();
    s.wire('board.P0', 'bb1.e5');
    expect(s.wires()).toEqual(['board.P0 bb1.e5']);
  });

  it('the parts panel has the micro:bit\'s group first, with its GPIO board; not for the other boards', async () => {
    await setup();
    const groups = within(screen.getByRole('region', { name: 'Parts' })).getAllByRole('group');
    expect(groups[0]).toHaveAccessibleName('micro:bit');
    expect(within(groups[0]!).getByRole('button', { name: /^GPIO board.*30 pins/ })).toBeInTheDocument();
  });

  it('a Pico W project has no micro:bit group', async () => {
    await setup('New Pico W project');
    expect(microbitGroup()).toBeNull();
  });

  it('clicked, the micro:bit alone shows its inspector: only Rotate (M7, the teacher\'s request: the board turns)', async () => {
    const s = await setup();
    s.clickBoard();
    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    expect(inspector).toHaveTextContent(/micro:bit/);
    expect(within(inspector).getAllByRole('button').map((b) => b.textContent?.trim())).toEqual(['', 'Rotate']);   // its close, its Rotate
  });
});

describe('M6.9 the GPIO board added (screen 24b)', () => {
  it('the micro:bit goes into it: every pin, the wires on the same pins, the canvas says so; its inspector shows', async () => {
    const s = await setup();
    s.wire('board.P0', 'bb1.e5');
    s.wire('board.GND', 'bb1.e10');
    addGpioBoard();
    expect(s.boardPins()).toBe(30 - 2);   // two are wired
    expect(s.wires()).toEqual(['board.P0 bb1.e5', 'board.GND bb1.e10']);
    expect(within(s.svg() as unknown as HTMLElement).getByRole('img', { name: 'BBC micro:bit V2 on its GPIO board' })).not.toHaveClass('alone');
    expect(s.hint()).toMatch(/in its GPIO board: 30 pins.*The wires on 0 and GND are on its P0 and GND\./);
    expect(within(screen.getByRole('group', { name: 'Project' })).getByText(/^BBC micro:bit V2 on its GPIO board/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/BBC micro:bit V2 \+ GPIO board \+ 0 parts · 2 wires/);
    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    expect(inspector).toHaveTextContent(/micro:bit GPIO board/);
    expect(s.svg().querySelector('[data-selected-board]')).not.toBeNull();
    expect(microbitGroup()).toBeNull();   // it is in use
    expect(s.svg().querySelector('[data-usb="in"]')).not.toBeNull();
  });

  it('one undo takes it back out, as it was', async () => {
    const s = await setup();
    s.wire('board.P0', 'bb1.e5');
    addGpioBoard();
    s.undo();
    expect(s.boardPins()).toBe(4);
    expect(s.wires()).toEqual(['board.P0 bb1.e5']);
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).toBeNull();   // nothing to show
    expect(microbitGroup()).not.toBeNull();
  });

  it('dragged from the panel and let go on the canvas, it goes in too', async () => {
    const s = await setup();
    const item = within(microbitGroup()!).getByRole('button', { name: /^GPIO board/ });
    fireEvent.mouseDown(item, { clientX: 5, clientY: 5, button: 0 });
    fireEvent.mouseMove(s.svg(), { clientX: 400, clientY: 300 });
    fireEvent.mouseUp(s.svg(), { clientX: 400, clientY: 300 });
    expect(s.boardPins()).toBe(30);
  });

  it('clicked, the GPIO board shows its inspector: its micro-USB is plugged in or taken out there', async () => {
    const s = await setup();
    addGpioBoard();
    fireEvent.click(screen.getByRole('button', { name: 'Close the inspector' }));
    s.clickBoard();
    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    expect(inspector).toHaveTextContent(/P0–P20 in two rows · I²C header/);
    fireEvent.click(within(inspector).getByRole('radio', { name: 'Out' }));
    expect(s.svg().querySelector('[data-usb="out"]')).not.toBeNull();
    fireEvent.click(within(inspector).getByRole('radio', { name: 'Plugged in · 5V' }));
    expect(s.svg().querySelector('[data-usb="in"]')).not.toBeNull();
  });

  it('Take the micro:bit out: the wires on pins it has no ring for go, the canvas says how many; one undo brings them back', async () => {
    const s = await setup();
    addGpioBoard();
    s.wire('board.P0', 'bb1.e5');
    s.wire('board.P8', 'bb1.e7');
    s.wire('board.P13', 'bb1.e9');
    s.clickBoard();
    fireEvent.click(within(screen.getByRole('complementary', { name: 'Inspector' })).getByRole('button', { name: /Take the micro:bit out/ }));
    expect(s.boardPins()).toBe(4);
    expect(s.wires()).toEqual(['board.P0 bb1.e5']);
    expect(s.hint()).toMatch(/out of its GPIO board.*The 2 wires on its other pins went with the GPIO board — Undo brings them back\./);
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).toBeNull();
    s.undo();
    expect(s.wires()).toEqual(['board.P0 bb1.e5', 'board.P8 bb1.e7', 'board.P13 bb1.e9']);
    expect(within(s.svg() as unknown as HTMLElement).getByRole('img', { name: 'BBC micro:bit V2 on its GPIO board' })).toBeInTheDocument();
  });
});
