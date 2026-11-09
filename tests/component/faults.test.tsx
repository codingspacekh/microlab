import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Fault } from '@lib/circuit';
import { legsCentre } from '@lib/editor';
import type { ProjectDoc } from '@lib/project';
import { App } from '../../src/renderer/app/App';
import type { StartRun } from '../../src/renderer/app/useRun';
import type { RunEvents } from '../../src/renderer/sim-client';
import { fakeApi } from './fake-api';
import { partsPanel, startBuilding } from './start-building';
import { newProjectFromStart } from './new-project';

/** M9 slice 2 (F-37, F-24; screens 04, 25c, 27c): a fault's card on the canvas, Problems, the status bar, a burnt LED
 *  dead until replaced. The worker is a fake: the test says which faults it tells. */
function fakeSim() {
  const runs: { doc: ProjectDoc; entry: string; burnt?: string[]; events: RunEvents }[] = [];
  const start: StartRun = (req, events) => {
    runs.push({ ...req, events });
    return { stop: vi.fn(), setInput: vi.fn() };
  };
  const say = (f: (e: RunEvents) => void) => act(() => f(runs.at(-1)!.events));
  const fault = (f: Fault) => say((e) => e.onFault?.(f));
  const end = (ended: string, faults: Fault[] = [], extra: object = {}) =>
    say((e) => e.onEnd({ output: '', trace: [], pwm: [], analog: [], display: [], sound: [], bus: [], parts: [], faults, ended, ...extra } as never));
  return { start, runs, fault, end };
}

async function setup() {
  const sim = fakeSim();
  render(<App api={fakeApi()} width={1440} startRun={sim.start} />);
  await newProjectFromStart('New Pico W project');
  startBuilding();
  const svg = screen.getByRole('application', { name: 'Circuit canvas' });
  const [vx, vy] = svg.getAttribute('viewBox')!.split(' ').map(Number) as [number, number];
  const place = (name: RegExp, type: string, hole: string) => {
    const c = svg.querySelector(`[data-point="${hole}"]`)!;
    const [cx, cy] = legsCentre(type);
    const at = { clientX: Number(c.getAttribute('cx')) + cx - vx, clientY: Number(c.getAttribute('cy')) + cy - vy, button: 0 };
    fireEvent.mouseDown(within(partsPanel()).getByRole('button', { name }), { clientX: 5, clientY: 5, button: 0 });
    fireEvent.mouseMove(svg, at);
    fireEvent.mouseUp(svg, at);
  };
  const run = () => fireEvent.click(screen.getByRole('button', { name: 'Run main.py' }));
  return { sim, svg, place, run };
}

const BURNT: Fault = { kind: 'led-burnt', severity: 'damage', on: 'led1', amps: 0.048, limitA: 0.03, ratedA: 0.02, via: 'GP13', atMs: 1400 };
const PIN13: Fault = { kind: 'pin-over-current', severity: 'warning', on: 'GP13', amps: 0.048, limitA: 0.012, atMs: 1400 };
const problems = () => screen.getByRole('region', { name: 'Problems in the circuit' });

describe('M9 slice 2: an LED with no resistor burns out (screen 04)', () => {
  it('its card beside it — why, the numbers, the fix — Problems open with both, the status bar says so', async () => {
    const s = await setup();
    s.place(/^LED/, 'led', 'bb1.e20');
    s.run();
    s.sim.fault(BURNT);
    s.sim.fault(PIN13);
    s.sim.end('fault', [BURNT, PIN13], { fault: { ...BURNT, message: '' } });

    const card = screen.getByRole('group', { name: 'LED1 burnt out' });
    expect(card).toHaveTextContent('GP13 goes straight to the red LED with no resistor, so far too much current flowed. A real LED would now be dead.');
    expect(card).toHaveTextContent('Current≈ 48 mALED can take20 mAPin can give12 mA');
    expect(card).toHaveTextContent('Fix: put a 220 Ω resistor between GP13 and the LED.');
    // GP13's own warning is in Problems, not a second note on the canvas
    expect(screen.queryByRole('note', { name: 'GP13 gave more than it should' })).toBeNull();

    expect(screen.getByRole('tab', { name: /Problems/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Problems/ })).toHaveTextContent('Problems2');
    const items = within(problems()).getAllByRole('listitem');
    expect(items.map((i) => i.querySelector('b')!.textContent)).toEqual(['LED1 (red) burnt out', 'GP13 gave more than it should']);
    expect(items[0]).toHaveTextContent('About 48 mA from GP13 — no resistor. The simulation stopped at 00:01.4.');

    expect(screen.getByRole('status')).toHaveTextContent('Stopped: a part was damaged');
    expect(screen.getByRole('status')).toHaveTextContent('1 part damaged · 1 warning');
    expect(s.svg.querySelector('[data-part="led1"]')).toHaveAttribute('data-burnt', '1');
  });

  it('it stays dead in the next run until it is replaced; Replace the LED lights it again', async () => {
    const s = await setup();
    s.place(/^LED/, 'led', 'bb1.e20');
    s.run();
    s.sim.fault(BURNT);
    s.sim.end('fault', [BURNT], { fault: { ...BURNT, message: '' } });
    s.run();
    expect(s.sim.runs[1]!.burnt).toEqual(['led1']);
    expect(screen.getByRole('tab', { name: /Console/ })).toHaveAttribute('aria-selected', 'true');   // a new run: the console
    s.sim.end('done');
    expect(s.svg.querySelector('[data-part="led1"]')).toHaveAttribute('data-burnt', '1');

    s.run();
    s.sim.fault(BURNT);
    s.sim.end('fault', [BURNT], { fault: { ...BURNT, message: '' } });
    fireEvent.click(within(screen.getByRole('group', { name: 'LED1 burnt out' })).getByRole('button', { name: 'Replace the LED' }));
    expect(s.svg.querySelector('[data-part="led1"]')).not.toHaveAttribute('data-burnt');
    expect(screen.queryByRole('group', { name: 'LED1 burnt out' })).toBeNull();
    s.run();
    expect(s.sim.runs.at(-1)!.burnt).toBeUndefined();
  });

  it('the card closes with its ×, and stays in Problems; Clear empties Problems but for the LED still dead', async () => {
    const s = await setup();
    s.place(/^LED/, 'led', 'bb1.e20');
    s.run();
    s.sim.end('fault', [BURNT], { fault: { ...BURNT, message: '' } });
    fireEvent.click(within(screen.getByRole('group', { name: 'LED1 burnt out' })).getByRole('button', { name: 'Close the card' }));
    expect(screen.queryByRole('group', { name: 'LED1 burnt out' })).toBeNull();
    expect(within(problems()).getByText('LED1 (red) burnt out')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(within(problems()).getAllByRole('listitem').map((i) => i.querySelector('b')!.textContent)).toEqual(['LED1 (red) is still burnt out']);
    fireEvent.click(within(problems()).getByRole('button', { name: 'Replace' }));
    expect(problems()).toHaveTextContent('No problems in the circuit.');
  });

  it('Show selects the LED and rings it', async () => {
    const s = await setup();
    s.place(/^LED/, 'led', 'bb1.e20');
    s.run();
    s.sim.end('fault', [BURNT], { fault: { ...BURNT, message: '' } });
    fireEvent.click(within(problems()).getByRole('button', { name: 'Show: LED1 (red) burnt out' }));
    expect(s.svg.querySelector('[data-part="led1"]')).toHaveAttribute('aria-selected', 'true');
    expect(s.svg.querySelector('.focus-ring')).not.toBeNull();
  });
});

describe('M9 slice 2: a pin damaged (screen 25c), warnings while running (screen 27c)', () => {
  it('a motor on GP15: GP15 was damaged, ringed; Undo takes back the last edit', async () => {
    const s = await setup();
    s.place(/^LED/, 'led', 'bb1.e20');
    const motor: Fault = { kind: 'motor-on-pin', severity: 'damage', on: 'GP15', part: 'motor1', amps: 0.046, limitA: 0.012, atMs: 200 };
    s.run();
    s.sim.fault(motor);
    s.sim.end('fault', [motor], { fault: { ...motor, message: '' } });
    const card = screen.getByRole('group', { name: 'GP15 was damaged' });
    expect(card).toHaveTextContent("MOTOR1 is wired straight to GP15.");
    expect(within(card).queryByRole('button', { name: 'Replace the LED' })).toBeNull();
    expect(s.svg.querySelector('[data-hurt="GP15"]')).not.toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Stopped: a pin was damaged');
    expect(screen.getByRole('status')).toHaveTextContent('1 pin damaged');
    fireEvent.click(within(card).getByRole('button', { name: 'Undo' }));
    expect(s.svg.querySelector('[data-part="led1"]')).toBeNull();
  });

  it('a warning while running: a note beside the pin, counted in Problems and the status bar; the console stays', async () => {
    const s = await setup();
    s.run();
    s.sim.fault({ kind: 'floating', severity: 'warning', on: 'GP14', atMs: 50 });
    const note = screen.getByRole('note', { name: 'GP14 reads chance' });
    expect(note).toHaveTextContent('Use Pin.PULL_UP or Pin.PULL_DOWN');
    expect(screen.getByRole('tab', { name: /Problems/ })).toHaveTextContent('Problems1');
    expect(screen.getByRole('tab', { name: /Console/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('1 warning');
    fireEvent.click(within(note).getByRole('button', { name: 'Close the note' }));
    expect(screen.queryByRole('note', { name: 'GP14 reads chance' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: /Problems/ }));
    expect(within(problems()).getByText('GP14 reads chance')).toBeInTheDocument();
  });
});
