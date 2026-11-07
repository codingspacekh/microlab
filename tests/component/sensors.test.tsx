import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { legsCentre } from '@lib/editor';
import type { ProjectDoc } from '@lib/project';
import { App } from '../../src/renderer/app/App';
import type { StartRun } from '../../src/renderer/app/useRun';
import type { RunEvents } from '../../src/renderer/sim-client';
import { fakeApi } from './fake-api';

/** M6.3 (screen 18, approved 2026-11-07): the PIR, the line sensor, the soil moisture sensor and the TMP36 / LM35 in
 *  the parts panel's Sensors group, standing in the breadboard; while running the PIR is held to see motion, the line
 *  sensor clicked over the line or white, the soil's moisture and the temperature set on the Inputs card. */
function fakeSim() {
  const runs: { doc: ProjectDoc; events: RunEvents; setInput: ReturnType<typeof vi.fn> }[] = [];
  const start: StartRun = (req, events) => {
    const r = { ...req, events, setInput: vi.fn() };
    runs.push(r);
    return { stop: vi.fn(), setInput: r.setInput };
  };
  const say = (f: (e: RunEvents) => void) => act(() => f(runs.at(-1)!.events));
  return { start, runs, say };
}

function setup() {
  const sim = fakeSim();
  render(<App api={fakeApi()} width={1440} startRun={sim.start} audio={() => null} />);
  fireEvent.click(screen.getByRole('button', { name: 'New Pico W project' }));
  const svg = screen.getByRole('application', { name: 'Circuit canvas' });
  const [vx, vy] = svg.getAttribute('viewBox')!.split(' ').map(Number) as [number, number];
  const client = (x: number, y: number) => ({ clientX: x - vx, clientY: y - vy, button: 0 });
  const panel = screen.getByRole('region', { name: 'Parts' });
  const item = (name: RegExp) => within(panel).getByRole('button', { name });
  const place = (name: RegExp, type: string, hole: string) => {
    const c = svg.querySelector(`[data-point="${hole}"]`)!;
    const [cx, cy] = legsCentre(type);
    const at = client(Number(c.getAttribute('cx')) + cx, Number(c.getAttribute('cy')) + cy);
    fireEvent.mouseDown(item(name), { clientX: 5, clientY: 5, button: 0 });
    fireEvent.mouseMove(svg, at);
    fireEvent.mouseUp(svg, at);
  };
  const part = (id: string) => svg.querySelector(`[data-part="${id}"]`)!;
  const run = () => fireEvent.click(screen.getByRole('button', { name: 'Run main.py' }));
  const inspector = () => screen.getByRole('complementary', { name: 'Inspector' });
  return { sim, svg, client, panel, item, place, part, run, inspector };
}

describe('M6.3 the sensors in the editor (screen 18)', () => {
  it('the parts panel has a Sensors group: the modules of screen 19, then PIR, line sensor, soil moisture, temperature', () => {
    const s = setup();
    const group = within(s.panel).getByRole('group', { name: 'Sensors' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Ultrasonic HC-SR04distance · 5 V', 'DHT11 / DHT22temperature, humidity', 'MPU6050 motionaccelerometer · I²C',
      'PIR motionHC-SR501 · 5 V', 'Line sensor (IR)TCRT5000', 'Soil moisturecapacitive', 'TemperatureTMP36 · LM35',
    ]);
    expect(within(within(s.panel).getByRole('group', { name: 'Basics' })).getAllByRole('button')).toHaveLength(9);
  });

  it('each stands in row f, drawn from its pins; the inspector names them in their printed order', () => {
    const s = setup();
    s.place(/^PIR motion/, 'pir', 'bb1.f7');
    expect(s.part('pir1')).toHaveAttribute('data-legs', 'bb1.f7 bb1.f8 bb1.f9');
    expect(within(s.inspector()).getByText('VCC f7, OUT f8, GND f9')).toBeInTheDocument();
    expect(within(s.inspector()).getByText(/needs 5 V/)).toBeInTheDocument();
    s.place(/^Line sensor/, 'line-sensor', 'bb1.f12');
    expect(within(s.inspector()).getByText('OUT f12, GND f13, VCC f14')).toBeInTheDocument();
    s.place(/^Soil moisture/, 'soil-moisture', 'bb1.f19');
    expect(within(s.inspector()).getByText('AOUT f19, VCC f20, GND f21')).toBeInTheDocument();
    for (const id of ['pir1', 'line1', 'soil1']) expect(s.part(id).querySelector('rect')).not.toBeNull();
  });

  it('a temperature sensor is a TMP36 or an LM35; the drawing says which', () => {
    const s = setup();
    s.place(/^Temperature/, 'temp-sensor', 'bb1.f2');
    expect(within(s.inspector()).getByText('+Vs f2, Vout f3, GND f4')).toBeInTheDocument();
    const kind = within(s.inspector()).getByRole('radiogroup', { name: 'Sensor kind' });
    expect(within(s.part('tmp1') as HTMLElement).getByText('TMP36')).toBeInTheDocument();
    fireEvent.click(within(kind).getByRole('radio', { name: 'LM35' }));
    expect(JSON.parse(s.part('tmp1').getAttribute('data-props')!)).toMatchObject({ kind: 'LM35' });
    expect(within(s.part('tmp1') as HTMLElement).getByText('LM35')).toBeInTheDocument();
    expect(within(s.inspector()).getByText(/needs 4 V/)).toBeInTheDocument();
  });
});

describe('M6.3 while running (screen 18)', () => {
  it('the PIR is held to see motion; its waves show while its OUT is high (its 3 s hold too); its tip says so', () => {
    const s = setup();
    s.place(/^PIR motion/, 'pir', 'bb1.f7');
    s.run();
    fireEvent.mouseDown(s.part('pir1'), s.client(0, 0));
    expect(s.sim.runs[0]!.setInput).toHaveBeenLastCalledWith('pressed:pir1', 1);
    fireEvent.mouseUp(s.svg, s.client(0, 0));
    expect(s.sim.runs[0]!.setInput).toHaveBeenLastCalledWith('pressed:pir1', 0);
    s.sim.say((e) => e.onParts({ pir1: { kind: 'sensor', volts: 3.3, powered: true } }));
    expect(s.part('pir1').querySelector('.waves')).not.toBeNull();
    fireEvent.mouseEnter(s.part('pir1'));
    expect(screen.getByRole('tooltip')).toHaveTextContent(/PIR1 · motion.*hold the mouse on it.*3 s after/);
    s.sim.say((e) => e.onParts({ pir1: { kind: 'sensor', volts: 0, powered: false } }));
    expect(s.part('pir1').querySelector('.waves')).toBeNull();
    expect(screen.getByRole('tooltip')).toHaveTextContent(/PIR1 · no motion.*Not powered: it needs 5 V/);
  });

  it('the line sensor is clicked over the line, and back over white', () => {
    const s = setup();
    s.place(/^Line sensor/, 'line-sensor', 'bb1.f12');
    s.run();
    expect(s.part('line1')).toHaveAttribute('data-position', '0');
    fireEvent.mouseDown(s.part('line1'), s.client(0, 0));
    expect(s.sim.runs[0]!.setInput).toHaveBeenLastCalledWith('position:line1', 1);
    expect(s.part('line1')).toHaveAttribute('data-position', '1');
    fireEvent.mouseEnter(s.part('line1'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('LINE1 · over the line — OUT 1. Click to slide it over white.');
    fireEvent.mouseDown(s.part('line1'), s.client(0, 0));
    expect(s.sim.runs[0]!.setInput).toHaveBeenLastCalledWith('position:line1', 0);
  });

  it('the Inputs card: a row for the temperature and one for the soil, each with its output\'s volts', () => {
    const s = setup();
    s.place(/^Temperature/, 'temp-sensor', 'bb1.f2');
    s.place(/^Soil moisture/, 'soil-moisture', 'bb1.f19');
    s.run();
    const card = screen.getByRole('group', { name: 'Inputs' });
    const temp = within(card).getByRole('slider', { name: 'Temperature of TMP1' });
    expect(temp).toHaveAttribute('aria-valuetext', '22 °C');
    fireEvent.keyDown(temp, { key: 'ArrowUp' });
    fireEvent.keyDown(temp, { key: 'ArrowUp' });
    expect(s.sim.runs[0]!.setInput).toHaveBeenLastCalledWith('celsius:tmp1', 24);
    const soil = within(card).getByRole('slider', { name: 'Moisture around SOIL1' });
    expect(soil).toHaveAttribute('aria-valuetext', '50 %');
    fireEvent.keyDown(soil, { key: 'End' });
    expect(s.sim.runs[0]!.setInput).toHaveBeenLastCalledWith('position:soil1', 1);
    s.sim.say((e) => e.onParts({ tmp1: { kind: 'sensor', volts: 0.74, powered: true }, soil1: { kind: 'sensor', volts: 0.9, powered: true } }));
    expect(card).toHaveTextContent('Vout 0.74 V');
    expect(card).toHaveTextContent('AOUT 0.9 V');
  });
});
