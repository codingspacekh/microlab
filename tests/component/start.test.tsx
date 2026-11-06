import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { newProject, type OpenResult } from '@lib/project';
import { App } from '../../src/renderer/app/App';
import type { MicrolabApi } from '../../src/renderer/app/api';

/** M4.2 the Start screen (01, minimal): a new project from a board (F-01), open a .mlab (F-02). */
function fakeApi(open: () => Promise<OpenResult> = async () => ({ ok: false, canceled: true })) {
  const stored: Record<string, unknown> = {};
  const api: MicrolabApi = {
    versions: { app: '0.4.0', electron: '0' },
    settings: { get: async (key) => stored[key], set: async (key, value) => { stored[key] = value; } },
    project: { open: vi.fn(open) },
  };
  return api;
}

const projectBar = () => screen.getByRole('group', { name: 'Project' });

describe('M4.2 the Start screen', () => {
  it('is where the app opens: three boards to start from, and a way to open a file; no mode is chosen', () => {
    render(<App api={fakeApi()} width={1440} />);
    expect(screen.getByRole('heading', { name: 'Start a new project' })).toBeInTheDocument();
    for (const name of ['New micro:bit project', 'New Pico W project', 'New ESP32 project']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    for (const board of ['BBC micro:bit V2', 'Raspberry Pi Pico W', 'ESP32 DevKit V1']) {
      expect(screen.getByRole('img', { name: board })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('button', { name: 'Open a project…' }).length).toBeGreaterThanOrEqual(1);
    for (const tab of screen.getAllByRole('tab')) expect(tab).toHaveAttribute('aria-selected', 'false');
    expect(screen.queryByRole('region', { name: 'Circuit' })).not.toBeInTheDocument();
  });

  it.each([
    ['New micro:bit project', 'BBC micro:bit V2', 'from microbit import *'],
    ['New Pico W project', 'Raspberry Pi Pico W', 'from machine import Pin'],
    ['New ESP32 project', 'ESP32 DevKit V1 (30 pins)', 'from machine import Pin'],
  ])('F-01 “%s” opens the workspace with that board and the starter main.py', (button, board, code) => {
    render(<App api={fakeApi()} width={1440} />);
    fireEvent.click(screen.getByRole('button', { name: button }));
    expect(screen.getByRole('region', { name: 'Circuit' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Workspace' })).toHaveAttribute('aria-selected', 'true');
    expect(within(projectBar()).getByText('Untitled project')).toBeInTheDocument();
    expect(within(projectBar()).getByText(board)).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Code' })).getByText(code, { exact: false })).toBeInTheDocument();
  });

  it('F-02 “Open a project…” opens the chosen file in the workspace, named as the file', async () => {
    const api = fakeApi(async () => ({ ok: true, path: '/s/Night light.mlab', name: 'Night light', doc: newProject('esp32-devkit-v1') }));
    render(<App api={api} width={1440} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Open a project…' })[0]!);
    await screen.findByRole('region', { name: 'Circuit' });
    expect(api.project.open).toHaveBeenCalledOnce();
    expect(within(projectBar()).getByText('Night light')).toBeInTheDocument();
    expect(within(projectBar()).getByText('ESP32 DevKit V1 (30 pins)')).toBeInTheDocument();
  });

  it('a file that can\'t be opened: its message is shown, and the start screen stays', async () => {
    render(<App api={fakeApi(async () => ({ ok: false, message: '“photo.mlab” isn\'t a MicroLab project.' }))} width={1440} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Open a project…' })[0]!);
    expect(await screen.findByRole('alert')).toHaveTextContent('“photo.mlab” isn\'t a MicroLab project.');
    expect(screen.getByRole('heading', { name: 'Start a new project' })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('cancelling the file chooser changes nothing', async () => {
    const api = fakeApi();
    render(<App api={api} width={1440} />);
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Open a project…' })[0]!); });
    expect(api.project.open).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Start a new project' })).toBeInTheDocument();
  });

  it('with no project, Workspace is the start screen; Learn and back', () => {
    render(<App api={fakeApi()} width={1440} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Learn' }));
    expect(screen.queryByRole('heading', { name: 'Start a new project' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Workspace' }));
    expect(screen.getByRole('heading', { name: 'Start a new project' })).toBeInTheDocument();
  });

  it('the Learn and Examples cards lead to those pages', () => {
    render(<App api={fakeApi()} width={1440} />);
    fireEvent.click(screen.getByRole('button', { name: 'See the examples' }));
    expect(screen.getByRole('tab', { name: 'Examples' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('M4.2 the project menu in the workspace', () => {
  const openWorkspace = (api = fakeApi()) => {
    render(<App api={api} width={1440} />);
    fireEvent.click(screen.getByRole('button', { name: 'New Pico W project' }));
    return api;
  };

  it('“New project…” goes back to the start screen', () => {
    openWorkspace();
    fireEvent.click(screen.getByRole('button', { name: 'Project menu' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New project…' }));
    expect(screen.getByRole('heading', { name: 'Start a new project' })).toBeInTheDocument();
  });

  it('“Open a project…” asks for a file', async () => {
    const api = openWorkspace(fakeApi(async () => ({ ok: true, path: '/s/Blink.mlab', name: 'Blink', doc: newProject('microbit-v2') })));
    fireEvent.click(screen.getByRole('button', { name: 'Project menu' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open a project…' }));
    expect(await within(projectBar()).findByText('Blink')).toBeInTheDocument();
    expect(api.project.open).toHaveBeenCalledOnce();
  });

  it('by keyboard: ArrowDown opens it on the first item, arrows move, Esc closes it and gives focus back', () => {
    openWorkspace();
    const button = screen.getByRole('button', { name: 'Project menu' });
    button.focus();
    fireEvent.keyDown(button, { key: 'ArrowDown' });
    const items = screen.getAllByRole('menuitem');
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(items[0]!, { key: 'ArrowDown' });
    expect(items[1]).toHaveFocus();
    fireEvent.keyDown(items[1]!, { key: 'ArrowDown' });
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(items[0]!, { key: 'End' });
    expect(items[items.length - 1]).toHaveFocus();
    fireEvent.keyDown(items[0]!, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('a click elsewhere closes it', () => {
    openWorkspace();
    fireEvent.click(screen.getByRole('button', { name: 'Project menu' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
