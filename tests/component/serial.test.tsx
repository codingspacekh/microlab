import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { legsCentre } from '@lib/editor';
import type { ProjectDoc } from '@lib/project';
import { App } from '../../src/renderer/app/App';
import type { StartRun } from '../../src/renderer/app/useRun';
import type { RunEvents } from '../../src/renderer/sim-client';
import { fakeApi } from './fake-api';
import { partsPanel, startBuilding } from './start-building';

/** M7 slice 5 in the editor (screens 28, 28b, 28c, 28d): the Communication group; a USB-serial adapter, an HC-05 and
 *  a GPS lie beside the board, their header pins points to wire; while running, a terminal, a phone and a GPS card
 *  send the sim what the student does there. The simulation is a fake: the test says what the worker says. */
function setup() {
  const runs: { doc: ProjectDoc; events: RunEvents }[] = [];
  const inputs: [string, number][] = [];
  const start: StartRun = (req, events) => {
    runs.push({ ...req, events });
    return { stop: vi.fn(), setInput: (name: string, v: number) => { inputs.push([name, v]); } };
  };
  render(<App api={fakeApi()} width={1440} startRun={start} />);
  fireEvent.click(screen.getByRole('button', { name: 'New Pico W project' }));
  startBuilding();
  const svg = screen.getByRole('application', { name: 'Circuit canvas' });
  const [vx, vy] = svg.getAttribute('viewBox')!.split(' ').map(Number) as [number, number];
  const client = (x: number, y: number) => ({ clientX: x - vx, clientY: y - vy, button: 0 });
  const item = (name: RegExp) => within(partsPanel()).getByRole('button', { name });   // the panel as it is now (it folds)
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
  return { svg, item, point, drop, place, wire, part, inspector, run, say, inputs };
}


describe('M7 the UART parts on the canvas (screens 28, 28b, 28c)', () => {
  it('a Communication group of three; each lies where it is let go, its header pins points; the terminal\'s baud rate in its inspector', () => {
    const s = setup();
    const group = screen.getByRole('group', { name: 'Communication' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual([
      expect.stringMatching(/^USB-serial adapter/), expect.stringMatching(/^Bluetooth HC-05/), expect.stringMatching(/^GPS NEO-6M/),
    ]);
    s.drop(/^USB-serial adapter/, { x: 760, y: 120 });
    for (const t of ['rxd', 'txd', 'gnd', '3v3', '5v']) expect(s.point(`usb1.${t}`)).toBeDefined();
    s.wire('board.GP0', 'usb1.rxd');
    fireEvent.mouseDown(s.part('usb1'), { clientX: 0, clientY: 0, button: 0 });
    fireEvent.mouseUp(s.svg, { clientX: 0, clientY: 0, button: 0 });
    fireEvent.click(within(within(s.inspector()).getByRole('radiogroup', { name: 'Terminal baud rate' })).getByRole('radio', { name: '115200' }));
    expect(s.part('usb1')).toHaveAttribute('data-props', '{"baud":115200,"ending":"crlf"}');
    s.drop(/^Bluetooth HC-05/, { x: 760, y: 320 });
    s.drop(/^GPS NEO-6M/, { x: 760, y: 500 });
    for (const t of ['en', 'vcc', 'gnd', 'txd', 'rxd', 'state']) expect(s.point(`bt1.${t}`)).toBeDefined();
    for (const t of ['gnd', 'tx', 'rx', 'vcc']) expect(s.point(`gps1.${t}`)).toBeDefined();
  });

  it('while running, the terminal shows what reached it (control bytes as \ufffd) and sends a line with its ending; at another baud rate it says why it is garbled', () => {
    const s = setup();
    s.drop(/^USB-serial adapter/, { x: 760, y: 120 });
    s.run();
    s.say((e) => e.onParts({ usb1: { kind: 'serial', text: 'Hello!\r\n', sent: 0, received: 8, baud: 9600, heardBaud: 9600 } }));
    const term = screen.getByRole('group', { name: 'USB1 serial terminal' });
    expect(within(term).getByLabelText('What USB1 received')).toHaveTextContent('Hello!');
    fireEvent.change(within(term).getByRole('textbox', { name: 'Send from USB1' }), { target: { value: 'on' } });
    fireEvent.click(within(term).getByRole('button', { name: 'Send' }));
    expect(s.inputs.filter(([n]) => n.endsWith(':usb1'))).toEqual([['tx0:usb1', 111], ['tx1:usb1', 110], ['tx2:usb1', 13], ['tx3:usb1', 10], ['txlen:usb1', 4], ['txseq:usb1', 1]]);
    expect(within(term).getByLabelText('What USB1 received')).toHaveTextContent('> on');
    s.say((e) => e.onParts({ usb1: { kind: 'serial', text: '\u0000\u0000x', sent: 4, received: 3, baud: 115200, heardBaud: 9600 } }));
    expect(within(term).getByLabelText('What USB1 received')).toHaveTextContent('\ufffd\ufffdx');
    expect(term).toHaveTextContent('Garbled? The board sends at 9600 baud; this terminal reads 115200.');
  });

  it('the phone connects, its messages are the sim\'s; the GPS card sets the fix and the place', () => {
    const s = setup();
    s.drop(/^Bluetooth HC-05/, { x: 760, y: 120 });
    s.drop(/^GPS NEO-6M/, { x: 760, y: 400 });
    s.run();
    s.say((e) => e.onParts({ bt1: { kind: 'bluetooth', on: true, connected: false, messages: [], sent: 0, received: 0 },
      gps1: { kind: 'gps', on: true, fix: true, sats: 9, lat: 11.5564, lon: 104.9282, kmh: 0, sent: 400 } }));
    const phone = screen.getByRole('group', { name: 'Phone (Bluetooth)' });
    expect(within(phone).getByRole('button', { name: 'on' })).toBeDisabled();
    fireEvent.click(within(phone).getByRole('button', { name: 'Connect' }));
    expect(s.inputs).toContainEqual(['connected:bt1', 1]);
    s.say((e) => e.onParts({ bt1: { kind: 'bluetooth', on: true, connected: true, messages: [{ from: 'phone', text: 'on' }, { from: 'board', text: 'Heart on\n' }], sent: 2, received: 9 } }));
    expect(within(phone).getByLabelText('Messages')).toHaveTextContent('onHeart on');
    fireEvent.click(within(phone).getByRole('button', { name: 'off' }));
    expect(s.inputs).toContainEqual(['txlen:bt1', 3]);
    const gps = screen.getByRole('group', { name: 'GPS1 GPS' });
    fireEvent.click(within(within(gps).getByRole('radiogroup', { name: 'GPS1 fix' })).getByRole('radio', { name: 'Searching' }));
    expect(s.inputs).toContainEqual(['fix:gps1', 0]);
    fireEvent.change(within(gps).getByRole('textbox', { name: 'GPS1 latitude' }), { target: { value: '48.8584' } });
    expect(s.inputs).toContainEqual(['lat:gps1', 48.8584]);
    fireEvent.mouseEnter(s.part('gps1'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('GPS1 · a fix, 9 satellites');
  });
});
