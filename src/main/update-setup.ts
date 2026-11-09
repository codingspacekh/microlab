// M11 (Rev 13, F-109), ported from OneEditor: updates as the installed app runs them — electron-updater, the update address
// written into the resources when the installers are built (updates.json), the settings in the
// settings folder (updates.json), and a Mac's .dmg downloaded with Electron's own network stack
// (which uses the school's proxy settings, as a browser does).
import {
  createWriteStream,
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import {
  NO_UPDATE_PREFS,
  updateMode,
  type UpdatePrefs,
  type UpdateState,
} from '../lib/updates/index.ts';
import { createUpdates, type Updater, type Updates } from './updates.ts';
import whatsNew from './whats-new.json';

/** What the build wrote into the resources (scripts/package.ts); none: updates are off. */
export interface UpdateConfig {
  url: string | null;
  macSigned: boolean;
}

export function readUpdateConfig(file: string): UpdateConfig {
  try {
    const c = JSON.parse(readFileSync(file, 'utf8')) as Partial<UpdateConfig>;
    return {
      url: typeof c.url === 'string' && c.url ? c.url : null,
      macSigned: c.macSigned === true,
    };
  } catch {
    return { url: null, macSigned: false };
  }
}

/** Downloads `url` to `file` (through a .download file), saying how far it has got. */
export async function fetchToFile(
  fetch: (url: string) => Promise<Response>,
  url: string,
  file: string,
  progress: (percent: number) => void,
): Promise<void> {
  const part = `${file}.download`;
  await mkdir(dirname(file), { recursive: true });
  try {
    const response = await fetch(url);
    if (!response.ok || !response.body)
      throw new Error(`The download answered ${response.status}.`);
    const total = Number(response.headers.get('content-length')) || 0;
    let got = 0;
    const body = Readable.fromWeb(response.body as unknown as WebReadableStream);
    body.on('data', (chunk: Buffer) => {
      got += chunk.length;
      if (total) progress(Math.round((100 * got) / total));
    });
    await pipeline(body, createWriteStream(part));
    if (existsSync(file)) rmSync(file);
    renameSync(part, file);
  } catch (error) {
    rmSync(part, { force: true });
    throw error;
  }
}

export interface UpdateSetup {
  packaged: boolean;
  platform: string;
  arch: string;
  version: string;
  /** resources/updates.json in the installed app. */
  configFile: string;
  /** The settings folder. */
  userData: string;
  downloads: string;
  send: (state: UpdateState) => void;
  fetch: (url: string) => Promise<Response>;
  showItem: (path: string) => void;
  openPath: (path: string) => Promise<unknown>;
  quit: () => void;
  /** electron-updater's autoUpdater, loaded only when updates are on. */
  loadUpdater: () => Promise<Updater>;
}

/**
 * electron-updater's autoUpdater from `import('electron-updater')`. It is a getter on the module's
 * exports, which Node does not list as a named export of a CommonJS module, so in the installed
 * app it is only on `default` (OneEditor 1.5.0 and 1.5.1 read the named one, got undefined, and never looked
 * for updates).
 */
export function autoUpdaterOf(mod: unknown): Updater {
  const m = mod as { autoUpdater?: Updater; default?: { autoUpdater?: Updater } } | undefined;
  const updater = m?.autoUpdater ?? m?.default?.autoUpdater;
  if (!updater) throw new Error('electron-updater has no autoUpdater');
  return updater;
}

export async function setUpUpdates(o: UpdateSetup): Promise<Updates> {
  const config = o.packaged ? readUpdateConfig(o.configFile) : { url: null, macSigned: false };
  const mode = updateMode({ platform: o.platform, packaged: o.packaged, ...config });
  let updater: Updater | null = null;
  let failed: unknown = null;
  if (mode !== 'off')
    try {
      updater = await o.loadUpdater();
    } catch (error) {
      failed = error;
    }
  const prefsFile = join(o.userData, 'updates.json');
  const notes = whatsNew as Record<string, string[]>;
  return createUpdates({
    mode,
    current: o.version,
    url: config.url,
    // Updates stay on and say they could not start (start() reports it).
    updater: () => {
      if (!updater) throw failed;
      return updater;
    },
    readPrefs: (): UpdatePrefs => {
      try {
        return { ...NO_UPDATE_PREFS, ...JSON.parse(readFileSync(prefsFile, 'utf8')) };
      } catch {
        return { ...NO_UPDATE_PREFS };
      }
    },
    writePrefs: (prefs) => {
      try {
        writeFileSync(prefsFile, `${JSON.stringify(prefs, null, 2)}\n`);
      } catch {
        // a settings folder that cannot be written only means it asks again
      }
    },
    notesFor: (version) => notes[version] ?? [],
    send: o.send,
    log: (line) => console.log(line),
    // After the window is up, so it never slows the start.
    later: (fn) => void setTimeout(fn, 8000),
    every: (fn, ms) => void setInterval(fn, ms).unref(),
    downloads: o.downloads,
    arch: o.arch === 'arm64' ? 'arm64' : 'x64',
    fetchToFile: (url, file, progress) => fetchToFile(o.fetch, url, file, progress),
    showItem: o.showItem,
    openPath: o.openPath,
    quit: o.quit,
  });
}
