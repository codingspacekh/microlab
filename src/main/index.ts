import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, protocol, session } from 'electron';
import { APP_SCHEME, APP_URL, isolationHeaders, resolveAppPath, responseHeaders } from './app-protocol';
import { mkdirSync } from 'node:fs';
import { userInfo } from 'node:os';
import { SerialPort } from 'serialport';
import { BoardWatcher, listVolumes } from './board-watcher';
import { openProjectFile, saveProjectFile } from './project-files';
import { SettingsStore } from './settings';
import type { ProjectDoc } from '@lib/project';
import type { PortInfo } from '@lib/usb';

const here = fileURLToPath(new URL('.', import.meta.url));
const rendererDir = join(here, '../renderer');

// Tests and spikes get their own settings folder, so they never touch a student's own.
if (process.env.MICROLAB_USER_DATA) app.setPath('userData', process.env.MICROLAB_USER_DATA);

protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

function serveAppFiles(): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const file = resolveAppPath(rendererDir, request.url);
    if (!file) return new Response('Not found', { status: 404 });
    try {
      return new Response(await readFile(file), { headers: responseHeaders(file) });
    } catch {
      return new Response('Not found', { status: 404, headers: { ...isolationHeaders } });
    }
  });
}

/** Windows with unsaved changes, and windows the student agreed to close anyway (by webContents id). */
const dirty = new Map<number, boolean>();
const closing = new Set<number>();

function createWindow(): void {
  const win = new BrowserWindow({
    title: 'MicroLab',
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    show: false,
    backgroundColor: '#f4f6f8',
    webPreferences: {
      preload: join(here, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.once('ready-to-show', () => win.show());
  // unsaved changes: the window asks the student first (M4.6), then closes itself through app:close
  win.on('close', (e) => {
    if (!dirty.get(win.webContents.id) || closing.has(win.webContents.id)) return;
    e.preventDefault();
    win.webContents.send('app:close-request');
  });
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  void win.loadURL(devUrl ?? APP_URL);
}

app.whenReady().then(() => {
  serveAppFiles();
  const settings = new SettingsStore(join(app.getPath('userData'), 'settings.json'));
  ipcMain.handle('settings:get', (_e, key: string) => settings.get(key));
  ipcMain.handle('settings:set', (_e, key: string, value: unknown) => settings.set(key, value));
  ipcMain.on('app:dirty', (e, value: boolean) => { dirty.set(e.sender.id, value); });
  ipcMain.handle('app:close', (e) => {
    closing.add(e.sender.id);
    BrowserWindow.fromWebContents(e.sender)?.close();
  });
  ipcMain.handle('project:save', async (e, doc: ProjectDoc, opts: { path?: string; name: string }) => {
    let path = opts.path;
    if (!path) {
      const folder = join(app.getPath('documents'), 'MicroLab');
      mkdirSync(folder, { recursive: true });
      const win = BrowserWindow.fromWebContents(e.sender);
      const options = { title: 'Save the project', defaultPath: join(folder, `${opts.name}.mlab`), filters: [{ name: 'MicroLab project', extensions: ['mlab'] }] };
      const r = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
      if (r.canceled || !r.filePath) return { ok: false, canceled: true };
      path = r.filePath;
    }
    return saveProjectFile(path, doc);
  });
  ipcMain.handle('project:open', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const options = { title: 'Open a project', filters: [{ name: 'MicroLab project', extensions: ['mlab'] }], properties: ['openFile' as const] };
    const r = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    const path = r.filePaths[0];
    return r.canceled || !path ? { ok: false, canceled: true } : openProjectFile(path);
  });
  // Real boards (F-55): the USB ports, looked at about once a second; every window is told what changed.
  const user = userInfo().username;
  // Tests (and demos) can stand in for USB with a port-list file, rewritten to "plug" a board (tests/fixtures/usb).
  const fake = process.env.MICROLAB_FAKE_USB;
  const fromFile = async () => JSON.parse(await readFile(fake!, 'utf8')) as { ports: PortInfo[]; volumes: string[]; platform: string };
  const watcher = new BoardWatcher(
    fake
      ? { listPorts: async () => (await fromFile()).ports, listVolumes: async () => (await fromFile()).volumes, platform: 'darwin' }
      : { listPorts: () => SerialPort.list(), listVolumes: () => listVolumes(process.platform, user), platform: process.platform },
    (now, changes) => { for (const w of BrowserWindow.getAllWindows()) w.webContents.send('boards:changed', now, changes); },
  );
  watcher.start();
  ipcMain.handle('boards:get', () => watcher.current);
  app.on('before-quit', () => watcher.stop());
  // Nothing in the window may open other sites (N-04, N-08).
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, done) => done(false));
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
