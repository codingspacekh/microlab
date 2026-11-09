import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/app/App';
import { fakeApi } from './fake-api';

/** M12 Rev 12 (F-106, screens 31b, 31h): the app's size in the status bar — − and +, a menu of sizes, Back to 100 %;
 *  ⌘− ⌘+ ⌘0 (the View menu's) are followed; remembered. */
function setup(start = 1) {
  let factor = start;
  const api = fakeApi();
  api.app.zoom = { get: vi.fn(() => factor), set: vi.fn((f: number) => { factor = f; }) };
  render(<App api={api} width={1440} />);
  const size = () => screen.getByRole('group', { name: 'The app\'s size' });
  return { api, size, outside: (f: number) => { factor = f; act(() => { window.dispatchEvent(new Event('resize')); }); } };
}

describe('M12 Rev 12: the app\'s size (F-106)', () => {
  it('100 % to start; + and − go a step; saved', async () => {
    const s = setup();
    expect(s.size()).toHaveTextContent('100 %');
    fireEvent.click(within(s.size()).getByRole('button', { name: 'Bigger' }));
    expect(s.api.app.zoom.set).toHaveBeenLastCalledWith(1.1);
    expect(s.size()).toHaveTextContent('110 %');
    fireEvent.click(within(s.size()).getByRole('button', { name: 'Smaller' }));
    fireEvent.click(within(s.size()).getByRole('button', { name: 'Smaller' }));
    expect(s.api.app.zoom.set).toHaveBeenLastCalledWith(0.9);
    expect(s.size()).toHaveTextContent('90 %');
    await waitFor(() => expect(s.api.settings.set).toHaveBeenLastCalledWith('zoom', 0.9));
  });

  it('the menu: 75 % to 150 %, the one now ticked; Back to 100 %', () => {
    const s = setup();
    fireEvent.click(within(s.size()).getByRole('button', { name: /The app's size: 100 %/ }));
    const menu = screen.getByRole('menu', { name: /The app's size/ });
    const sizes = within(menu).getAllByRole('menuitemcheckbox');
    expect(sizes.map((m) => m.textContent)).toEqual(['75 %', '90 %', '100 %', '110 %', '125 %', '150 %']);
    expect(within(menu).getByRole('menuitemcheckbox', { name: '100 %' })).toHaveAttribute('aria-checked', 'true');
    expect(within(menu).getByRole('menuitem', { name: /Back to 100 %/ })).toBeInTheDocument();
    fireEvent.click(within(menu).getByRole('menuitemcheckbox', { name: '125 %' }));
    expect(s.api.app.zoom.set).toHaveBeenLastCalledWith(1.25);
    expect(s.size()).toHaveTextContent('125 %');
    fireEvent.click(within(s.size()).getByRole('button', { name: /The app's size: 125 %/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Back to 100 %/ }));
    expect(s.api.app.zoom.set).toHaveBeenLastCalledWith(1);
    expect(s.size()).toHaveTextContent('100 %');
  });

  it('⌘+ / ⌘− from the View menu: the number follows', () => {
    const s = setup();
    s.outside(1.2);
    expect(s.size()).toHaveTextContent('120 %');
  });

  it('the size saved last time comes back', async () => {
    let factor = 1;
    const api = fakeApi();
    api.app.zoom = { get: vi.fn(() => factor), set: vi.fn((f: number) => { factor = f; }) };
    await api.settings.set('zoom', 1.25);
    render(<App api={api} width={1440} />);
    await waitFor(() => expect(api.app.zoom.set).toHaveBeenCalledWith(1.25));
    expect(screen.getByRole('group', { name: 'The app\'s size' })).toHaveTextContent('125 %');
  });
});
