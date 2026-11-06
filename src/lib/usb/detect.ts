import type { BoardId } from '../boards';
import type { ConsoleState } from '../repl/console';
import { boardFits, modelOf, type ModelInfo, type Uname } from '../repl/greeting';

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

/** A device on USB as Windows' device list has it (Get-PnpDevice): its IDs, whether it works, its name. */
export interface UsbDevice {
  usb: string;
  ok: boolean;
  name?: string;
}

/** A known board's USB chip that is on USB but has no serial port: its driver is missing (R5, mostly Windows). */
export interface NoDriver {
  usb: string;
  chip: UsbChip;
  name?: string;
}

export interface Detection {
  boards: FoundBoard[];
  drives: BoardDrive[];
  noDriver?: NoDriver[];
  /** What each board (by id) said when it was asked (M10.2); none until it is asked. */
  checks?: Record<string, BoardCheck>;
  /** The boards whose console is open (M10.4), and whether each is at its >>> prompt or running something. */
  consoles?: Record<string, ConsoleState>;
}

/** The answer to asking a board (F-55, R10): its MicroPython and name, or why it couldn't be asked. */
export type BoardCheck =
  | { state: 'checking' }
  | { state: 'micropython'; uname?: Uname }
  | { state: 'sending'; done: number; total: number; uname?: Uname }
  | { state: 'no-micropython'; seen: string }
  | { state: 'busy'; by?: string }
  | { state: 'cant-open'; message: string };

const KNOWN: Record<string, { kind: BoardKind; chip?: UsbChip }> = {
  '2e8a:0005': { kind: 'pico' },                       // Raspberry Pi Pico / Pico W running MicroPython
  '0d28:0204': { kind: 'microbit' },                   // the micro:bit's interface chip (DAPLink)
  '10c4:ea60': { kind: 'esp32', chip: 'CP210x' },
  '1a86:7523': { kind: 'esp32', chip: 'CH340' },
  '1a86:55d4': { kind: 'esp32', chip: 'CH9102' },
};

const DRIVES: Record<string, BoardDrive['kind']> = { 'RPI-RP2': 'pico-bootsel', MICROBIT: 'microbit' };

/** Windows' device list (`Get-PnpDevice … | ConvertTo-Json`), the USB devices in it; nothing when it can't be read. */
export function parsePnp(json: string): UsbDevice[] {
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { return []; }
  const list = (Array.isArray(raw) ? raw : raw ? [raw] : []) as { InstanceId?: string; Status?: string; FriendlyName?: string | null }[];
  const out: UsbDevice[] = [];
  for (const d of list) {
    const m = /^USB\\VID_([0-9A-F]{4})&PID_([0-9A-F]{4})/i.exec(d.InstanceId ?? '');
    if (!m) continue;
    const usb = `${m[1]}:${m[2]}`.toLowerCase();
    if (out.some((x) => x.usb === usb)) continue;
    out.push({ usb, ok: d.Status === 'OK', ...(d.FriendlyName ? { name: d.FriendlyName } : {}) });
  }
  return out;
}

/** `usb`: the device list where the system gives one (Windows), to find a board's chip with no driver. */
export function detect(ports: PortInfo[], volumes: string[], platform: string, usb?: UsbDevice[]): Detection {
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
  const portUsb = new Set(ports.filter((p) => p.vendorId && p.productId).map((p) => `${p.vendorId}:${p.productId}`.toLowerCase()));
  const noDriver = (usb ?? []).filter((d) => KNOWN[d.usb]?.chip && !portUsb.has(d.usb))
    .map((d) => ({ usb: d.usb, chip: KNOWN[d.usb]!.chip!, ...(d.name ? { name: d.name } : {}) }));
  return noDriver.length ? { boards, drives, noDriver } : { boards, drives };
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

/** What the board chip says (screens 13, 13b). */
type On = { board: FoundBoard; others?: number };
export type ChipState =
  | { kind: 'none' }
  | { kind: 'bootsel'; volume: string }
  | { kind: 'no-driver'; chip: UsbChip; usb: string }
  | ({ kind: 'checking' } & On)
  | ({ kind: 'sending'; done: number; total: number; uname?: Uname; model?: ModelInfo } & On)
  | ({ kind: 'ready'; uname?: Uname; model?: ModelInfo } & On)
  | ({ kind: 'wrong'; want: BoardKind; uname?: Uname; model?: ModelInfo } & On)
  | ({ kind: 'busy'; by?: string } & On)
  | ({ kind: 'no-micropython' } & On)
  | ({ kind: 'cant-open'; message: string } & On);

/** Whether a board fits the project: by its answer once it gave one, else by its USB IDs. */
function fits(b: FoundBoard, check: BoardCheck | undefined, project: BoardId): boolean {
  if ((check?.state === 'micropython' || check?.state === 'sending') && check.uname) return boardFits(modelOf(check.uname).model, project);
  return b.kind === kindOf(project);
}

/** `chosen`: the board picked last (its id), if it is still there. */
export function chipState(d: Detection, project: BoardId | undefined, chosen?: string): ChipState {
  if (d.boards.length === 0) {
    const bootsel = d.drives.find((x) => x.kind === 'pico-bootsel');
    if (bootsel) return { kind: 'bootsel', volume: bootsel.volume };
    const nd = d.noDriver?.[0];
    return nd ? { kind: 'no-driver', chip: nd.chip, usb: nd.usb } : { kind: 'none' };
  }
  const checks = d.checks ?? {};
  const board = d.boards.find((b) => b.id === chosen)
    ?? (project && d.boards.find((b) => checks[b.id]?.state === 'micropython' && fits(b, checks[b.id], project)))
    ?? d.boards.find((b) => !project || fits(b, checks[b.id], project))
    ?? d.boards[0]!;
  const on = { board, ...(d.boards.length > 1 ? { others: d.boards.length - 1 } : {}) };
  const check = checks[board.id];
  if (check?.state === 'checking') return { kind: 'checking', ...on };
  if (check?.state === 'sending') {
    return { kind: 'sending', ...on, done: check.done, total: check.total, ...(check.uname ? { uname: check.uname, model: modelOf(check.uname) } : {}) };
  }
  if (check?.state === 'busy') return { kind: 'busy', ...on, ...(check.by ? { by: check.by } : {}) };
  if (check?.state === 'no-micropython') return { kind: 'no-micropython', ...on };
  if (check?.state === 'cant-open') return { kind: 'cant-open', ...on, message: check.message };
  const answer = check?.state === 'micropython' && check.uname ? { uname: check.uname, model: modelOf(check.uname) } : {};
  return !project || fits(board, check, project)
    ? { kind: 'ready', ...on, ...answer }
    : { kind: 'wrong', ...on, want: kindOf(project), ...answer };
}
