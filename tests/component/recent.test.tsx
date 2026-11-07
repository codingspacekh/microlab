import { EditorView } from '@codemirror/view';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newProject } from '@lib/project';
import { App } from '../../src/renderer/app/App';
import type { RecentItem } from '../../src/renderer/app/api';
import { fakeApi } from './fake-api';

/** M5.7 F-05 recent projects on the Start screen (screen 01); F-03 autosave and the project offered back. */
const today = (h: number, m: number) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.getTime(); };
const RECENT: RecentItem[] = [
  { path: '/Users/s/Documents/MicroLab/Traffic lights.mlab', name: 'Traffic lights', board: 'pico-w', at: today(10, 42), where: 'Documents/MicroLab/Traffic lights.mlab', missing: false },
  { path: '/Users/s/Desktop/Night light.mlab', name: 'Night light', board: 'microbit-v2', at: today(9, 5) - 86_400_000, where: 'Desktop/Night light.mlab', missing: true },
];
const recentList = () => within(screen.getByRole('region', { name: 'Recent projects' }));
const typeIn = (name: string, text: string) => {
  const view = EditorView.findFromDOM(screen.getByRole('textbox', { name }).closest('.cm-editor') as HTMLElement)!;
  act(() => { view.dispatch({ changes: { from: view.state.doc.length, insert: text }, userEvent: 'input.type' }); });
};

afterEach(() => { vi.useRealTimers(); });

describe('M5.7 F-05 recent projects (screen 01)', () => {
  it('each with its board, where it is and when; one that is gone can be taken off the list', async () => {
    const api = fakeApi({}, { recent: RECENT });
    render(<App api={api} width={1440} />);
    const row = await waitFor(() => recentList().getByRole('button', { name: /Traffic lights/ }));
    expect(row).toHaveTextContent('Traffic lightsDocuments/MicroLab/Traffic lights.mlabPico WToday 10:42');
    const gone = recentList().getByRole('button', { name: /Night light/ });
    expect(gone).toBeDisabled();
    expect(gone).toHaveTextContent('Desktop/Night light.mlab — no longer theremicro:bit V2Yesterday');
    fireEvent.click(recentList().getByRole('button', { name: 'Take off the list' }));
    await waitFor(() => expect(recentList().queryByRole('button', { name: /Night light/ })).toBeNull());
    expect(api.project.forget).toHaveBeenCalledWith('/Users/s/Desktop/Night light.mlab');
  });

  it('a click opens it, named after its file', async () => {
    const doc = newProject('pico-w');
    const api = fakeApi({ openPath: vi.fn(async (path: string) => ({ ok: true as const, path, name: 'Traffic lights', doc })) }, { recent: RECENT });
    render(<App api={api} width={1440} />);
    fireEvent.click(await waitFor(() => recentList().getByRole('button', { name: /Traffic lights/ })));
    await waitFor(() => expect(screen.getByRole('group', { name: 'Project' })).toHaveTextContent('Traffic lights'));
    expect(api.project.openPath).toHaveBeenCalledWith('/Users/s/Documents/MicroLab/Traffic lights.mlab');
  });

  it('none yet: it says where they will be, and Open a project… is there', async () => {
    render(<App api={fakeApi()} width={1440} />);
    expect(await waitFor(() => recentList().getByText(/The projects you open or save show here/))).toBeInTheDocument();
    expect(recentList().getByRole('button', { name: /Open a project/ })).toBeInTheDocument();
  });
});

describe('M5.7 F-03 autosave and the project offered back', () => {
  it('changes are kept a few seconds after they are made; Run keeps them at once; Save lets the copy go', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = fakeApi({ save: vi.fn(async (_d, o) => ({ ok: true as const, path: `/s/${o.name}.mlab`, name: o.name })) });
    render(<App api={api} width={1440} startRun={() => ({ stop: vi.fn(), setInput: vi.fn() })} />);
    fireEvent.click(screen.getByRole('button', { name: 'New micro:bit project' }));
    typeIn('main.py', '\n# my change\n');
    expect(api.recovery.write).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(3100); });
    expect(api.recovery.write).toHaveBeenCalledTimes(1);
    const [doc, about] = vi.mocked(api.recovery.write).mock.calls[0]!;
    expect(doc.files['main.py']).toMatch(/# my change/);
    expect(about).toEqual({ name: 'Untitled project' });
    typeIn('main.py', '# more\n');
    fireEvent.click(screen.getByRole('button', { name: 'Run main.py' }));
    expect(api.recovery.write).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await act(async () => { fireEvent.keyDown(window, { key: 's', metaKey: true }); });
    await waitFor(() => expect(api.recovery.clear).toHaveBeenCalled());
  });

  it('when MicroLab ended with changes not saved, Start offers them back: Get them back opens it, not saved', async () => {
    const doc = newProject('pico-w');
    doc.files['main.py'] = 'print("not lost")\n';
    const api = fakeApi({}, { recovery: { name: 'Night light', path: '/Users/s/Night light.mlab', at: today(10, 42), doc } });
    render(<App api={api} width={1440} />);
    const card = await waitFor(() => screen.getByRole('alert'));
    expect(card).toHaveTextContent('Your changes to “Night light” were kept');
    expect(card).toHaveTextContent('today at 10:42');
    fireEvent.click(within(card).getByRole('button', { name: 'Get them back' }));
    expect(screen.getByRole('group', { name: 'Project' })).toHaveTextContent('Night light');
    expect(screen.getByTitle('Not saved')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'main.py' }).textContent).toContain('print("not lost")');
    expect(api.recovery.clear).not.toHaveBeenCalled();
  });

  it('Let them go: the copy is removed and the card goes', async () => {
    const api = fakeApi({}, { recovery: { name: 'Untitled project', at: Date.now(), doc: newProject('pico-w') } });
    render(<App api={api} width={1440} />);
    fireEvent.click(within(await waitFor(() => screen.getByRole('alert'))).getByRole('button', { name: 'Let them go' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(api.recovery.clear).toHaveBeenCalled();
  });
});
