import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../../src/renderer/app/App';
import { fakeApi } from './fake-api';
import { newProjectFromStart } from './new-project';

/** M6.8 (screen 23, approved 2026-11-08): the editor's text size (11–36 px since Rev 12) and theme (Light, Dark, High
 *  contrast) from Aa in the code panel, kept for next time; Rev 12 (screen 31h): the code font, from a list. */
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

  it('+ makes the text bigger, up to 36 px (Rev 12, the teacher); a theme is chosen; Esc closes', async () => {
    const s = await setup();
    s.open();
    fireEvent.click(within(s.pop()).getByRole('button', { name: 'More' }));
    expect(s.code().style.getPropertyValue('--code-size')).toBe('14px');
    for (let i = 0; i < 30; i++) fireEvent.click(within(s.pop()).getByRole('button', { name: 'More' }));
    expect(s.code().style.getPropertyValue('--code-size')).toBe('36px');
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

describe('M12 Rev 12 (F-105, screen 31h): the code font, chosen from a list', () => {
  it('JetBrains Mono to start; thirteen fonts shipped inside MicroLab; one chosen is the code panel\'s (the editor, the console), and kept', async () => {
    const api = fakeApi();
    const s = await setup(api);
    s.open();
    const font = within(s.pop()).getByRole('combobox', { name: 'Code font' });
    expect(font).toHaveTextContent('JetBrains Mono');
    fireEvent.click(font);
    const names = within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent);
    expect(names).toEqual(['JetBrains Mono', 'Fira Code', 'Source Code Pro', 'Cascadia Code', 'IBM Plex Mono', 'Atkinson Hyperlegible Mono',
      'Roboto Mono', 'Inconsolata', 'Noto Sans Mono', 'Red Hat Mono', 'Space Mono', 'Courier Prime', 'Anonymous Pro']);
    fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Fira Code' }));
    expect(s.code().style.getPropertyValue('--mono')).toMatch(/^"Fira Code Variable", "Fira Code", /);
    expect(api.settings.set).toHaveBeenLastCalledWith('editor', expect.objectContaining({ font: 'fira-code' }));
    s.r.unmount();
    await setup(api);
    await waitFor(() => expect(screen.getByRole('region', { name: 'Code' }).style.getPropertyValue('--mono')).toMatch(/^"Fira Code Variable"/));
  });
});
