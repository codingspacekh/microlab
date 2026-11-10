// M11 (Rev 13, F-109; ported from OneEditor's tests): M17a U1–U5: the main process's updates, with a fake electron-updater (the real one needs an
// installed app and a release to find).
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { NO_UPDATE_PREFS, type UpdatePrefs, type UpdateState } from '../../../src/lib/updates/index.ts';
import { createUpdates, type Updater, type UpdatesDeps } from '../../../src/main/updates.ts';

function fakeUpdater() {
  const listeners = new Map<string, ((...a: unknown[]) => void)[]>();
  const updater = {
    autoDownload: true,
    autoInstallOnAppQuit: false,
    logger: null as unknown,
    feed: null as unknown,
    setFeedURL(o: unknown) {
      this.feed = o;
    },
    on(event: string, fn: (...a: unknown[]) => void) {
      listeners.set(event, [...(listeners.get(event) ?? []), fn]);
      return this;
    },
    checkForUpdates: vi.fn(async () => null),
    downloadUpdate: vi.fn(async () => []),
    quitAndInstall: vi.fn(),
  };
  const emit = (event: string, ...args: unknown[]) =>
    listeners.get(event)?.forEach((fn) => fn(...args));
  return { updater: updater as Updater & typeof updater, emit };
}

function setup(over: Partial<UpdatesDeps> = {}, prefs: UpdatePrefs = { ...NO_UPDATE_PREFS }) {
  const { updater, emit } = fakeUpdater();
  let saved = prefs;
  const sent: UpdateState[] = [];
  const timers: (() => void)[] = [];
  const deps: UpdatesDeps = {
    mode: 'auto',
    current: '1.5.0',
    url: 'https://github.com/codingspacekh/MicroLab/releases/latest/download',
    updater: () => updater,
    readPrefs: () => saved,
    writePrefs: (p) => void (saved = p),
    notesFor: (v) => (v === '1.5.1' ? ['SVG pictures'] : []),
    send: (s) => void sent.push(s),
    log: () => {},
    later: (fn) => void timers.push(fn),
    every: () => {},
    downloads: '/Users/x/Downloads',
    arch: 'arm64',
    fetchToFile: vi.fn(async () => {}),
    showItem: vi.fn(),
    openPath: vi.fn(async () => {}),
    quit: vi.fn(),
    ...over,
  };
  const updates = createUpdates(deps);
  return { updates, updater, emit, sent, timers, prefs: () => saved, deps };
}

describe('U1 looking for a newer version', () => {
  it('looks a little after the app opens (never slowing the start), from the GitHub feed', async () => {
    const { updates, updater, timers } = setup();
    updates.start();
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    expect(updater.feed).toEqual({
      provider: 'generic',
      url: 'https://github.com/codingspacekh/MicroLab/releases/latest/download',
    });
    expect(updater.autoDownload).toBe(false); // it says one is out; Download fetches it
    expect(updater.autoInstallOnAppQuit).toBe(true); // Later = when the app is next quit
    timers[0]!();
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('says a newer version is out, with what is new', () => {
    const { updates, emit, sent } = setup();
    updates.start();
    emit('checking-for-update');
    emit('update-available', { version: '1.5.1', releaseNotes: '- SVG pictures\n- OGG audio' });
    expect(updates.get()).toMatchObject({
      status: 'available',
      version: '1.5.1',
      notes: ['SVG pictures', 'OGG audio'],
    });
    expect(sent.at(-1)!.status).toBe('available');
  });

  it('no newer version: says so when asked; no internet: says nothing unless asked', async () => {
    const { updates, emit } = setup();
    updates.start();
    emit('checking-for-update');
    emit('error', new Error('getaddrinfo ENOTFOUND github.com'));
    expect(updates.get()).toMatchObject({ status: 'idle', error: null });
    const asked = updates.check();
    emit('checking-for-update');
    emit('error', new Error('getaddrinfo ENOTFOUND github.com'));
    await asked;
    expect(updates.get()).toMatchObject({
      status: 'error',
      error: expect.stringMatching(/internet/),
    });
    emit('checking-for-update');
    emit('update-not-available', { version: '1.5.0' });
    expect(updates.get().status).toBe('none');
  });
});

describe('U2 Download, then Restart and update', () => {
  it('downloads in the background with its progress; then it is ready', async () => {
    const { updates, updater, emit } = setup();
    updates.start();
    emit('update-available', { version: '1.5.1', releaseNotes: '' });
    await updates.download();
    expect(updater.downloadUpdate).toHaveBeenCalled();
    emit('download-progress', { percent: 41.6 });
    expect(updates.get()).toMatchObject({ status: 'downloading', percent: 42 });
    emit('update-downloaded', { version: '1.5.1' });
    expect(updates.get()).toMatchObject({ status: 'ready', percent: 100 });
    updates.install();
    await new Promise((r) => setTimeout(r, 0));
    expect(updater.quitAndInstall).toHaveBeenCalledWith(true, true);
  });

  it('never puts it in unless it is ready', async () => {
    const { updates, updater } = setup();
    updates.start();
    updates.install();
    await new Promise((r) => setTimeout(r, 0));
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
  });

  it('"Download updates by itself": saved, and a new version is then downloaded without asking', () => {
    const { updates, updater, emit, prefs } = setup();
    updates.start();
    updates.setAuto(true);
    expect(prefs().autoDownload).toBe(true);
    emit('update-available', { version: '1.5.1', releaseNotes: '' });
    expect(updater.downloadUpdate).toHaveBeenCalled();
  });
});

describe('U2 the rarer turns', () => {
  it('a Mac that refuses the signed update while downloading is offered the .dmg instead', async () => {
    const { updates, emit } = setup();
    updates.start();
    emit('update-available', { version: '1.5.1', releaseNotes: '' });
    await updates.download();
    emit('error', new Error('Code signature at URL … did not pass validation'));
    expect(updates.get()).toMatchObject({ mode: 'dmg', status: 'available', error: null });
  });

  it('looking again after the download keeps it ready; a failed download says so', async () => {
    const { updates, emit, updater } = setup();
    updates.start();
    emit('update-available', { version: '1.5.1', releaseNotes: '' });
    await updates.download();
    emit('update-downloaded', { version: '1.5.1' });
    emit('checking-for-update');
    emit('update-available', { version: '1.5.1', releaseNotes: '' });
    expect(updates.get().status).toBe('ready');
    expect(updater.downloadUpdate).toHaveBeenCalledTimes(1);
    const other = setup();
    other.updates.start();
    other.emit('update-available', { version: '1.5.1', releaseNotes: '' });
    await other.updates.download();
    other.emit('error', new Error('sha512 checksum mismatch'));
    expect(other.updates.get()).toMatchObject({
      status: 'error',
      error: expect.stringMatching(/Could not get the update/),
    });
  });

  it('nothing to download, a look while looking, and a .dmg to show: nothing happens wrongly', async () => {
    const { updates, emit, updater, deps } = setup();
    updates.start();
    await updates.download();
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
    emit('checking-for-update');
    await updates.check();
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    updates.showDmg();
    expect(deps.showItem).not.toHaveBeenCalled();
  });

  it('a failed .dmg download says so', async () => {
    const { updates, emit } = setup({
      mode: 'dmg',
      fetchToFile: vi.fn(async () => {
        throw new Error('The download answered 404.');
      }),
    });
    updates.start();
    emit('update-available', { version: '1.5.1', releaseNotes: '' });
    await updates.download();
    expect(updates.get()).toMatchObject({
      status: 'error',
      error: expect.stringMatching(/Could not get/),
    });
  });
});

describe('U4 after an update', () => {
  it('says once "Updated to 1.5.1" with its what is new; seen, it is gone', () => {
    const { updates, prefs } = setup(
      { current: '1.5.1' },
      {
        autoDownload: false,
        lastVersion: '1.5.0',
        updatedTo: null,
      },
    );
    expect(updates.get()).toMatchObject({ updatedTo: '1.5.1', updatedNotes: ['SVG pictures'] });
    expect(prefs()).toMatchObject({ lastVersion: '1.5.1', updatedTo: '1.5.1' });
    updates.seen();
    expect(updates.get().updatedTo).toBeNull();
    expect(prefs().updatedTo).toBeNull();
  });
});

describe('U1 off and dmg modes', () => {
  it('run from the source: nothing is looked for, and asking does nothing', async () => {
    const updater = vi.fn();
    const { updates, timers } = setup({ mode: 'off', updater });
    updates.start();
    await updates.check();
    expect(timers).toHaveLength(0);
    expect(updater).not.toHaveBeenCalled();
    expect(updates.get()).toMatchObject({ mode: 'off', status: 'idle' });
  });

  it("a Mac that cannot update by itself downloads this chip's .dmg to Downloads and opens it", async () => {
    const { updates, emit, deps } = setup({ mode: 'dmg' });
    updates.start();
    emit('update-available', { version: '1.5.1', releaseNotes: '' });
    await updates.download();
    // node:path join, as on the computer it runs on (Windows CI writes \\).
    const file = join('/Users/x/Downloads', 'MicroLab-1.5.1-mac-arm64.dmg');
    expect(deps.fetchToFile).toHaveBeenCalledWith(
      'https://github.com/codingspacekh/MicroLab/releases/latest/download/MicroLab-1.5.1-mac-arm64.dmg',
      file,
      expect.any(Function),
    );
    expect(updates.get()).toMatchObject({ status: 'dmg', dmg: file });
    await updates.openDmg();
    expect(deps.openPath).toHaveBeenCalledWith(file);
  });
});

describe('an updater that cannot start (1.5.0 and 1.5.1: electron-updater loaded wrongly)', () => {
  it('says so, and Check for Updates does not claim there is nothing new', async () => {
    const logged: string[] = [];
    const { updates, timers } = setup({
      updater: () => {
        throw new TypeError("Cannot read properties of undefined (reading 'setFeedURL')");
      },
      log: (line) => void logged.push(line),
    });
    expect(() => updates.start()).not.toThrow();
    expect(timers).toHaveLength(0);
    expect(updates.get()).toMatchObject({
      status: 'error',
      error: expect.stringMatching(/could not start.*download the newest version/i),
    });
    expect(await updates.check()).toMatchObject({ status: 'error' });
    expect(logged.join('\n')).toMatch(/setFeedURL/);
  });
});
