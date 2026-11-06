import { installRoute, type BoardKind, type Detection, type FoundBoard, type InstallResult, type InstallStep, type InstallStepId } from '@lib/usb';

export { installRoute } from '@lib/usb';
export type { InstallResult, InstallStep } from '@lib/usb';

/**
 * Installing MicroPython from the app (F-52, Q18, screen 14b), offline — the firmware ships in library/firmware:
 *   a Pico: put in BOOTSEL (by MicroLab with machine.bootloader() when it runs MicroPython, else by the student
 *   holding the button), the .uf2 copied to its RPI-RP2 drive; the drive goes, the Pico comes back and answers;
 *   a micro:bit: its files copied to the laptop first (installing wipes them), the .hex copied to its MICROBIT
 *   drive; it restarts and answers; its files put back;
 *   an ESP32: a guide (it needs a flashing tool, not a drive).
 * The flow follows what is on USB through the watcher; its pieces are injected, so it is tested on a timeline.
 */
export interface Firmware {
  /** Where the file is on this laptop. */
  file: string;
  /** Its name, as copied to the drive. */
  name: string;
  size: number;
  /** The drive it goes to: RPI-RP2, MICROBIT. */
  drive: string;
  version: string;
}

export interface InstallDeps {
  /** What is on USB now (with what each board said). */
  now(): Detection;
  /** Resolves with what `pick` finds as USB changes; rejects after `ms` (or when cancelled). */
  waitFor<T>(pick: (d: Detection) => T | undefined, ms: number, signal?: AbortSignal): Promise<T>;
  /** Where a drive is mounted ("/Volumes/RPI-RP2", "E:\\"). */
  drivePath(name: string): Promise<string | undefined>;
  copy(src: string, dest: string, progress: (done: number) => void): Promise<void>;
  /** Asks a Pico running MicroPython to restart into BOOTSEL (machine.bootloader()). */
  bootloader(board: FoundBoard): Promise<void>;
  /** Asks a board what it is (as when plugged in). */
  check(board: FoundBoard): Promise<void>;
  /** A micro:bit's files, before installing wipes them. */
  readAll(board: FoundBoard): Promise<Record<string, Uint8Array> | null>;
  /** Keeps them on the laptop; where. */
  keep(files: Record<string, Uint8Array>): Promise<string>;
  /** Puts them back; how many. */
  restore(board: FoundBoard, files: Record<string, Uint8Array>): Promise<number>;
}

const has = (d: Detection, drive: string) => d.drives.some((x) => x.volume === drive);
const board = (d: Detection, kind: BoardKind) => d.boards.find((b) => b.kind === kind);

export async function installMicroPython(kind: 'pico' | 'microbit', fw: Firmware, deps: InstallDeps, onStep: (s: InstallStep) => void, signal?: AbortSignal): Promise<InstallResult> {
  const step = (s: InstallStepId, state: InstallStep['state'], more: Partial<InstallStep> = {}) => onStep({ step: s, state, ...more });
  const name = kind === 'pico' ? 'Pico W' : 'micro:bit';
  let phase = 'start';
  let wrote = false;
  try {
    // 0. A board never asked (plugged in before MicroLab started) is asked first: running MicroPython or not decides
    //    how a Pico gets to BOOTSEL — and whether a micro:bit has files to keep before they are wiped
    if (kind === 'microbit' && !has(deps.now(), fw.drive)) {
      return { ok: false, message: `The micro:bit's ${fw.drive} drive isn't there: plug the micro:bit in with a cable that carries data.` };
    }
    const there = board(deps.now(), kind);
    if (there && !deps.now().checks?.[there.id]) {
      phase = 'ask';
      await deps.check(there);
      await deps.waitFor((d) => {
        const c = d.checks?.[there.id];
        return c && c.state !== 'checking' ? c : undefined;
      }, 15_000, signal);
    }
    // 1. Ready to take the firmware: a Pico in BOOTSEL; a micro:bit's files kept first
    let saved: Record<string, Uint8Array> | null = null;
    let keptIn: string | undefined;
    if (kind === 'pico') {
      const route = installRoute('pico', deps.now());
      if (route === 'bootloader') {
        step('bootsel', 'now');
        await deps.bootloader(board(deps.now(), 'pico')!);
      } else if (route === 'press-bootsel') {
        step('bootsel', 'wait');
      }
      if (route !== 'copy') {
        phase = 'bootsel';
        await deps.waitFor((d) => (has(d, fw.drive) ? true : undefined), route === 'bootloader' ? 15_000 : 180_000, signal);
        step('bootsel', 'done');
      }
    } else {
      const mb = board(deps.now(), 'microbit');
      const said = mb ? deps.now().checks?.[mb.id] : undefined;
      // its files can't be read (another program has it, it can't be opened): installing would lose them
      if (said?.state === 'busy') return { ok: false, message: `The micro:bit is used by ${said.by ?? 'another program'}, so its files can't be kept first. Close it and try again. Nothing was installed.` };
      if (said?.state === 'cant-open') return { ok: false, message: "MicroLab can't talk to the micro:bit, so its files can't be kept first. Unplug it, plug it back in, and try again. Nothing was installed." };
      if (mb && said?.state === 'micropython') {
        step('save', 'now');
        phase = 'save';
        saved = await deps.readAll(mb);
        if (saved && Object.keys(saved).length) keptIn = await deps.keep(saved);
        step('save', 'done');
      } else {
        step('save', 'skip');
      }
    }
    if (signal?.aborted) throw new Error('aborted');

    // 2. The firmware to the drive
    phase = 'copy';
    const dir = await deps.drivePath(fw.drive);
    if (!dir) return { ok: false, message: `The ${fw.drive} drive went away before MicroPython could be copied. Try again.` };
    step('copy', 'now');
    const sep = dir.includes('\\') ? '\\' : '/';
    await deps.copy(fw.file, `${dir.replace(/[\\/]+$/, '')}${sep}${fw.name}`, (done) => step('copy', 'progress', { done, total: fw.size }));
    wrote = true;
    step('copy', 'done');

    // 3. It restarts with it: the Pico's drive goes away for good; the micro:bit's goes and comes back
    phase = 'restart';
    step('restart', 'now');
    if (kind === 'pico') {
      await deps.waitFor((d) => (!has(d, fw.drive) ? true : undefined), 30_000, signal);
      await deps.waitFor((d) => board(d, 'pico'), 30_000, signal);
    } else {
      await deps.waitFor((d) => (!has(d, fw.drive) ? true : undefined), 20_000, signal).catch(() => undefined);
      await deps.waitFor((d) => (has(d, fw.drive) && board(d, 'microbit') ? true : undefined), 60_000, signal);
    }
    step('restart', 'done');

    // 4. It answers with its version
    phase = 'answer';
    step('answer', 'now');
    const b = board(deps.now(), kind)!;
    const now = deps.now().checks?.[b.id];
    if (!now || now.state !== 'micropython') await deps.check(b);
    const answer = await deps.waitFor((d) => {
      const c = d.checks?.[b.id];
      return c && c.state !== 'checking' && c.state !== 'sending' ? c : undefined;
    }, 30_000, signal);
    if (answer.state !== 'micropython') {
      return { ok: false, message: `The ${name} restarted but didn't answer as MicroPython does. Unplug it, plug it back in, and try again.` };
    }
    step('answer', 'done');
    const version = answer.uname?.release ?? fw.version.replace(/^v/, '');

    // 5. A micro:bit's files back
    if (saved && Object.keys(saved).length) {
      phase = 'restore';
      step('restore', 'now');
      const restored = await deps.restore(b, saved);
      step('restore', 'done');
      return { ok: true, version, restored, ...(keptIn ? { keptIn } : {}) };
    }
    return { ok: true, version };
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (signal?.aborted) {
      return { ok: false, cancelled: true, message: wrote ? 'Cancelled — MicroPython was already copied; the board finishes installing by itself.' : 'Cancelled — nothing was written to the board.' };
    }
    if (phase === 'copy' && (err.code === 'EPERM' || err.code === 'EACCES')) {
      return {
        ok: false, permission: true, file: fw.file,
        message: `MicroLab may not write to the ${fw.drive} drive. On a Mac: allow MicroLab in System Settings › Privacy & Security › Files and Folders › Removable Volumes — or drag the file onto ${fw.drive} yourself.`,
      };
    }
    if (phase === 'bootsel') return { ok: false, message: `The ${fw.drive} drive didn't appear. Unplug the Pico W, hold its BOOTSEL button, plug it back in, then let go.` };
    if (phase === 'restart') return { ok: false, message: `The ${name} didn't come back after the copy. Unplug it, plug it back in, and look at the board chip.` };
    if (phase === 'answer') return { ok: false, message: `The ${name} restarted but didn't answer as MicroPython does. Unplug it, plug it back in, and try again.` };
    if (phase === 'ask') return { ok: false, message: `The ${name} didn't answer when asked. Unplug it, plug it back in, and try again. Nothing was installed.` };
    if (phase === 'save') return { ok: false, message: `The micro:bit's files couldn't be copied to this laptop (${err.message}). Nothing was installed.` };
    if (phase === 'restore') return { ok: false, message: `MicroPython is installed, but the micro:bit's files couldn't be put back: ${err.message}. They are kept on this laptop.` };
    return { ok: false, message: err.message };
  }
}
