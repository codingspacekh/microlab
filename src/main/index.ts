import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, sep } from 'node:path';
import { app, BrowserWindow, clipboard, dialog, ipcMain, protocol, session, shell } from 'electron';
import { APP_SCHEME, APP_URL, isolationHeaders, resolveAppPath, responseHeaders } from './app-protocol';
import { mkdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { userInfo } from 'node:os';
import { SerialPort } from 'serialport';
import { backupFolder, Boards } from './board-check';
import { copyToDrive, drivePath, listVolumesWindows } from './drives';
import { installMicroPython, type Firmware } from './firmware';
import { BoardWatcher, listUsbWindows, listVolumes } from './board-watcher';
import { whoHolds } from './port-holder';
import { openSerial, type SerialLink } from './serial-link';
import { openProjectFile, saveProjectFile } from './project-files';
import { Recent, Recovery } from './recent';
import { SettingsStore } from './settings';
import pkg from '../../package.json';
import type { ProjectDoc } from '@lib/project';
import { FakeBoard, type ConsoleAction, type ConsoleKind, type FakePreset, type SendRequest } from '@lib/repl';
import { DRIVER_PAGES, parsePnp, type BoardKind, type Detection, type FoundBoard, type PortInfo } from '@lib/usb';

/** "macOS 26.0", "Windows 10.0.26100": the system, as a teacher would say it. (The version is package.json's, built
 *  in: app.getVersion() is Electron's own when the app is started as `electron out/main/index.js`.) */
function systemName(): string {
  const os = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' }[process.platform as string] ?? process.platform;
  return `${os} ${process.getSystemVersion()}`;
}

const here = fileURLToPath(new URL('.', import.meta.url));
const rendererDir = join(here, '../renderer');

// Tests and spikes get their own settings folder, so they never touch a student's own.
if (process.env.MICROLAB_USER_DATA) app.setPath('userData', process.env.MICROLAB_USER_DATA);

// E2E runs hidden (the teacher's request, 2026-11-06): the window is never shown, the app has no Dock icon and never
// takes focus from what the teacher is doing; its page still lays out, draws and runs timers at full speed.
const HIDDEN = process.env.MICROLAB_HIDDEN === '1';
if (HIDDEN) app.dock?.hide();

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
      // the version and the system, for the window (the helper's report): a sandboxed preload can't ask for them
      additionalArguments: [`--microlab-version=${pkg.version}`, `--microlab-system=${systemName()}`],
      ...(HIDDEN ? { backgroundThrottling: false } : {}),
    },
  });
  if (!HIDDEN) win.once('ready-to-show', () => win.show());
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
  // recent projects (F-05) and the recovery copy (F-03, M5.7)
  const recent = new Recent(settings, app.getPath('home'));
  const recovery = new Recovery(join(app.getPath('userData'), 'recovery'));
  const remember = <T extends { ok: boolean }>(r: T, board: string): T => {
    if (r.ok) { const k = r as unknown as { path: string; name: string }; recent.add({ path: k.path, name: k.name, board }); }
    return r;
  };
  const opened = async (path: string) => {
    const r = await openProjectFile(path);
    return r.ok ? remember(r, r.doc.project.board) : r;
  };
  ipcMain.handle('project:recent', () => recent.list());
  ipcMain.handle('project:open-path', (_e, path: string) => opened(path));
  ipcMain.handle('project:forget', (_e, path: string) => recent.forget(path));
  ipcMain.handle('recovery:get', () => recovery.get());
  ipcMain.handle('recovery:write', (_e, doc: ProjectDoc, about: { name: string; path?: string }) => recovery.write(doc, about));
  ipcMain.handle('recovery:clear', () => recovery.clear());
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
    return remember(await saveProjectFile(path, doc), doc.project.board);
  });
  ipcMain.handle('project:open', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const options = { title: 'Open a project', filters: [{ name: 'MicroLab project', extensions: ['mlab'] }], properties: ['openFile' as const] };
    const r = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    const path = r.filePaths[0];
    return r.canceled || !path ? { ok: false, canceled: true } : opened(path);
  });
  // Real boards (F-55): the USB ports, looked at about once a second; every window is told what changed.
  const user = userInfo().username;
  // Windows' drives come from PowerShell (slow): read at most every 3 s
  let winVol: { at: number; list: Promise<{ name: string; path: string }[]> } | undefined;
  const winVolumes = () => {
    if (!winVol || Date.now() - winVol.at > 3000) winVol = { at: Date.now(), list: listVolumesWindows() };
    return winVol.list;
  };
  // Tests (and demos) can stand in for USB with a port-list file, rewritten to "plug" a board (tests/fixtures/usb);
  // its boards are FakeBoards, answering as its "answers" say (a preset, "silent", "busy" or "gone").
  const fake = process.env.MICROLAB_FAKE_USB;
  type FakeUsb = { ports: PortInfo[]; volumes: string[]; platform: string; answers?: Record<string, string>; holder?: string; pnp?: string };
  const fromFile = async () => JSON.parse(await readFile(fake!, 'utf8')) as FakeUsb;
  // anything waiting for USB to change (installing MicroPython: the drive going, the board coming back)
  const waiters = new Set<() => void>();
  const send = (now: Detection, changes: { plugged: FoundBoard[]; unplugged: FoundBoard[] }) => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('boards:changed', now, changes);
    for (const w of [...waiters]) w();
  };
  const boardsNow = (): Detection => ({ ...watcher.current, checks: checker.checks, consoles: checker.consoles });
  // a board's console output, gathered and sent at most every 40 ms (a program printing in a loop can't flood the window)
  let pending: Record<string, { text: string; kind: ConsoleKind }[]> = {};
  let flush: ReturnType<typeof setTimeout> | undefined;
  const consoleOut = (id: string, text: string, kind: ConsoleKind) => {
    const list = (pending[id] ??= []);
    const last = list.at(-1);
    if (last && last.kind === kind) last.text += text;
    else list.push({ text, kind });
    flush ??= setTimeout(() => {
      const out = pending;
      pending = {};
      flush = undefined;
      for (const w of BrowserWindow.getAllWindows()) for (const [bid, chunks] of Object.entries(out)) w.webContents.send('boards:console', bid, chunks);
    }, 40);
  };
  /** The little Python a fake board answers (e2e): print("…"), a sum, and a loop that runs until stopped. */
  const fakeExec = (code: string) => {
    if (/while True/.test(code)) return undefined;
    let out = '';
    for (const line of code.split('\n')) {
      const p = /^\s*print\((['"])(.*)\1\)\s*$/.exec(line);
      const sum = /^\s*(\d+)\s*([-+*])\s*(\d+)\s*$/.exec(line);
      if (p) out += `${p[2]}\r\n`;
      else if (sum) out += `${sum[2] === '+' ? +sum[1]! + +sum[3]! : sum[2] === '-' ? +sum[1]! - +sum[3]! : +sum[1]! * +sum[3]!}\r\n`;
      else if (line.trim() && !/^\s*(#|from |import )/.test(line)) return { out, err: `Traceback (most recent call last):\r\n  File "<stdin>", line 1, in <module>\r\nNameError: the fake board runs only print() and sums\r\n` };
    }
    return { out };
  };
  const fakes = new Map<string, FakeBoard>();   // a fake board keeps its files between opens, as a real one
  const fakeOpen = async (port: string): Promise<SerialLink> => {
    const answer = (await fromFile()).answers?.[port];
    if (answer === 'busy') throw new Error('Error Resource temporarily unavailable Cannot lock port');
    if (answer === 'gone') throw new Error(`Error: No such file or directory, cannot open ${port}`);
    const kind = watcher.current.boards.find((b) => b.port === port)?.kind;
    const preset = (answer && answer !== 'silent' ? answer : ({ pico: 'pico-w', microbit: 'microbit-v2', esp32: 'esp32' } satisfies Record<BoardKind, FakePreset>)[kind ?? 'pico']) as FakePreset;
    const key = `${port} ${preset} ${answer ?? ''}`;
    const b = fakes.get(key) ?? new FakeBoard({ preset, program: {}, silent: answer === 'silent', exec: fakeExec });
    fakes.set(key, b);
    b.replug();
    return { write: (d) => b.write(d), onData: (l) => b.onData(l), onClose: (l) => b.onClose(l), close: async () => {} };
  };
  // Send to board keeps the board's old main.py (F-50, screen 08): Documents/MicroLab/Board backups/<board> <time>/
  const keepOld = async (folder: string, path: string, data: Uint8Array): Promise<string> => {
    // (with fake USB — the tests — in the test's own folder, never the user's Documents)
    const dir = join(app.getPath(fake ? 'userData' : 'documents'), 'MicroLab', 'Board backups', folder);
    const target = resolve(dir, path);
    // the name comes from the board: it must stay inside the backup folder
    if (!target.startsWith(dir + sep)) throw new Error(`Not kept: “${path}” is not a file name MicroLab can keep`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data);
    return dir;
  };
  const checker = new Boards(
    fake
      ? { open: fakeOpen, whoHolds: async () => (await fromFile()).holder, keepOld }
      : { open: (port) => openSerial(port), whoHolds: (port) => whoHolds(port, process.platform), keepOld },
    () => send(boardsNow(), { plugged: [], unplugged: [] }),
    { output: consoleOut, sessions: () => send(boardsNow(), { plugged: [], unplugged: [] }) },
  );
  const watcher = new BoardWatcher(
    fake
      ? {
          listPorts: async () => (await fromFile()).ports, listVolumes: async () => (await fromFile()).volumes, platform: 'darwin',
          listUsb: async () => parsePnp((await fromFile()).pnp ?? ''),
        }
      : {
          listPorts: () => SerialPort.list(), platform: process.platform,
          listVolumes: async () => (process.platform === 'win32' ? (await winVolumes()).map((v) => v.name) : listVolumes(process.platform, user)),
          ...(process.platform === 'win32' ? { listUsb: () => listUsbWindows() } : {}),
        },
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

  // Installing MicroPython (F-52, screen 14b): the firmware shipped in library/firmware, copied to the board's drive
  const firmwareDir = process.env.MICROLAB_FIRMWARE_DIR ?? join(here, '../../library/firmware');
  const firmwareOf = async (kind: 'pico' | 'microbit'): Promise<Firmware> => {
    const all = JSON.parse(await readFile(join(firmwareDir, 'firmware.json'), 'utf8')) as Record<string, { file: string; size: number; drive: string; version: string }>;
    const f = all[kind === 'pico' ? 'pico-w' : 'microbit-v2']!;
    return { file: join(firmwareDir, f.file), name: f.file, size: f.size, drive: f.drive, version: f.version };
  };
  const waitFor = <T,>(pick: (d: Detection) => T | undefined, ms: number, signal?: AbortSignal) => new Promise<T>((ok, fail) => {
    const done = () => { waiters.delete(look); clearTimeout(timer); clearInterval(poll); signal?.removeEventListener('abort', stop); };
    const look = () => { const v = pick(boardsNow()); if (v !== undefined) { done(); ok(v); } };
    const stop = () => { done(); fail(new Error('aborted')); };
    const timer = setTimeout(() => { done(); fail(new Error('timed out')); }, ms);
    const poll = setInterval(look, 250);
    signal?.addEventListener('abort', stop);
    waiters.add(look);
    look();
  });
  let installing: AbortController | undefined;
  ipcMain.handle('boards:install', async (e, kind: 'pico' | 'microbit') => {
    installing?.abort();
    const ac = new AbortController();
    installing = ac;
    const fw = await firmwareOf(kind);
    const keepFolder = backupFolder('micro-bit', new Date());
    const res = await installMicroPython(kind, fw, {
      now: boardsNow,
      waitFor,
      drivePath: (name) => (fake ? Promise.resolve(join(dirname(fake), 'volumes', name)) : drivePath(name, process.platform, user, winVolumes)),
      copy: copyToDrive,
      bootloader: (b) => checker.bootloader(b),
      check: (b) => checker.check(b),
      readAll: (b) => checker.readAll(b),
      keep: async (files) => { let dir = ''; for (const [p, data] of Object.entries(files)) dir = await keepOld(keepFolder, p, data); return dir; },
      restore: async (b, files) => {
        const r = await checker.copyToBoard(b, files, false);
        if (!r.ok) throw new Error(r.message);
        return r.sent.length + r.same.length;
      },
    }, (step) => e.sender.send('boards:install-step', step), ac.signal);
    if (installing === ac) installing = undefined;
    return res;
  });
  ipcMain.handle('boards:install-cancel', () => installing?.abort());
  ipcMain.handle('app:show-firmware', async (_e, kind: 'pico' | 'microbit') => shell.showItemInFolder((await firmwareOf(kind)).file));
  // the helper (F-56): its report to the clipboard; a USB chip's official driver page — no other page can be opened
  ipcMain.handle('app:copy', (_e, text: string) => clipboard.writeText(String(text)));
  ipcMain.handle('app:open-driver-page', async (_e, chip: string) => {
    const url = (DRIVER_PAGES as Record<string, string>)[chip];
    if (url) await shell.openExternal(url);
  });
  ipcMain.handle('boards:check', async (_e, id: string) => {
    const b = watcher.current.boards.find((x) => x.id === id);
    if (b) await checker.check(b);
  });
  const boardBy = (id: string) => watcher.current.boards.find((x) => x.id === id);
  ipcMain.handle('boards:console-open', async (_e, id: string) => {
    const b = boardBy(id);
    return b ? checker.openConsole(b) : { ok: false, message: 'The board is no longer plugged in.' };
  });
  ipcMain.handle('boards:console-close', (_e, id: string) => checker.closeConsole(id));
  ipcMain.handle('boards:console-do', (_e, id: string, a: ConsoleAction) => checker.console(id, a));
  // Board files (F-53, screen 15)
  const gone = { ok: false, message: 'The board is no longer plugged in.' };
  ipcMain.handle('boards:files-list', async (_e, id: string, project: Record<string, string | Uint8Array>) => { const b = boardBy(id); return b ? checker.listFiles(b, project) : gone; });
  ipcMain.handle('boards:files-read', async (_e, id: string, paths: string[]) => { const b = boardBy(id); return b ? checker.readFiles(b, paths) : gone; });
  ipcMain.handle('boards:files-copy', async (_e, id: string, files: Record<string, string | Uint8Array>, keep: boolean) => { const b = boardBy(id); return b ? checker.copyToBoard(b, files, keep) : gone; });
  ipcMain.handle('boards:files-delete', async (_e, id: string, paths: string[], keep: boolean) => { const b = boardBy(id); return b ? checker.deleteOnBoard(b, paths, keep) : gone; });
  ipcMain.handle('boards:files-mkdir', async (_e, id: string, path: string) => { const b = boardBy(id); return b ? checker.makeFolder(b, path) : gone; });
  ipcMain.handle('boards:files-done', async (_e, id: string) => { const b = boardBy(id); if (b) await checker.filesDone(b); });
  ipcMain.handle('boards:send', async (_e, id: string, files: Record<string, string | Uint8Array>, req: SendRequest) => {
    const b = watcher.current.boards.find((x) => x.id === id);
    return b ? checker.send(b, files, req) : { ok: false, message: 'The board is no longer plugged in.' };
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
