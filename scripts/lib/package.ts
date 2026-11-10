// What scripts/package.ts and scripts/release-mac.ts run (M11, Rev 13; as OneEditor's scripts/lib/package.ts):
// electron-builder for one platform and chip, where the packaged program lands, the installers' size, and the
// update address written into the installed app.

/** The public repo that holds only MicroLab's installers (the teacher: as the gradebook's); its latest release is the feed. */
export const RELEASES_REPO = 'codingspacekh/microlab-releases';
export const feedUrl = (repo: string = RELEASES_REPO): string => `https://github.com/${repo}/releases/latest/download`;

/** electron-builder's arguments; `dir`: an unpacked app only (quick, for the self-check). */
export function builderArgs(platform: string, arch: string, { dir }: { dir: boolean }): string[] {
  const os = platform === 'win32' ? '--win' : '--mac';
  return ['--config', 'electron-builder.config.ts', '--publish', 'never', os, `--${arch}`, ...(dir ? ['--dir'] : [])];
}

/** The packaged program, relative to the project folder. */
export function packagedProgram(platform: string, arch: string): string {
  if (platform === 'win32') return 'release/win-unpacked/MicroLab.exe';
  const folder = arch === 'x64' ? 'mac' : `mac-${arch}`;
  return `release/${folder}/MicroLab.app/Contents/MacOS/MicroLab`;
}

/** Electron is about 100 MB compressed, the bundled Python with Tk about 25 MB: 260 MB leaves room, and stops growth by accident. */
export const MAX_INSTALLER_MB = 260;

/** The installers (.exe, .dmg) bigger than allowed, explained (1 MB = 1 000 000 bytes); the updater's .zip is not one. */
export function oversized(files: readonly { name: string; bytes: number }[]): string[] {
  return files
    .filter((f) => !f.name.endsWith('.zip') && f.bytes > MAX_INSTALLER_MB * 1e6)
    .map((f) => `${f.name} is ${Math.round(f.bytes / 1e6)} MB (at most ${MAX_INSTALLER_MB} MB)`);
}

/**
 * What goes into the installed app's resources as updates.json: the update address (MICROLAB_UPDATE_URL; none,
 * updates are off) and whether this Mac build is signed with the teacher's certificate (CSC_NAME), so it can take an
 * update by itself.
 */
export function updateConfig(env: Record<string, string | undefined>, platform: string): { url: string | null; macSigned: boolean } {
  return { url: env.MICROLAB_UPDATE_URL || null, macSigned: platform === 'darwin' && Boolean(env.CSC_NAME) };
}

/** Each Mac build's own feed, kept apart until both are merged into latest-mac.yml. */
export const macFeedName = (arch: string): string => `latest-mac-${arch}.yml`;
