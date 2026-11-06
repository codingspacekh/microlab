import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { legsCentre } from '@lib/editor';
import type { ProjectDoc } from '@lib/project';
import { App } from '../../src/renderer/app/App';
import type { MicrolabApi } from '../../src/renderer/app/api';
import type { StartRun } from '../../src/renderer/app/useRun';
import type { RunEvents } from '../../src/renderer/sim-client';

/** M4.5 F-22, F-23 (screen 03): Run, Stop, Restart, the console, LEDs glowing and buttons pressed while running.
 *  The simulation is a fake here (the real worker runs in the e2e tests): the test says what the worker says. */
function fakeSim() {
  const runs: { doc: ProjectDoc; entry: string; events: RunEvents; stop: ReturnType<typeof vi.fn>; setInput: ReturnType<typeof vi.fn> }[] = [];
  const start: StartRun = (req, events) => {
    const r = { ...req, events, stop: vi.fn(), setInput: vi.fn() };
    runs.push(r);
    return { stop: r.stop, setInput: r.setInput };
  };
  const say = (f: (e: RunEvents) => void) => act(() => f(runs.at(-1)!.events));
  const end = (ended: string, extra: object = {}) => say((e) => e.onEnd({ output: '', trace: [], pwm: [], analog: [], display: [], sound: [], bus: [], parts: [], faults: [], ended, ...extra } as never));
  return { start, runs, say, end };
}

function api(): MicrolabApi {
  const stored: Record<string, unknown> = {};
  return {
    versions: { app: '0.4.0', electron: '0' },
    settings: { get: async (k) => stored[k], set: async (k, v) => { stored[k] = v; } },
    project: { open: vi.fn(async () => ({ ok: false as const, canceled: true as const })) },
  };
}

function setup(board = 'New Pico W project') {
  const sim = fakeSim();
  render(<App api={api()} width={1440} startRun={sim.start} />);
  fireEvent.click(screen.getByRole('button', { name: board }));
  const svg = screen.getByRole('application', { name: 'Circuit canvas' });
  const [vx, vy] = svg.getAttribute('viewBox')!.split(' ').map(Number) as [number, number];
  const client = (x: number, y: number) => ({ clientX: x - vx, clientY: y - vy, button: 0 });
  const place = (name: RegExp, type: string, hole: string) => {
    const c = svg.querySelector(`[data-point="${hole}"]`)!;
    const [cx, cy] = legsCentre(type);
    const at = client(Number(c.getAttribute('cx')) + cx, Number(c.getAttribute('cy')) + cy);
    fireEvent.mouseDown(within(screen.getByRole('region', { name: 'Parts' })).getByRole('button', { name }), { clientX: 5, clientY: 5, button: 0 });
    fireEvent.mouseMove(svg, at);
    fireEvent.mouseUp(svg, at);
  };
  const consoleText = () => screen.getByRole('log', { name: 'Console' }).textContent;
  return { sim, svg, client, place, consoleText };
}

describe('M4.5 Run and Stop (F-22)', () => {
  it('Run starts main.py with the project as it is; the top bar shows the time, Stop and Restart', () => {
    const s = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(s.sim.runs).toHaveLength(1);
    expect(s.sim.runs[0]!).toMatchObject({ entry: 'main.py', doc: { project: { board: 'pico-w' } } });
    expect(screen.getByRole('timer', { name: 'Running for' })).toHaveTextContent('Running 00:00');
    expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Restart' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Running at real speed');
    expect(s.consoleText()).toMatch(/^MicroPython v1\.29\.0 on Raspberry Pi Pico W \(simulated\) — running main\.py/);
  });

  it('Stop asks the run to stop; once it has, Run is back, the parts go dark, the console says so', () => {
    const s = setup();
    s.place(/^LED/, 'led', 'bb1.c10');
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    s.sim.say((e) => e.onParts({ led1: { kind: 'led', amps: 0.012, brightness: 0.6 } }));
    expect(s.svg.querySelector('[data-part="led1"]')).toHaveAttribute('data-lit', '1');
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(s.sim.runs[0]!.stop).toHaveBeenCalled();
    s.sim.end('stopped');
    expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled();
    expect(s.svg.querySelector('[data-part="led1"]')).toHaveAttribute('data-lit', '0');
    expect(s.consoleText()).toMatch(/Stopped\.\n$/);
    expect(screen.getByRole('status')).toHaveTextContent('Ready');
  });

  it('Restart: stops, then runs again with the code as it is now', async () => {
    vi.useFakeTimers();
    try {
      const s = setup();
      fireEvent.click(screen.getByRole('button', { name: 'Run' }));
      fireEvent.click(screen.getByRole('button', { name: 'Restart' }));
      expect(s.sim.runs[0]!.stop).toHaveBeenCalled();
      s.sim.end('stopped');
      await act(async () => { vi.runAllTimers(); });
      expect(s.sim.runs).toHaveLength(2);
      expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a new project stops what runs', () => {
    const s = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    fireEvent.click(screen.getByRole('button', { name: 'Project menu' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New project…' }));
    expect(s.sim.runs[0]!.stop).toHaveBeenCalled();
  });
});

describe('M4.5 the console (F-23)', () => {
  it('shows what the board prints; the end of the program; Clear empties it', () => {
    const s = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    s.sim.say((e) => e.onOutput('Hello\n'));
    s.sim.say((e) => e.onOutput('24 °C\n'));
    s.sim.end('done');
    expect(s.consoleText()).toContain('Hello\n24 °C\n');
    expect(s.consoleText()).toMatch(/The program ended\.\n$/);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(s.consoleText()).toMatch(/^Press Run/);
  });

  it('an error: the traceback as the board prints it, a red line saying where, and the status bar', () => {
    const s = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    s.sim.say((e) => e.onOutput('Traceback (most recent call last):\n  File "main.py", line 3, in <module>\nNameError: name \'y\' isn\'t defined\n'));
    s.sim.end('error', { error: { type: 'NameError', message: "name 'y' isn't defined", file: 'main.py', line: 3 } });
    const err = screen.getByRole('log', { name: 'Console' }).querySelector('.err')!;
    expect(err).toHaveTextContent("The program stopped with an error (main.py, line 3): NameError: name 'y' isn't defined");
    expect(screen.getByRole('status')).toHaveTextContent('Stopped: an error on line 3');
  });

  it('a damaged circuit: the fault\'s message, in red', () => {
    const s = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    s.sim.end('fault', { fault: { kind: 'led-burnt', part: 'led1', message: 'LED1 burnt out: 95 mA through it (it takes 30 mA at most).' } });
    expect(screen.getByRole('log', { name: 'Console' }).querySelector('.err')).toHaveTextContent('LED1 burnt out');
    expect(screen.getByRole('status')).toHaveTextContent('Stopped: the circuit was damaged');
  });
});

describe('M4.5 while running (screen 03)', () => {
  it('a push button is pressed by holding the mouse on it, and let go', () => {
    const s = setup();
    s.place(/^Push button/, 'button', 'bb1.e20');
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    const btn = s.svg.querySelector('[data-part="btn1"]')!;
    fireEvent.mouseDown(btn, s.client(0, 0));
    expect(s.sim.runs[0]!.setInput).toHaveBeenLastCalledWith('pressed:btn1', 1);
    expect(btn).toHaveAttribute('data-pressed', '1');
    fireEvent.mouseUp(s.svg, s.client(0, 0));
    expect(s.sim.runs[0]!.setInput).toHaveBeenLastCalledWith('pressed:btn1', 0);
    expect(s.svg.querySelector('[data-part="btn1"]')).toHaveAttribute('data-pressed', '0');
  });

  it('the circuit can\'t be changed: no part moves, none is added, the inspector closes, holes take no wires', () => {
    const s = setup();
    s.place(/^Resistor/, 'resistor', 'bb1.a1');
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).toBeNull();
    expect(screen.getByRole('note')).toHaveTextContent('Stop the program to change the circuit');
    const part = s.svg.querySelector('[data-part="r1"]')!;
    fireEvent.mouseDown(part, s.client(100, 100));
    fireEvent.mouseMove(s.svg, s.client(164, 132));
    fireEvent.mouseUp(s.svg, s.client(164, 132));
    expect(part.getAttribute('data-legs')).toBe('bb1.a1 bb1.a4');
    s.place(/^LED/, 'led', 'bb1.c10');
    expect(s.svg.querySelectorAll('[data-part]')).toHaveLength(1);
    expect(s.svg.querySelector('.points')).toHaveAttribute('display', 'none');
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(s.svg.querySelectorAll('[data-part]')).toHaveLength(1);
  });

  it('the Pico W\'s own LED lights from its LED pin', () => {
    const s = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(s.svg.querySelector('[data-board-led]')).toBeNull();
    s.sim.say((e) => e.onBoard({ pins: { LED: 1 } }));
    expect(s.svg.querySelector('[data-board-led]')).not.toBeNull();
    s.sim.say((e) => e.onBoard({ pins: { LED: 0 } }));
    expect(s.svg.querySelector('[data-board-led]')).toBeNull();
  });

  it('the ESP32\'s blue LED lights from its current (a part of the board\'s circuit)', () => {
    const s = setup('New ESP32 project');
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    s.sim.say((e) => e.onParts({ 'board.LED': { kind: 'led', amps: 0.0012, brightness: 0.06 } }));
    expect(s.svg.querySelector('[data-board-led]')).not.toBeNull();
  });

  it('the micro:bit\'s display shows each frame, each pixel as bright as it is', () => {
    const s = setup('New micro:bit project');
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    s.sim.say((e) => e.onBoard({ pins: {}, display: '0909099999999990999000900' }));
    const d = s.svg.querySelector('[data-display]')!;
    expect(d.getAttribute('data-display')).toBe('0909099999999990999000900');
    expect(d.querySelectorAll('rect')).toHaveLength(16);
  });
});
