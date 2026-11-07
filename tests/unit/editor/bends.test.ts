import { describe, expect, it } from 'vitest';
import { addPart, addWire, boardData, deleteBend, holeCard, insertBend, moveBend, pinCard, straighten } from '@lib/editor';
import { newProject, parseProject } from '@lib/project';

/** M5.3 F-13 a wire's bends moved, added and taken away; F-15 / F-12 what a pin and a hole are (screen 02). */
const empty = () => newProject('pico-w').project;
const bent = () => addWire(empty(), 'board.GP15', 'bb1.a5', [{ x: 104, y: 48 }, { x: 104, y: 232 }])!;

describe('M5.3 a wire\'s bends', () => {
  it('a bend moved goes on the grid; the others stay', () => {
    const p = moveBend(bent(), 'w1', 1, { x: 130, y: 237 });
    expect(p.wires[0]!.via).toEqual([{ x: 104, y: 48 }, { x: 128, y: 240 }]);
    expect(parseProject(p)).toEqual(p);
  });

  it('a bend added in a segment goes between the two points it splits', () => {
    const p = insertBend(bent(), 'w1', 1, { x: 61, y: 140 });
    expect(p.wires[0]!.via).toEqual([{ x: 104, y: 48 }, { x: 64, y: 144 }, { x: 104, y: 232 }]);
    expect(insertBend(empty(), 'w9', 0, { x: 0, y: 0 })).toEqual(empty());
    const s = insertBend(addWire(empty(), 'bb1.a1', 'bb1.a9')!, 'w1', 0, { x: 40, y: 400 });
    expect(s.wires[0]!.via).toEqual([{ x: 40, y: 400 }]);
  });

  it('a bend taken away; the last one leaves a straight wire with no via at all', () => {
    let p = deleteBend(bent(), 'w1', 0);
    expect(p.wires[0]!.via).toEqual([{ x: 104, y: 232 }]);
    p = deleteBend(p, 'w1', 0);
    expect(p.wires[0]).toEqual({ id: 'w1', a: 'board.GP15', b: 'bb1.a5' });
    expect(straighten(bent(), 'w1').wires[0]).toEqual({ id: 'w1', a: 'board.GP15', b: 'bb1.a5' });
  });
});

describe('M5.3 F-15 a pin\'s card', () => {
  const pico = boardData('pico-w');
  it('GP15 on the Pico W: its name, its pin number, digital in/out and its functions by kind, logic and current', () => {
    const c = pinCard(pico, 'GP15');
    expect(c.title).toBe('GP15');
    expect(c.detail).toBe('pin 20');
    expect(c.chips).toEqual([
      { text: 'Digital in/out', kind: 'gpio' }, { text: 'PWM7B', kind: 'pwm' }, { text: 'I2C1 SCL', kind: 'i2c' }, { text: 'SPI1 TX', kind: 'spi' },
    ]);
    expect(pinCard(pico, 'GP0').chips.map((ch) => ch.kind)).toEqual(['gpio', 'pwm', 'i2c', 'spi', 'uart']);
    expect(c.lines).toEqual(['3.3 V logic · up to 12 mA']);
  });

  it('power, ground, an ADC pin, and the ESP32\'s input-only and strapping pins say so', () => {
    expect(pinCard(pico, '3V3')).toMatchObject({ chips: [{ text: 'Power', kind: 'power' }], lines: ['3.3 V out · up to 300 mA'] });
    expect(pinCard(pico, 'VBUS').lines).toEqual(['5 V out · up to 500 mA', 'Only while the USB cable is in', '5 V from USB']);
    expect(pinCard(pico, 'GND@3')).toMatchObject({ title: 'GND', chips: [{ text: 'Ground', kind: 'gnd' }], lines: ['0 V · every GND pin is joined'] });
    expect(pinCard(pico, 'GP26').chips.map((c) => c.kind)).toContain('adc');
    const esp = boardData('esp32-devkit-v1');
    const vp = esp.pins.find((p) => p.inputOnly)!;
    expect(pinCard(esp, vp.id).chips[0]).toEqual({ text: 'Input only', kind: 'gpio' });
    expect(pinCard(esp, 'D2').lines).toContain('The blue LED on the board; must be LOW or floating to load new code');
    expect(pinCard(esp, 'D2').chips.map((c) => c.kind)).toEqual(['gpio', 'adc', 'touch', 'pwm']);
  });
});

describe('M5.3 F-12 a hole\'s card', () => {
  it('a column half: its holes, and what is already in it', () => {
    let p = addPart(empty(), 'resistor', { a: 'bb1.e18', b: 'bb1.e21' }).project;
    expect(holeCard(p, 'bb1.c18')).toEqual({ title: 'Column 18, rows a–e', lines: ['These 5 holes are joined inside the breadboard.', 'R1 is already in row e.'] });
    p = addWire(p, 'board.GP15', 'bb1.a18')!;
    expect(holeCard(p, 'bb1.c18').lines).toEqual(['These 5 holes are joined inside the breadboard.', 'R1 is already in row e.', 'A wire joins it to GP15.']);
    expect(holeCard(empty(), 'bb1.h3').title).toBe('Column 3, rows f–j');
  });

  it('a rail: which one, all its holes joined', () => {
    expect(holeCard(empty(), 'bb1.T-4')).toEqual({ title: 'Top − rail', lines: ['All 25 holes along this line are joined — usually GND.'] });
    expect(holeCard(empty(), 'bb1.B+4').title).toBe('Bottom + rail');
    const full = { ...empty(), breadboards: [{ id: 'bb1', size: 'full' as const }] };
    expect(holeCard(full, 'bb1.T+1').lines[0]).toMatch(/^All 53 holes/);
  });
});
