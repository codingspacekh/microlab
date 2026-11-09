import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/app/App';
import type { MicrolabApi } from '../../src/renderer/app/api';
import { newProjectFromStart } from './new-project';
import { fakeApi as sharedApi } from './fake-api';

function fakeApi(stored: Record<string, unknown> = {}): MicrolabApi & { set: ReturnType<typeof vi.fn> } {
  const set = vi.fn(async (key: string, value: unknown) => { stored[key] = value; });
  // the shared fake (projects made in memory, M12 Rev 11) with this file's settings
  return { ...sharedApi(), settings: { get: async (key: string) => stored[key], set }, set };
}

/** The workspace needs a project (M4.2): start one on the Pico W. */
async function renderWorkspace(api: MicrolabApi, width: number) {
  const r = render(<App api={api} width={width} />);
  await newProjectFromStart('New Pico W project');
  return r;
}

describe('M4.1 the shell (screens 01–03): top bar, modes, panels, status bar', () => {
  it('has the brand, the modes — Workspace, Python 3 (M12), Learn — and a status bar', async () => {
    await renderWorkspace(fakeApi(), 1440);
    expect(screen.getByText('Lab')).toBeInTheDocument();
    expect(within(screen.getByRole('tablist', { name: 'Mode' })).getAllByRole('tab').map((t) => t.textContent!.trim())).toEqual(['Workspace', 'Python 3', 'Learn']);
    expect(screen.getByRole('tab', { name: 'Workspace' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('the workspace has the rail, the canvas and the code side; the parts panel slides out with its own divider (M6.8)', async () => {
    await renderWorkspace(fakeApi(), 1440);
    expect(screen.getByRole('navigation', { name: 'Board and parts' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Circuit' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Code' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Parts' })).toBeNull();
    // the code side's divider, and the console's edge under the code (the teacher, 2026-11-09)
    expect(screen.getAllByRole('separator').map((s) => s.getAttribute('aria-label'))).toEqual(['Code panel width', 'The console\'s size']);
    fireEvent.click(screen.getByRole('button', { name: 'Parts' }));
    expect(screen.getByRole('region', { name: 'Parts' })).toBeInTheDocument();
    expect(screen.getByRole('separator', { name: 'Parts panel width' })).toBeInTheDocument();
  });

  it('panel widths are proportions of the window, within limits: 17 % and 34 % by default', async () => {
    await renderWorkspace(fakeApi(), 1440);
    fireEvent.click(screen.getByRole('button', { name: 'Parts' }));
    expect(screen.getByRole('separator', { name: 'Parts panel width' })).toHaveAttribute('aria-valuenow', String(Math.round(1440 * 0.17)));
    expect(screen.getByRole('separator', { name: 'Code panel width' })).toHaveAttribute('aria-valuenow', String(Math.round(1440 * 0.34)));
  });

  it('a moved divider is saved as a proportion, and read back on the next start', async () => {
    const api = fakeApi();
    const { unmount } = await renderWorkspace(api, 1600);
    fireEvent.click(screen.getByRole('button', { name: 'Parts' }));
    const sep = screen.getByRole('separator', { name: 'Parts panel width' });
    fireEvent.keyDown(sep, { key: 'ArrowRight' });   // 272 → 288 px
    expect(api.set).toHaveBeenCalledWith('layout', expect.objectContaining({ parts: expect.closeTo(288 / 1600, 4) }));
    unmount();
    await renderWorkspace(api, 1600);
    fireEvent.click(screen.getByRole('button', { name: 'Parts' }));
    await vi.waitFor(() => expect(screen.getByRole('separator', { name: 'Parts panel width' })).toHaveAttribute('aria-valuenow', '288'));
  });

  it('Learn is its own page (built in M8)', async () => {
    await renderWorkspace(fakeApi(), 1440);
    fireEvent.click(screen.getByRole('tab', { name: 'Learn' }));
    expect(screen.getByRole('tab', { name: 'Learn' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('region', { name: 'Parts' })).not.toBeInTheDocument();
  });
});
