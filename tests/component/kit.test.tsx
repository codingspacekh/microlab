import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { legsCentre } from '@lib/editor';
import type { ProjectDoc } from '@lib/project';
import { App } from '../../src/renderer/app/App';
import type { StartRun } from '../../src/renderer/app/useRun';
import type { RunEvents } from '../../src/renderer/sim-client';
import { fakeApi } from './fake-api';
import { startBuilding } from './start-building';

/** M6.5a (screens 20, 20b, approved 2026-11-07): the SunFounder kit's input modules in the editor and while running —
 *  held, clicked, dragged, turned, and set on the Inputs card. */
function setup() {
  const runs: { doc: ProjectDoc; events: RunEvents; setInput: ReturnType<typeof vi.fn> }[] = [];
  const start: StartRun = (req, events) => {
    const r = { ...req, events, setInput: vi.fn() };
    runs.push(r);
    return { stop: vi.fn(), setInput: r.setInput };
  };
  render(<App api={fakeApi()} width={1440} startRun={start} audio={() => null} />);
  fireEvent.click(screen.getByRole('button', { name: 'New Pico W project' }));
  startBuilding();
  const svg = screen.getByRole('application', { name: 'Circuit canvas' });
  const [vx, vy] = svg.getAttribute('viewBox')!.split(' ').map(Number) as [number, number];
  const client = (x: number, y: number) => ({ clientX: x - vx, clientY: y - vy, button: 0 });
  const panel = screen.getByRole('region', { name: 'Parts' });
  const place = (name: RegExp, type: string, hole: string) => {
    const c = svg.querySelector(`[data-point="${hole}"]`)!;
    const [cx, cy] = legsCentre(type);
    const at = client(Number(c.getAttribute('cx')) + cx, Number(c.getAttribute('cy')) + cy);
    fireEvent.mouseDown(within(panel).getByRole('button', { name }), { clientX: 5, clientY: 5, button: 0 });
    fireEvent.mouseMove(svg, at);
    fireEvent.mouseUp(svg, at);
  };
  const part = (id: string) => svg.querySelector(`[data-part="${id}"]`)!;
  const input = () => runs[0]!.setInput;
  const run = () => fireEvent.click(screen.getByRole('button', { name: 'Run main.py' }));
  const say = (f: (e: RunEvents) => void) => act(() => f(runs.at(-1)!.events));
  return { svg, client, panel, place, part, input, run, say };
}

describe('M6.5a the kit\'s modules in the editor (screens 20, 20b)', () => {
  it('a Modules group in the parts panel, the 14 of them and the RC522 RFID reader (M7)', () => {
    const s = setup();
    const group = within(s.panel).getByRole('group', { name: 'Modules' });
    expect(within(group).getAllByRole('button')).toHaveLength(15);
    expect(within(group).getByRole('button', { name: /^Gas \/ smoke \(MQ-2\)/ })).toBeInTheDocument();
  });

  it('each drawn from its pins, named as printed in the inspector, with what to know', () => {
    const s = setup();
    s.place(/^Flame/, 'flame', 'bb1.f21');
    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    expect(within(inspector).getByText('AO f21, GND f22, VCC f23, DO f24')).toBeInTheDocument();
    expect(within(s.part('flame1') as HTMLElement).getByText('DO')).toBeInTheDocument();
    s.place(/^Gas \/ smoke/, 'mq2', 'bb1.f2');
    expect(within(screen.getByRole('complementary', { name: 'Inspector' })).getByText(/heater needs 5 V/)).toBeInTheDocument();
  });
});

describe('M6.5a while running (screen 20)', () => {
  it('held: the button module (pressed), the touch pad; clicked: the IR obstacle sensor, the Hall sensor', () => {
    const s = setup();
    s.place(/^Button module/, 'button-module', 'bb1.f2');
    s.place(/^Touch/, 'touch', 'bb1.f6');
    s.place(/^IR obstacle/, 'ir-obstacle', 'bb1.f10');
    s.place(/^Hall/, 'hall', 'bb1.f14');
    s.run();
    fireEvent.mouseDown(s.part('kbtn1'), s.client(0, 0));
    expect(s.input()).toHaveBeenLastCalledWith('pressed:kbtn1', 1);
    fireEvent.mouseUp(s.svg, s.client(0, 0));
    expect(s.input()).toHaveBeenLastCalledWith('pressed:kbtn1', 0);
    fireEvent.mouseDown(s.part('touch1'), s.client(0, 0));
    expect(s.input()).toHaveBeenLastCalledWith('pressed:touch1', 1);
    fireEvent.mouseUp(s.svg, s.client(0, 0));
    fireEvent.mouseDown(s.part('ir1'), s.client(0, 0));
    expect(s.input()).toHaveBeenLastCalledWith('position:ir1', 1);
    expect(s.part('ir1')).toHaveAttribute('data-position', '1');
    fireEvent.mouseDown(s.part('hall1'), s.client(0, 0));
    expect(s.input()).toHaveBeenLastCalledWith('position:hall1', 1);
  });

  it('the joystick: dragged, its axes follow; let go, it springs back; a click presses SW', () => {
    const s = setup();
    s.place(/^Joystick/, 'joystick', 'bb1.f2');
    s.run();
    fireEvent.mouseDown(s.part('joy1'), { clientX: 200, clientY: 200, button: 0 });
    fireEvent.mouseMove(window, { clientX: 230, clientY: 215 });
    expect(s.input()).toHaveBeenCalledWith('x:joy1', 1);
    expect(s.input()).toHaveBeenLastCalledWith('y:joy1', 0.25);
    fireEvent.mouseUp(window, { clientX: 230, clientY: 215 });
    expect(s.input()).toHaveBeenCalledWith('x:joy1', 0.5);
    expect(s.input()).toHaveBeenLastCalledWith('y:joy1', 0.5);
    fireEvent.mouseDown(s.part('joy1'), { clientX: 200, clientY: 200, button: 0 });
    fireEvent.mouseUp(window, { clientX: 200, clientY: 200 });
    expect(s.input()).toHaveBeenCalledWith('pressed:joy1', 1);
  });

  it('the rotary encoder: dragged round a quarter turn clockwise is 6 steps; a click presses it', () => {
    const s = setup();
    s.place(/^Rotary encoder/, 'rotary-encoder', 'bb1.f2');
    s.run();
    // jsdom has no layout: the encoder's middle is the screen's corner (0, 0)
    fireEvent.mouseDown(s.part('enc1'), { clientX: 100, clientY: 0, button: 0 });
    fireEvent.mouseMove(window, { clientX: 71, clientY: 71 });
    fireEvent.mouseMove(window, { clientX: 0, clientY: 100 });
    expect(s.input()).toHaveBeenLastCalledWith('steps:enc1', 6);
    fireEvent.mouseUp(window, { clientX: 0, clientY: 100 });
    fireEvent.mouseDown(s.part('enc1'), { clientX: 100, clientY: 0, button: 0 });
    fireEvent.mouseUp(window, { clientX: 100, clientY: 0 });
    expect(s.input()).toHaveBeenCalledWith('pressed:enc1', 1);
  });

  it('the Inputs card: the flame, the gas, the wheel\'s speed — each with its output', () => {
    const s = setup();
    s.place(/^Flame/, 'flame', 'bb1.f2');
    s.place(/^Gas \/ smoke/, 'mq2', 'bb1.f8');
    s.place(/^IR speed sensor/, 'speed-sensor', 'bb1.f14');
    s.run();
    const card = screen.getByRole('group', { name: 'Inputs' });
    const flame = within(card).getByRole('slider', { name: 'Flame at FLAME1' });
    expect(flame).toHaveAttribute('aria-valuetext', '0 %');
    fireEvent.keyDown(flame, { key: 'End' });
    expect(s.input()).toHaveBeenLastCalledWith('position:flame1', 1);
    fireEvent.keyDown(within(card).getByRole('slider', { name: 'Gas at GAS1' }), { key: 'End' });
    expect(s.input()).toHaveBeenLastCalledWith('position:gas1', 1);
    const rpm = within(card).getByRole('slider', { name: 'Speed of SPEED1' });
    fireEvent.keyDown(rpm, { key: 'End' });
    expect(s.input()).toHaveBeenLastCalledWith('rpm:speed1', 300);
    expect(card).toHaveTextContent('100 pulses/s');
    s.say((e) => e.onParts({ flame1: { kind: 'sensor', volts: 0.5, powered: true } }));
    expect(card).toHaveTextContent('AO 0.5 V');
  });
});
