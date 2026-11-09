import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/app/App';
import { START_CARD_MS } from '../../src/renderer/workspace/Canvas';
import type { StartRun } from '../../src/renderer/app/useRun';
import { fakeApi } from './fake-api';
import { newProjectFromStart } from './new-project';

/** M6.8 (screens 23 and 23b, approved 2026-11-08): a new project is the board alone; the parts panel is folded to a
 *  rail and slides out over the canvas; breadboards — mini, half, full — come from it. */
async function setup(board = 'New Pico W project') {
  const start: StartRun = () => ({ stop: vi.fn(), setInput: vi.fn() });
  render(<App api={fakeApi()} width={1440} startRun={start} audio={() => null} />);
  await newProjectFromStart(board);
  const svg = screen.getByRole('application', { name: 'Circuit canvas' });
  const [vx, vy] = svg.getAttribute('viewBox')!.split(' ').map(Number) as [number, number];
  const parts = () => screen.queryByRole('region', { name: 'Parts' });
  const toggle = () => screen.getByRole('button', { name: 'Parts' });
  /** Drag a panel item to a drawing point. */
  const drag = (name: RegExp, x: number, y: number) => {
    const at = { clientX: x - vx, clientY: y - vy, button: 0 };
    fireEvent.mouseDown(within(parts()!).getByRole('button', { name }), { clientX: 5, clientY: 5, button: 0 });
    fireEvent.mouseMove(svg, at);
    fireEvent.mouseUp(svg, at);
  };
  return { svg, parts, toggle, drag };
}

describe('M6.8 the board alone; the parts panel on a rail (screen 23)', () => {
  it('a new project has the board and no breadboard; the canvas says how to start; the panel is folded', async () => {
    const s = await setup();
    expect(s.svg.querySelector('[data-point^="bb"]')).toBeNull();
    expect(screen.getByRole('group', { name: 'Start building' })).toHaveTextContent('Put a breadboard under the board');
    expect(s.parts()).toBeNull();
    expect(s.toggle()).toHaveAttribute('aria-expanded', 'false');
  });

  it('Parts, the card\'s Add parts, or P opens it; its ⟨, Esc or P folds it', async () => {
    const s = await setup();
    fireEvent.click(s.toggle());
    expect(s.parts()).not.toBeNull();
    fireEvent.click(within(s.parts()!).getByRole('button', { name: 'Fold the parts away' }));
    expect(s.parts()).toBeNull();
    fireEvent.click(within(screen.getByRole('group', { name: 'Start building' })).getByRole('button', { name: 'Add parts' }));
    expect(s.parts()).not.toBeNull();
    fireEvent.keyDown(within(s.parts()!).getAllByRole('button')[0]!, { key: 'Escape' });
    expect(s.parts()).toBeNull();
    fireEvent.keyDown(document.body, { key: 'p' });
    expect(s.parts()).not.toBeNull();
    fireEvent.keyDown(document.body, { key: 'p' });
    expect(s.parts()).toBeNull();
  });

  it('the card shows for a few seconds, then goes by itself (the teacher, 2026-11-08); the rail\'s Parts stays', async () => {
    vi.useFakeTimers();
    try {
      await setup();
      expect(screen.getByRole('group', { name: 'Start building' })).toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(START_CARD_MS - 100); });
      expect(screen.getByRole('group', { name: 'Start building' })).toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(200); });
      expect(screen.queryByRole('group', { name: 'Start building' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Parts' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('P typed in the editor is a letter, not the panel', async () => {
    const s = await setup();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'main.py' }), { key: 'p' });
    expect(s.parts()).toBeNull();
  });
});

describe('M6.8 breadboards from the panel (screen 23b)', () => {
  it('Basics starts with a mini, a half and a full breadboard', async () => {
    const s = await setup();
    fireEvent.click(s.toggle());
    const basics = within(s.parts()!).getByRole('group', { name: 'Basics' });
    expect(within(basics).getAllByRole('button').slice(0, 3).map((b) => b.textContent)).toEqual([
      'Mini breadboard170 holes · no rails', 'Half breadboard400 holes · 30 columns', 'Full breadboard830 holes · 63 columns',
    ]);
  });

  it('one dragged in goes under the board; the card goes; its size is in the inspector — mini has no rails', async () => {
    const s = await setup();
    fireEvent.click(s.toggle());
    s.drag(/^Half breadboard/, 300, 500);
    expect(s.svg.querySelector('[data-point="bb1.a1"]')).not.toBeNull();
    expect(s.svg.querySelector('[data-point="bb1.T-1"]')).not.toBeNull();
    expect(screen.queryByRole('group', { name: 'Start building' })).toBeNull();
    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    fireEvent.click(within(inspector).getByRole('radio', { name: 'Mini · 17' }));
    expect(s.svg.querySelector('[data-point="bb1.T-1"]')).toBeNull();
    expect(s.svg.querySelector('[data-point="bb1.j17"]')).not.toBeNull();
    expect(s.svg.querySelector('[data-point="bb1.a18"]')).toBeNull();
  });

  it('the card\'s Add a breadboard puts a half one down at once', async () => {
    const s = await setup();
    fireEvent.click(screen.getByRole('button', { name: 'Add a breadboard' }));
    expect(s.svg.querySelector('[data-point="bb1.j30"]')).not.toBeNull();
  });

  it('a part dropped with no breadboard brings a half one with it, and the canvas says so', async () => {
    const s = await setup();
    fireEvent.click(s.toggle());
    s.drag(/^Resistor/, 300, 600);
    expect(within(s.svg).getByRole('img', { name: 'Breadboard bb1 (half)' })).toBeInTheDocument();
    expect(s.svg.querySelector('[data-part="r1"]')!.getAttribute('data-legs')).toMatch(/^bb1\.\S+ bb1\.\S+$/);
    expect(screen.getByText(/A half breadboard came with it/)).toBeInTheDocument();
  });

  it('a running program folds the panel away; opened again, it says what can be done while it runs', async () => {
    const s = await setup();
    fireEvent.click(s.toggle());
    fireEvent.click(screen.getByRole('button', { name: 'Run main.py' }));
    expect(s.parts()).toBeNull();
    fireEvent.click(s.toggle());
    expect(within(s.parts()!).getByRole('note')).toHaveTextContent('Stop the program to change the circuit');
  });
});
