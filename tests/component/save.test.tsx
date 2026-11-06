import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { legsCentre } from '@lib/editor';
import { newProject, type ProjectDoc, type SaveResult } from '@lib/project';
import { App } from '../../src/renderer/app/App';
import type { MicrolabApi } from '../../src/renderer/app/api';

/** M4.6 F-02, F-60: Save, Save as, the unsaved mark, "Save your changes?" before the project is closed. */
function fakeApi(save: (doc: ProjectDoc, opts: { path?: string; name: string }) => Promise<SaveResult> = async (_d, o) => ({ ok: true, path: o.path ?? `/s/${o.name} 2.mlab`, name: o.path ? o.name : `${o.name} 2` })) {
  const stored: Record<string, unknown> = {};
  let closeRequest: (() => void) | undefined;
  const api = {
    versions: { app: '0.4.0', electron: '0' },
    settings: { get: async (k: string) => stored[k], set: async (k: string, v: unknown) => { stored[k] = v; } },
    project: {
      open: vi.fn(async () => ({ ok: true as const, path: '/s/Other.mlab', name: 'Other', doc: newProject('microbit-v2') })),
      save: vi.fn(save),
    },
    boards: { get: vi.fn(async () => ({ boards: [], drives: [] })), check: vi.fn(async () => {}), send: vi.fn(async () => ({ ok: false as const, message: 'no' })),
      files: {
        list: vi.fn(async () => ({ ok: false as const, message: 'no' })),
        read: vi.fn(async () => ({ ok: false as const, message: 'no' })),
        copy: vi.fn(async () => ({ ok: false as const, message: 'no' })),
        delete: vi.fn(async () => ({ ok: false as const, message: 'no' })),
        mkdir: vi.fn(async () => ({ ok: false as const, message: 'no' })),
        done: vi.fn(async () => {}),
      },
      console: { open: vi.fn(async () => ({ ok: true as const })), close: vi.fn(async () => {}), do: vi.fn(async () => {}), onOutput: vi.fn(() => () => {}) },
      onChange: vi.fn(() => () => {}) },
    app: {
      setDirty: vi.fn(),
      onCloseRequest: vi.fn((cb: () => void) => { closeRequest = cb; return () => { closeRequest = undefined; }; }),
      close: vi.fn(),
    },
  } satisfies MicrolabApi;
  return { api, requestClose: () => act(() => closeRequest?.()) };
}

function setup(f = fakeApi()) {
  render(<App api={f.api} width={1440} />);
  fireEvent.click(screen.getByRole('button', { name: 'New Pico W project' }));
  return f;
}

const bar = () => screen.getByRole('group', { name: 'Project' });
const menu = (item: string) => {
  fireEvent.click(screen.getByRole('button', { name: 'Project menu' }));
  fireEvent.click(screen.getByRole('menuitem', { name: item }));
};
/** A change: a resistor dragged onto the breadboard. */
function change() {
  const svg = screen.getByRole('application', { name: 'Circuit canvas' });
  const [vx, vy] = svg.getAttribute('viewBox')!.split(' ').map(Number) as [number, number];
  const hole = [...svg.querySelectorAll('[data-point^="bb1."]')].find((c) => !c.closest('[display="none"]'))!;
  const [cx, cy] = legsCentre('resistor');
  const at = { clientX: Number(hole.getAttribute('cx')) + cx - vx, clientY: Number(hole.getAttribute('cy')) + cy - vy, button: 0 };
  fireEvent.mouseDown(within(screen.getByRole('region', { name: 'Parts' })).getByRole('button', { name: /^Resistor/ }), { clientX: 5, clientY: 5, button: 0 });
  fireEvent.mouseMove(svg, at);
  fireEvent.mouseUp(svg, at);
}

describe('M4.6 the unsaved mark', () => {
  it('a new project is "not saved" but has no changes yet; a change marks it, and the window is told', () => {
    const f = setup();
    expect(bar()).toHaveTextContent('Raspberry Pi Pico W · not saved');
    expect(within(bar()).queryByTitle('Not saved')).toBeNull();
    change();
    expect(within(bar()).getByTitle('Not saved')).toBeInTheDocument();
    expect(f.api.app.setDirty).toHaveBeenLastCalledWith(true);
    expect(document.title).toBe('Untitled project • — MicroLab');
  });
});

describe('M4.6 F-02 Save and Save as', () => {
  it('Save on a new project asks where (no path given); it is then named as its file, with no mark', async () => {
    const f = setup();
    change();
    menu('Save');
    await waitFor(() => expect(within(bar()).getByText('Untitled project 2')).toBeInTheDocument());
    expect(f.api.project.save).toHaveBeenCalledWith(expect.objectContaining({ project: expect.objectContaining({ board: 'pico-w' }) }), { name: 'Untitled project' });
    expect(within(bar()).queryByTitle('Not saved')).toBeNull();
    expect(bar()).not.toHaveTextContent('not saved');
    // the window tells the main process from an effect, run just after the screen changes: wait for it too
    await waitFor(() => expect(f.api.app.setDirty).toHaveBeenLastCalledWith(false));
    expect(screen.getByRole('status')).toHaveTextContent('Saved “Untitled project 2.mlab”');
  });

  it('once saved, ⌘S / Ctrl+S saves to the same file without asking', async () => {
    const f = setup();
    menu('Save');
    await waitFor(() => expect(within(bar()).getByText('Untitled project 2')).toBeInTheDocument());
    change();
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await waitFor(() => expect(f.api.project.save).toHaveBeenCalledTimes(2));
    expect(f.api.project.save).toHaveBeenLastCalledWith(expect.anything(), { path: '/s/Untitled project 2.mlab', name: 'Untitled project 2' });
  });

  it('Save as (or ⇧⌘S) always asks', async () => {
    const f = setup();
    menu('Save');
    await waitFor(() => expect(f.api.project.save).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(window, { key: 's', metaKey: true, shiftKey: true });
    await waitFor(() => expect(f.api.project.save).toHaveBeenCalledTimes(2));
    expect(f.api.project.save).toHaveBeenLastCalledWith(expect.anything(), { name: 'Untitled project 2' });
  });

  it('cancelled: nothing changes; failed: the message is shown and the mark stays', async () => {
    const cancel = setup(fakeApi(async () => ({ ok: false, canceled: true })));
    change();
    menu('Save');
    await waitFor(() => expect(cancel.api.project.save).toHaveBeenCalled());
    expect(within(bar()).getByTitle('Not saved')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a save that fails says why', async () => {
    setup(fakeApi(async () => ({ ok: false, message: '“x.mlab” can\'t be saved: the disk is full.' })));
    change();
    menu('Save');
    expect(await screen.findByRole('alert')).toHaveTextContent('the disk is full');
    expect(within(bar()).getByTitle('Not saved')).toBeInTheDocument();
  });
});

describe('M4.6 "Save your changes?" before a project is closed', () => {
  it('New project with changes: Cancel keeps it, Don\'t save drops them', () => {
    setup();
    change();
    menu('New project…');
    const ask = screen.getByRole('alertdialog', { name: 'Save your changes to “Untitled project”?' });
    fireEvent.click(within(ask).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('application', { name: 'Circuit canvas' })).toBeInTheDocument();
    menu('New project…');
    fireEvent.click(screen.getByRole('button', { name: "Don't save" }));
    expect(screen.getByRole('heading', { name: 'Start a new project' })).toBeInTheDocument();
  });

  it('Save in it saves, then goes on; a cancelled save stays', async () => {
    const f = setup();
    change();
    menu('Open a project…');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(within(bar()).getByText('Other')).toBeInTheDocument());
    expect(f.api.project.save).toHaveBeenCalledOnce();
    expect(f.api.project.open).toHaveBeenCalledOnce();
  });

  it('with no changes, nothing is asked', () => {
    setup();
    menu('New project…');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Start a new project' })).toBeInTheDocument();
  });

  it('closing the window: asked only when there are changes; Don\'t save closes it', () => {
    const f = setup();
    f.requestClose();
    expect(f.api.app.close).toHaveBeenCalledTimes(1);
    change();
    f.requestClose();
    expect(f.api.app.close).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: "Don't save" }));
    expect(f.api.app.close).toHaveBeenCalledTimes(2);
  });
});
