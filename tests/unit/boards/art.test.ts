import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBoard } from '@lib/boards';

/** `npm run art` output (design/svgparts.py → library/…/art.svg + art.json), F-12, F-13. */
const lib = join(process.cwd(), 'library');
const read = (rel: string) => JSON.parse(readFileSync(join(lib, rel), 'utf8'));
const PITCH = 16;

type Art = { width: number; height: number; pitch: number; pins?: Record<string, [number, number]>; legs?: Record<string, [number, number]> };

/** All points lie on one 0.1 in grid, so they plug into breadboard holes. */
function onGrid(points: [number, number][]) {
  const [x0, y0] = points[0]!;
  return points.every(([x, y]) => Math.abs((x - x0) / PITCH - Math.round((x - x0) / PITCH)) < 1e-6
    && Math.abs((y - y0) / PITCH - Math.round((y - y0) / PITCH)) < 1e-6);
}

describe.each(['pico-w', 'esp32-devkit-v1', 'microbit-v2', 'esp32-devkit-v1-ext'])('F-12 %s art', (id) => {
  const board = parseBoard(read(`boards/${id}/board.json`));
  const art: Art = read(`boards/${id}/art.json`);

  it('has a picture', () => {
    expect(readFileSync(join(lib, `boards/${id}/art.svg`), 'utf8')).toMatch(/^<svg [^>]*viewBox="[^"]+"/);
    expect(art.pitch).toBe(PITCH);
  });

  it('every pin in board.json has a position inside the picture, and nothing else does', () => {
    expect(Object.keys(art.pins!).map(Number).sort((a, b) => a - b)).toEqual(board.pins.map((p) => p.number).sort((a, b) => a - b));
    for (const [x, y] of Object.values(art.pins!)) {
      expect(x).toBeGreaterThan(0);
      expect(y).toBeGreaterThan(0);
      expect(x).toBeLessThan(art.width);
      expect(y).toBeLessThan(art.height);
    }
  });

  it('the pins are on the 0.1 in grid, one pitch apart along a header', () => {
    const pts = Object.values(art.pins!);
    expect(onGrid(pts)).toBe(true);
    const n = (k: number) => art.pins![String(k)]!;
    if (id === 'esp32-devkit-v1-ext') return;   // its own test below: G-V-S triples
    expect(n(2)[0] - n(1)[0]).toBe(id === 'esp32-devkit-v1' ? -PITCH : PITCH);   // the ESP32's EN header runs right to left
  });
});

it('F-12 Pico W rows are 0.7 in apart (it straddles the channel)', () => {
  const art: Art = read('boards/pico-w/art.json');
  expect(art.pins!['1']![1] - art.pins!['40']![1]).toBe(7 * PITCH);
  expect(art.pins!['1']![0]).toBe(art.pins!['40']![0]);
});

it('F-12 micro:bit GPIO board rows are 0.3 in apart, one above the other (it straddles the channel)', () => {
  const art: Art = read('boards/microbit-v2/art.json');
  const pin = (n: number) => art.pins![String(n)]!;
  for (let i = 0; i < 13; i++) {
    expect(pin(14 + i)[1] - pin(1 + i)[1]).toBe(3 * PITCH);   // rows e and f of a breadboard
    expect(pin(14 + i)[0]).toBe(pin(1 + i)[0]);
  }
  for (let i = 27; i <= 30; i++) expect(pin(i)[0]).toBeGreaterThan(pin(13)[0]);   // the I²C header, to the right
});

it('M6.9 the micro:bit alone (screen 24): a picture, and its five rings — P0, P1, P2, 3.3V, GND — inside it', () => {
  const board = parseBoard(read('boards/microbit-v2/board.json'));
  const art: Art & { display?: [number, number][] } = read('boards/microbit-v2/alone.json');
  expect(readFileSync(join(lib, 'boards/microbit-v2/alone.svg'), 'utf8')).toMatch(/^<svg [^>]*viewBox="[^"]+"/);
  const number = (id: string) => String(board.pins.find((p) => p.id === id)!.number);
  expect(Object.keys(art.pins!).sort()).toEqual(['P0', 'P1', 'P2', '3.3V', 'GND'].map(number).sort());
  for (const [x, y] of Object.values(art.pins!)) {
    expect(x).toBeGreaterThan(0);
    expect(y).toBeGreaterThan(0);
    expect(x).toBeLessThan(art.width);
    expect(y).toBeLessThan(art.height);
  }
  expect(art.display).toHaveLength(25);   // the display lights as on the GPIO board
});

it('F-12 ESP32 extension board: each G-V-S triple is one column, a pitch apart, G outermost', () => {
  const art: Art = read('boards/esp32-devkit-v1-ext/art.json');
  const pin = (n: number) => art.pins![String(n)]!;
  for (let t = 0; t < 26; t++) {
    const [s, v, g] = [pin(t * 3 + 1), pin(t * 3 + 2), pin(t * 3 + 3)];
    expect(v[0]).toBe(s[0]);
    expect(g[0]).toBe(s[0]);
    const out = t < 13 ? -PITCH : PITCH;   // EN header's triples above the ESP32, the other header's below
    expect(v[1] - s[1]).toBe(out);
    expect(g[1] - v[1]).toBe(out);
  }
  expect(pin(4)[0] - pin(1)[0]).toBe(-PITCH);   // EN, VP, VN … run right to left, like the ESP32's header
  expect(pin(43)[0] - pin(40)[0]).toBe(-PITCH);   // D23, D22 … too
});

describe.each([
  ['button', ['1a', '1b', '2a', '2b']],
  ['potentiometer', ['1', '2', '3']],
])('F-13 %s art', (id, legs) => {
  it('has a picture and its legs on the grid', () => {
    expect(existsSync(join(lib, `parts/${id}/art.svg`))).toBe(true);
    const art: Art = read(`parts/${id}/art.json`);
    expect(Object.keys(art.legs!).sort()).toEqual([...legs].sort());
    expect(onGrid(Object.values(art.legs!))).toBe(true);
  });
  it('its legs are inside the picture (not cut off)', () => {
    const art: Art = read(`parts/${id}/art.json`);
    for (const [x, y] of Object.values(art.legs!)) {
      expect(x).toBeGreaterThan(0);
      expect(y).toBeGreaterThan(0);
      expect(x).toBeLessThan(art.width);
      expect(y).toBeLessThan(art.height);
    }
  });
});
