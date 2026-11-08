import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { legsCentre } from '@lib/editor';
import type { ProjectDoc } from '@lib/project';
import { App } from '../../src/renderer/app/App';
import type { StartRun } from '../../src/renderer/app/useRun';
import type { RunEvents } from '../../src/renderer/sim-client';
import { fakeApi } from './fake-api';
import { startBuilding } from './start-building';

/** M6.5b (screen 21, approved 2026-11-07): the kit's chips in the editor and while running. */
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
  return { panel, place, part, input, run, say };
}

describe('M6.5b the kit\'s chips in the editor (screen 21)', () => {
  it('a Chips group of six; each drawn from its pins, named as printed', () => {
    const s = setup();
    const group = within(s.panel).getByRole('group', { name: 'Chips' });
    expect(within(group).getAllByRole('button')).toHaveLength(6);
    s.place(/^VL53L0X/, 'vl53l0x', 'bb1.f2');
    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    expect(within(inspector).getByText('VIN f2, GND f3, SCL f4, SDA f5, GPIO1 f6, XSHUT f7')).toBeInTheDocument();
    expect(within(inspector).getByText(/0x29/)).toBeInTheDocument();
    expect(within(s.part('tof1') as HTMLElement).getByText('XSHUT')).toBeInTheDocument();
  });
});

describe('M6.5b while running (screen 21)', () => {
  it('the Inputs card: the air (temperature, pressure), the DS18B20\'s temperature, the distance, the pulse', () => {
    const s = setup();
    s.place(/^BMP280/, 'bmp280', 'bb1.f2');
    s.place(/^DS18B20/, 'ds18b20', 'bb1.f9');
    s.place(/^VL53L0X/, 'vl53l0x', 'bb1.f13');
    s.place(/^MAX30102/, 'max30102', 'bb1.f20');
    s.run();
    const card = screen.getByRole('group', { name: 'Inputs' });
    const hpa = within(card).getByRole('slider', { name: 'Pressure at BARO1' });
    expect(hpa).toHaveAttribute('aria-valuetext', '1013 hPa');
    fireEvent.keyDown(hpa, { key: 'End' });
    expect(s.input()).toHaveBeenLastCalledWith('hpa:baro1', 1100);
    fireEvent.keyDown(within(card).getByRole('slider', { name: 'Temperature of TEMP1' }), { key: 'ArrowUp' });
    expect(s.input()).toHaveBeenLastCalledWith('celsius:temp1', 22.5);   // half a degree a step
    const cm = within(card).getByRole('slider', { name: 'Distance from TOF1' });
    fireEvent.keyDown(cm, { key: 'Home' });
    expect(s.input()).toHaveBeenLastCalledWith('cm:tof1', 3);
    expect(card).toHaveTextContent('30 mm');
    const finger = within(card).getByRole('switch', { name: 'A finger on PULSE1' });
    expect(finger).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(finger);
    expect(s.input()).toHaveBeenLastCalledWith('position:pulse1', 0);
    fireEvent.keyDown(within(card).getByRole('slider', { name: 'Heart rate of PULSE1' }), { key: 'ArrowUp' });
    expect(s.input()).toHaveBeenLastCalledWith('bpm:pulse1', 73);
  });

  it('the DS1302\'s tip says its time; the VL53L0X\'s laser shows while it is powered', () => {
    const s = setup();
    s.place(/^DS1302/, 'ds1302', 'bb1.f2');
    s.place(/^VL53L0X/, 'vl53l0x', 'bb1.f10');
    s.run();
    s.say((e) => e.onParts({ rtc1: { kind: 'clock', time: '08:59:58' }, tof1: { kind: 'sensor', volts: 0, powered: true } }));
    fireEvent.mouseEnter(s.part('rtc1'));
    expect(screen.getByRole('tooltip')).toHaveTextContent(/RTC1 · 08:59:58.*laptop's time/);
    expect(s.part('tof1').querySelector('.beam')).not.toBeNull();
  });
});
