// M11 (Rev 13, F-109): MicroLab's installers, as OneEditor's and the ZISPP Gradebook's — a Windows x64 installer;
// a macOS DMG (and the zip the updater takes) for Apple-chip Macs and one for Intel Macs. `npm run package` builds
// them for this computer; scripts/release-mac.ts both Macs; the Release workflow Windows. Each carries the Python 3
// fetched for its platform and chip (`npm run fetch:python`, checked by hash) and Jedi; the window's code is bundled
// by electron-vite, so only the main process's runtime packages come from node_modules.
//
// Updates: a release build is given the update address (MICROLAB_UPDATE_URL: the releases repo's latest release), so
// latest.yml / latest-mac.yml are written beside the installers with this version's what's new. Macs are signed with
// the teacher's own certificate (CSC_NAME, as the gradebook's and OneEditor's) so they update by themselves; without
// it, ad hoc.
import { readFileSync } from 'node:fs';
import type { Configuration } from 'electron-builder';

/** The Python for the platform and chip being packaged (`${arch}` is filled in by electron-builder). */
const python = (platform: string) => ({ from: `vendor/python/${platform}-\${arch}/python`, to: 'python' });

/** This version's what's new, as the feed's release notes ("- " points); shown in the app after the update. */
function releaseNotes(version: string): string {
  const all = JSON.parse(readFileSync(new URL('./src/main/whats-new.json', import.meta.url), 'utf8')) as Record<string, string[]>;
  const lines = all[version];
  if (!lines?.length) throw new Error(`src/main/whats-new.json has nothing for ${version}: write what's new first (it is shown in the app).`);
  return lines.map((line) => `- ${line}`).join('\n');
}

const VERSION = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version;

export function configFor(env: Record<string, string | undefined>, version: string = VERSION): Configuration {
  const url = env.MICROLAB_UPDATE_URL || null;
  return {
    appId: 'dev.codingspacekh.microlab',
    productName: 'MicroLab',
    copyright: '© 2026 CodingSpaceKH. All rights reserved.',
    directories: { output: 'release', buildResources: 'build' },
    // The window, main process and preload are bundled by electron-vite; the main process's runtime packages
    // (serialport, its prebuilt N-API binaries; electron-updater; fflate, zod) are added from node_modules.
    files: ['out/**/*', 'package.json'],
    // serialport ships N-API binaries for every platform: nothing to rebuild for Electron (and a Mac can't for Windows)
    npmRebuild: false,
    extraResources: [
      // the update address (none: updates are off), written by scripts/package.ts
      { from: 'build-info/updates.json', to: 'updates.json' },
      // MicroLab's own Python: the runner (a program's process) and the help while typing (Jedi's process)
      { from: 'src/python3', to: 'python3', filter: ['*.py'] },
      { from: 'vendor/python-tools', to: 'python-tools' },
    ],
    win: {
      target: [{ target: 'nsis', arch: ['x64'] }],
      extraResources: [python('win32')],
    },
    nsis: {
      // Students install for themselves (no administrator password) and may choose the folder.
      oneClick: false,
      perMachine: false,
      allowToChangeInstallationDirectory: true,
      artifactName: 'MicroLab-Setup-${version}.${ext}',
    },
    mac: {
      // One DMG per chip (each half the size of a universal one); the zip is what the updater downloads.
      target: ['dmg', 'zip'],
      category: 'public.app-category.education',
      extraResources: [python('darwin')],
      minimumSystemVersion: '12.0',
      // Not notarised (no paid Apple account, as the gradebook and OneEditor). Signed with the teacher's own
      // certificate when CSC_NAME names it (a Mac then takes updates by itself), else ad hoc, which Apple-chip Macs
      // need to run it at all. The hardened runtime is for notarised apps; it can stop the launch.
      identity: env.CSC_NAME || '-',
      hardenedRuntime: false,
      artifactName: 'MicroLab-${version}-mac-${arch}.${ext}',
    },
    dmg: { title: 'MicroLab ${version}' },
    // The build itself uploads nothing (`--publish never`): with an address it only writes the feeds; the Release
    // workflow and scripts/release-mac.ts put them in the draft release.
    publish: url ? [{ provider: 'generic', url }] : null,
    ...(url ? { releaseInfo: { releaseNotes: releaseNotes(version) } } : {}),
  };
}

export default configFor(process.env);
