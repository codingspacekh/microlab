import type { CircuitSpec, Fault, SimState } from '@lib/circuit';
import type { Wave } from './soundfx';
import type { PartView } from './circuit';
import { RealClock } from './clock';
import { Control } from './control';
import { runProject, type ProjectFiles, type RunResult, type SimBoard, type SimError } from './run';
import type { LoadMicroPython } from './vm';

/** What the window sends before a run (architecture §2.2: postMessage before a run only). */
export interface StartMessage {
  type: 'start';
  board?: SimBoard;
  files: ProjectFiles;
  /** The Control buffer (Stop, wake, input slots), shared with the window. */
  control: SharedArrayBuffer;
  /** The input slot names, in buffer order: 'level:14', 'volts:26', 'touch:4', 'pressed:btn1'. */
  inputs: string[];
  /** The circuit the board is in (M3). */
  circuit?: CircuitSpec;
  /** The file to run (M4.5, Q19); main.py if not given. */
  entry?: string;
  /** The REPL after the program (M9, F-23): the worker goes on, taking lines typed, until Stop. */
  repl?: boolean;
}

/** What the worker sends back: console text at most ~60 times a second, and the end of the run. */
export type WorkerMessage =
  | { type: 'output'; text: string; echo?: boolean }
  /** The latest state of every part that changed since the last message. */
  | { type: 'parts'; states: Record<string, PartView> }
  /** The board's own outputs that changed (M4.5): pin levels ('LED' is the Pico W's own LED), the display, the
   *  micro:bit speaker's pitch (Hz, 0: silence; M6.2), its volume (0–1) and waveform (M7 slice 4). */
  | { type: 'board'; pins: Record<string, number>; display?: string; sound?: number; tone?: Tone; radio?: string[]; state?: SimState }
  /** A fault first seen (M9 slice 2), warnings too, with its time: after what came before it. */
  | { type: 'fault'; fault: Fault }
  /** The program has ended and the REPL is ready (M9, F-23): the worker goes on until Stop. */
  | { type: 'ended'; result: RunResult }
  /** An error in a line typed at the REPL (M9). */
  | { type: 'repl-error'; error: SimError }
  | { type: 'end'; result: RunResult };


/** The speaker's volume (0–1, with set_volume) and waveform (M7 slice 4). */
export interface Tone { volume: number; wave: Wave }
const FRAME_MS = 1000 / 60;

export async function handleStart(
  msg: StartMessage,
  post: (m: WorkerMessage) => void,
  load: LoadMicroPython,
  now: () => number = () => performance.now(),
): Promise<void> {
  const control = new Control(msg.inputs, msg.control);
  let pending = '';
  let parts: Record<string, PartView> = {};
  let pins: Record<string, number> = {};
  let display: string | undefined;
  let sound: number | undefined;
  let tone: Tone | undefined;
  let radio: string[] = [];
  let state: SimState | undefined;
  let last = -Infinity;
  const flush = () => {
    if (pending) post({ type: 'output', text: pending });
    if (Object.keys(parts).length) post({ type: 'parts', states: parts });
    if (Object.keys(pins).length || display !== undefined || sound !== undefined || radio.length || state) {
      post({ type: 'board', pins, ...(display !== undefined ? { display } : {}), ...(sound !== undefined ? { sound, ...(tone ? { tone } : {}) } : {}), ...(radio.length ? { radio } : {}), ...(state ? { state } : {}) });
    }
    state = undefined;
    pending = '';
    parts = {};
    pins = {};
    display = undefined;
    radio = [];
    sound = undefined;
    tone = undefined;
    last = now();
  };
  const maybeFlush = () => {
    if (now() - last >= FRAME_MS) flush();
  };
  const result = await runProject(load, {
    board: msg.board,
    files: msg.files,
    entry: msg.entry,
    circuit: msg.circuit,
    control,
    // the window draws each change as it comes: no record of them all (M11.5 — a fast loop filled the memory)
    record: false,
    // a sleep sends what is waiting once a frame has passed: a note (an LED) set just after a send is shown while the
    // program sleeps, not only at its next change
    clock: new RealClock({ wait: (ms) => { maybeFlush(); control.wait(ms); } }),
    onOutput: (text, echo) => {
      if (echo) {
        flush();
        post({ type: 'output', text, echo });
        return;
      }
      pending += text;
      maybeFlush();
    },
    repl: !!msg.repl,
    onProgramEnd: (result) => {
      flush();
      post({ type: 'ended', result });
    },
    onReplError: (error) => {
      flush();
      post({ type: 'repl-error', error });
    },
    onState: (s) => {
      state = s;
      maybeFlush();
    },
    onFault: (fault) => {
      flush();
      post({ type: 'fault', fault });
    },
    onParts: ([, id, view]) => {
      parts[id] = view;
      maybeFlush();
    },
    onPin: (pin, level) => {
      pins[pin] = level;
      maybeFlush();
    },
    onDisplay: (pixels) => {
      display = pixels;
      maybeFlush();
    },
    onSound: (hz, volume, wave) => {
      sound = hz;
      tone = { volume, wave };
      maybeFlush();
    },
    onRadio: (hex) => {
      radio.push(hex);
      maybeFlush();
    },
  });
  flush();
  post({ type: 'end', result });
}
