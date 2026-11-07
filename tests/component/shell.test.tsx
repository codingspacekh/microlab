import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/app/App';
import type { MicrolabApi } from '../../src/renderer/app/api';

function fakeApi(stored: Record<string, unknown> = {}): MicrolabApi & { set: ReturnType<typeof vi.fn> } {
  const set = vi.fn(async (key: string, value: unknown) => { stored[key] = value; });
  return { versions: { app: '0.4.0', electron: '0' }, settings: { get: async (key: string) => stored[key], set }, project: { open: vi.fn(), save: vi.fn(), recent: vi.fn(async () => []), openPath: vi.fn(), forget: vi.fn() }, recovery: { get: vi.fn(async () => null), write: vi.fn(async () => {}), clear: vi.fn(async () => {}) }, boards: { get: vi.fn(async () => ({ boards: [], drives: [] })), check: vi.fn(), send: vi.fn(), files: {}, console: { open: vi.fn(), close: vi.fn(), do: vi.fn(), onOutput: vi.fn(() => () => {}) }, onChange: vi.fn(() => () => {}) }, app: { setDirty: vi.fn(), onCloseRequest: vi.fn(() => () => {}), close: vi.fn() }, set } as never;
}

/** The workspace needs a project (M4.2): start one on the Pico W. */
function renderWorkspace(api: MicrolabApi, width: number) {
  const r = render(<App api={api} width={width} />);
  fireEvent.click(screen.getByRole('button', { name: 'New Pico W project' }));
  return r;
}

describe('M4.1 the shell (screens 01–03): top bar, modes, panels, status bar', () => {
  it('has the brand, the three modes and a status bar', async () => {
    renderWorkspace(fakeApi(), 1440);
    expect(screen.getByText('Lab')).toBeInTheDocument();
    for (const name of ['Workspace', 'Learn', 'Examples']) expect(screen.getByRole('tab', { name })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Workspace' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('the workspace has the parts panel, the canvas and the code side, with two dividers', async () => {
    renderWorkspace(fakeApi(), 1440);
    expect(screen.getByRole('region', { name: 'Parts' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Circuit' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Code' })).toBeInTheDocument();
    expect(screen.getAllByRole('separator')).toHaveLength(2);
  });

  it('panel widths are proportions of the window, within limits: 17 % and 34 % by default', async () => {
    renderWorkspace(fakeApi(), 1440);
    expect(screen.getByRole('separator', { name: 'Parts panel width' })).toHaveAttribute('aria-valuenow', String(Math.round(1440 * 0.17)));
    expect(screen.getByRole('separator', { name: 'Code panel width' })).toHaveAttribute('aria-valuenow', String(Math.round(1440 * 0.34)));
  });

  it('a moved divider is saved as a proportion, and read back on the next start', async () => {
    const api = fakeApi();
    const { unmount } = renderWorkspace(api, 1600);
    const sep = screen.getByRole('separator', { name: 'Parts panel width' });
    fireEvent.keyDown(sep, { key: 'ArrowRight' });   // 272 → 288 px
    expect(api.set).toHaveBeenCalledWith('layout', expect.objectContaining({ parts: expect.closeTo(288 / 1600, 4) }));
    unmount();
    renderWorkspace(api, 1600);
    await vi.waitFor(() => expect(screen.getByRole('separator', { name: 'Parts panel width' })).toHaveAttribute('aria-valuenow', '288'));
  });

  it('Learn and Examples are their own pages (built in later milestones)', async () => {
    renderWorkspace(fakeApi(), 1440);
    fireEvent.click(screen.getByRole('tab', { name: 'Learn' }));
    expect(screen.getByRole('tab', { name: 'Learn' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('region', { name: 'Parts' })).not.toBeInTheDocument();
  });
});
