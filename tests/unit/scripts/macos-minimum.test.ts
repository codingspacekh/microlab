import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** M11.7: the macOS a Mac installer says it needs is never older than the one its Electron needs. Said 12.0 while
 *  Electron 45 needs 13.0 — on macOS 12 it would install, then not start, instead of macOS saying why. */
const PLIST = 'node_modules/electron/dist/Electron.app/Contents/Info.plist';
const version = (v: string) => v.split('.').map(Number).reduce((s, n, i) => s + n * 1000 ** (2 - i), 0);

describe('M11.7 the oldest macOS', () => {
  // on a Mac only (the plist is the Mac's Electron); there it must be found — skipping quietly hid it once on CI
  it.skipIf(process.platform !== 'darwin')('the installer asks for at least the macOS its Electron runs on', () => {
    expect(existsSync(PLIST), `${PLIST}: node node_modules/electron/install.js`).toBe(true);
    const electron = /<key>LSMinimumSystemVersion<\/key>\s*<string>([\d.]+)<\/string>/.exec(readFileSync(PLIST, 'utf8'))![1]!;
    const ours = /minimumSystemVersion:\s*'([\d.]+)'/.exec(readFileSync('electron-builder.config.ts', 'utf8'))![1]!;
    expect(version(ours)).toBeGreaterThanOrEqual(version(electron));
  });
});
