import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { legsCentre } from '@lib/editor';
import type { ProjectDoc } from '@lib/project';
import { App } from '../../src/renderer/app/App';
import type { StartRun } from '../../src/renderer/app/useRun';
import type { RunEvents } from '../../src/renderer/sim-client';
import { fakeApi } from './fake-api';

/** M6.1 the inputs pack (screens 17, 17b): the slide switch, the light sensor, the RGB LED and the battery pack in
 *  the parts panel, drawn and set in the inspector; while running a switch is clicked, a knob dragged, the light on
 *  a sensor set on its card; an RGB LED mixes its three dies; the micro:bit GPIO board's micro-USB plugged in or out.
 *  The simulation is a fake (run.test.tsx): the test says what the worker says. */
function fakeSim() {
  const runs: { doc: ProjectDoc; events: RunEvents; stop: ReturnType<typeof vi.fn>; setInput: ReturnType<typeof vi.fn> }[] = [];
  const start: StartRun = (req, events) => {
    const r = { ...req, events, stop: vi.fn(), setInput: vi.fn() };
    runs.push(r);
    return { stop: r.stop, setInput: r.setInput };
  };
  const say = (f: (e: RunEvents) => void) => act(() => f(runs.at(-1)!.events));
  return { start, runs, say };
}

function setup(board = 'New Pico W project') {
  const sim = fakeSim();
  render(<App api={fakeApi()} width={1440} startRun={sim.start} />);
  fireEvent.click(screen.getByRole('button', { name: board }));
  const svg = screen.getByRole('application', { name: 'Circuit canvas' });
  const [vx, vy] = svg.getAttribute('viewBox')!.split(' ').map(Number) as [number, number];
  const client = (x: number, y: number) => ({ clientX: x - vx, clientY: y - vy, button: 0 });
  const panel = screen.getByRole('region', { name: 'Parts' });
  const item = (name: RegExp) => within(panel).getByRole('button', { name });
  const place = (name: RegExp, type: string, hole: string) => {
    const c = svg.querySelector(`[data-point="${hole}"]`);
    if (!c) throw new Error(`no free point ${hole}`);
    const [cx, cy] = legsCentre(type);
    const at = client(Number(c.getAttribute('cx')) + cx, Number(c.getAttribute('cy')) + cy);
    fireEvent.mouseDown(item(name), { clientX: 5, clientY: 5, button: 0 });
    fireEvent.mouseMove(svg, at);
    fireEvent.mouseUp(svg, at);
  };
  const part = (id: string) => svg.querySelector(`[data-part="${id}"]`)!;
  const run = () => fireEvent.click(screen.getByRole('button', { name: 'Run main.py' }));
  /** Stop, and the (fake) worker says it stopped. */
  const stop = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    sim.say((e) => e.onEnd({ output: '', trace: [], pwm: [], analog: [], display: [], sound: [], bus: [], parts: [], faults: [], ended: 'stopped' } as never));
  };
  const inspector = () => screen.getByRole('complementary', { name: 'Inspector' });
  return { sim, svg, client, item, place, part, run, stop, inspector };
}

describe('M6.1 the inputs pack in the parts panel (screen 17)', () => {
  it('lists the RGB LED, the slide switch, the light sensor and the battery pack with the basics', () => {
    const s = setup();
    for (const name of [/^Resistor/, /^LED/, /^RGB LED/, /^Push button/, /^Slide switch/, /^Potentiometer/, /^Light sensor \(LDR\)/, /^Battery pack/]) {
      expect(s.item(name)).toBeInTheDocument();
    }
  });

  it('each is drawn where it is dropped, legs in holes', () => {
    const s = setup();
    s.place(/^Slide switch/, 'slide-switch', 'bb1.e21');
    s.place(/^Light sensor/, 'ldr', 'bb1.a26');
    s.place(/^RGB LED/, 'rgb-led', 'bb1.h20');
    s.place(/^Battery pack/, 'battery', 'bb1.B+20');
    expect(s.part('sw1')).toHaveAttribute('data-legs', 'bb1.e21 bb1.e22 bb1.e23');
    expect(s.part('ldr1')).toHaveAttribute('data-legs', 'bb1.a26 bb1.a28');
    expect(s.part('rgb1')).toHaveAttribute('data-legs', 'bb1.h20 bb1.h21 bb1.h22 bb1.h23');
    expect(s.part('bat1')).toHaveAttribute('data-legs', 'bb1.B+20 bb1.B-20');
    for (const id of ['sw1', 'ldr1', 'rgb1', 'bat1']) expect(s.part(id).querySelector('path, rect, circle')).not.toBeNull();
    expect(within(s.part('bat1') as HTMLElement).getByText('3 V')).toBeInTheDocument();
  });
});

describe('M6.1 the inspector (screens 17, 17b)', () => {
  it('an RGB LED: common cathode or anode; its legs R, −, G, B — + for a common anode', () => {
    const s = setup();
    s.place(/^RGB LED/, 'rgb-led', 'bb1.h20');
    const common = within(s.inspector()).getByRole('radiogroup', { name: 'Common leg' });
    expect(within(common).getByRole('radio', { name: /cathode/ })).toHaveAttribute('aria-checked', 'true');
    expect(within(s.inspector()).getByText(/R h20/)).toBeInTheDocument();
    expect(within(s.inspector()).getByText('nothing yet')).toBeInTheDocument();   // not "nothing ↔ nothing ↔ nothing ↔ nothing"
    expect(within(s.part('rgb1') as HTMLElement).getByText('−')).toBeInTheDocument();
    fireEvent.click(within(common).getByRole('radio', { name: /anode/ }));
    expect(JSON.parse(s.part('rgb1').getAttribute('data-props')!)).toMatchObject({ common: 'anode' });
    expect(within(s.part('rgb1') as HTMLElement).getByText('+')).toBeInTheDocument();
  });

  it('a battery pack: 2×AA, 4×AA or 9 V; its red lead in +, its black lead in −', () => {
    const s = setup();
    s.place(/^Battery pack/, 'battery', 'bb1.B+20');
    const pack = within(s.inspector()).getByRole('radiogroup', { name: 'Battery pack' });
    expect(within(pack).getByRole('radio', { name: '2×AA · 3 V' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(within(pack).getByRole('radio', { name: '9 V' }));
    expect(JSON.parse(s.part('bat1').getAttribute('data-props')!)).toMatchObject({ kind: '9V' });
    expect(within(s.part('bat1') as HTMLElement).getByText('9 V')).toBeInTheDocument();
    expect(within(s.inspector()).getByText(/red lead/)).toHaveTextContent('B+20');
    expect(within(s.inspector()).getByText(/black lead/)).toHaveTextContent('B-20');
  });
});

describe('M6.1 while running (screen 17)', () => {
  it('a slide switch is clicked to slide it: position 1, then 0 again; a new run starts it at 0', () => {
    const s = setup();
    s.place(/^Slide switch/, 'slide-switch', 'bb1.e21');
    s.run();
    expect(s.part('sw1')).toHaveAttribute('data-position', '0');
    fireEvent.mouseDown(s.part('sw1'), s.client(0, 0));
    expect(s.sim.runs[0]!.setInput).toHaveBeenLastCalledWith('position:sw1', 1);
    expect(s.part('sw1')).toHaveAttribute('data-position', '1');
    fireEvent.mouseDown(s.part('sw1'), s.client(0, 0));
    expect(s.sim.runs[0]!.setInput).toHaveBeenLastCalledWith('position:sw1', 0);
    fireEvent.mouseDown(s.part('sw1'), s.client(0, 0));
    s.stop();
    s.run();
    expect(s.part('sw1')).toHaveAttribute('data-position', '0');
  });

  it('a knob is turned by dragging up (more) or down (less) from the middle', () => {
    const s = setup();
    s.place(/^Potentiometer/, 'potentiometer', 'bb1.e21');
    s.run();
    expect(s.part('pot1')).toHaveAttribute('data-position', '0.5');
    fireEvent.mouseDown(s.part('pot1'), s.client(0, 200));
    fireEvent.mouseMove(s.svg, s.client(0, 140));
    const up = s.sim.runs[0]!.setInput.mock.lastCall!;
    expect(up[0]).toBe('position:pot1');
    expect(up[1]).toBeGreaterThan(0.5);
    fireEvent.mouseMove(s.svg, s.client(0, 2000));
    expect(s.sim.runs[0]!.setInput).toHaveBeenLastCalledWith('position:pot1', 0);
    fireEvent.mouseUp(s.svg, s.client(0, 2000));
    fireEvent.mouseMove(s.svg, s.client(0, 0));
    expect(s.sim.runs[0]!.setInput).toHaveBeenLastCalledWith('position:pot1', 0);
    expect(s.part('pot1')).toHaveAttribute('data-position', '0');
  });

  it('the light sensor\'s row on the Inputs card (screen 18) sets the light on it, from dark to daylight, and says its resistance', () => {
    const s = setup();
    s.place(/^Light sensor/, 'ldr', 'bb1.a24');
    expect(screen.queryByRole('group', { name: 'Inputs' })).toBeNull();
    s.run();
    const card = screen.getByRole('group', { name: 'Inputs' });
    const slider = within(card).getByRole('slider', { name: 'Light on LDR1' });
    expect(slider).toHaveAttribute('aria-valuetext', '300 lux');
    expect(card).toHaveTextContent('LDR1');
    expect(card).toHaveTextContent('1.4 kΩ');
    fireEvent.keyDown(slider, { key: 'Home' });
    expect(s.sim.runs[0]!.setInput).toHaveBeenLastCalledWith('lux:ldr1', 0.1);
    expect(card).toHaveTextContent('380 kΩ');
    fireEvent.keyDown(slider, { key: 'End' });
    expect(s.sim.runs[0]!.setInput).toHaveBeenLastCalledWith('lux:ldr1', 100_000);
    fireEvent.click(within(card).getByRole('button', { name: 'Close the inputs card' }));
    expect(screen.queryByRole('group', { name: 'Inputs' })).toBeNull();
    fireEvent.mouseDown(s.part('ldr1'), s.client(0, 0));
    expect(screen.getByRole('group', { name: 'Inputs' })).toBeInTheDocument();
    s.stop();
    expect(screen.queryByRole('group', { name: 'Inputs' })).toBeNull();
  });

  it('an RGB LED mixes its three dies; hovering it shows each one\'s current', () => {
    const s = setup();
    s.place(/^RGB LED/, 'rgb-led', 'bb1.h20');
    s.run();
    expect(s.part('rgb1')).toHaveAttribute('data-lit', '0');
    s.sim.say((e) => e.onParts({
      'rgb1:r': { kind: 'led', amps: 0.0059, brightness: 0.295 },
      'rgb1:g': { kind: 'led', amps: 0, brightness: 0 },
      'rgb1:b': { kind: 'led', amps: 0.0014, brightness: 0.07 },
    }));
    expect(s.part('rgb1')).toHaveAttribute('data-lit', '1');
    expect(s.part('rgb1').querySelectorAll('.glow')).toHaveLength(2);
    fireEvent.mouseEnter(s.part('rgb1'));
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('RGB1 · common cathode');
    expect(tip).toHaveTextContent('R 5.9 mA · G 0 mA · B 1.4 mA');
    expect(tip).toHaveTextContent(/Green and blue need about 3 V/);
    fireEvent.mouseLeave(s.part('rgb1'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('an LED says its current on hover too (screen 03)', () => {
    const s = setup();
    s.place(/^LED/, 'led', 'bb1.c10');
    s.run();
    s.sim.say((e) => e.onParts({ led1: { kind: 'led', amps: 0.0059, brightness: 0.295 } }));
    fireEvent.mouseEnter(s.part('led1'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('LED1 · 5.9 mA');
  });

  it('the note in the parts panel says what can be done while running', () => {
    const s = setup();
    s.run();
    expect(screen.getByRole('note')).toHaveTextContent(/click a slide switch/);
    expect(screen.getByRole('note')).toHaveTextContent(/drag a knob/);
  });
});

describe('M6.1 the micro:bit GPIO board\'s micro-USB (screen 17b)', () => {
  it('a new micro:bit project has it plugged in; a click takes it out (an undo step) and puts it back', () => {
    const s = setup('New micro:bit project');
    const usb = () => s.svg.querySelector('[data-usb]')!;
    expect(usb()).toHaveAttribute('data-usb', 'in');
    expect(usb().querySelector('.usb-plug')).not.toBeNull();
    fireEvent.mouseEnter(usb());
    expect(screen.getByRole('tooltip')).toHaveTextContent(/micro-USB · 5V in.*plugged in.*Click to take it out/);
    fireEvent.click(usb());
    expect(usb()).toHaveAttribute('data-usb', 'out');
    expect(usb().querySelector('.usb-plug')).toBeNull();
    expect(screen.getByRole('tooltip')).toHaveTextContent(/not plugged in.*give nothing.*Click to plug it in/);
    fireEvent.click(screen.getByRole('button', { name: /^Undo/ }));
    expect(usb()).toHaveAttribute('data-usb', 'in');
  });

  it('the run is told: unplugged, the project says usb: false', () => {
    const s = setup('New micro:bit project');
    fireEvent.click(s.svg.querySelector('[data-usb]')!);
    s.run();
    expect(s.sim.runs[0]!.doc.project.usb).toBe(false);
    fireEvent.click(s.svg.querySelector('[data-usb]')!);   // can't be changed while running
    expect(s.svg.querySelector('[data-usb]')).toHaveAttribute('data-usb', 'out');
  });

  it('the Pico W has no such socket', () => {
    const s = setup();
    expect(s.svg.querySelector('[data-usb]')).toBeNull();
  });
});
