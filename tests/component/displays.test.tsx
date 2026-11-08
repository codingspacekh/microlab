import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { legsCentre } from '@lib/editor';
import type { ProjectDoc } from '@lib/project';
import { App } from '../../src/renderer/app/App';
import type { StartRun } from '../../src/renderer/app/useRun';
import type { RunEvents } from '../../src/renderer/sim-client';
import { fakeApi } from './fake-api';
import { startBuilding } from './start-building';

/** M7 slice 2 in the editor (screens 26, 26b, 26c): the Displays group; the OLED stands in row f, the digit straddles
 *  the gap, the LCD, the TM1637 and the matrix lie beside the breadboard, their header pins points to wire; the
 *  address and common in the inspector; while running each shows what the sim says it shows, and says it hovered.
 *  The simulation is a fake: the test says what the worker says. */
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

const HEX_ONE_PIXEL = `01${'00'.repeat(1023)}`;

describe('M7 the displays in the parts panel and on the canvas (screens 26, 26b)', () => {
  it('a Displays group of five; the OLED in row f; the digit across the gap, its pins in rows h and d', () => {
    const s = setup();
    const group = screen.getByRole('group', { name: 'Displays' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual([
      expect.stringMatching(/^OLED SSD1306/), expect.stringMatching(/^LCD 16×2/), expect.stringMatching(/^7-segment digit/),
      expect.stringMatching(/^4-digit display/), expect.stringMatching(/^8×8 dot matrix/),
    ]);
    s.place(/^OLED SSD1306/, 'ssd1306', 'bb1.f14');
    expect(s.part('oled1')).toHaveAttribute('data-legs', 'bb1.f14 bb1.f15 bb1.f16 bb1.f17');
    s.place(/^7-segment digit/, 'seven-segment', 'bb1.h4');
    expect(s.part('digit1')).toHaveAttribute('data-legs', 'bb1.h4 bb1.h5 bb1.h6 bb1.h7 bb1.h8 bb1.d8 bb1.d7 bb1.d6 bb1.d5 bb1.d4');
    expect(within(s.inspector()).getByRole('radiogroup', { name: 'Common pins' })).toBeInTheDocument();
  });

  it('the LCD lies where it is let go; its GND VCC SDA SCL are points; a wire to its SDA; its address 0x27 or 0x3F', () => {
    const s = setup();
    s.drop(/^LCD 16×2/, { x: 760, y: 200 });
    for (const t of ['gnd', 'vcc', 'sda', 'scl']) expect(s.point(`lcd1.${t}`)).toBeDefined();
    s.wire('board.GP20', 'lcd1.sda');
    expect(s.part('lcd1').querySelector('.lcd1602')).toBeInTheDocument();
    fireEvent.mouseDown(s.part('lcd1'), { clientX: 0, clientY: 0, button: 0 });
    fireEvent.mouseUp(s.svg, { clientX: 0, clientY: 0, button: 0 });
    fireEvent.click(within(within(s.inspector()).getByRole('radiogroup', { name: 'I²C address' })).getByRole('radio', { name: '0x3F' }));
    expect(s.part('lcd1')).toHaveAttribute('data-props', '{"address":63}');
    expect(s.part('lcd1')).toHaveTextContent('0x3F');
  });

  it('the TM1637 and the matrix lie beside it, their headers points: CLK DIO VCC GND; VCC GND DIN CS CLK and the chain out', () => {
    const s = setup();
    s.drop(/^4-digit display/, { x: 760, y: 120 });
    s.drop(/^8×8 dot matrix/, { x: 760, y: 320 });
    for (const t of ['clk', 'dio', 'vcc', 'gnd']) expect(s.point(`tm1.${t}`)).toBeDefined();
    for (const t of ['vcc', 'gnd', 'din', 'cs', 'clk', 'dout', 'cs2']) expect(s.point(`matrix1.${t}`)).toBeDefined();
  });
});

describe('M7 the displays while running (screens 26, 26b, 26c)', () => {
  it('each shows what the sim says; hovered, what it shows', () => {
    const s = setup();
    s.place(/^OLED SSD1306/, 'ssd1306', 'bb1.f14');
    s.place(/^7-segment digit/, 'seven-segment', 'bb1.h4');
    s.drop(/^LCD 16×2/, { x: 760, y: 120 });
    s.drop(/^4-digit display/, { x: 760, y: 320 });
    s.drop(/^8×8 dot matrix/, { x: 760, y: 480 });
    s.run();
    const led = (b: number) => ({ kind: 'led' as const, amps: b * 0.02, brightness: b });
    s.say((e) => e.onParts({
      oled1: { kind: 'oled', on: true, lit: 1, contrast: 255, frame: HEX_ONE_PIXEL },
      lcd1: { kind: 'lcd', on: true, backlight: true, faint: false, rows: ['Knob:  62 %     ', 'ADC 40632       '] },
      tm1: { kind: 'digits', on: true, brightness: 7, segments: [0x3f, 0x86, 0x5b, 0x07], text: '01:27' },
      matrix1: { kind: 'matrix', on: true, intensity: 4, rows: [0x00, 0x66, 0xff, 0xff, 0x7e, 0x3c, 0x18, 0x00], lit: 32, amps: 0.053 },
      'digit1:a': led(0.3), 'digit1:b': led(0.3), 'digit1:c': led(0.3),
    }));
    expect(s.part('oled1').querySelector('.oled')).toHaveAttribute('data-lit', '1');
    expect(s.part('lcd1').querySelector('.lcd1602')).toHaveAttribute('data-rows', 'Knob:  62 %     \nADC 40632       ');
    expect(s.part('tm1').querySelector('.tm1637')).toHaveAttribute('data-text', '01:27');
    expect(s.part('matrix1').querySelector('.max7219')).toHaveAttribute('data-lit', '32');
    expect(s.part('digit1').querySelector('.seven-segment')).toHaveAttribute('data-segments', '11100000');
    fireEvent.mouseEnter(s.part('lcd1'));
    expect(screen.getByRole('tooltip')).toHaveTextContent(/LCD1 · 16×2 at 0x27 · backlight on/);
    fireEvent.mouseLeave(s.part('lcd1'));
    fireEvent.mouseEnter(s.part('tm1'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('TM1 · 01:27 · brightness 7');
    fireEvent.mouseLeave(s.part('tm1'));
    fireEvent.mouseEnter(s.part('matrix1'));
    expect(screen.getByRole('tooltip')).toHaveTextContent(/MATRIX1 · 32 dots · brightness 4 of 15/);
    fireEvent.mouseLeave(s.part('matrix1'));
    fireEvent.mouseEnter(s.part('digit1'));
    expect(screen.getByRole('tooltip')).toHaveTextContent(/DIGIT1 · a b c lit/);
    fireEvent.mouseLeave(s.part('digit1'));
    fireEvent.mouseEnter(s.part('oled1'));
    expect(screen.getByRole('tooltip')).toHaveTextContent(/OLED1 · 1 pixels lit/);
  });

  it('an LCD on 3V3 (screen 26c): its letters faint, and hovered it says why', () => {
    const s = setup();
    s.drop(/^LCD 16×2/, { x: 760, y: 120 });
    s.run();
    s.say((e) => e.onParts({ lcd1: { kind: 'lcd', on: true, backlight: true, faint: true, rows: ['Counting down   ', '                '] } }));
    expect(s.part('lcd1').querySelector('.lcd1602')).toHaveAttribute('data-faint', '1');
    fireEvent.mouseEnter(s.part('lcd1'));
    expect(screen.getByRole('tooltip')).toHaveTextContent(/too faint to read: a 16×2 LCD needs 5 V/);
  });
});
