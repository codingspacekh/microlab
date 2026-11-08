import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { legsCentre } from '@lib/editor';
import type { ProjectDoc } from '@lib/project';
import { App } from '../../src/renderer/app/App';
import type { StartRun } from '../../src/renderer/app/useRun';
import type { RunEvents } from '../../src/renderer/sim-client';
import { fakeApi } from './fake-api';
import { startBuilding } from './start-building';

/** M7 slice 1 in the editor (screens 25, 25b): the Actuators and Output modules groups; a motor, a pump, an L298N lie
 *  where they are let go, their tabs and screws points to wire; a ULN2003 brings its stepper; the power supply's
 *  jumpers clicked; while running each says what it does. The simulation is a fake: the test says what the worker says. */
function setup() {
  const runs: { doc: ProjectDoc; events: RunEvents }[] = [];
  const start: StartRun = (req, events) => {
    runs.push({ ...req, events });
    return { stop: vi.fn(), setInput: vi.fn() };
  };
  render(<App api={fakeApi()} width={1440} startRun={start} />);
  fireEvent.click(screen.getByRole('button', { name: 'New Pico W project' }));
  startBuilding();
  const svg = screen.getByRole('application', { name: 'Circuit canvas' });
  const [vx, vy] = svg.getAttribute('viewBox')!.split(' ').map(Number) as [number, number];
  const client = (x: number, y: number) => ({ clientX: x - vx, clientY: y - vy, button: 0 });
  const panel = screen.getByRole('region', { name: 'Parts' });
  const item = (name: RegExp) => within(panel).getByRole('button', { name });
  const point = (ref: string) => {
    const c = svg.querySelector(`[data-point="${ref}"]`);
    if (!c) throw new Error(`no free point ${ref}`);
    return { x: Number(c.getAttribute('cx')), y: Number(c.getAttribute('cy')) };
  };
  /** Dragged from the panel and let go at a drawing point (a part in holes: its first leg on `hole`). */
  const drop = (name: RegExp, at: { x: number; y: number }) => {
    fireEvent.mouseDown(item(name), { clientX: 5, clientY: 5, button: 0 });
    fireEvent.mouseMove(svg, client(at.x, at.y));
    fireEvent.mouseUp(svg, client(at.x, at.y));
  };
  const place = (name: RegExp, type: string, hole: string) => {
    const p = point(hole);
    const [cx, cy] = legsCentre(type);
    drop(name, { x: p.x + cx, y: p.y + cy });
  };
  const wire = (a: string, b: string) => {
    const p = point(a);
    const q = point(b);
    fireEvent.mouseDown(svg.querySelector(`[data-point="${a}"]`)!, client(p.x, p.y));
    fireEvent.mouseMove(svg, client(q.x, q.y));
    fireEvent.mouseUp(svg, client(q.x, q.y));
  };
  const part = (id: string) => svg.querySelector(`[data-part="${id}"]`)!;
  const inspector = () => screen.getByRole('complementary', { name: 'Inspector' });
  const run = () => fireEvent.click(screen.getByRole('button', { name: 'Run main.py' }));
  const say = (f: (e: RunEvents) => void) => act(() => f(runs.at(-1)!.events));
  return { svg, item, point, drop, place, wire, part, inspector, run, say };
}

describe('M7 the parts panel (screens 25, 25b)', () => {
  it('an Actuators group and an Output modules group; the stepper comes with its ULN2003', () => {
    setup();
    const panel = screen.getByRole('region', { name: 'Parts' });
    const names = (group: string) => within(within(panel).getByRole('group', { name: group })).getAllByRole('button').map((b) => b.querySelector('.nm')!.firstChild!.textContent);
    expect(names('Actuators')).toEqual(['Servo SG90', 'TT motor', 'L9110S driver', 'L298N driver', 'Relay module', 'Water pump', 'Stepper 28BYJ-48']);
    expect(names('Output modules')).toEqual(['Traffic light module', 'RGB LED module', 'Passive buzzer module', 'Breadboard power supply']);
  });
});

describe('M7 a motor beside the breadboard, wired at its tabs', () => {
  it('let go anywhere on the canvas, it lies there; its tabs are points; a wire goes from a tab to a hole', () => {
    const s = setup();
    s.drop(/^TT motor/, { x: 700, y: 120 });
    expect(s.part('motor1')).toHaveAttribute('data-at', '680,120');
    expect(s.part('motor1').querySelector('.tt-motor')).not.toBeNull();
    const tab = s.point('motor1.+');
    expect(tab).toEqual({ x: 758, y: 112 });
    s.wire('motor1.+', 'bb1.a5');
    expect(s.svg.querySelector('[data-ends="motor1.+ bb1.a5"]')).not.toBeNull();
    // its inspector: where it lies, and Rotate (it turns where it lies, M7 slice 2)
    fireEvent.mouseDown(s.part('motor1'), { clientX: 0, clientY: 0, button: 0 });
    fireEvent.mouseUp(s.svg, { clientX: 0, clientY: 0, button: 0 });
    expect(s.inspector()).toHaveTextContent(/MOTOR1 · TT motor/);
    expect(s.inspector()).toHaveTextContent(/beside the breadboard — wire its tabs/);
    expect(within(s.inspector()).getByRole('button', { name: /Rotate/ })).toBeInTheDocument();
  });

  it('dragged, it moves on the grid; deleted, the wire on its tab goes too', () => {
    const s = setup();
    s.drop(/^TT motor/, { x: 700, y: 120 });
    s.wire('motor1.-', 'bb1.a7');
    fireEvent.mouseDown(s.part('motor1'), { clientX: 0, clientY: 0, button: 0 });
    fireEvent.mouseMove(s.svg, { clientX: 32, clientY: 16, button: 0 });
    fireEvent.mouseUp(s.svg, { clientX: 32, clientY: 16, button: 0 });
    expect(s.part('motor1')).toHaveAttribute('data-at', '712,136');
    fireEvent.click(within(s.inspector()).getByRole('button', { name: 'Delete' }));
    expect(s.svg.querySelector('[data-part="motor1"]')).toBeNull();
    expect(s.svg.querySelectorAll('[data-wire]')).toHaveLength(0);
  });
});

describe('M7 drivers in the breadboard, their screws to wire', () => {
  it('an L9110S in row f: its MOTOR A screws are points; a wire from a screw to the motor\'s tab', () => {
    const s = setup();
    s.place(/^L9110S/, 'l9110s', 'bb1.f8');
    s.drop(/^TT motor/, { x: 700, y: 120 });
    s.wire('drv1.a1', 'motor1.+');
    expect(s.svg.querySelector('[data-ends="drv1.a1 motor1.+"]')).not.toBeNull();
    fireEvent.mouseDown(s.part('drv1'), { clientX: 0, clientY: 0, button: 0 });
    fireEvent.mouseUp(s.svg, { clientX: 0, clientY: 0, button: 0 });
    expect(s.inspector()).toHaveTextContent(/B-IA bb1\.f8|B-IA f8/);
  });

  it('the ULN2003 brings the 28BYJ-48, its cable in the socket — one undo takes both away', () => {
    const s = setup();
    s.place(/^Stepper 28BYJ-48/, 'uln2003', 'bb1.f4');
    expect(s.part('uln1')).not.toBeNull();
    expect(s.part('step1').querySelector('.stepper')).not.toBeNull();
    expect(s.svg.querySelector('[data-point="uln1.a"]')).toBeNull();   // the cable is in it
    fireEvent.click(within(screen.getByRole('group', { name: 'Undo and redo' })).getByRole('button', { name: 'Undo' }));
    expect(s.svg.querySelector('[data-part="step1"]')).toBeNull();
    expect(s.svg.querySelector('[data-part="uln1"]')).toBeNull();
  });

  it('a relay module: what turns it on, in its inspector', () => {
    const s = setup();
    s.place(/^Relay module/, 'relay', 'bb1.f19');
    fireEvent.click(within(s.inspector()).getByRole('radio', { name: 'S low' }));
    expect(s.part('relay1')).toHaveAttribute('data-props', '{"trigger":"low"}');
  });

  it('an L298N\'s jumpers, in its inspector: ENB off', () => {
    const s = setup();
    s.drop(/^L298N/, { x: 760, y: 200 });
    const row = within(s.inspector()).getByRole('radiogroup', { name: 'ENB jumper' });
    fireEvent.click(within(row).getByRole('radio', { name: 'Off' }));
    expect(s.part('l298n1')).toHaveAttribute('data-props', '{"enb":false}');
    expect(s.part('l298n1').querySelector('[data-jumper="enb"]')).toBeNull();
    expect(s.part('l298n1').querySelector('[data-jumper="ena"]')).not.toBeNull();
  });
});

describe('M7 the breadboard power supply (screen 25b)', () => {
  it('on the rails at the left end; its jumpers clicked on the canvas set 5 V or 3.3 V; its inspector too', () => {
    const s = setup();
    s.place(/^Breadboard power supply/, 'power-supply', 'bb1.T-1');
    expect(s.part('psu1')).toHaveAttribute('data-legs', 'bb1.T-1 bb1.T-2 bb1.T+1 bb1.T+2 bb1.B+1 bb1.B+2 bb1.B-1 bb1.B-2');
    fireEvent.click(s.svg.querySelector('[data-jumper="psu1.top"]')!);
    expect(s.part('psu1')).toHaveAttribute('data-props', '{"top":3.3,"bottom":3.3}');
    fireEvent.mouseDown(s.part('psu1'), { clientX: 0, clientY: 0, button: 0 });
    fireEvent.mouseUp(s.svg, { clientX: 0, clientY: 0, button: 0 });
    fireEvent.click(within(within(s.inspector()).getByRole('radiogroup', { name: 'Bottom rails' })).getByRole('radio', { name: '5 V' }));
    expect(s.part('psu1')).toHaveAttribute('data-props', '{"top":3.3,"bottom":5}');
    fireEvent.click(within(within(s.inspector()).getByRole('radiogroup', { name: 'Power' })).getByRole('radio', { name: 'Off' }));
    expect(s.part('psu1').querySelector('.power-supply')).toHaveAttribute('data-on', '0');
  });
});

describe('M7 while running (screens 25, 25b)', () => {
  it('a motor\'s rpm and way, a servo\'s arm, a relay\'s contact, a pump running, a driver\'s LED; hovered, what each does', () => {
    const s = setup();
    s.place(/^Servo SG90/, 'servo', 'bb1.a2');
    s.place(/^L9110S/, 'l9110s', 'bb1.f8');
    s.place(/^Relay module/, 'relay', 'bb1.f19');
    s.drop(/^TT motor/, { x: 700, y: 120 });
    s.drop(/^Water pump/, { x: 700, y: 300 });
    s.run();
    s.say((e) => e.onParts({
      servo1: { kind: 'servo', angle: 135, powered: true, pulseUs: 2000 }, motor1: { kind: 'motor', rpm: 126, direction: 1, amps: 0.16 },
      relay1: { kind: 'relay', on: true }, pump1: { kind: 'pump', running: true, amps: 0.18 }, drv1: { kind: 'driver', a: 1, b: 0 },
    }));
    expect(s.part('motor1').querySelector('.tt-motor')).toHaveAttribute('data-rpm', '126');
    expect(s.part('motor1')).toHaveTextContent('126 rpm');
    expect(s.part('servo1').querySelector('.arm')).toHaveAttribute('data-angle', '135');
    expect(s.part('relay1').querySelector('.relay-module')).toHaveAttribute('data-on', '1');
    expect(s.part('pump1').querySelector('.pump')).toHaveAttribute('data-running', '1');
    fireEvent.mouseEnter(s.part('motor1'));
    expect(screen.getByRole('tooltip')).toHaveTextContent(/MOTOR1 · forward · 126 rpm/);
    fireEvent.mouseLeave(s.part('motor1'));
    fireEvent.mouseEnter(s.part('servo1'));
    expect(screen.getByRole('tooltip')).toHaveTextContent(/SERVO1 · 135° · 2\.0 ms pulses/);
    fireEvent.mouseLeave(s.part('servo1'));
    fireEvent.mouseEnter(s.part('relay1'));
    expect(screen.getByRole('tooltip')).toHaveTextContent(/RELAY1 · on · COM to NO/);
  });

  it('a servo on 3V3 says it can\'t turn; a stepper its steps and coils', () => {
    const s = setup();
    s.place(/^Servo SG90/, 'servo', 'bb1.a2');
    s.place(/^Stepper 28BYJ-48/, 'uln2003', 'bb1.f10');
    s.run();
    s.say((e) => e.onParts({
      servo1: { kind: 'servo', angle: 90, powered: false }, step1: { kind: 'stepper', steps: 1024, coils: 'BC' },
      'uln1:B': { kind: 'led', amps: 0.003, brightness: 0.15 }, 'uln1:C': { kind: 'led', amps: 0.003, brightness: 0.15 },
    }));
    fireEvent.mouseEnter(s.part('servo1'));
    expect(screen.getByRole('tooltip')).toHaveTextContent(/needs 4\.8–6 V/);
    fireEvent.mouseLeave(s.part('servo1'));
    expect(s.part('step1').querySelector('.stepper')).toHaveAttribute('data-steps', '1024');
    expect(s.part('uln1').querySelector('[data-coil="B"]')).toHaveAttribute('data-on', '1');
    expect(s.part('uln1').querySelector('[data-coil="A"]')).toHaveAttribute('data-on', '0');
    fireEvent.mouseEnter(s.part('step1'));
    expect(screen.getByRole('tooltip')).toHaveTextContent(/STEP1 · 28BYJ-48 · step 1024.*Coils B and C on/);
  });
});
