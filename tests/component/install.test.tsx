import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Detection, FoundBoard, InstallResult, InstallStep } from '@lib/usb';
import { App } from '../../src/renderer/app/App';
import { fakeApi } from './fake-api';
import { newProjectFromStart } from './new-project';

/** M10.7 F-52 (screen 14b): installing MicroPython from the app — offline, its steps as they go, what can go wrong. */
const MB: FoundBoard = { id: '9906', kind: 'microbit', port: '/dev/cu.usbmodem14202', usb: '0d28:0204' };
const bootsel: Detection = { boards: [], drives: [{ kind: 'pico-bootsel', volume: 'RPI-RP2' }] };

async function setup(start: Detection, project = 'New Pico W project') {
  const api = fakeApi();
  let step: (s: InstallStep) => void = () => {};
  let finish: (r: InstallResult) => void = () => {};
  api.boards.get = vi.fn(async () => start);
  api.boards.onInstallStep = vi.fn((h) => { step = h; return () => {}; });
  api.boards.install = vi.fn(() => new Promise<InstallResult>((r) => { finish = r; }));
  render(<App api={api} width={1440} />);
  await newProjectFromStart(project);
  return { api, step: (s: InstallStep) => act(() => step(s)), finish: (r: InstallResult) => act(async () => { finish(r); }) };
}

async function openFromChip(label: RegExp) {
  fireEvent.click(await screen.findByRole('button', { name: /^Board:/ }));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Board' })).getByRole('button', { name: label }));
}
const dialog = (name: string) => screen.getByRole('dialog', { name });

describe('M10.7 F-52 on a Pico W in BOOTSEL', () => {
  it('the dialog, as screen 14b: the firmware shipped with the app, the steps, the notes', async () => {
    await setup(bootsel);
    await openFromChip(/Install MicroPython 1.29/);
    const d = dialog('Install MicroPython on the Pico W');
    expect(d).toHaveTextContent('The Pico W is in BOOTSEL mode');
    expect(d).toHaveTextContent('MicroPython v1.29.0 for the Pico W');
    expect(d).toHaveTextContent('RPI_PICO_W-20260824-v1.29.0.uf2 · 1.7 MB');
    expect(d).toHaveTextContent('same as the simulator');
    expect(within(d).getByRole('list', { name: 'Installing' })).toHaveTextContent('Copy MicroPython to RPI-RP2');
    expect(d).toHaveTextContent('Choose Allow');
    expect(d).toHaveTextContent("The Pico W's files stay");
    expect(d).toHaveTextContent('About 20 seconds');
  });

  it('Install: each step as it goes — the copy\'s progress — then its version', async () => {
    const s = await setup(bootsel);
    await openFromChip(/Install MicroPython 1.29/);
    fireEvent.click(within(dialog('Install MicroPython on the Pico W')).getByRole('button', { name: 'Install' }));
    expect(s.api.boards.install).toHaveBeenCalledWith('pico');
    expect(within(dialog('Install MicroPython on the Pico W')).getByRole('button', { name: 'Installing…' })).toBeDisabled();
    s.step({ step: 'copy', state: 'now' });
    s.step({ step: 'copy', state: 'progress', done: 905728, total: 1811456 });
    const list = within(dialog('Install MicroPython on the Pico W')).getByRole('list', { name: 'Installing' });
    expect(list).toHaveTextContent('50 %');
    s.step({ step: 'copy', state: 'done' });
    s.step({ step: 'restart', state: 'now' });
    expect(within(list).getByText('Copy MicroPython to RPI-RP2').closest('li')).toHaveClass('is-ok');
    await s.finish({ ok: true, version: '1.29.0' });
    expect(dialog('Install MicroPython on the Pico W')).toHaveTextContent('MicroPython 1.29.0 is on the Pico W.');
  });

  it('macOS says no: what to allow, and the file to drag by hand', async () => {
    const s = await setup(bootsel);
    await openFromChip(/Install MicroPython 1.29/);
    fireEvent.click(within(dialog('Install MicroPython on the Pico W')).getByRole('button', { name: 'Install' }));
    await s.finish({ ok: false, permission: true, file: '/x.uf2', message: 'MicroLab may not write to the RPI-RP2 drive. On a Mac: allow MicroLab in System Settings.' });
    const d = dialog('Install MicroPython on the Pico W');
    expect(within(d).getByRole('alert')).toHaveTextContent('may not write to the RPI-RP2 drive');
    fireEvent.click(within(d).getByRole('button', { name: 'Show the file' }));
    expect(s.api.app.showFirmware).toHaveBeenCalledWith('pico');
    expect(within(d).getByRole('button', { name: 'Try again' })).toBeEnabled();
  });

  it('Cancel while it installs: asked to stop', async () => {
    const s = await setup(bootsel);
    await openFromChip(/Install MicroPython 1.29/);
    fireEvent.click(within(dialog('Install MicroPython on the Pico W')).getByRole('button', { name: 'Install' }));
    fireEvent.click(within(dialog('Install MicroPython on the Pico W')).getByRole('button', { name: 'Cancel' }));
    expect(s.api.boards.cancelInstall).toHaveBeenCalled();
  });

  it('a Pico with no MicroPython and no BOOTSEL drive: the first step is the student\'s', async () => {
    await setup({ boards: [{ id: 'e661', kind: 'pico', port: '/dev/cu.usbmodem14201', usb: '2e8a:0005' }], drives: [], checks: { e661: { state: 'no-micropython', seen: '' } } });
    await openFromChip(/Install MicroPython/);
    expect(within(dialog('Install MicroPython on the Pico W')).getByRole('list', { name: 'Installing' }))
      .toHaveTextContent('Put it in BOOTSEL: unplug it, hold the white BOOTSEL button, plug it back in, let go');
  });
});

describe('M10.7 F-52 on a micro:bit', () => {
  it('no MicroPython on it: installing wipes its files — they are copied off first and put back', async () => {
    const s = await setup({ boards: [MB], drives: [{ kind: 'microbit', volume: 'MICROBIT' }], checks: { 9906: { state: 'no-micropython', seen: '' } } }, 'New micro:bit project');
    await openFromChip(/Install MicroPython/);
    const d = dialog('Install MicroPython on the micro:bit');
    expect(d).toHaveTextContent('micro:bit MicroPython v2.1.2');
    expect(d).toHaveTextContent('installing wipes its files');
    expect(within(d).getByRole('list', { name: 'Installing' })).toHaveTextContent('Copy its files to this laptop');
    expect(within(d).getByRole('list', { name: 'Installing' })).toHaveTextContent('Put its files back');
    fireEvent.click(within(d).getByRole('button', { name: 'Install' }));
    expect(s.api.boards.install).toHaveBeenCalledWith('microbit');
    await s.finish({ ok: true, version: '2.1.2', restored: 3, keptIn: '/d/micro-bit 2026-11-06 16-00-00' });
    expect(d).toHaveTextContent('MicroPython 2.1.2 is on the micro:bit. Its 3 files are back on it');
  });
});

describe('M10.7 F-52 from the helper', () => {
  it('a Pico in BOOTSEL: the helper offers to install', async () => {
    await setup(bootsel);
    await openFromChip(/Help connecting/);
    fireEvent.click(within(dialog('Help connecting a board')).getByRole('button', { name: /Install MicroPython/ }));
    await waitFor(() => expect(dialog('Install MicroPython on the Pico W')).toBeInTheDocument());
  });
});
