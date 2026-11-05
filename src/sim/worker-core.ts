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
}

/** What the worker sends back: console text at most ~60 times a second, and the end of the run. */
export type WorkerMessage =
  | { type: 'output'; text: string }
  /** The latest state of every part that changed since the last message. */
  | { type: 'parts'; states: Record<string, PartView> }
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
  let last = -Infinity;
  const flush = () => {
    if (pending) post({ type: 'output', text: pending });
    if (Object.keys(parts).length) post({ type: 'parts', states: parts });
    pending = '';
    parts = {};
    last = now();
  };
  const maybeFlush = () => {
    if (now() - last >= FRAME_MS) flush();
  };
  const result = await runProject(load, {
    board: msg.board,
    files: msg.files,
    circuit: msg.circuit,
    control,
    clock: new RealClock({ wait: (ms) => control.wait(ms) }),
    onOutput: (text) => {
      pending += text;
      maybeFlush();
    },
    onParts: ([, id, view]) => {
      parts[id] = view;
      maybeFlush();
    },
  });
  flush();
  post({ type: 'end', result });
}
