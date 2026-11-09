import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/app/App';
import { fakeApi } from './fake-api';
import { newProjectFromStart } from './new-project';

/** M11 slice 3 (Rev 13, F-109; screens 34, 34b): updates as the gradebook and OneEditor show them — a note above the
 *  status bar; Help ▸ Check for Updates… / About's Check for updates. The main process's part is tested in
 *  tests/unit/main/updates.test.ts. */
const out = { mode: 'auto' as const, status: 'available' as const, version: '0.13.0', notes: ['Parts: the servo\'s pulse shown', 'Fixes: a closed turtle window'] };

describe('M11 the update note (screen 34)', () => {
  it('nothing to say (off, or the newest): no note', () => {
    const api = fakeApi();
    render(<App api={api} width={1440} />);
    act(() => api.emitUpdates({ mode: 'auto', status: 'none' }));
    expect(screen.queryByRole('region', { name: 'Updates' })).toBeNull();
  });

  it('one is out: What\'s new opens the list; Download asks for it', () => {
    const api = fakeApi();
    render(<App api={api} width={1440} />);
    act(() => api.emitUpdates(out));
    const note = screen.getByRole('region', { name: 'Updates' });
    expect(note).toHaveTextContent('MicroLab 0.13.0 is out.');
    fireEvent.click(within(note).getByRole('button', { name: 'What\'s new' }));
    expect(within(note).getByRole('list')).toHaveTextContent('Parts: the servo\'s pulse shown');
    fireEvent.click(within(note).getByRole('button', { name: 'Download' }));
    expect(api.updates.download).toHaveBeenCalledOnce();
  });

  it('downloading: how far; ready: Later hides the note until it changes', () => {
    const api = fakeApi();
    render(<App api={api} width={1440} />);
    act(() => api.emitUpdates({ ...out, status: 'downloading', percent: 62 }));
    const note = screen.getByRole('region', { name: 'Updates' });
    expect(note).toHaveTextContent('Downloading 0.13.0… 62 %');
    expect(within(note).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '62');
    act(() => api.emitUpdates({ status: 'ready', percent: 100 }));
    expect(screen.getByRole('region', { name: 'Updates' })).toHaveTextContent('0.13.0 is ready. It goes in when you next close MicroLab, or now:');
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByRole('region', { name: 'Updates' })).toBeNull();
  });

  it('Restart and update: unsaved work is asked about first — never lost to an update', async () => {
    const api = fakeApi();
    render(<App api={api} width={1440} />);
    await newProjectFromStart('New Pico W project');
    fireEvent.click(screen.getByRole('button', { name: 'Add a breadboard' }));   // a change, not saved
    act(() => api.emitUpdates({ ...out, status: 'ready' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restart and update' }));
    expect(screen.getByRole('alertdialog', { name: /Save your changes/ })).toBeInTheDocument();
    expect(api.updates.install).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Don\'t save' }));
    await waitFor(() => expect(api.updates.install).toHaveBeenCalledOnce());
  });

  it('after an update, once: Updated to 0.13.0, and what is new; OK', () => {
    const api = fakeApi();
    render(<App api={api} width={1440} />);
    act(() => api.emitUpdates({ mode: 'auto', status: 'idle', updatedTo: '0.13.0', updatedNotes: ['Parts: the servo\'s pulse shown'] }));
    const note = screen.getByRole('region', { name: 'Updates' });
    expect(note).toHaveTextContent('Updated to 0.13.0. New: Parts: the servo\'s pulse shown');
    fireEvent.click(within(note).getByRole('button', { name: 'OK' }));
    expect(api.updates.seen).toHaveBeenCalledOnce();
  });

  it('a Mac that can\'t update itself: the .dmg in Downloads — Open it, Show in Finder', () => {
    const api = fakeApi();
    render(<App api={api} width={1440} />);
    act(() => api.emitUpdates({ ...out, mode: 'dmg', status: 'dmg', dmg: '/Users/s/Downloads/MicroLab-0.13.0-mac-arm64.dmg' }));
    const note = screen.getByRole('region', { name: 'Updates' });
    expect(note).toHaveTextContent('MicroLab 0.13.0 is in Downloads. Open it and drag MicroLab into Applications.');
    fireEvent.click(within(note).getByRole('button', { name: 'Open it' }));
    expect(api.updates.openDmg).toHaveBeenCalledOnce();
    fireEvent.click(within(note).getByRole('button', { name: 'Show in Finder' }));
    expect(api.updates.showDmg).toHaveBeenCalledOnce();
  });
});

describe('M11 the Updates window (screen 34b)', () => {
  it('Check for Updates… (the app menu) opens it and looks at once; the version; what is out; Download updates by itself', async () => {
    let menu: (what: string) => void = () => {};
    const api = fakeApi();
    api.app.onMenu = vi.fn((h: (what: string) => void) => { menu = h; return () => {}; });
    render(<App api={api} width={1440} />);
    act(() => api.emitUpdates({ mode: 'auto', status: 'none', checkedAt: '2026-11-09T14:32:00Z' }));
    act(() => menu('updates'));
    const d = screen.getByRole('dialog', { name: 'Updates' });
    expect(api.updates.check).toHaveBeenCalled();
    expect(d).toHaveTextContent('MicroLab 0.12.0');
    expect(d).toHaveTextContent('This is the newest version.');
    expect(d).toHaveTextContent('Last looked:');
    act(() => api.emitUpdates(out));
    expect(d).toHaveTextContent('MicroLab 0.13.0 is out.');
    expect(d).toHaveTextContent('What\'s new in 0.13.0:');
    fireEvent.click(within(d).getByRole('checkbox', { name: /Download updates by itself/ }));
    await waitFor(() => expect(api.updates.setAuto).toHaveBeenCalledWith(true));
    fireEvent.click(within(d).getByRole('button', { name: 'Download' }));
    expect(api.updates.download).toHaveBeenCalled();
    fireEvent.click(within(d).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: 'Updates' })).toBeNull();
  });

  it('About\'s Check for updates opens it; outside the installed app it says updates work only there', () => {
    const api = fakeApi();
    render(<App api={api} width={1440} />);
    fireEvent.click(screen.getByRole('button', { name: 'About MicroLab' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    const d = screen.getByRole('dialog', { name: 'Updates' });
    expect(d).toHaveTextContent('Updates work only in the installed MicroLab');
  });
});
