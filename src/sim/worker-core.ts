import type { CircuitSpec } from '@lib/circuit';
import type { PartView } from './circuit';
import { RealClock } from './clock';
import { Control } from './control';
import { runProject, type ProjectFiles, type RunResult, type SimBoard } from './run';
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
}

/** What the worker sends back: console text at most ~60 times a second, and the end of the run. */
export type WorkerMessage =
  | { type: 'output'; text: string }
  /** The latest state of every part that changed since the last message. */
  | { type: 'parts'; states: Record<string, PartView> }
  /** The board's own outputs that changed (M4.5): pin levels ('LED' is the Pico W's own LED), the display, the
   *  micro:bit speaker's pitch (Hz, 0: silence; M6.2). */
  | { type: 'board'; pins: Record<string, number>; display?: string; sound?: number }
  | { type: 'end'; result: RunResult };

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
  let last = -Infinity;
  const flush = () => {
    if (pending) post({ type: 'output', text: pending });
    if (Object.keys(parts).length) post({ type: 'parts', states: parts });
    if (Object.keys(pins).length || display !== undefined || sound !== undefined) {
      post({ type: 'board', pins, ...(display !== undefined ? { display } : {}), ...(sound !== undefined ? { sound } : {}) });
    }
    pending = '';
    parts = {};
    pins = {};
    display = undefined;
    sound = undefined;
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
    // a sleep sends what is waiting once a frame has passed: a note (an LED) set just after a send is shown while the
    // program sleeps, not only at its next change
    clock: new RealClock({ wait: (ms) => { maybeFlush(); control.wait(ms); } }),
    onOutput: (text) => {
      pending += text;
      maybeFlush();
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
    onSound: (hz) => {
      sound = hz;
      maybeFlush();
    },
  });
  flush();
  post({ type: 'end', result });
}
