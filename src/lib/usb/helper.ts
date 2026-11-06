import { modelOf, shortVersion } from '../repl/greeting';
import type { BoardKind, Detection, UsbChip } from './detect';

/**
 * The connection helper (F-56, §1.13, screen 14): five steps — plugged in, seen by the laptop, a driver if it needs
 * one, free of other programs, running MicroPython — each decided from what the app sees and what the student
 * answers; the step that fails says what to do. Pure.
 */
export type StepId = 'plugged' | 'seen' | 'driver' | 'free' | 'micropython';
export type StepState = 'ok' | 'now' | 'later' | 'bad' | 'skip';

export interface HelperStep {
  id: StepId;
  title: string;
  note: string;
  state: StepState;
}

/** What the student said: plugged in at both ends; its power light on (micro:bit, ESP32); the BOOTSEL drive came (Pico). */
export interface HelperAnswers {
  plugged?: boolean;
  light?: boolean;
  bootsel?: boolean;
}

/** The question asked now, or what to do. */
export type HelperAsk =
  | { kind: 'plugged' }
  | { kind: 'bootsel-test' }
  | { kind: 'light' }
  | { kind: 'charge-only' }
  | { kind: 'no-power' }
  | { kind: 'bootsel-mode' }
  | { kind: 'wrong-board'; found: BoardKind }
  | { kind: 'driver'; chip: UsbChip; usb: string }
  | { kind: 'not-asked'; id: string }
  | { kind: 'checking' }
  | { kind: 'busy'; by?: string; id: string }
  | { kind: 'cant-open'; message: string; id: string }
  | { kind: 'no-micropython'; id: string }
  | { kind: 'ok'; version: string };

export interface HelperView {
  steps: HelperStep[];
  ask: HelperAsk;
}

/**
 * The official driver pages of the USB chips on ESP32 boards (R5). The installers themselves are to ship with the app
 * once their licences are checked (M11, N-11); until then the helper opens the maker's own page.
 */
export const DRIVER_PAGES: Record<UsbChip, string> = {
  CP210x: 'https://www.silabs.com/developer-tools/usb-to-uart-bridge-vcp-drivers',
  CH340: 'https://www.wch-ic.com/downloads/CH341SER_EXE.html',
  CH9102: 'https://www.wch-ic.com/downloads/CH343SER_EXE.html',
};

/** The board helped with, in sentences. */
export const HELPED: Record<BoardKind, string> = { pico: 'Pico W', microbit: 'micro:bit', esp32: 'ESP32' };

const TITLES: Record<StepId, string> = {
  plugged: 'Plugged in at both ends',
  seen: 'The laptop sees the board',
  driver: 'A driver, if it needs one',
  free: 'No other program has it',
  micropython: 'It runs MicroPython',
};
const NOTES: Record<StepId, string> = {
  plugged: 'the cable, at the board and at the laptop',
  seen: 'nothing new on USB yet',
  driver: 'only ESP32 boards on Windows',
  free: 'Thonny, Arduino IDE, mu',
  micropython: 'it answers with its version',
};
const ORDER: StepId[] = ['plugged', 'seen', 'driver', 'free', 'micropython'];

export function helperView(kind: BoardKind, d: Detection, answers: HelperAnswers, chosen?: string): HelperView {
  const set: Partial<Record<StepId, { state: StepState; note?: string }>> = {};
  const view = (ask: HelperAsk): HelperView => {
    let reached = false;
    const steps = ORDER.map((id) => {
      const s = set[id];
      if (s) { if (s.state === 'now' || s.state === 'bad') reached = true; return { id, title: TITLES[id], note: s.note ?? NOTES[id], state: s.state }; }
      // the first step not decided yet is the one now, unless one before it is already wrong or asked
      const state: StepState = reached ? 'later' : 'now';
      reached = true;
      return { id, title: TITLES[id], note: NOTES[id], state };
    });
    return { steps, ask };
  };
  const noDriverNeeded = { state: 'skip' as const, note: `not needed for a ${HELPED[kind]}` };

  const board = d.boards.find((b) => b.id === chosen && b.kind === kind) ?? d.boards.find((b) => b.kind === kind);
  if (board) {
    set.plugged = { state: 'ok', note: 'it is on USB' };
    set.seen = { state: 'ok', note: `on ${board.port}` };
    set.driver = kind === 'esp32' ? { state: 'ok', note: `its ${board.chip ?? 'USB'} driver works` } : noDriverNeeded;
    const c = d.checks?.[board.id];
    if (!c) return view({ kind: 'not-asked', id: board.id });
    if (c.state === 'checking') { set.free = { state: 'now', note: 'asking the board…' }; return view({ kind: 'checking' }); }
    if (c.state === 'busy') { set.free = { state: 'bad', note: `used by ${c.by ?? 'another program'}` }; return view({ kind: 'busy', ...(c.by ? { by: c.by } : {}), id: board.id }); }
    if (c.state === 'cant-open') { set.free = { state: 'bad', note: "the port won't open" }; return view({ kind: 'cant-open', message: c.message, id: board.id }); }
    set.free = { state: 'ok', note: 'MicroLab can talk to it' };
    if (c.state === 'no-micropython') { set.micropython = { state: 'bad', note: 'it gave no MicroPython answer' }; return view({ kind: 'no-micropython', id: board.id }); }
    const uname = c.uname;
    const version = uname ? shortVersion(uname) : 'MicroPython';
    set.micropython = { state: 'ok', note: uname ? `${version} on a ${modelOf(uname).short}` : version };
    return view({ kind: 'ok', version });
  }

  const bootsel = kind === 'pico' ? d.drives.find((x) => x.kind === 'pico-bootsel') : undefined;
  if (bootsel) {
    set.plugged = { state: 'ok', note: 'it is on USB' };
    set.seen = { state: 'ok', note: `its ${bootsel.volume} drive` };
    set.driver = noDriverNeeded;
    set.free = { state: 'skip', note: 'no program to stop' };
    set.micropython = { state: 'bad', note: 'BOOTSEL mode: it runs no program' };
    return view({ kind: 'bootsel-mode' });
  }
  const nd = kind === 'esp32' ? d.noDriver?.[0] : undefined;
  if (nd) {
    set.plugged = { state: 'ok', note: 'it is on USB' };
    set.seen = { state: 'ok', note: `its ${nd.chip} USB chip` };
    set.driver = { state: 'bad', note: `no driver for its ${nd.chip} chip` };
    return view({ kind: 'driver', chip: nd.chip, usb: nd.usb });
  }
  const other = d.boards[0];
  if (other) {
    set.plugged = { state: 'ok', note: 'a board is on USB' };
    set.seen = { state: 'now', note: `a ${HELPED[other.kind]} is plugged in instead` };
    return view({ kind: 'wrong-board', found: other.kind });
  }

  if (!answers.plugged) return view({ kind: 'plugged' });
  set.plugged = { state: 'ok', note: 'you said so' };
  if (kind === 'pico') {
    if (answers.bootsel === undefined) return view({ kind: 'bootsel-test' });
    if (!answers.bootsel) { set.seen = { state: 'bad', note: 'no RPI-RP2 drive: the cable only charges' }; return view({ kind: 'charge-only' }); }
    // the drive came (and went, if it was unplugged again): the cable is fine
    set.seen = { state: 'ok', note: 'its RPI-RP2 drive came' };
    set.driver = noDriverNeeded;
    set.free = { state: 'skip', note: 'no program to stop' };
    set.micropython = { state: 'now', note: 'start it normally, or install MicroPython' };
    return view({ kind: 'bootsel-mode' });
  }
  if (answers.light === undefined) return view({ kind: 'light' });
  if (!answers.light) { set.seen = { state: 'bad', note: 'its power light is off: no power' }; return view({ kind: 'no-power' }); }
  set.seen = { state: 'bad', note: 'powered, but no data: the cable only charges' };
  return view({ kind: 'charge-only' });
}

export interface ReportInput {
  at: Date;
  app: string;
  /** The system, as the window knows it (its user agent's platform part). */
  system: string;
  /** The project's board, in full. */
  project: string;
  kind: BoardKind;
  detection: Detection;
  answers: HelperAnswers;
}

const KIND_NAME: Record<BoardKind, string> = { pico: 'Pico', microbit: 'micro:bit', esp32: 'ESP32' };

/** The short report for the teacher (F-56): everything needed to see the problem at a glance. */
export function helperReport(r: ReportInput): string {
  const two = (n: number) => String(n).padStart(2, '0');
  const when = `${r.at.getFullYear()}-${two(r.at.getMonth() + 1)}-${two(r.at.getDate())} ${two(r.at.getHours())}:${two(r.at.getMinutes())}`;
  const d = r.detection;
  const state = (id: string): string => {
    const c = d.checks?.[id];
    if (!c) return 'not asked';
    if (c.state === 'micropython' || c.state === 'sending') return c.uname ? `MicroPython ${c.uname.release} (${c.uname.machine})` : 'MicroPython';
    if (c.state === 'busy') return `used by ${c.by ?? 'another program'}`;
    if (c.state === 'no-micropython') return 'no MicroPython answer';
    if (c.state === 'cant-open') return `can't open: ${c.message}`;
    return 'being asked';
  };
  const boards = d.boards.map((b) => `${KIND_NAME[b.kind]} ${b.usb} on ${b.port}${b.id !== b.port ? ` (serial ${b.id})` : ''} — ${state(b.id)}`);
  const noDriver = (d.noDriver ?? []).map((n) => `${n.chip} ${n.usb} with no driver`);
  const answers = [
    r.answers.plugged !== undefined ? `plugged in: ${r.answers.plugged ? 'yes' : 'no'}` : '',
    r.answers.light !== undefined ? `power light on: ${r.answers.light ? 'yes' : 'no'}` : '',
    r.answers.bootsel !== undefined ? `RPI-RP2 drive came: ${r.answers.bootsel ? 'yes' : 'no'}` : '',
  ].filter(Boolean);
  const mark: Record<StepState, string> = { ok: '✓', bad: '✗', now: '→', later: '…', skip: '–' };
  const v = helperView(r.kind, d, r.answers);
  return [
    `MicroLab connection report — ${when}`,
    `MicroLab ${r.app} · ${r.system}`,
    `Project board: ${r.project} · helping with: ${HELPED[r.kind]}`,
    `Boards on USB: ${[...boards, ...noDriver].join('; ') || 'none'}`,
    `Drives: ${d.drives.map((x) => x.volume).join(', ') || 'none'}`,
    `Answers: ${answers.join('; ') || 'none yet'}`,
    `Steps: ${v.steps.map((s) => `${mark[s.state]} ${s.title} (${s.note})`).join(' · ')}`,
  ].join('\n');
}
