import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/app/App';
import type { StartRun } from '../../src/renderer/app/useRun';
import type { RunEvents } from '../../src/renderer/sim-client';
import { fakeApi } from './fake-api';
import { newProjectFromStart } from './new-project';

/** M9 slice 5 (F-26, screen 07): the numbers a program prints, drawn in the Plotter beside the console. */
async function setup(code: string) {
  const runs: { events: RunEvents }[] = [];
  const start: StartRun = (_req, events) => { runs.push({ events }); return { stop: vi.fn(), setInput: vi.fn() }; };
  render(<App api={fakeApi()} width={1440} startRun={start} />);
  await newProjectFromStart('New Pico W project');
  const view = EditorView.findFromDOM(screen.getByRole('textbox', { name: 'main.py' }).closest('.cm-editor') as HTMLElement)!;
  act(() => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } }));
  fireEvent.click(screen.getByRole('button', { name: 'Run main.py' }));
  const say = (text: string) => act(() => runs.at(-1)!.events.onOutput(text));
  const plotter = () => {
    if (screen.getByRole('tab', { name: /Plotter/ }).getAttribute('aria-selected') !== 'true') fireEvent.click(screen.getByRole('tab', { name: /Plotter/ }));
    return screen.getByRole('region', { name: 'Plotter' });
  };
  return { say, plotter };
}

describe('M9 slice 5: the Plotter (screen 07)', () => {
  it('print(d): a line named d, "printed by line 4"; the console keeps the numbers too', async () => {
    const s = await setup('import time\nwhile True:\n    d = 34.0\n    print(d)\n    time.sleep(0.2)\n');
    s.say('34.0\n35.5\n');
    s.say('36.1\n');
    expect(screen.getByRole('log', { name: 'Console' })).toHaveTextContent('34.0 35.5 36.1');
    const p = s.plotter();
    expect(p).toHaveTextContent('d— printed by line 4');
    const line = p.querySelector('polyline[data-series="0"]')!;
    expect(line.getAttribute('points')!.split(' ')).toHaveLength(3);
    expect(within(p).getByRole('img')).toHaveAccessibleName('Plot of d, now 36.1');
  });

  it('print(x, y): two lines, each in its colour, both in the legend and named at their ends', async () => {
    const s = await setup('x = 1\ny = 2\nprint(x, y)\n');
    s.say('1 10\n2 20\n');
    const p = s.plotter();
    expect(p.querySelectorAll('polyline.series')).toHaveLength(2);
    expect([...p.querySelectorAll('.legend .key')].map((k) => k.textContent)).toEqual(['x', 'y']);
    expect([...p.querySelectorAll('.end text')].map((k) => k.textContent).sort()).toEqual(['x', 'y']);
    expect(p.querySelector('polyline[data-series="1"]')).toHaveAttribute('stroke', '#eb6834');
  });

  it('names from the output itself ("temp: 24.5 humidity: 40"); text lines are left to the console', async () => {
    const s = await setup('print("temp:", t, "humidity:", h)\n');
    s.say('Starting\ntemp: 24.5 humidity: 40\n');
    const p = s.plotter();
    expect([...p.querySelectorAll('.legend .key')].map((k) => k.textContent)).toEqual(['temp', 'humidity']);
    expect(p).not.toHaveTextContent('printed by line');
  });

  it('hovering reads every line at that moment; 1 min shows more; Clear empties it', async () => {
    const s = await setup('print(a, b)\n');
    s.say('3 4\n');
    const p = s.plotter();
    fireEvent.mouseMove(within(p).getByRole('img'), { clientX: 600 - 84 - 1, clientY: 100 });
    expect(within(p).getByRole('tooltip')).toHaveTextContent('a 3b 4');
    fireEvent.click(within(p).getByRole('radio', { name: '1 min' }));
    expect(within(p).getByRole('radio', { name: '1 min' })).toHaveAttribute('aria-checked', 'true');
    expect(p).toHaveTextContent('−60 s');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(s.plotter()).toHaveTextContent('Numbers the program prints are drawn here');
  });
});
