import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../../src/renderer/app/App';
import { fakeApi } from './fake-api';
import { newProjectFromStart } from './new-project';

/** M6.8 (screen 23, approved 2026-11-08): the editor's text size (11–24 px) and theme (Light, Dark, High contrast)
 *  from Aa in the code panel, kept for next time. */
async function setup(api = fakeApi()) {
  const r = render(<App api={api} width={1440} />);
  await newProjectFromStart('New Pico W project');
  const code = () => screen.getByRole('region', { name: 'Code' });
  const open = () => fireEvent.click(screen.getByRole('button', { name: 'Text size and theme' }));
  const pop = () => screen.getByRole('dialog', { name: 'Text size and theme' });
  return { api, r, code, open, pop };
}

describe('M6.8 the editor\'s text size and theme (screen 23)', () => {
  it('Aa opens them; 13 px and Light to start', async () => {
    const s = await setup();
    expect(screen.queryByRole('dialog', { name: 'Text size and theme' })).toBeNull();
    s.open();
    expect(within(s.pop()).getByRole('spinbutton', { name: 'Text size' })).toHaveAttribute('aria-valuetext', '13 px');
    expect(within(s.pop()).getByRole('radio', { name: 'Light' })).toBeChecked();
    expect(s.code()).toHaveAttribute('data-theme', 'light');
    expect(s.code().style.getPropertyValue('--code-size')).toBe('13px');
  });

  it('+ makes the text bigger, up to 24 px; a theme is chosen; Esc closes', async () => {
    const s = await setup();
    s.open();
    fireEvent.click(within(s.pop()).getByRole('button', { name: 'More' }));
    expect(s.code().style.getPropertyValue('--code-size')).toBe('14px');
    for (let i = 0; i < 20; i++) fireEvent.click(within(s.pop()).getByRole('button', { name: 'More' }));
    expect(s.code().style.getPropertyValue('--code-size')).toBe('24px');
    fireEvent.click(within(s.pop()).getByRole('radio', { name: 'Dark' }));
    expect(s.code()).toHaveAttribute('data-theme', 'dark');
    fireEvent.click(within(s.pop()).getByRole('radio', { name: 'High contrast' }));
    expect(s.code()).toHaveAttribute('data-theme', 'contrast');
    fireEvent.keyDown(s.pop(), { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Text size and theme' })).toBeNull();
  });

  it('kept for next time', async () => {
    const api = fakeApi();
    const s = await setup(api);
    s.open();
    fireEvent.click(within(s.pop()).getByRole('button', { name: 'More' }));
    fireEvent.click(within(s.pop()).getByRole('radio', { name: 'Dark' }));
    s.r.unmount();
    await setup(api);
    await waitFor(() => expect(screen.getByRole('region', { name: 'Code' })).toHaveAttribute('data-theme', 'dark'));
    expect(screen.getByRole('region', { name: 'Code' }).style.getPropertyValue('--code-size')).toBe('14px');
  });
});
