import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/app/App';
import { fakeApi } from './fake-api';

/** M11 slice 1 (Rev 13, F-108, screen 33): About MicroLab — from the logo in the top bar, and the app menu. */
describe('M11 About MicroLab (screen 33)', () => {
  it('the logo opens it: the version, what MicroLab is, what is inside, © 2026 CodingSpaceKH, codingspacekh.dev', async () => {
    const api = fakeApi();
    render(<App api={api} width={1440} />);
    fireEvent.click(screen.getByRole('button', { name: 'About MicroLab' }));
    const about = screen.getByRole('dialog', { name: 'About MicroLab' });
    expect(within(about).getByRole('heading', { name: 'MicroLab' })).toBeInTheDocument();
    expect(about).toHaveTextContent('Version 0.4.0');
    expect(about).toHaveTextContent('Build circuits with a micro:bit, a Raspberry Pi Pico W or an ESP32');
    await waitFor(() => expect(about).toHaveTextContent('Python 3.13.18 · MicroPython 1.29.0'));
    expect(about).toHaveTextContent('© 2026 CodingSpaceKH. All rights reserved.');
    fireEvent.click(within(about).getByRole('button', { name: /codingspacekh\.dev/ }));
    expect(api.app.openWebsite).toHaveBeenCalledOnce();
    fireEvent.click(within(about).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: 'About MicroLab' })).toBeNull();
  });

  it('the app menu\'s About MicroLab (the Mac\'s MicroLab menu, Windows\' Help) opens it too', () => {
    let menu: (what: string) => void = () => {};
    const api = fakeApi();
    api.app.onMenu = vi.fn((h: (what: string) => void) => { menu = h; return () => {}; });
    render(<App api={api} width={1440} />);
    act(() => menu('about'));
    expect(screen.getByRole('dialog', { name: 'About MicroLab' })).toBeInTheDocument();
  });

  it('without the bundled Python\'s answer (the browser, or none yet): MicroPython alone', () => {
    const api = fakeApi();
    api.python3.version = vi.fn(async () => null);
    render(<App api={api} width={1440} />);
    fireEvent.click(screen.getByRole('button', { name: 'About MicroLab' }));
    expect(screen.getByRole('dialog', { name: 'About MicroLab' })).toHaveTextContent('MicroPython 1.29.0');
  });

  it('M11.4 Licences (N-11): everything MicroLab is built with, from the app itself; Close goes back to About', async () => {
    const api = fakeApi();
    render(<App api={api} width={1440} />);
    fireEvent.click(screen.getByRole('button', { name: 'About MicroLab' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'About MicroLab' })).getByRole('button', { name: 'Licences' }));
    const list = screen.getByRole('dialog', { name: 'Licences' });
    expect(list).toHaveTextContent('MicroLab is © 2026 CodingSpaceKH. It is built with these parts made by others, each under its own licence.');
    await waitFor(() => expect(within(list).getByLabelText('Licences')).toHaveTextContent('Python 3.13.18 — Python Software Foundation License'));
    expect(within(list).getByLabelText('Licences')).toHaveAttribute('tabindex', '0');   // scrolled with the keyboard too
    expect(api.app.licences).toHaveBeenCalledOnce();
    fireEvent.click(within(list).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: 'Licences' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'About MicroLab' })).toBeInTheDocument();
  });

  it('while developing, before the list is made: says how to make it', async () => {
    const api = fakeApi();
    api.app.licences = vi.fn(async () => null);
    render(<App api={api} width={1440} />);
    fireEvent.click(screen.getByRole('button', { name: 'About MicroLab' }));
    fireEvent.click(screen.getByRole('button', { name: 'Licences' }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Licences' })).toHaveTextContent('The list is made when MicroLab is built (npm run build && npm run licences).'));
  });
});
