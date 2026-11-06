import { execFile } from 'node:child_process';
import { holderName } from '@lib/usb';

/**
 * Which program holds a board's port (F-56, screen 13b "used by Thonny"): on macOS and Linux `lsof` gives the
 * processes that have it open and `ps` their command lines. Windows can't tell without admin rights: not named there.
 */
export type Run = (cmd: string, args: string[]) => Promise<string>;

const run: Run = (cmd, args) => new Promise((ok, fail) => {
  execFile(cmd, args, { timeout: 1500 }, (err, stdout) => (err && !stdout ? fail(err) : ok(stdout)));
});

export async function whoHolds(port: string, platform: string, exec: Run = run): Promise<string | undefined> {
  if (platform === 'win32') return undefined;
  try {
    const pids = (await exec('lsof', ['-t', port])).split(/\s+/).filter(Boolean);
    if (!pids.length) return undefined;
    const commands = (await exec('ps', ['-o', 'command=', '-p', pids.join(',')])).split('\n').filter(Boolean);
    return holderName(commands);
  } catch {
    return undefined;
  }
}
