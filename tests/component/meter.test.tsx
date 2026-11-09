import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { parseProject, type ProjectDoc } from '@lib/project';
import { App } from '../../src/renderer/app/App';
import type { StartRun } from '../../src/renderer/app/useRun';
import type { RunEvents } from '../../src/renderer/sim-client';
import { fakeApi } from './fake-api';
import { newProjectFromStart } from './new-project';

/** M9 slice 4 (F-38, screen 29): Meter takes out the multimeter; its probes dragged onto holes read V and Ω, a wire
 *  clicked reads A; with a program running it follows the board's pins. */
const blink = parseProject(JSON.parse(readFileSync('library/examples/blink/pico-w/project.json', 'utf8')));
const doc = (project: ProjectDoc['project'], code = 'from machine import Pin\nPin(15, Pin.OUT).on()\n'): ProjectDoc => ({ project, files: { 'main.py': code } });
// screen 29: two 10 kΩ from 3V3 (column 5) to GND (column 13), their middle column 9
const DIVIDER = doc({
  ...blink, title: 'Voltage divider',
  parts: [
    { id: 'r1', type: 'resistor', props: { ohms: 10000 }, legs: { a: 'bb1.f5', b: 'bb1.f9' } },
    { id: 'r2', type: 'resistor', props: { ohms: 10000 }, legs: { a: 'bb1.g9', b: 'bb1.g13' } },
  ],
  wires: [{ id: 'w1', a: 'board.3V3', b: 'bb1.j5' }, { id: 'w2', a: 'board.GND@38', b: 'bb1.j13' }],
}, '# Two 10 kΩ from 3V3 to GND: no code needed.\n');

async function setup(d: ProjectDoc) {
  const runs: { events: RunEvents }[] = [];
  const start: StartRun = (_req, events) => { runs.push({ events }); return { stop: vi.fn(), setInput: vi.fn() }; };
  const api = fakeApi({ open: vi.fn(async () => ({ ok: true as const, path: '/s/p.mlab', name: d.project.title ?? 'p', doc: d })) });
  render(<App api={api} width={1440} startRun={start} />);
  await newProjectFromStart('New Pico W project');
  fireEvent.click(screen.getByRole('button', { name: 'Project menu' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Open a project…' }));
  await waitFor(() => expect(screen.getByRole('group', { name: 'Project' })).toHaveTextContent(d.project.title ?? ''));
  const svg = screen.getByRole('application', { name: 'Circuit canvas' });
  const at = (point: string) => {
    const [vx, vy] = svg.getAttribute('viewBox')!.split(' ').map(Number) as [number, number];
    const c = svg.querySelector(`[data-point="${point}"]`)!;
    return { clientX: Number(c.getAttribute('cx')) - vx, clientY: Number(c.getAttribute('cy')) - vy, button: 0 };
  };
  /** A probe dragged onto a point, as with the mouse. */
  const probe = (which: 'red' | 'black', point: string) => {
    fireEvent.mouseDown(svg.querySelector(`[data-probe="${which}"]`)!, { button: 0 });
    fireEvent.mouseMove(window, at(point));
    fireEvent.mouseUp(window, at(point));
  };
  const card = () => screen.queryByRole('group', { name: 'Multimeter' });
  const reading = () => within(card()!).getByRole('status', { name: 'Reading' }).textContent;
  const meter = () => fireEvent.click(screen.getByRole('button', { name: /Meter/ }));
  return { runs, svg, at, probe, card, reading, meter };
}

describe('M9 slice 4: the multimeter (screen 29)', () => {
  it('Meter takes it out: nothing to read until both probes are on points; the divider\'s middle reads 1.65 V', async () => {
    const s = await setup(DIVIDER);
    s.meter();
    expect(screen.getByRole('button', { name: /Meter/ })).toHaveAttribute('aria-pressed', 'true');
    expect(s.reading()).toBe('- - - -V');
    expect(s.card()).toHaveTextContent('+not on anything yet');
    s.probe('red', 'bb1.h9');
    s.probe('black', 'bb1.h13');
    expect(s.reading()).toBe('1.65V');
    expect(s.card()).toHaveTextContent('+column 9 — R1 and R2COMcolumn 13 — GND');
    expect(s.svg.querySelector('[data-probe="red"]')).toHaveAttribute('data-on', '1');
  });

  it('Ω: 20.0 kΩ across both resistors; 10.0 kΩ across one', async () => {
    const s = await setup(DIVIDER);
    s.meter();
    fireEvent.click(within(s.card()!).getByRole('radio', { name: 'Ohms' }));
    s.probe('red', 'bb1.h5');
    s.probe('black', 'bb1.h13');
    expect(s.reading()).toBe('20.0kΩ');
    s.probe('red', 'bb1.h9');
    expect(s.reading()).toBe('10.0kΩ');
  });

  it('A with Blink running: GP15\'s wire clicked reads what the LED draws', async () => {
    const s = await setup(doc(blink));
    fireEvent.click(screen.getByRole('button', { name: 'Run main.py' }));
    act(() => s.runs[0]!.events.onBoard({ pins: { 15: 1 }, state: { pins: { GP15: { mode: 'out', value: 1 } } } }));
    s.meter();
    fireEvent.click(within(s.card()!).getByRole('radio', { name: 'Amps' }));
    expect(s.card()).toHaveTextContent('Throughclick a wire or a leg');
    fireEvent.mouseDown(s.svg.querySelector('[data-wire="w1"]')!, { button: 0 });
    expect(s.reading()).toBe('5.9mA');
    expect(s.card()).toHaveTextContent('W1, from GP15 to column 5');
    expect(s.svg.querySelector('.meter-through')).not.toBeNull();
    // the program turns the pin off: it follows
    act(() => s.runs[0]!.events.onBoard({ pins: { 15: 0 }, state: { pins: { GP15: { mode: 'out', value: 0 } } } }));
    expect(s.reading()).toBe('0µA');
  });

  it('a leg clicked in A: its part\'s nearest leg', async () => {
    const s = await setup(doc(blink));
    s.meter();
    fireEvent.click(within(s.card()!).getByRole('radio', { name: 'Amps' }));
    fireEvent.mouseDown(s.svg.querySelector('[data-part="led1"]')!, s.at('bb1.c10'));   // next to its short leg (b10)
    expect(s.card()).toHaveTextContent("LED1's short leg (column 10)");
    expect(s.reading()).toBe('0µA');   // no program: GP15 is an input
  });

  it('Esc puts it away; Meter again finds the probes where they were', async () => {
    const s = await setup(DIVIDER);
    s.meter();
    s.probe('red', 'bb1.h9');
    s.probe('black', 'bb1.h13');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(s.card()).toBeNull();
    expect(s.svg.querySelector('[data-probe]')).toBeNull();
    s.meter();
    expect(s.reading()).toBe('1.65V');
  });
});
