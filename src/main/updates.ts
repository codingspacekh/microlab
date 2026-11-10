// M11 (Rev 13, F-109), ported from OneEditor: updates in the main process, as in the ZISPP Gradebook. It looks a little after the
// app opens and every 6 hours; a newer version is only said (status 'available') unless "Download
// updates by itself" is on. Nothing is put in while the app is open: Restart and update, or when
// the app is next quit. Only the installed app with an update address does any of it (mode 'off'
// otherwise). Electron and electron-updater are passed in, so this is tested without them.
import { join } from 'node:path';
import {
  dmgName,
  friendlyUpdateError,
  noteLines,
  versionStart,
  type UpdateMode,
  type UpdatePrefs,
  type UpdateState,
} from '../lib/updates/index.ts';

const EVERY = 6 * 60 * 60 * 1000;

/** The parts of electron-updater's autoUpdater used here. */
export interface Updater {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  logger: unknown;
  setFeedURL(options: { provider: 'generic'; url: string }): void;
  on(event: string, listener: (...args: never[]) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(isSilent: boolean, isForceRunAfter: boolean): void;
}

export interface UpdatesDeps {
  mode: UpdateMode;
  current: string;
  url: string | null;
  /** Loads electron-updater only when updates are on (it is not needed otherwise). */
  updater: () => Updater;
  readPrefs: () => UpdatePrefs;
  writePrefs: (prefs: UpdatePrefs) => void;
  /** This app's own what's new for a version (whats-new.json), for the note after an update. */
  notesFor: (version: string) => string[];
  send: (state: UpdateState) => void;
  log: (line: string) => void;
  /** Runs once, a little after the window is up. */
  later: (fn: () => void) => void;
  /** Runs every 6 hours. */
  every: (fn: () => void, ms: number) => void;
  downloads: string;
  arch: 'arm64' | 'x64';
  fetchToFile: (url: string, file: string, progress: (percent: number) => void) => Promise<void>;
  showItem: (path: string) => void;
  openPath: (path: string) => Promise<unknown>;
  quit: () => void;
}

export interface Updates {
  start(): void;
  get(): UpdateState;
  check(): Promise<UpdateState>;
  download(): Promise<UpdateState>;
  install(): UpdateState;
  setAuto(on: boolean): UpdateState;
  seen(): UpdateState;
  showDmg(): UpdateState;
  openDmg(): Promise<UpdateState>;
}

export function createUpdates(deps: UpdatesDeps): Updates {
  let prefs = versionStart(deps.readPrefs(), deps.current);
  if (prefs !== deps.readPrefs()) deps.writePrefs(prefs);
  const state: UpdateState = {
    mode: deps.mode,
    current: deps.current,
    status: 'idle',
    version: null,
    notes: [],
    percent: 0,
    checkedAt: null,
    error: null,
    autoDownload: prefs.autoDownload,
    updatedTo: prefs.updatedTo,
    updatedNotes: prefs.updatedTo ? deps.notesFor(prefs.updatedTo) : [],
    dmg: null,
  };
  const copy = (): UpdateState => ({ ...state, notes: [...state.notes] });
  const set = (patch: Partial<UpdateState>): void => {
    Object.assign(state, patch);
    deps.send(copy());
  };
  const savePrefs = (patch: Partial<UpdatePrefs>): void => {
    prefs = { ...prefs, ...patch };
    deps.writePrefs(prefs);
  };

  let updater: Updater | null = null;
  /** The student or teacher asked (Check now): a problem is then said. */
  let asked = false;
  let before: UpdateState['status'] = 'idle';
  const now = () => new Date().toISOString();

  function listen(u: Updater): void {
    u.on('checking-for-update', () => {
      before = state.status;
      set({ status: 'checking', error: null });
    });
    u.on('update-not-available', () =>
      set({ status: 'none', checkedAt: now(), version: null, notes: [] }),
    );
    u.on('update-available', (info: { version: string; releaseNotes?: unknown }) => {
      // Already downloaded (or its .dmg is): looking again changes nothing.
      const already = state.version === info.version && (before === 'ready' || before === 'dmg');
      set({
        status: already ? before : 'available',
        checkedAt: now(),
        version: info.version,
        notes: noteLines(info.releaseNotes),
      });
      if (!already && prefs.autoDownload) void download();
    });
    u.on('download-progress', (p: { percent: number }) =>
      set({ status: 'downloading', percent: Math.round(p.percent) }),
    );
    u.on('update-downloaded', () => set({ status: 'ready', percent: 100 }));
    u.on('error', (error: Error) => {
      const message = String(error?.message ?? error);
      deps.log(`updates: ${message}`);
      // A Mac that refuses an update signed another way is offered the .dmg instead.
      if (
        state.mode === 'auto' &&
        state.status === 'downloading' &&
        /signature|code ?sign/i.test(message)
      )
        return set({ mode: 'dmg', status: 'available', percent: 0, error: null });
      // U5: a look by itself with no internet says nothing; one asked for says why.
      if (asked || state.status === 'downloading')
        set({ status: 'error', error: friendlyUpdateError(message) });
      else set({ status: before === 'checking' ? 'idle' : before });
    });
  }

  async function check(byHand: boolean): Promise<UpdateState> {
    if (!updater || state.status === 'checking' || state.status === 'downloading') return copy();
    asked = byHand;
    try {
      await updater.checkForUpdates();
    } catch {
      // the error event has said it
    }
    return copy();
  }

  async function download(): Promise<UpdateState> {
    if (!updater || !state.version) return copy();
    if (state.status !== 'available' && state.status !== 'error') return copy();
    set({ status: 'downloading', percent: 0, error: null });
    if (state.mode === 'dmg') return downloadDmg(state.version);
    try {
      await updater.downloadUpdate();
    } catch {
      // the error event has said it
    }
    return copy();
  }

  /** The .dmg for this Mac into Downloads, then it is opened to drag into Applications. */
  async function downloadDmg(version: string): Promise<UpdateState> {
    const name = dmgName(version, deps.arch);
    const file = join(deps.downloads, name);
    try {
      await deps.fetchToFile(`${deps.url!.replace(/\/$/, '')}/${name}`, file, (percent) =>
        set({ percent }),
      );
      set({ status: 'dmg', percent: 100, dmg: file });
    } catch (error) {
      set({ status: 'error', error: friendlyUpdateError(String((error as Error)?.message)) });
    }
    return copy();
  }

  return {
    start() {
      if (state.mode === 'off' || !deps.url) return;
      try {
        updater = deps.updater();
        updater.setFeedURL({ provider: 'generic', url: deps.url });
      } catch (error) {
        // Said, not hidden: without it Check for Updates would seem to find nothing new.
        updater = null;
        deps.log(`updates: could not start: ${String((error as Error)?.message ?? error)}`);
        set({
          status: 'error',
          error:
            'Updates could not start in this version. Download the newest version from the website and install it over this one.',
        });
        return;
      }
      updater.autoDownload = false;
      updater.autoInstallOnAppQuit = true;
      updater.logger = {
        info: (m: unknown) => deps.log(`updates: ${String(m)}`),
        warn: (m: unknown) => deps.log(`updates: ${String(m)}`),
        error: (m: unknown) => deps.log(`updates: ${String(m)}`),
        debug: () => {},
      };
      listen(updater);
      deps.later(() => void check(false));
      deps.every(() => void check(false), EVERY);
    },
    get: copy,
    check: () => check(true),
    download,
    install() {
      // Windows: the installer runs without asking and opens the app again; a Mac swaps the app.
      if (updater && state.status === 'ready') {
        const u = updater;
        setTimeout(() => u.quitAndInstall(true, true), 0);
      }
      return copy();
    },
    setAuto(on) {
      savePrefs({ autoDownload: on });
      set({ autoDownload: on });
      if (on && state.status === 'available') void download();
      return copy();
    },
    seen() {
      savePrefs({ updatedTo: null });
      set({ updatedTo: null, updatedNotes: [] });
      return copy();
    },
    showDmg() {
      if (state.dmg) deps.showItem(state.dmg);
      return copy();
    },
    async openDmg() {
      if (state.dmg) {
        await deps.openPath(state.dmg);
        setTimeout(deps.quit, 0);
      }
      return copy();
    },
  };
}
