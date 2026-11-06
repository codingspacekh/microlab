import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { detect, parsePnp, plugChanges, type Detection, type PortInfo, type UsbDevice } from '@lib/usb';

/**
 * The port watcher (F-55, N-12, §1.13): the main process lists the USB serial ports and the mounted drives about once
 * a second and tells the window when the boards it means change — a board plugged in is named within 2 s, with no
 * setup. It only lists; it never opens a port (that is asking the board, M10.2), so Thonny can still use it.
 */
export interface WatcherDeps {
  listPorts: () => Promise<PortInfo[]>;
  listVolumes: () => Promise<string[]>;
  platform: string;
  /** The system's USB device list (Windows): a board's chip with no driver has no port but is in it (R5). */
  listUsb?: () => Promise<UsbDevice[]>;
}

/** The device list is slow to read (PowerShell): every third look; the last one stands in between. */
const USB_EVERY = 3;

/** `first`: this is the first look — the boards in it were there before MicroLab started, not just plugged in. */
export type OnBoards = (now: Detection, changes: ReturnType<typeof plugChanges>, first: boolean) => void;

export const LOOK_MS = 1000;

export class BoardWatcher {
  current: Detection = { boards: [], drives: [] };
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private looked = false;
  private looks = 0;
  private usb: UsbDevice[] | undefined;

  constructor(private readonly deps: WatcherDeps, private readonly onChange: OnBoards, private readonly everyMs = LOOK_MS) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.look();
  }

  stop(): void {
    this.running = false;
    clearTimeout(this.timer);
  }

  /** One look; the next is planned when this one ends, so two never overlap. */
  private async look(): Promise<void> {
    try {
      const usbNow = this.deps.listUsb && this.looks++ % USB_EVERY === 0;
      const [ports, volumes, usb] = await Promise.all([
        this.deps.listPorts(), this.deps.listVolumes(), usbNow ? this.deps.listUsb!().catch(() => this.usb) : Promise.resolve(this.usb),
      ]);
      this.usb = usb;
      if (!this.running) return;
      const next = detect(ports, volumes, this.deps.platform, usb);
      if (JSON.stringify(next) !== JSON.stringify(this.current)) {
        const changes = plugChanges(this.current, next);
        this.current = next;
        this.onChange(next, changes, !this.looked);
      }
      this.looked = true;
    } catch {
      // a port list that fails (the system busy) changes nothing; the next look tries again
    }
    if (this.running) this.timer = setTimeout(() => void this.look(), this.everyMs);
  }
}

/** The folders where removable drives appear. Windows drive labels are read when MicroPython is installed (M10.7). */
export function volumesIn(platform: string, user: string): string[] {
  if (platform === 'darwin') return ['/Volumes'];
  if (platform === 'linux') return [`/media/${user}`, `/run/media/${user}`];
  return [];
}

/** The names of the mounted drives, from those folders (names only: macOS lets an app list them without asking). */
export async function listVolumes(platform: string, user: string): Promise<string[]> {
  const lists = await Promise.all(volumesIn(platform, user).map((d) => readdir(d).catch(() => [] as string[])));
  return lists.flat();
}

export type Run = (cmd: string, args: string[]) => Promise<string>;

const run: Run = (cmd, args) => new Promise((ok, fail) => {
  execFile(cmd, args, { timeout: 4000, windowsHide: true }, (err, stdout) => (err && !stdout ? fail(err) : ok(stdout)));
});

/** Windows' present USB devices (Get-PnpDevice): those with a driver and those without; none if it can't be read. */
export async function listUsbWindows(exec: Run = run): Promise<UsbDevice[]> {
  const cmd = "Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -like 'USB\\VID_*' } | Select-Object InstanceId,Status,FriendlyName,Problem | ConvertTo-Json -Compress";
  try {
    return parsePnp(await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd]));
  } catch {
    return [];
  }
}
