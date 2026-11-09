// M11 (Rev 13, F-109): MicroLab's installers (electron-builder) carry everything the app needs on each platform — the
// built app, the Python for its platform and chip, Jedi, MicroLab's own Python scripts, the update address. (As
// OneEditor's tests/unit/scripts/packaging.test.ts.)
import { describe, expect, it } from 'vitest';
import config, { configFor } from '../../../electron-builder.config.ts';
import { builderArgs, feedUrl, macFeedName, MAX_INSTALLER_MB, oversized, packagedProgram, RELEASES_REPO, updateConfig } from '../../../scripts/lib/package.ts';

const resources = (list: unknown) => (list as { from: string; to: string }[]).map((r) => `${r.from} → ${r.to}`);

describe('installers', () => {
  it('are called MicroLab, © 2026 CodingSpaceKH, and hold only the built app (no source, nothing to rebuild)', () => {
    expect(config.productName).toBe('MicroLab');
    expect(config.appId).toBe('dev.codingspacekh.microlab');
    expect(config.copyright).toBe('© 2026 CodingSpaceKH. All rights reserved.');
    expect(config.files).toEqual(['out/**/*', 'package.json']);
    expect(config.npmRebuild).toBe(false);   // serialport's N-API binaries are prebuilt for every platform
  });

  it('every installer carries the update address, MicroLab\'s Python scripts and Jedi', () => {
    expect(resources(config.extraResources)).toEqual([
      'build-info/updates.json → updates.json',
      'src/python3 → python3',
      'vendor/python-tools → python-tools',
    ]);
  });

  it('Windows: one installer, 64-bit, with the Windows Python; students install it for themselves', () => {
    expect(config.win!.target).toEqual([{ target: 'nsis', arch: ['x64'] }]);
    expect(resources(config.win!.extraResources)).toEqual(['vendor/python/win32-${arch}/python → python']);
    expect(config.nsis).toMatchObject({ oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, artifactName: 'MicroLab-Setup-${version}.${ext}' });
  });

  it('macOS: a DMG (and the updater\'s zip) for each chip, each with its own Python; signed with CSC_NAME, else ad hoc; not notarised', () => {
    expect(config.mac!.target).toEqual(['dmg', 'zip']);
    expect(resources(config.mac!.extraResources)).toEqual(['vendor/python/darwin-${arch}/python → python']);
    expect(config.mac).toMatchObject({ category: 'public.app-category.education', hardenedRuntime: false, artifactName: 'MicroLab-${version}-mac-${arch}.${ext}' });
    expect(configFor({ CSC_NAME: 'ZISPP Gradebook' }).mac!.identity).toBe('ZISPP Gradebook');
    expect(configFor({}).mac!.identity).toBe('-');
  });

  it('a release build has the update address, so latest.yml and latest-mac.yml are made, with this version\'s what\'s new', () => {
    const url = feedUrl();
    expect(url).toBe(`https://github.com/${RELEASES_REPO}/releases/latest/download`);
    const c = configFor({ MICROLAB_UPDATE_URL: url }, '0.12.0');
    expect(c.publish).toEqual([{ provider: 'generic', url }]);
    expect(c.releaseInfo!.releaseNotes).toMatch(/^- Python 3 in MicroLab/);
    expect(configFor({}).publish).toBeNull();   // no address: updates are off
    expect(() => configFor({ MICROLAB_UPDATE_URL: url }, '9.9.9')).toThrow(/whats-new.json has nothing for 9\.9\.9/);
  });
});

describe('scripts/package.ts', () => {
  it('electron-builder for this platform and chip; where the packaged program lands', () => {
    expect(builderArgs('darwin', 'arm64', { dir: false })).toEqual(['--config', 'electron-builder.config.ts', '--publish', 'never', '--mac', '--arm64']);
    expect(builderArgs('win32', 'x64', { dir: true })).toEqual(['--config', 'electron-builder.config.ts', '--publish', 'never', '--win', '--x64', '--dir']);
    expect(packagedProgram('darwin', 'arm64')).toBe('release/mac-arm64/MicroLab.app/Contents/MacOS/MicroLab');
    expect(packagedProgram('darwin', 'x64')).toBe('release/mac/MicroLab.app/Contents/MacOS/MicroLab');
    expect(packagedProgram('win32', 'x64')).toBe('release/win-unpacked/MicroLab.exe');
  });

  it('updates.json: the address, and whether a Mac build is signed with the certificate', () => {
    const url = feedUrl();
    expect(updateConfig({ MICROLAB_UPDATE_URL: url, CSC_NAME: 'ZISPP Gradebook' }, 'darwin')).toEqual({ url, macSigned: true });
    expect(updateConfig({ MICROLAB_UPDATE_URL: url }, 'darwin')).toEqual({ url, macSigned: false });
    expect(updateConfig({ MICROLAB_UPDATE_URL: url, CSC_NAME: 'x' }, 'win32')).toEqual({ url, macSigned: false });
    expect(updateConfig({}, 'win32')).toEqual({ url: null, macSigned: false });
    expect(macFeedName('arm64')).toBe('latest-mac-arm64.yml');
  });

  it('an installer bigger than 260 MB stops the release; the updater\'s zip is not an installer', () => {
    expect(MAX_INSTALLER_MB).toBe(260);
    expect(oversized([
      { name: 'MicroLab-1.0.0-mac-x64.dmg', bytes: 207_000_000 },
      { name: 'MicroLab-Setup-1.0.0.exe', bytes: 261_000_001 },
      { name: 'MicroLab-1.0.0-mac-x64.zip', bytes: 280_000_000 },
    ])).toEqual(['MicroLab-Setup-1.0.0.exe is 261 MB (at most 260 MB)']);
  });
});
