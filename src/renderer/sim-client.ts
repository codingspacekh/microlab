import type { BoardId } from '@lib/boards';
import { boardData } from '@lib/editor';
import { toCircuit, type Project, type ProjectDoc } from '@lib/project';
import type { PartView } from '../sim/circuit';
import { Control } from '../sim/control';
import type { RunResult, SimBoard } from '../sim/run';
import type { StartMessage, WorkerMessage } from '../sim/worker-core';

/**
 * The window's side of a run (architecture §2.2, §2.3; F-22): a fresh simulation worker per run, started with the
 * board, the project's files, its circuit and the file to run; the shared Control buffer for Stop and live inputs
 * (a button pressed); the worker's messages passed on. Stop asks through the buffer; a program that still runs
 * 300 ms later has its worker ended (N-03).
 */
export interface WorkerLike {
  postMessage(m: StartMessage): void;
  terminate(): void;
  onmessage: ((e: MessageEvent<WorkerMessage>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
}

export interface RunEvents {
  onOutput: (text: string) => void;
  onParts: (states: Record<string, PartView>) => void;
  onBoard: (outputs: { pins: Record<string, number>; display?: string; sound?: number }) => void;
  onEnd: (result: RunResult) => void;
}

export interface RunHandle {
  stop(): void;
  setInput(name: string, value: number): void;
}

export const STOP_GRACE_MS = 300;

/** The live input each kind of part takes: a push button is pressed or not, a knob has a position (0–1), a slide
 *  switch is at 0 or 1 (M6.1), a light sensor has the light on it in lux; a PIR sees motion or not, a line sensor is
 *  over white (0) or the line (1), a soil sensor's moisture is 0–1, a temperature sensor has °C (M6.3). */
const SLOT: Record<string, string[]> = {
  button: ['pressed'], potentiometer: ['position'], 'slide-switch': ['position'], ldr: ['lux'],
  pir: ['pressed'], 'line-sensor': ['position'], 'soil-moisture': ['position'], 'temp-sensor': ['celsius'],
  dht: ['celsius', 'humidity'], 'hc-sr04': ['cm'],   // M6.4: a DHT's air, how far an HC-SR04's object is
  mpu6050: ['tiltx', 'tilty'],                        // M6.4b: its tilt
  // M6.5a, the SunFounder kit's modules
  'button-module': ['pressed'], 'ldr-module': ['lux'], 'pot-module': ['position'], touch: ['pressed'], vibration: ['pressed'],
  'ir-obstacle': ['position'], hall: ['position'], 'water-level': ['position'], flame: ['position'], raindrop: ['position'], mq2: ['position'],
  joystick: ['x', 'y', 'pressed'], 'rotary-encoder': ['steps', 'pressed'], 'speed-sensor': ['rpm'],
  bmp280: ['celsius', 'hpa'], ds18b20: ['celsius'],                          // M6.5b: the air (the PCF8591 reads the circuit)
};

export function inputSlots(project: Project): string[] {
  return project.parts.flatMap((p) => (SLOT[p.type] ?? []).map((kind) => `${kind}:${p.id}`));
}

const newWorker = (): WorkerLike => new Worker(new URL('../sim/worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;

export function startRun(req: { doc: ProjectDoc; entry: string }, events: RunEvents, makeWorker: () => WorkerLike = newWorker): RunHandle {
  const { project, files } = req.doc;
  const inputs = inputSlots(project);
  const control = new Control(inputs);
  const worker = makeWorker();
  let ended = false;
  let killer: ReturnType<typeof setTimeout> | undefined;

  const end = (result: RunResult) => {
    if (ended) return;
    ended = true;
    clearTimeout(killer);
    worker.terminate();
    events.onEnd(result);
  };

  worker.onmessage = (e) => {
    const m = e.data;
    if (ended) return;
    if (m.type === 'output') events.onOutput(m.text);
    else if (m.type === 'parts') events.onParts(m.states);
    else if (m.type === 'board') events.onBoard({ pins: m.pins, ...(m.display !== undefined ? { display: m.display } : {}), ...(m.sound !== undefined ? { sound: m.sound } : {}) });
    else end(m.result);
  };
  worker.onerror = (e) => end({ ...emptyResult('error'), error: { type: 'Error', message: `The simulator couldn't start: ${e.message}` } });

  worker.postMessage({
    type: 'start',
    board: project.board as SimBoard,
    files,
    entry: req.entry,
    control: control.buffer,
    inputs,
    circuit: toCircuit(project, boardData(project.board as BoardId)),
  });

  return {
    stop() {
      if (ended) return;
      control.stop();
      killer ??= setTimeout(() => end(emptyResult('stopped')), STOP_GRACE_MS);
    },
    setInput(name, value) {
      if (!ended) control.setInput(name, value);
    },
  };
}

function emptyResult(ended: RunResult['ended']): RunResult {
  return { output: '', trace: [], pwm: [], analog: [], display: [], sound: [], bus: [], parts: [], faults: [], ended };
}
