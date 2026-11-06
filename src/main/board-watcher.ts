import { readdir } from 'node:fs/promises';
import { detect, plugChanges, type Detection, type PortInfo } from '@lib/usb';

/**
 * The port watcher (F-55, N-12, §1.13): the main process lists the USB serial ports and the mounted drives about once
 * a second and tells the window when the boards it means change — a board plugged in is named within 2 s, with no
 * setup. It only lists; it never opens a port (that is asking the board, M10.2), so Thonny can still use it.
 */
export interface WatcherDeps {
  listPorts: () => Promise<PortInfo[]>;
  listVolumes: () => Promise<string[]>;
  platform: string;
}

export type OnBoards = (now: Detection, changes: ReturnType<typeof plugChanges>) => void;

export const LOOK_MS = 1000;

export class BoardWatcher {
  current: Detection = { boards: [], drives: [] };
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;

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
      const [ports, volumes] = await Promise.all([this.deps.listPorts(), this.deps.listVolumes()]);
      if (!this.running) return;
      const next = detect(ports, volumes, this.deps.platform);
      if (JSON.stringify(next) !== JSON.stringify(this.current)) {
        const changes = plugChanges(this.current, next);
        this.current = next;
        this.onChange(next, changes);
      }
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
