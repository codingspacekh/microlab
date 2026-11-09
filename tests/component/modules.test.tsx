import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { legsCentre } from '@lib/editor';
import type { ProjectDoc } from '@lib/project';
import { App } from '../../src/renderer/app/App';
import type { StartRun } from '../../src/renderer/app/useRun';
import type { RunEvents } from '../../src/renderer/sim-client';
import { fakeApi } from './fake-api';
import { startBuilding } from './start-building';
import { newProjectFromStart } from './new-project';

/** M6.4c (screen 19, approved 2026-11-07): the DHT11 / DHT22, the HC-SR04 and the GY-521 (MPU6050) in the editor;
 *  while running the Inputs card sets the DHT's air, the object's distance and the MPU6050's tilt. */
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

async function setup() {
  const sim = fakeSim();
  render(<App api={fakeApi()} width={1440} startRun={sim.start} audio={() => null} />);
  await newProjectFromStart('New Pico W project');
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
  const inspector = () => screen.getByRole('complementary', { name: 'Inspector' });
  const run = () => fireEvent.click(screen.getByRole('button', { name: 'Run main.py' }));
  return { sim, svg, client, place, part, inspector, run };
}

describe('M6.4c the modules in the editor (screen 19)', () => {
  it('a DHT11 to start with, a DHT22 chosen in the inspector; its pins VCC, DATA, GND', async () => {
    const s = await setup();
    s.place(/^DHT11 \/ DHT22/, 'dht', 'bb1.f2');
    expect(s.part('dht1')).toHaveAttribute('data-legs', 'bb1.f2 bb1.f3 bb1.f4');
    expect(within(s.inspector()).getByText('VCC f2, DATA f3, GND f4')).toBeInTheDocument();
    expect(within(s.part('dht1') as HTMLElement).getByText('DHT11')).toBeInTheDocument();
    fireEvent.click(within(within(s.inspector()).getByRole('radiogroup', { name: 'Sensor kind' })).getByRole('radio', { name: 'DHT22' }));
    expect(within(s.part('dht1') as HTMLElement).getByText('DHT22')).toBeInTheDocument();
    expect(within(s.inspector()).getByText(/has its pull-up/)).toBeInTheDocument();
  });

  it('an HC-SR04 in row j; the inspector says its Echo needs a divider', async () => {
    const s = await setup();
    s.place(/^Ultrasonic HC-SR04/, 'hc-sr04', 'bb1.j20');
    expect(s.part('sonar1')).toHaveAttribute('data-legs', 'bb1.j20 bb1.j21 bb1.j22 bb1.j23');
    expect(within(s.inspector()).getByText('VCC j20, Trig j21, Echo j22, GND j23')).toBeInTheDocument();
    expect(within(s.inspector()).getByText(/1 kΩ \+ 2 kΩ/)).toBeInTheDocument();
    expect(within(s.part('sonar1') as HTMLElement).getByText('HC-SR04')).toBeInTheDocument();
  });

  it('a GY-521: its 8 pins as printed; the inspector says how to wake it', async () => {
    const s = await setup();
    s.place(/^MPU6050 motion/, 'mpu6050', 'bb1.f7');
    expect(within(s.inspector()).getByText('VCC f7, GND f8, SCL f9, SDA f10, XDA f11, XCL f12, AD0 f13, INT f14')).toBeInTheDocument();
    expect(within(s.inspector()).getByText(/0x68.*0x6B/)).toBeInTheDocument();
  });
});

describe('M6.4c while running (screen 19)', () => {
  it('the Inputs card: the DHT\'s temperature and humidity, the distance with its echo, the tilt with its g', async () => {
    const s = await setup();
    s.place(/^DHT11 \/ DHT22/, 'dht', 'bb1.f2');
    s.place(/^MPU6050 motion/, 'mpu6050', 'bb1.f7');
    s.place(/^Ultrasonic HC-SR04/, 'hc-sr04', 'bb1.j20');
    s.run();
    const card = screen.getByRole('group', { name: 'Inputs' });
    expect(within(card).getByRole('slider', { name: 'Temperature of DHT1' })).toHaveAttribute('aria-valuetext', '22 °C');
    const hum = within(card).getByRole('slider', { name: 'Humidity of DHT1' });
    expect(hum).toHaveAttribute('aria-valuetext', '50 %');
    fireEvent.keyDown(hum, { key: 'ArrowUp' });
    expect(s.sim.runs[0]!.setInput).toHaveBeenLastCalledWith('humidity:dht1', 51);
    const cm = within(card).getByRole('slider', { name: 'Distance from SONAR1' });
    expect(cm).toHaveAttribute('aria-valuetext', '100.0 cm');
    expect(card).toHaveTextContent('echo 5800 µs');
    fireEvent.keyDown(cm, { key: 'Home' });
    expect(s.sim.runs[0]!.setInput).toHaveBeenLastCalledWith('cm:sonar1', 2);
    expect(card).toHaveTextContent('echo 116 µs');
    const x = within(card).getByRole('slider', { name: 'Tilt of MPU1 about X' });
    expect(within(card).getByRole('slider', { name: 'Tilt of MPU1 about Y' })).toHaveAttribute('aria-valuetext', 'Y 0°');
    for (let i = 0; i < 30; i++) fireEvent.keyDown(x, { key: 'ArrowUp' });
    expect(s.sim.runs[0]!.setInput).toHaveBeenLastCalledWith('tiltx:mpu1', 30);
    expect(card).toHaveTextContent('x 0.50 g · y 0.00 g');
  });

  it('the HC-SR04 shows its sound waves while it is powered and running; the GY-521\'s level follows its tilt', async () => {
    const s = await setup();
    s.place(/^Ultrasonic HC-SR04/, 'hc-sr04', 'bb1.j20');
    s.place(/^MPU6050 motion/, 'mpu6050', 'bb1.f7');
    s.run();
    expect(s.part('sonar1').querySelector('.waves')).toBeNull();
    s.sim.say((e) => e.onParts({ sonar1: { kind: 'sensor', volts: 0, powered: true } }));
    expect(s.part('sonar1').querySelector('.waves')).not.toBeNull();
    const bubble = () => s.part('mpu1').querySelector('.level .bubble')!.getAttribute('cx');
    const flat = bubble();
    fireEvent.keyDown(within(screen.getByRole('group', { name: 'Inputs' })).getByRole('slider', { name: 'Tilt of MPU1 about X' }), { key: 'End' });
    expect(bubble()).not.toBe(flat);
  });
});
