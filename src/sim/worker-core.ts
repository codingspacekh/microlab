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
  /** The input slot names, in buffer order: 'level:14', 'volts:26', 'touch:4'. */
  inputs: string[];
}

/** What the worker sends back: console text at most ~60 times a second, and the end of the run. */
export type WorkerMessage = { type: 'output'; text: string } | { type: 'end'; result: RunResult };

const FRAME_MS = 1000 / 60;

export async function handleStart(
  msg: StartMessage,
  post: (m: WorkerMessage) => void,
  load: LoadMicroPython,
  now: () => number = () => performance.now(),
): Promise<void> {
  const control = new Control(msg.inputs, msg.control);
  let pending = '';
  let last = -Infinity;
  const flush = () => {
    if (!pending) return;
    post({ type: 'output', text: pending });
    pending = '';
    last = now();
  };
  const result = await runProject(load, {
    board: msg.board,
    files: msg.files,
    control,
    clock: new RealClock({ wait: (ms) => control.wait(ms) }),
    onOutput: (text) => {
      pending += text;
      if (now() - last >= FRAME_MS) flush();
    },
  });
  flush();
  post({ type: 'end', result });
}
