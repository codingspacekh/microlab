import type { MenuItemConstructorOptions } from 'electron';

/**
 * The app menu (M11, Rev 13; F-106, F-108, F-109): About MicroLab and Check for Updates… where each computer keeps them
 * — the Mac's MicroLab menu, Windows' Help — the View menu's zoom (the app's size, followed by its status bar), Edit
 * (copy and paste everywhere), and the website. A pure template: the main process builds it, the tests read it.
 */
export type MenuAction = 'about' | 'updates';
export const WEBSITE = 'https://codingspacekh.dev';

export function menuTemplate(opts: { mac: boolean; dev: boolean; send: (action: MenuAction) => void; website: () => void }): MenuItemConstructorOptions[] {
  const about: MenuItemConstructorOptions = { label: 'About MicroLab', click: () => opts.send('about') };
  const updates: MenuItemConstructorOptions = { label: 'Check for Updates…', click: () => opts.send('updates') };
  const site: MenuItemConstructorOptions = { label: 'codingspacekh.dev', click: opts.website };
  const view: MenuItemConstructorOptions = {
    label: 'View',
    submenu: [
      ...(opts.dev ? [{ role: 'reload' as const }, { role: 'toggleDevTools' as const }, { type: 'separator' as const }] : []),
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' },
    ],
  };
  if (opts.mac) {
    return [
      { label: 'MicroLab', submenu: [about, updates, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
      { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
      view,
      { role: 'window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }] },
      { role: 'help', submenu: [site] },
    ];
  }
  return [
    { label: 'File', submenu: [{ role: 'quit', label: 'Exit' }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    view,
    { role: 'help', submenu: [about, updates, { type: 'separator' }, site] },
  ];
}
