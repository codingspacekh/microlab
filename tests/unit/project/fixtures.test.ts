import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readMlab } from '@lib/project';

/** N-09: a file saved by this version (format 1) opens in every later MicroLab. The fixture is never rewritten:
 *  when the format changes, migrate.ts must still read it, and a new fixture is added for the new format. */
describe('M4.6 N-09 old files open', () => {
  it('format 1 (MicroLab 0.4): the board, view, parts with their values, wires with bends and colours, the files', () => {
    const d = readMlab(readFileSync('tests/fixtures/projects/format-1.mlab'));
    expect(d.project).toMatchObject({
      format: 1, title: 'Traffic light', board: 'pico-w',
      breadboards: [{ id: 'bb1', size: 'full' }],
      view: { board: { x: 72, y: 0 }, breadboards: { bb1: { x: 0, y: 200 } } },
    });
    expect(d.project.parts.map((p) => `${p.id} ${p.type} ${JSON.stringify(p.props)} ${Object.values(p.legs).join(' ')}`)).toEqual([
      'r1 resistor {"ohms":330} bb1.a5 bb1.a8',
      'led1 led {"color":"green"} bb1.b8 bb1.b10',
      'btn1 button {} bb1.e40 bb1.e42 bb1.f40 bb1.f42',
      'pot1 potentiometer {"ohms":100000} bb1.a50 bb1.a52 bb1.a54',
    ]);
    expect(d.project.wires).toEqual([
      { id: 'w1', a: 'board.GP15', b: 'bb1.e5', via: [{ x: 304, y: 184 }, { x: 88, y: 184 }], color: 'yellow' },
      { id: 'w2', a: 'board.GND@38', b: 'bb1.e10' },
    ]);
    expect(d.files).toEqual({ 'main.py': 'from machine import Pin\nled = Pin(15, Pin.OUT)\n', 'lib/helper.py': '# 24 °C\n' });
  });
});
