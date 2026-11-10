// M11 (Rev 13, F-109; screens 34, 34b): updates in the app, as in the ZISPP Gradebook and OneEditor. The installed app looks for a newer
// version when it opens and every 6 hours; it says one is out, with what's new, and Download
// (only the parts that changed, in the background); the update goes in on Restart and update or
// when the app is next quit, never while working. This module holds the decisions that need no
// Electron; src/main/updates.ts runs electron-updater (ported from OneEditor's src/core/updates.ts).

/** off: run from the source, or built with no update address · auto: by itself · dmg: a Mac that
 * cannot take an update by itself (not signed with the certificate) downloads the .dmg instead. */
export type UpdateMode = 'off' | 'auto' | 'dmg';

export type UpdateStatus =
  'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'dmg' | 'error';

/** What the page is told (Help ▸ Updates, and the note at the bottom of the window). */
export interface UpdateState {
  mode: UpdateMode;
  /** The version running now. */
  current: string;
  status: UpdateStatus;
  /** The newer version found, if any. */
  version: string | null;
  /** Its what's new, one line each. */
  notes: string[];
  /** Downloaded so far, 0–100. */
  percent: number;
  /** When it last looked (ISO time), if it ever did. */
  checkedAt: string | null;
  error: string | null;
  /** "Download updates by itself" (off unless the student or teacher turns it on). */
  autoDownload: boolean;
  /** Set once after an update: "Updated to 1.5.1" and its what's new, until seen. */
  updatedTo: string | null;
  updatedNotes: string[];
  /** A Mac's downloaded .dmg (mode dmg). */
  dmg: string | null;
}

/** Kept in the settings folder (updates.json), by the main process. */
export interface UpdatePrefs {
  autoDownload: boolean;
  /** The version that ran last time, to know when an update has been put in. */
  lastVersion: string | null;
  updatedTo: string | null;
}

export const NO_UPDATE_PREFS: UpdatePrefs = {
  autoDownload: false,
  lastVersion: null,
  updatedTo: null,
};

export function updateMode(o: {
  platform: string;
  packaged: boolean;
  url: string | null;
  macSigned: boolean;
}): UpdateMode {
  if (!o.packaged || !o.url) return 'off';
  if (o.platform === 'darwin' && !o.macSigned) return 'dmg';
  return 'auto';
}

/** A Mac's .dmg, as electron-builder.config.ts names it. */
export const dmgName = (version: string, arch: 'arm64' | 'x64'): string =>
  `MicroLab-${version}-mac-${arch}.dmg`;

/** latest.yml's releaseNotes (text, electron-updater's list, or HTML) as lines. */
export function noteLines(notes: unknown): string[] {
  const text = Array.isArray(notes)
    ? notes.map((n) => (n as { note?: string } | null)?.note ?? '').join('\n')
    : String(notes ?? '');
  return text
    .replace(/<[^>]+>/g, '\n')
    .split('\n')
    .map((l) => l.replace(/^\s*[-*•]\s*/, '').trim())
    .filter(Boolean);
}

/** U5: what went wrong, in a few plain words. */
export function friendlyUpdateError(message: string): string {
  if (
    /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|ERR_INTERNET|ERR_NAME_NOT_RESOLVED|network/i.test(
      message,
    )
  )
    return 'Could not reach the internet. It will look again later.';
  return 'Could not get the update. It will look again later.';
}

/**
 * U4: a version starting for the first time. When an earlier version ran here, the app says once
 * that it was updated; on a first install it says nothing.
 */
export function versionStart(prefs: UpdatePrefs, current: string): UpdatePrefs {
  if (prefs.lastVersion === current) return prefs;
  return {
    ...prefs,
    lastVersion: current,
    updatedTo: prefs.lastVersion ? current : prefs.updatedTo,
  };
}

/** One entry of a latest*.yml feed. */
export interface FeedFile {
  url: string;
  sha512: string;
  size: number;
  [more: string]: unknown;
}
export interface Feed {
  version: string;
  files: FeedFile[];
  releaseDate?: string;
  [more: string]: unknown;
}

/**
 * U3: one latest-mac.yml for both Macs. Each Mac build writes a feed for its own chip; the
 * updater picks the .zip for its chip from `files`.
 */
export function mergeMacFeeds(feeds: readonly Feed[]): Feed {
  const [first, ...rest] = feeds;
  if (!first) throw new Error('There is no Mac feed to merge.');
  if (rest.some((f) => f.version !== first.version))
    throw new Error('The Mac feeds are not for the same version.');
  return {
    ...first,
    files: feeds.flatMap((f) => f.files),
    releaseDate: rest.at(-1)?.releaseDate ?? first.releaseDate,
  };
}
