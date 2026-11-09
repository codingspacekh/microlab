import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { describe, expect, it, vi } from 'vitest';
import { legsCentre } from '@lib/editor';
import type { ProjectDoc } from '@lib/project';
import { App } from '../../src/renderer/app/App';
import type { StartRun } from '../../src/renderer/app/useRun';
import { fakeApi } from './fake-api';
import { partsPanel, startBuilding } from './start-building';

/** M9 slice 3 (F-18, screen 29b): Run looks over the circuit and the code first; with something to look at it asks —
 *  Show / Line N, Run anyway, Cancel, the setting — and Problems lists it until it is fixed. */
function setup() {
  const runs: { doc: ProjectDoc; entry: string }[] = [];
  const start: StartRun = (req) => { runs.push(req); return { stop: vi.fn(), setInput: vi.fn() }; };
  const api = fakeApi();
  render(<App api={api} width={1440} startRun={start} />);
  fireEvent.click(screen.getByRole('button', { name: 'New Pico W project' }));
  startBuilding();
  const svg = screen.getByRole('application', { name: 'Circuit canvas' });
  const place = (name: RegExp, type: string, hole: string) => {
    const [vx, vy] = svg.getAttribute('viewBox')!.split(' ').map(Number) as [number, number];
    const c = svg.querySelector(`[data-point="${hole}"]`)!;
    const [cx, cy] = legsCentre(type);
    const at = { clientX: Number(c.getAttribute('cx')) + cx - vx, clientY: Number(c.getAttribute('cy')) + cy - vy, button: 0 };
    fireEvent.mouseDown(within(partsPanel()).getByRole('button', { name }), { clientX: 5, clientY: 5, button: 0 });
    fireEvent.mouseMove(svg, at);
    fireEvent.mouseUp(svg, at);
  };
  const setCode = (code: string) => {
    const view = EditorView.findFromDOM(screen.getByRole('textbox', { name: 'main.py' }).closest('.cm-editor') as HTMLElement)!;
    act(() => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } }));
  };
  const run = () => fireEvent.click(screen.getByRole('button', { name: 'Run main.py' }));
  const card = () => screen.queryByRole('dialog', { name: 'Before it runs' });
  return { runs, api, svg, place, setCode, run, card };
}

const GP12 = 'from machine import Pin\nimport time\nbutton = Pin(12, Pin.IN, Pin.PULL_UP)\n';

describe('M9 slice 3: the check before running (screen 29b)', () => {
  it('a pin the code uses with nothing wired: Run asks first — nothing runs yet; the status bar says so', () => {
    const s = setup();
    s.setCode(GP12);
    s.run();
    expect(s.runs).toHaveLength(0);
    expect(s.card()).toHaveTextContent('Before it runs: 1 thing to look at');
    expect(s.card()).toHaveTextContent('main.py uses GP12 (line 3), but nothing is wired to it.');
    expect(screen.getByRole('status')).toHaveTextContent('Checked before running: 1 thing to look at');
    expect(screen.getByRole('status')).toHaveTextContent('Wiring check: 1 to look at');
  });

  it('Line 3 puts the editor on the line; Run anyway runs it as it is', () => {
    const s = setup();
    s.setCode(GP12);
    s.run();
    fireEvent.click(within(s.card()!).getByRole('button', { name: 'Line 3' }));
    expect(screen.getByRole('textbox', { name: 'main.py' }).querySelector('.cm-activeLine')).toHaveTextContent('button = Pin(12, Pin.IN, Pin.PULL_UP)');
    fireEvent.click(within(s.card()!).getByRole('button', { name: 'Run anyway' }));
    expect(s.runs).toHaveLength(1);
    expect(s.runs[0]!.entry).toBe('main.py');
    expect(s.card()).toBeNull();
  });

  it('Cancel goes back to fix it; Problems lists it until it is fixed, then Run just runs', () => {
    const s = setup();
    s.setCode(GP12);
    s.run();
    fireEvent.click(within(s.card()!).getByRole('button', { name: 'Cancel' }));
    expect(s.card()).toBeNull();
    expect(s.runs).toHaveLength(0);
    fireEvent.click(screen.getByRole('tab', { name: /Problems/ }));
    const problems = screen.getByRole('region', { name: 'Problems in the circuit' });
    expect(problems).toHaveTextContent('main.py uses GP12 (line 3), but nothing is wired to it.');
    expect(within(problems).getByRole('button', { name: /^Line 3:/ })).toBeInTheDocument();
    // fixed: the board's own LED instead — nothing to look at
    s.setCode('from machine import Pin\nled = Pin("LED", Pin.OUT)\n');
    expect(problems).toHaveTextContent('No problems in the circuit.');
    expect(screen.getByRole('status')).not.toHaveTextContent('Wiring check');
    s.run();
    expect(s.card()).toBeNull();
    expect(s.runs).toHaveLength(1);
  });

  it('a leg alone: Show rings it on the canvas', () => {
    const s = setup();
    s.setCode('from machine import Pin\nled = Pin("LED", Pin.OUT)\n');
    s.place(/^Resistor/, 'resistor', 'bb1.e20');
    const r1 = s.svg.querySelector('[data-part="r1"]')!.getAttribute('data-legs')!.split(' ');
    // an LED with its long leg in the resistor's second column, the same side of the channel
    const col = Number(/\d+$/.exec(r1[1]!)![0]);
    s.place(/^LED/, 'led', `bb1.d${col}`);
    s.run();
    const items = within(s.card()!).getAllByRole('listitem').map((li) => li.querySelector('b')!.textContent);
    expect(items).toContain('R1\'s leg is alone in column 20.');
    expect(items.some((t) => /^LED1's short leg is alone in column \d+\.$/.test(t!))).toBe(true);
    fireEvent.click(within(s.card()!).getAllByRole('button', { name: 'Show' })[0]!);
    expect(s.svg.querySelector('.focus-ring')).not.toBeNull();
    expect(s.card()).not.toBeNull();   // Show leaves the card open
  });

  it('"Check each time I press Run" off: Run runs at once, and it is remembered', async () => {
    const s = setup();
    s.setCode(GP12);
    s.run();
    fireEvent.click(within(s.card()!).getByRole('checkbox', { name: 'Check each time I press Run' }));
    expect(await s.api.settings.get('check.beforeRun')).toBe(false);
    fireEvent.click(within(s.card()!).getByRole('button', { name: 'Cancel' }));
    s.run();
    expect(s.runs).toHaveLength(1);
    expect(s.card()).toBeNull();
  });

  it("Run's menu shows the setting and turns it on again", () => {
    const s = setup();
    s.setCode(GP12);
    const menuItem = () => {
      if (!screen.queryByRole('menu')) fireEvent.click(screen.getByRole('button', { name: 'More ways to run' }));
      return screen.getByRole('menuitemcheckbox', { name: /Check before running/ });
    };
    expect(menuItem()).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(menuItem());   // off
    expect(menuItem()).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(menuItem());   // on again
    s.run();
    expect(s.card()).not.toBeNull();
  });
});
