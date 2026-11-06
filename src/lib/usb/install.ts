import type { BoardKind, Detection } from './detect';

/**
 * Installing MicroPython (F-52, screen 14b): which way it gets on a board now, and what the install tells as it goes.
 * The install itself is the main process's (src/main/firmware.ts).
 */
export type InstallStepId = 'bootsel' | 'save' | 'copy' | 'restart' | 'answer' | 'restore';

export interface InstallStep {
  step: InstallStepId;
  /** now: under way; wait: the student is to do something; progress: bytes copied; done; skip. */
  state: 'now' | 'wait' | 'progress' | 'done' | 'skip';
  done?: number;
  total?: number;
}

export type InstallResult =
  | { ok: true; version: string; restored?: number; keptIn?: string }
  | { ok: false; message: string; permission?: boolean; file?: string; cancelled?: boolean };

export type InstallRoute = 'copy' | 'bootloader' | 'press-bootsel' | 'no-drive' | 'guide';

const DRIVE: Partial<Record<BoardKind, string>> = { pico: 'RPI-RP2', microbit: 'MICROBIT' };

/** How MicroPython gets on this board now. */
export function installRoute(kind: BoardKind, d: Detection): InstallRoute {
  if (kind === 'esp32') return 'guide';
  const drive = DRIVE[kind]!;
  if (d.drives.some((x) => x.volume === drive)) return 'copy';
  if (kind === 'microbit') return 'no-drive';
  const pico = d.boards.find((b) => b.kind === 'pico');
  return pico && d.checks?.[pico.id]?.state === 'micropython' ? 'bootloader' : 'press-bootsel';
}

