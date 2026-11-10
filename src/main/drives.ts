import { execFile } from 'node:child_process';
import { access, open, stat } from 'node:fs/promises';
import { posix } from 'node:path';
import { parseVolumes } from '@lib/usb';

/**
 * The drives a board shows (F-52): where they are mounted, and copying firmware onto one with its progress. On a Mac
 * and Linux they are folders under /Volumes, /media/<user>; on Windows lettered drives, found with Get-Volume (which
 * also lets the watcher see a Pico in BOOTSEL there).
 */
export type Run = (cmd: string, args: string[]) => Promise<string>;

const run: Run = (cmd, args) => new Promise((ok, fail) => {
  execFile(cmd, args, { timeout: 4000, windowsHide: true }, (err, stdout) => (err && !stdout ? fail(err) : ok(stdout)));
});

/** Windows' lettered drives, by name; none if they can't be read. */
export async function listVolumesWindows(exec: Run = run): Promise<{ name: string; path: string }[]> {
  const cmd = 'Get-Volume | Where-Object DriveLetter | Select-Object DriveLetter,FileSystemLabel | ConvertTo-Json -Compress';
  try {
    return parseVolumes(await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd]));
  } catch {
    return [];
  }
}

/** Where a drive is mounted now, if it is. */
const there = async (p: string) => { try { await access(p); return true; } catch { return false; } };

export async function drivePath(
  name: string, platform: string, user: string,
  windows: () => Promise<{ name: string; path: string }[]> = () => listVolumesWindows(),
  exists: (p: string) => Promise<boolean> = there,
): Promise<string | undefined> {
  if (platform === 'win32') return (await windows()).find((v) => v.name === name)?.path;
  const places = platform === 'darwin' ? [posix.join('/Volumes', name)] : [posix.join('/media', user, name), posix.join('/run/media', user, name)];
  for (const p of places) if (await exists(p)) return p;
  return undefined;
}

/**
 * Copies a file onto a drive in 64 KB pieces, telling how far it is, and makes sure it is written before it says it is
 * done — the board takes the firmware as it is written, and restarts once it has all of it.
 */
export async function copyToDrive(src: string, dest: string, progress: (done: number) => void): Promise<void> {
  const size = (await stat(src)).size;
  const from = await open(src, 'r');
  const to = await open(dest, 'w');
  try {
    const buf = Buffer.alloc(64 * 1024);
    let done = 0;
    while (done < size) {
      const { bytesRead } = await from.read(buf, 0, buf.length, done);
      if (!bytesRead) break;
      await to.write(buf, 0, bytesRead);
      done += bytesRead;
      progress(done);
    }
    await to.sync().catch(() => {});   // some drives refuse fsync; closing still writes
  } finally {
    await from.close();
    await to.close().catch(() => {});  // the board may already be restarting
  }
}
