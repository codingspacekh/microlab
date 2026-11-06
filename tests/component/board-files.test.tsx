import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { parseUname, type BoardListing } from '@lib/repl';
import type { Detection, FoundBoard } from '@lib/usb';
import { App } from '../../src/renderer/app/App';
import { fakeApi } from './fake-api';

/**
 * M10.5 F-53 (screen 15): Board files — the board's files beside the project's, which are the same, differ or are
 * only on one side; copy either way, open read-only, make a folder, delete; a warning and a copy kept before anything
 * on the board is replaced or deleted.
 */
const PICO: FoundBoard = { id: 'e661', kind: 'pico', port: '/dev/cu.usbmodem14201', usb: '2e8a:0005' };
const W = parseUname("(sysname='rp2', nodename='rp2', release='1.29.0', version='v1.29.0 on 2026-08-24', machine='Raspberry Pi Pico W with RP2040')")!;
const ready: Detection = { boards: [PICO], drives: [], checks: { e661: { state: 'micropython', uname: W } } };
const enc = (t: string) => new TextEncoder().encode(t);

const LISTING: BoardListing = {
  files: [
    { path: 'lib/a.py', size: 6 }, { path: 'main.py', size: 12533 },
    { path: 'smarthome/door.py', size: 4 }, { path: 'smarthome/web/x.html', size: 3 },
  ],
  dirs: ['lib', 'smarthome', 'smarthome/web'],
  same: { 'main.py': false },
  space: { total: 868352, free: 868352 - 139264 },
  flat: false,
};

function setup(listing: BoardListing = LISTING, detection: Detection = ready) {
  const api = fakeApi();
  api.boards.get = vi.fn(async () => detection);
  api.boards.files.list = vi.fn(async () => ({ ok: true as const, listing, board: 'Pico W' }));
  api.boards.files.read = vi.fn(async (_id: string, paths: string[]) => ({
    ok: true as const,
    files: (paths.includes('smarthome')
      ? { 'smarthome/door.py': enc('door'), 'smarthome/web/x.html': enc('<p>') }
      : { 'main.py': enc('# the teacher\'s smart home\nimport network\n') }) as Record<string, Uint8Array>,
  }));
  api.boards.files.copy = vi.fn(async () => ({ ok: true as const, sent: [{ path: 'main.py', size: 200 }], same: [], keptIn: '/d/Pico W 2026-11-06 15-00-00' }));
  api.boards.files.delete = vi.fn(async () => ({ ok: true as const, keptIn: '/d/Pico W 2026-11-06 15-01-00' }));
  api.boards.files.mkdir = vi.fn(async () => ({ ok: true as const }));
  render(<App api={api} width={1440} />);
  fireEvent.click(screen.getByRole('button', { name: 'New Pico W project' }));
  return { api };
}

const dialog = () => screen.getByRole('dialog', { name: 'Board files' });
const pane = (name: RegExp) => within(dialog()).getByRole('tree', { name });
const project = () => pane(/This project/);
const board = () => pane(/On the Pico W/);
const item = (tree: HTMLElement, name: string) => within(tree).getByRole('treeitem', { name: new RegExp(`^${name.replace('.', '\\.')}\\b`) });

async function open() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'More ways to send' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'More ways to send' }));
  fireEvent.click(screen.getByRole('menuitem', { name: /Board files/ }));
  await waitFor(() => expect(within(dialog()).getByRole('tree', { name: /On the Pico W/ })).toBeInTheDocument());
}

describe('M10.5 F-53 the two sides', () => {
  it('the project and the board, each file\'s size and how it compares; the board\'s space', async () => {
    const s = setup();
    await open();
    expect(s.api.boards.files.list).toHaveBeenCalledWith('e661', expect.objectContaining({ 'main.py': expect.any(String) }));
    expect(item(project(), 'main.py')).toHaveTextContent('differs');
    expect(item(board(), 'main.py')).toHaveTextContent('12.2 KB');
    expect(item(board(), 'main.py')).toHaveTextContent('differs');
    expect(item(board(), 'smarthome')).toHaveTextContent('1 folder · 1 file');
    expect(item(board(), 'smarthome')).toHaveTextContent('only on the board');
    expect(dialog()).toHaveTextContent('136 KB used of 848 KB');
  });

  it('folders open and close (a click on the arrow, or → and ←)', async () => {
    setup();
    await open();
    expect(within(board()).queryByRole('treeitem', { name: /^door\.py/ })).toBeNull();
    fireEvent.click(within(item(board(), 'smarthome')).getByRole('button', { name: 'Open smarthome' }));
    expect(item(board(), 'door.py')).toBeInTheDocument();
    fireEvent.keyDown(item(board(), 'smarthome'), { key: 'ArrowLeft' });
    expect(within(board()).queryByRole('treeitem', { name: /^door\.py/ })).toBeNull();
  });
});

describe('M10.5 F-53 copying', () => {
  it('to the board, replacing its main.py: asked first, its old one kept on the laptop', async () => {
    const s = setup();
    await open();
    fireEvent.click(item(project(), 'main.py'));
    fireEvent.click(within(dialog()).getByRole('button', { name: /Copy to the board/ }));
    const ask = within(dialog()).getByRole('group', { name: 'Replace main.py on the Pico W?' });
    expect(ask).toHaveTextContent('The board\'s own main.py (12.2 KB) is replaced by this project\'s');
    expect(within(ask).getByRole('checkbox', { name: /Keep a copy/ })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(within(ask).getByRole('button', { name: 'Replace' }));
    await waitFor(() => expect(s.api.boards.files.copy).toHaveBeenCalledWith('e661', { 'main.py': expect.stringContaining('from machine') }, true));
    expect(await within(dialog()).findByText(/kept in “Pico W 2026-11-06 15-00-00”/)).toBeInTheDocument();
    expect(s.api.boards.files.list).toHaveBeenCalledTimes(2);
  });

  it('to this laptop: a board folder goes into the project, all in it', async () => {
    setup();
    await open();
    fireEvent.click(item(board(), 'smarthome'));
    fireEvent.click(within(dialog()).getByRole('button', { name: /Copy to this laptop/ }));
    await waitFor(() => expect(item(project(), 'smarthome')).toBeInTheDocument());
    // copied in, its folders are open
    expect(item(project(), 'door.py')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Project' })).getByTitle('Not saved')).toBeInTheDocument();
  });

  it('to this laptop, replacing the project\'s main.py: asked first; then it is the editor\'s', async () => {
    setup();
    await open();
    fireEvent.click(item(board(), 'main.py'));
    fireEvent.click(within(dialog()).getByRole('button', { name: /Copy to this laptop/ }));
    const ask = await within(dialog()).findByRole('group', { name: 'Replace main.py in this project?' });
    fireEvent.click(within(ask).getByRole('button', { name: 'Replace' }));
    expect(await within(dialog()).findByText('Copied main.py into this project.')).toBeInTheDocument();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('textbox', { name: /main\.py/ })).toHaveTextContent('the teacher\'s smart home');
  });
});

describe('M10.5 F-53 open, folder, delete, done', () => {
  it('Open: a board file read-only, then back to the list', async () => {
    setup();
    await open();
    fireEvent.click(item(board(), 'main.py'));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Open' }));
    const view = await within(dialog()).findByRole('region', { name: 'main.py on the Pico W (read-only)' });
    expect(view).toHaveTextContent('import network');
    fireEvent.click(within(view).getByRole('button', { name: 'Back to the files' }));
    expect(board()).toBeInTheDocument();
  });

  it('a new folder, inside the folder chosen', async () => {
    const s = setup();
    await open();
    fireEvent.click(item(board(), 'lib'));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'New folder' }));
    const ask = within(dialog()).getByRole('group', { name: 'A new folder on the Pico W' });
    fireEvent.change(within(ask).getByRole('textbox', { name: 'Folder name' }), { target: { value: 'sensors' } });
    fireEvent.click(within(ask).getByRole('button', { name: 'Make it' }));
    await waitFor(() => expect(s.api.boards.files.mkdir).toHaveBeenCalledWith('e661', 'lib/sensors'));
  });

  it('Delete: asked first, says what goes, a copy kept', async () => {
    const s = setup();
    await open();
    fireEvent.click(item(board(), 'smarthome'));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Delete' }));
    const ask = within(dialog()).getByRole('group', { name: 'Delete smarthome from the Pico W?' });
    expect(ask).toHaveTextContent('Its 2 files are deleted from the board.');
    fireEvent.click(within(ask).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(s.api.boards.files.delete).toHaveBeenCalledWith('e661', ['smarthome'], true));
    expect(await within(dialog()).findByText(/kept in “Pico W 2026-11-06 15-01-00”/)).toBeInTheDocument();
  });

  it('Cancel in a question: nothing done', async () => {
    const s = setup();
    await open();
    fireEvent.click(item(board(), 'main.py'));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Delete' }));
    fireEvent.click(within(within(dialog()).getByRole('group', { name: /Delete main.py/ })).getByRole('button', { name: 'Cancel' }));
    expect(s.api.boards.files.delete).not.toHaveBeenCalled();
  });

  it('Done: closed, and the board\'s program runs again', async () => {
    const s = setup();
    await open();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog', { name: 'Board files' })).toBeNull();
    expect(s.api.boards.files.done).toHaveBeenCalledWith('e661');
  });

  it('the micro:bit has no folders: New folder can\'t be pressed, and says why', async () => {
    setup({ ...LISTING, files: [{ path: 'main.py', size: 10 }], dirs: [], flat: true, same: {} }, ready);
    await open();
    expect(within(dialog()).getByRole('button', { name: 'New folder' })).toBeDisabled();
  });

  it('a board that can\'t be read says why', async () => {
    const s = setup();
    s.api.boards.files.list = vi.fn(async () => ({ ok: false as const, message: 'The board is used by Thonny. Close Thonny, or press Stop/Disconnect in it, then try again.' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'More ways to send' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'More ways to send' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Board files/ }));
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('used by Thonny');
    await act(async () => {});
  });
});
