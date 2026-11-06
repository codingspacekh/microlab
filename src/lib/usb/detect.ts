import type { BoardId } from '../boards';

/**
 * Which boards a USB port list means (F-55, §1.13, N-12): every USB device reports a vendor and a product ID; the
 * ones MicroLab knows are the Pico's own (MicroPython), the micro:bit's interface chip and the USB-serial chips of
 * ESP32 boards. Pure, so it is tested with port lists recorded on real laptops (tests/fixtures/usb). Asking the
 * board itself — its MicroPython version, Pico or Pico W — is the next step (the raw REPL, M10.2).
 */
export interface PortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  vendorId?: string;
  productId?: string;
  pnpId?: string;
  locationId?: string;
  friendlyName?: string;
}

/** What the USB IDs say; a Pico can be a Pico W, a micro:bit a V1, until the board answers. */
export type BoardKind = 'pico' | 'microbit' | 'esp32';
export type UsbChip = 'CP210x' | 'CH340' | 'CH9102';

export interface FoundBoard {
  /** Its serial number when it has one — the same board keeps it on another port — else its port. */
  id: string;
  kind: BoardKind;
  /** The port to open: on macOS the /dev/cu.* twin of /dev/tty.* (tty waits for a carrier these boards never give). */
  port: string;
  /** 'vid:pid', lower case. */
  usb: string;
  chip?: UsbChip;
}

/** Drives a board shows: a Pico held in BOOTSEL (no program runs), a micro:bit's own (always there). */
export interface BoardDrive {
  kind: 'pico-bootsel' | 'microbit';
  volume: string;
}

export interface Detection {
  boards: FoundBoard[];
  drives: BoardDrive[];
}

const KNOWN: Record<string, { kind: BoardKind; chip?: UsbChip }> = {
  '2e8a:0005': { kind: 'pico' },                       // Raspberry Pi Pico / Pico W running MicroPython
  '0d28:0204': { kind: 'microbit' },                   // the micro:bit's interface chip (DAPLink)
  '10c4:ea60': { kind: 'esp32', chip: 'CP210x' },
  '1a86:7523': { kind: 'esp32', chip: 'CH340' },
  '1a86:55d4': { kind: 'esp32', chip: 'CH9102' },
};

const DRIVES: Record<string, BoardDrive['kind']> = { 'RPI-RP2': 'pico-bootsel', MICROBIT: 'microbit' };

export function detect(ports: PortInfo[], volumes: string[], platform: string): Detection {
  const boards: FoundBoard[] = [];
  for (const p of ports) {
    if (!p.vendorId || !p.productId) continue;
    const usb = `${p.vendorId}:${p.productId}`.toLowerCase();
    const known = KNOWN[usb];
    if (!known) continue;
    const port = platform === 'darwin' ? p.path.replace(/^\/dev\/tty\./, '/dev/cu.') : p.path;
    boards.push({ id: p.serialNumber || p.path, kind: known.kind, port, usb, ...(known.chip ? { chip: known.chip } : {}) });
  }
  boards.sort((a, b) => a.port.localeCompare(b.port, 'en', { numeric: true }));
  const drives = volumes.filter((v) => DRIVES[v]).map((v) => ({ kind: DRIVES[v]!, volume: v }));
  return { boards, drives };
}

/** Boards plugged in and unplugged between two looks; the same board (its id) on another port is neither. */
export function plugChanges(before: Detection, after: Detection): { plugged: FoundBoard[]; unplugged: FoundBoard[] } {
  const was = new Set(before.boards.map((b) => b.id));
  const now = new Set(after.boards.map((b) => b.id));
  return { plugged: after.boards.filter((b) => !was.has(b.id)), unplugged: before.boards.filter((b) => !now.has(b.id)) };
}

/** The kind of board a project needs. */
export function kindOf(board: BoardId): BoardKind {
  return board === 'pico-w' ? 'pico' : board === 'microbit-v2' ? 'microbit' : 'esp32';
}

/** What the board chip says (screens 13, 13b) — the states USB alone can tell; asking the board adds the rest. */
export type ChipState =
  | { kind: 'none' }
  | { kind: 'bootsel'; volume: string }
  | { kind: 'ready'; board: FoundBoard; others?: number }
  | { kind: 'wrong'; board: FoundBoard; want: BoardKind; others?: number };

/** `chosen`: the board picked last (its id), if it is still there. */
export function chipState(d: Detection, project: BoardId | undefined, chosen?: string): ChipState {
  if (d.boards.length === 0) {
    const bootsel = d.drives.find((x) => x.kind === 'pico-bootsel');
    return bootsel ? { kind: 'bootsel', volume: bootsel.volume } : { kind: 'none' };
  }
  const want = project ? kindOf(project) : undefined;
  const board = d.boards.find((b) => b.id === chosen) ?? d.boards.find((b) => !want || b.kind === want) ?? d.boards[0]!;
  const others = d.boards.length > 1 ? { others: d.boards.length - 1 } : {};
  return !want || board.kind === want ? { kind: 'ready', board, ...others } : { kind: 'wrong', board, want, ...others };
}
