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
  it('a Displays group of six; the OLED in row f; the digit across the gap, its pins in rows h and d', () => {
    const s = setup();
    const group = screen.getByRole('group', { name: 'Displays' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual([
      expect.stringMatching(/^OLED SSD1306/), expect.stringMatching(/^LCD 16×2/), expect.stringMatching(/^7-segment digit/),
      expect.stringMatching(/^4-digit display/), expect.stringMatching(/^8×8 dot matrix/), expect.stringMatching(/^NeoPixel strip \/ ring/),   // M7 slice 3
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

describe('M7 the parts panel\'s search (the teacher\'s request)', () => {
  it('filters by name, what a part is and its group, as typed; groups with nothing hidden; nothing found says so; Esc empties it', () => {
    setup();
    const panel = screen.getByRole('region', { name: 'Parts' });
    const search = within(panel).getByRole('textbox', { name: 'Search the parts' });
    expect(search).toHaveAttribute('placeholder', expect.stringMatching(/^Search \d+ parts$/));
    fireEvent.change(search, { target: { value: 'i2c' } });
    const names = () => within(panel).getAllByRole('button').filter((b) => b.classList.contains('pitem')).map((b) => b.querySelector('.nm')!.firstChild!.textContent);
    expect(names()).toEqual(expect.arrayContaining(['MPU6050 motion', 'OLED SSD1306', 'LCD 16×2']));
    expect(names()).not.toContain('Resistor');
    expect(within(panel).queryByRole('group', { name: 'Basics' })).toBeNull();
    fireEvent.change(search, { target: { value: 'half bread' } });
    expect(names()).toEqual(['Half breadboard']);
    fireEvent.change(search, { target: { value: 'displays matrix' } });
    expect(names()).toEqual(['8×8 dot matrix']);
    fireEvent.change(search, { target: { value: 'flux capacitor' } });
    expect(within(panel).getByRole('status')).toHaveTextContent('No part matches “flux capacitor”.');
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(search).toHaveValue('');
    expect(within(panel).getByRole('group', { name: 'Basics' })).toBeInTheDocument();
  });
});

describe('M7 the parts panel folds away by itself (the teacher\'s request)', () => {
  it('a press on the canvas folds it; placing a part from it doesn\'t (that press puts the part down); its search keeps it', () => {
    const s = setup();
    const open = () => screen.queryByRole('region', { name: 'Parts' });
    expect(open()).not.toBeNull();
    fireEvent.mouseDown(within(open()!).getByRole('textbox', { name: 'Search the parts' }));
    expect(open()).not.toBeNull();
    s.place(/^Resistor/, 'resistor', 'bb1.a3');   // from the panel onto the breadboard: it stays open meanwhile
    expect(s.part('r1')).toBeInTheDocument();
    fireEvent.mouseDown(s.svg, { clientX: 0, clientY: 0, button: 0 });
    expect(open()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Parts' }));
    expect(open()).not.toBeNull();
    fireEvent.mouseDown(screen.getByRole('textbox', { name: 'main.py' }));
    expect(open()).toBeNull();
  });
});

describe('M7 a display beside the breadboard turned (the teacher\'s request)', () => {
  it('Rotate in its inspector turns the LCD a quarter about its middle: its drawing, its pins, the wire on its pin', () => {
    const s = setup();
    s.drop(/^LCD 16×2/, { x: 760, y: 200 });
    s.wire('board.GP20', 'lcd1.sda');
    const before = s.point('lcd1.gnd');
    fireEvent.mouseDown(s.part('lcd1'), { clientX: 0, clientY: 0, button: 0 });
    fireEvent.mouseUp(s.svg, { clientX: 0, clientY: 0, button: 0 });
    fireEvent.click(within(s.inspector()).getByRole('button', { name: /Rotate/ }));
    expect(s.part('lcd1').querySelector('g[transform^="rotate(90 "] .lcd1602')).toBeInTheDocument();
    expect(s.point('lcd1.gnd')).not.toEqual(before);
    // the wire's end moved with SDA: its last point is the pin's new place (it's taken: no free point there now)
    expect(s.svg.querySelector('[data-wire="w1"]')).toBeInTheDocument();
    fireEvent.click(within(s.inspector()).getByRole('button', { name: /Rotate/ }));
    expect(s.part('lcd1').querySelector('g[transform^="rotate(180 "]')).toBeInTheDocument();
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

describe('M7 the RC522 RFID reader (the teacher\'s request)', () => {
  it('in the Modules group, in row f by its eight pins; while running, the Inputs card holds a tag to it; drawn over it; hovered, its UID', () => {
    const s = setup();
    s.place(/^RFID reader RC522/, 'rc522', 'bb1.f3');
    expect(s.part('rfid1')).toHaveAttribute('data-legs', 'bb1.f3 bb1.f4 bb1.f5 bb1.f6 bb1.f7 bb1.f8 bb1.f9 bb1.f10');
    expect(s.inspector()).toHaveTextContent(/3\.3 V only/);
    s.run();
    const card = screen.getByRole('group', { name: 'Inputs' });
    const tags = within(card).getByRole('radiogroup', { name: 'Tag held to RFID1' });
    fireEvent.click(within(tags).getByRole('radio', { name: 'Card' }));
    expect(within(tags).getByRole('radio', { name: 'Card' })).toBeChecked();
    s.say((e) => e.onParts({ rfid1: { kind: 'rfid', antenna: true, tag: 1, uid: '93 5E 1A 2B', last: 'card 93 5E 1A 2B selected' } }));
    expect(s.part('rfid1').querySelector('.rc522')).toHaveAttribute('data-tag', '1');
    expect(s.part('rfid1')).toHaveTextContent('93 5E 1A 2B');
    fireEvent.mouseEnter(s.part('rfid1'));
    expect(screen.getByRole('tooltip')).toHaveTextContent(/RFID1 · the card 93 5E 1A 2B/);
    expect(screen.getByRole('tooltip')).toHaveTextContent(/Last: card 93 5E 1A 2B selected/);
  });
});

describe('M7 NeoPixels (screens 27, 27b, 27c)', () => {
  it('a stick of 8 lies where it is let go, its pads points; its inspector makes it a ring of 12, then 24 — its pads with it', () => {
    const s = setup();
    s.drop(/^NeoPixel strip \/ ring/, { x: 760, y: 200 });
    const np = () => s.part('neo1').querySelector('.neopixel')!;
    expect(np()).toHaveAttribute('data-shape', 'stick');
    expect(np().querySelectorAll('[data-led]')).toHaveLength(8);
    for (const t of ['din', 'vcc', 'gnd', 'dout', 'vcc2', 'gnd2']) expect(s.point(`neo1.${t}`)).toBeDefined();
    s.wire('board.GP0', 'neo1.din');
    fireEvent.mouseDown(s.part('neo1'), { clientX: 0, clientY: 0, button: 0 });
    fireEvent.mouseUp(s.svg, { clientX: 0, clientY: 0, button: 0 });
    expect(s.inspector()).toHaveTextContent('up to 480 mA — 8 LEDs × 60 mA');
    fireEvent.click(within(within(s.inspector()).getByRole('radiogroup', { name: 'NeoPixel shape' })).getByRole('radio', { name: 'Ring' }));
    expect(np()).toHaveAttribute('data-shape', 'ring');
    expect(np().querySelectorAll('[data-led]')).toHaveLength(12);
    expect(() => s.point('neo1.vcc2')).toThrow();   // a ring has no 5V out
    expect(s.svg.querySelectorAll('[data-wire]')).toHaveLength(1);   // the wire on DIN stays
    fireEvent.click(within(within(s.inspector()).getByRole('radiogroup', { name: 'LEDs' })).getByRole('radio', { name: '24' }));
    expect(np().querySelectorAll('[data-led]')).toHaveLength(24);
    expect(s.inspector()).toHaveTextContent('up to 1440 mA — 24 LEDs × 60 mA');
  });

  it('while running each LED shows the colour the sim says; hovered, an LED says its colour and current; the status bar adds them up', () => {
    const s = setup();
    s.drop(/^NeoPixel strip \/ ring/, { x: 760, y: 200 });
    s.run();
    s.say((e) => e.onParts({ neo1: { kind: 'pixels', on: true, pixels: `ff0000${'000000'.repeat(2)}000050${'000000'.repeat(4)}`, lit: 2, amps: 0.0313, from: 'VBUS', limitA: 0.5 } }));
    const np = s.part('neo1').querySelector('.neopixel')!;
    expect(np).toHaveAttribute('data-lit', '2');
    expect(np.querySelector('[data-led="0"] circle[fill="#ff0000"]')).toBeInTheDocument();
    expect(np.querySelector('[data-led="3"] circle[fill="#0000ff"]')).toBeInTheDocument();   // (0, 0, 80) drawn in its full colour
    expect(np.querySelector('[data-led="1"] circle[fill="#e2ddd0"]')).toBeInTheDocument();   // dark
    fireEvent.mouseEnter(s.part('neo1'));
    fireEvent.mouseMove(np.querySelector('[data-led="3"] .np-body')!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('NEO1 · LED 3 of 8');
    expect(screen.getByRole('tooltip')).toHaveTextContent('(0, 0, 80) — blue, 31 % · about 7 mA');
    fireEvent.mouseMove(np.querySelector('text')!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('NEO1 · 2 of 8 lit · 31 mA');
    expect(screen.getByRole('status')).toHaveTextContent("NeoPixels: 8 LEDs draw 31 mA of USB's 500 mA");
    s.say((e) => e.onParts({ neo1: { kind: 'pixels', on: true, pixels: 'ffffff'.repeat(8), lit: 8, amps: 0.4848, from: 'VBUS', limitA: 0.3 } }));
    expect(screen.getByRole('status')).toHaveTextContent("NeoPixels: 8 LEDs ask 485 mA of USB's 300 mA");
  });
});
