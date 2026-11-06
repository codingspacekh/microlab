import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, protocol, session } from 'electron';
import { APP_SCHEME, APP_URL, isolationHeaders, resolveAppPath, responseHeaders } from './app-protocol';
import { mkdirSync } from 'node:fs';
import { userInfo } from 'node:os';
import { SerialPort } from 'serialport';
import { BoardChecker } from './board-check';
import { BoardWatcher, listVolumes } from './board-watcher';
import { whoHolds } from './port-holder';
import { openSerial, type SerialLink } from './serial-link';
import { openProjectFile, saveProjectFile } from './project-files';
import { SettingsStore } from './settings';
import type { ProjectDoc } from '@lib/project';
import { FakeBoard, type FakePreset } from '@lib/repl';
import type { BoardKind, Detection, FoundBoard, PortInfo } from '@lib/usb';

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
  // Tests (and demos) can stand in for USB with a port-list file, rewritten to "plug" a board (tests/fixtures/usb);
  // its boards are FakeBoards, answering as its "answers" say (a preset, "silent", "busy" or "gone").
  const fake = process.env.MICROLAB_FAKE_USB;
  type FakeUsb = { ports: PortInfo[]; volumes: string[]; platform: string; answers?: Record<string, string>; holder?: string };
  const fromFile = async () => JSON.parse(await readFile(fake!, 'utf8')) as FakeUsb;
  const send = (now: Detection, changes: { plugged: FoundBoard[]; unplugged: FoundBoard[] }) => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('boards:changed', now, changes);
  };
  const boardsNow = (): Detection => ({ ...watcher.current, checks: checker.checks });
  const fakeOpen = async (port: string): Promise<SerialLink> => {
    const answer = (await fromFile()).answers?.[port];
    if (answer === 'busy') throw new Error('Error Resource temporarily unavailable Cannot lock port');
    if (answer === 'gone') throw new Error(`Error: No such file or directory, cannot open ${port}`);
    const kind = watcher.current.boards.find((b) => b.port === port)?.kind;
    const preset = (answer && answer !== 'silent' ? answer : ({ pico: 'pico-w', microbit: 'microbit-v2', esp32: 'esp32' } satisfies Record<BoardKind, FakePreset>)[kind ?? 'pico']) as FakePreset;
    const b = new FakeBoard({ preset, program: {}, silent: answer === 'silent' });
    return { write: (d) => b.write(d), onData: (l) => b.onData(l), close: async () => {} };
  };
  const checker = new BoardChecker(
    fake
      ? { open: fakeOpen, whoHolds: async () => (await fromFile()).holder }
      : { open: (port) => openSerial(port), whoHolds: (port) => whoHolds(port, process.platform) },
    () => send(boardsNow(), { plugged: [], unplugged: [] }),
  );
  const watcher = new BoardWatcher(
    fake
      ? { listPorts: async () => (await fromFile()).ports, listVolumes: async () => (await fromFile()).volumes, platform: 'darwin' }
      : { listPorts: () => SerialPort.list(), listVolumes: () => listVolumes(process.platform, user), platform: process.platform },
    (now, changes, first) => {
      checker.forget(changes.unplugged.map((b) => b.id));
      send(boardsNow(), changes);
      // A board plugged in has just restarted: asking it now interrupts nothing (R10). Boards already there when
      // MicroLab starts are asked only when the student says so (the chip's card), or when MicroLab sends to them.
      if (!first) for (const b of changes.plugged) void checker.check(b);
    },
  );
  watcher.start();
  ipcMain.handle('boards:get', () => boardsNow());
  ipcMain.handle('boards:check', async (_e, id: string) => {
    const b = watcher.current.boards.find((x) => x.id === id);
    if (b) await checker.check(b);
  });
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
