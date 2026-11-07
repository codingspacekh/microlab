import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { legsCentre } from '@lib/editor';
import type { ProjectDoc } from '@lib/project';
import { App } from '../../src/renderer/app/App';
import type { StartRun } from '../../src/renderer/app/useRun';
import type { RunEvents } from '../../src/renderer/sim-client';
import { fakeApi } from './fake-api';
import { startBuilding } from './start-building';

/** M6.7b (screens 22 and 22b, approved 2026-11-08): Add a library — from the + menu and the files panel — and the
 *  inspector's Library line. Run hands the project's files to the (fake) simulation: the test reads them there. */
const pack = (f: string) => readFileSync(join(process.cwd(), 'library/lib-pack', f), 'utf8');

function setup(board = 'New Pico W project') {
  const runs: { doc: ProjectDoc; events: RunEvents }[] = [];
  const start: StartRun = (req, events) => { runs.push({ ...req, events }); return { stop: vi.fn(), setInput: vi.fn() }; };
  const api = fakeApi();
  render(<App api={api} width={1440} startRun={start} audio={() => null} />);
  fireEvent.click(screen.getByRole('button', { name: board }));
  startBuilding();
  const svg = screen.getByRole('application', { name: 'Circuit canvas' });
  const [vx, vy] = svg.getAttribute('viewBox')!.split(' ').map(Number) as [number, number];
  const parts = screen.getByRole('region', { name: 'Parts' });
  const place = (name: RegExp, type: string, hole: string) => {
    const c = svg.querySelector(`[data-point="${hole}"]`)!;
    const [cx, cy] = legsCentre(type);
    const at = { clientX: Number(c.getAttribute('cx')) + cx - vx, clientY: Number(c.getAttribute('cy')) + cy - vy, button: 0 };
    fireEvent.mouseDown(within(parts).getByRole('button', { name }), { clientX: 5, clientY: 5, button: 0 });
    fireEvent.mouseMove(svg, at);
    fireEvent.mouseUp(svg, at);
  };
  const plus = (item: 'New file…' | 'Add a library…') => {
    fireEvent.click(screen.getByRole('button', { name: 'Add a file or a library' }));
    fireEvent.click(screen.getByRole('menuitem', { name: item }));
  };
  const dialog = () => screen.getByRole('dialog', { name: 'Add a library' });
  const row = (title: string) => within(dialog()).getByRole('listitem', { name: title });
  /** The project's files, as Run hands them to the simulation. */
  const files = () => {
    fireEvent.click(screen.getByRole('button', { name: /^Run \S+\.py$/ }));
    const f = runs.at(-1)!.doc.files;
    act(() => runs.at(-1)!.events.onEnd({ output: '', trace: [], pwm: [], analog: [], display: [], sound: [], bus: [], parts: [], faults: [], ended: 'done' } as never));
    return f;
  };
  const inspector = () => screen.getByRole('complementary', { name: 'Inspector' });
  return { api, place, plus, dialog, row, files, inspector };
}

describe('M6.7b Add a library (screen 22)', () => {
  it('from the + menu: the circuit\'s parts first, each with its authors and licence; what needs nothing says so', () => {
    const s = setup();
    s.place(/^VL53L0X/, 'vl53l0x', 'bb1.f2');
    s.place(/^DS18B20/, 'ds18b20', 'bb1.f12');
    s.plus('Add a library…');
    const mine = within(s.dialog()).getByRole('list', { name: 'For the parts in this circuit' });
    expect(within(mine).getAllByRole('listitem').map((r) => r.getAttribute('aria-label'))).toEqual(['VL53L0X laser distance']);
    expect(s.row('VL53L0X laser distance')).toHaveTextContent('TOF1');
    expect(s.row('VL53L0X laser distance')).toHaveTextContent('BSD-3-Clause · Kevin McAleer');
    expect(within(s.dialog()).getByText(/TEMP1 · DS18B20/).closest('p')).toHaveTextContent('onewire and ds18x20 are part of MicroPython');
    const other = within(s.dialog()).getByRole('list', { name: 'Other parts' });
    expect(within(other).getAllByRole('listitem')).toHaveLength(6);
  });

  it('how to start with the chosen one, to copy; Add puts its files and its licence in lib/', () => {
    const s = setup();
    s.plus('Add a library…');
    fireEvent.click(within(s.row('BMP280 air pressure')).getByRole('button', { name: /BMP280 air pressure/ }));
    const start = within(s.dialog()).getByRole('region', { name: 'How to start with bmp280' });
    expect(start).toHaveTextContent('bmp = BMP280(I2C(0, sda=Pin(4), scl=Pin(5)))');
    fireEvent.click(within(start).getByRole('button', { name: 'Copy' }));
    expect(s.api.app.copy).toHaveBeenCalledWith(expect.stringContaining('from bmp280 import BMP280'));
    fireEvent.click(within(s.row('BMP280 air pressure')).getByRole('button', { name: 'Add bmp280' }));
    expect(s.row('BMP280 air pressure')).toHaveTextContent('in lib/');
    fireEvent.click(within(s.dialog()).getByRole('button', { name: 'Close' }));
    const f = s.files();
    expect(f['lib/bmp280.py']).toBe(pack('bmp280/bmp280.py'));
    expect(f['lib/LICENSE-bmp280.txt']).toBe(pack('bmp280/LICENSE'));
  });

  it('the Pico W gets the rotary library\'s rp2 file; a lib/ file the student changed is replaced only when asked', () => {
    const s = setup();
    s.plus('New file…');
    const field = screen.getByRole('textbox', { name: 'New file' });
    fireEvent.change(field, { target: { value: 'lib/rotary.py' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    s.plus('Add a library…');
    const r = s.row('Rotary encoder');
    expect(r).toHaveTextContent('Your lib/rotary.py is different — it would be replaced.');
    fireEvent.click(within(r).getByRole('button', { name: 'Replace… rotary' }));
    const ask = screen.getByRole('alertdialog', { name: 'Replace your lib/rotary.py?' });
    fireEvent.click(within(ask).getByRole('button', { name: 'Keep mine' }));
    expect(s.files()['lib/rotary.py']).toBe('');
    s.plus('Add a library…');
    fireEvent.click(within(s.row('Rotary encoder')).getByRole('button', { name: 'Replace… rotary' }));
    fireEvent.click(within(screen.getByRole('alertdialog', { name: 'Replace your lib/rotary.py?' })).getByRole('button', { name: 'Replace it' }));
    fireEvent.click(within(s.dialog()).getByRole('button', { name: 'Close' }));
    const f = s.files();
    expect(f['lib/rotary.py']).toBe(pack('rotary/rotary.py'));
    expect(f['lib/rotary_irq_rp2.py']).toBe(pack('rotary/rotary_irq_rp2.py'));
    expect(f['lib/rotary_irq_esp.py']).toBeUndefined();
  });

  it('the files panel has Add library too; on the micro:bit, MicroLab\'s own drivers go next to main.py, the MIT notice inside', () => {
    const s = setup('New micro:bit project');
    fireEvent.click(screen.getByRole('button', { name: 'Project files' }));
    fireEvent.click(within(screen.getByRole('complementary', { name: 'Project files' })).getByRole('button', { name: 'Add library' }));
    expect(within(s.dialog()).getAllByRole('listitem')).toHaveLength(7);
    expect(s.row('HC-SR04 distance')).toHaveTextContent('MIT · MicroLab');
    fireEvent.click(within(s.row('HC-SR04 distance')).getByRole('button', { name: 'Add hcsr04' }));
    expect(s.row('HC-SR04 distance')).toHaveTextContent('added');
    fireEvent.click(within(s.dialog()).getByRole('button', { name: 'Close' }));
    const f = s.files();
    expect(f['hcsr04.py']).toBe(pack('hcsr04/microbit/hcsr04.py'));
    expect(Object.keys(f).sort()).toEqual(['hcsr04.py', 'main.py']);   // no folders, no licence file: its notice is inside
  });
});

describe('M6.7b the inspector\'s Library line (screen 22b)', () => {
  it('a part that needs a library: Add adds it at once; then it says it is in lib/', () => {
    const s = setup();
    s.place(/^VL53L0X/, 'vl53l0x', 'bb1.f2');
    const line = within(s.inspector()).getByRole('group', { name: 'Library' });
    expect(line).toHaveTextContent('vl53l0x');
    fireEvent.click(within(line).getByRole('button', { name: 'Add the vl53l0x library' }));
    expect(within(s.inspector()).getByRole('group', { name: 'Library' })).toHaveTextContent('vl53l0x in lib/ · BSD-3-Clause');
    expect(s.files()['lib/vl53l0x.py']).toBe(pack('vl53l0x/vl53l0x.py'));
  });

  it('nothing to add (MicroPython\'s own); none for the micro:bit; a part without one has no line', () => {
    const s = setup();
    s.place(/^DS18B20/, 'ds18b20', 'bb1.f12');
    expect(within(s.inspector()).getByRole('group', { name: 'Library' })).toHaveTextContent('None needed: onewire, ds18x20 are part of MicroPython');
    s.place(/^Push button/, 'button', 'bb1.e20');
    expect(within(s.inspector()).queryByRole('group', { name: 'Library' })).toBeNull();
  });

  it('on the micro:bit: MicroLab\'s own bmp280, added next to main.py', () => {
    const s = setup('New micro:bit project');
    s.place(/^BMP280/, 'bmp280', 'bb1.f2');
    fireEvent.click(within(s.inspector()).getByRole('button', { name: 'Add the bmp280 library' }));
    expect(within(s.inspector()).getByRole('group', { name: 'Library' })).toHaveTextContent('bmp280 added · MIT');
    expect(s.files()['bmp280.py']).toBe(pack('bmp280/microbit/bmp280.py'));
  });
});
