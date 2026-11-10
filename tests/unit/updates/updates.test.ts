// M11 (Rev 13, F-109; ported from OneEditor's tests): M17a U1–U5: updates in the app, as in the ZISPP Gradebook — the decisions that need no Electron.
import { describe, expect, it } from 'vitest';
import {
  dmgName,
  friendlyUpdateError,
  mergeMacFeeds,
  noteLines,
  updateMode,
  versionStart,
} from '../../../src/lib/updates/index.ts';

describe('U1 how this copy of the app takes an update', () => {
  const url = 'https://github.com/codingspacekh/MicroLab/releases/latest/download';
  it('by itself when installed with an update address; off when run from the source or with none', () => {
    expect(updateMode({ platform: 'win32', packaged: true, url, macSigned: false })).toBe('auto');
    expect(updateMode({ platform: 'darwin', packaged: true, url, macSigned: true })).toBe('auto');
    expect(updateMode({ platform: 'win32', packaged: false, url, macSigned: false })).toBe('off');
    expect(updateMode({ platform: 'win32', packaged: true, url: null, macSigned: false })).toBe(
      'off',
    );
  });

  it('a Mac not signed with the certificate is offered the .dmg to download instead', () => {
    expect(updateMode({ platform: 'darwin', packaged: true, url, macSigned: false })).toBe('dmg');
    expect(dmgName('1.5.1', 'arm64')).toBe('MicroLab-1.5.1-mac-arm64.dmg');
  });
});

describe("U2 what's new", () => {
  it('the release notes as lines: text with "- " points, or electron-updater\'s list, or HTML', () => {
    expect(noteLines('- Export at any size\n- OGG audio\n')).toEqual([
      'Export at any size',
      'OGG audio',
    ]);
    expect(noteLines([{ version: '1.5.1', note: '<ul><li>SVG pictures</li></ul>' }])).toEqual([
      'SVG pictures',
    ]);
    expect(noteLines(null)).toEqual([]);
  });
});

describe('U5 problems are explained simply', () => {
  it('no internet, or anything else', () => {
    expect(friendlyUpdateError('net::ERR_INTERNET_DISCONNECTED')).toMatch(/internet/i);
    expect(friendlyUpdateError('getaddrinfo ENOTFOUND github.com')).toMatch(/internet/i);
    expect(friendlyUpdateError('sha512 checksum mismatch')).toMatch(/could not get the update/i);
  });
});

describe('U4 the first start of a new version', () => {
  it('says once that the app was updated, only when an earlier version ran here', () => {
    expect(
      versionStart({ autoDownload: false, lastVersion: null, updatedTo: null }, '1.5.0'),
    ).toEqual({ autoDownload: false, lastVersion: '1.5.0', updatedTo: null });
    expect(
      versionStart({ autoDownload: true, lastVersion: '1.5.0', updatedTo: null }, '1.5.1'),
    ).toEqual({ autoDownload: true, lastVersion: '1.5.1', updatedTo: '1.5.1' });
    const same = { autoDownload: false, lastVersion: '1.5.1', updatedTo: null };
    expect(versionStart(same, '1.5.1')).toBe(same);
  });
});

describe('U3 one feed for both Macs', () => {
  it('the files of the Apple-chip and Intel builds in one latest-mac.yml', () => {
    const arm = {
      version: '1.5.1',
      files: [{ url: 'MicroLab-1.5.1-mac-arm64.zip', sha512: 'a', size: 1 }],
      path: 'MicroLab-1.5.1-mac-arm64.zip',
      sha512: 'a',
      releaseDate: '2026-11-04T10:00:00.000Z',
    };
    const intel = {
      ...arm,
      files: [{ url: 'MicroLab-1.5.1-mac-x64.zip', sha512: 'b', size: 2 }],
      path: 'MicroLab-1.5.1-mac-x64.zip',
      sha512: 'b',
      releaseDate: '2026-11-04T10:05:00.000Z',
    };
    const merged = mergeMacFeeds([arm, intel]);
    expect(merged.files.map((f) => f.url)).toEqual([
      'MicroLab-1.5.1-mac-arm64.zip',
      'MicroLab-1.5.1-mac-x64.zip',
    ]);
    expect(merged.releaseDate).toBe('2026-11-04T10:05:00.000Z');
    expect(() => mergeMacFeeds([arm, { ...intel, version: '1.5.0' }])).toThrow(/version/);
  });
});
