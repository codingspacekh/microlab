import type { BoardId } from '@lib/boards';
import type { Fault, SimState } from '@lib/circuit';
import { boardData } from '@lib/editor';
import { toCircuit, type Project, type ProjectDoc } from '@lib/project';
import type { PartView } from '../sim/circuit';
import type { Tone } from '../sim/worker-core';
import { Control } from '../sim/control';
import type { RunResult, SimBoard, SimError } from '../sim/run';
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
  /** `echo`: what the student typed, as the board echoes it (M9). */
  onOutput: (text: string, echo?: boolean) => void;
  onParts: (states: Record<string, PartView>) => void;
  onBoard: (outputs: { pins: Record<string, number>; display?: string; sound?: number; tone?: Tone; radio?: string[]; state?: SimState }) => void;
  /** The program ended: by itself, with an error, by Ctrl+C — the REPL follows when `result.repl` — or by Stop. */
  onEnd: (result: RunResult) => void;
  /** An error in a line typed at the REPL (M9). */
  onReplError?: (error: SimError) => void;
  /** A fault first seen while running (M9 slice 2): the cards and Problems. */
  onFault?: (fault: Fault) => void;
}

export interface RunHandle {
  /** Stops the program; at the REPL, ends the session. */
  stop(): void;
  setInput(name: string, value: number): void;
  /** What the student typed in the console (M9): a line ends with '\n'; '\x03' is Ctrl+C. */
  type?(text: string): void;
  /** Ends the worker at once, telling nothing more (the REPL left for a new run, another project). */
  close?(): void;
}

export const STOP_GRACE_MS = 300;

/** The live input each kind of part takes: a push button is pressed or not, a knob has a position (0–1), a slide
 *  switch is at 0 or 1 (M6.1), a light sensor has the light on it in lux; a PIR sees motion or not, a line sensor is
 *  over white (0) or the line (1), a soil sensor's moisture is 0–1, a temperature sensor has °C (M6.3). */
const TEXT_SLOTS = ['txseq', 'txlen', ...Array.from({ length: 64 }, (_, i) => `tx${i}`)];
const SLOT: Record<string, string[]> = {
  button: ['pressed'], potentiometer: ['position'], 'slide-switch': ['position'], ldr: ['lux'],
  pir: ['pressed'], 'line-sensor': ['position'], 'soil-moisture': ['position'], 'temp-sensor': ['celsius'],
  dht: ['celsius', 'humidity'], 'hc-sr04': ['cm'],   // M6.4: a DHT's air, how far an HC-SR04's object is
  mpu6050: ['tiltx', 'tilty'],                        // M6.4b: its tilt
  // M6.5a, the SunFounder kit's modules
  'button-module': ['pressed'], 'ldr-module': ['lux'], 'pot-module': ['position'], touch: ['pressed'], vibration: ['pressed'],
  'ir-obstacle': ['position'], hall: ['position'], 'water-level': ['position'], flame: ['position'], raindrop: ['position'], mq2: ['position'],
  joystick: ['x', 'y', 'pressed'], 'rotary-encoder': ['steps', 'pressed'], 'speed-sensor': ['rpm'],
  bmp280: ['celsius', 'hpa'], ds18b20: ['celsius'], vl53l0x: ['cm'], max30102: ['bpm', 'spo2', 'position'],
  rc522: ['position'],
  // M7 slice 5: what a terminal or a phone sends (a count, how many bytes, the bytes); a phone connected; a GPS's place
  'usb-serial': [...TEXT_SLOTS, 'baud'], hc05: [...TEXT_SLOTS, 'connected'], gps: ['fix', 'lat', 'lon', 'sats', 'kmh'],   // M7: the tag held to the RFID reader (0 none, 1 the card, 2 the key fob)                          // M6.5b: the air (the PCF8591 reads the circuit)
};

/** The micro:bit's own inputs (M6.6, screen 06): buttons A and B, the touch logo, its tilt (mg), a shake (a count),
 *  its temperature, light level and sound level. */
export const MICROBIT_SLOTS = ['pressed:board.A', 'pressed:board.B', 'touch:LOGO', 'board:accelx', 'board:accely', 'board:accelz', 'board:shake', 'board:celsius', 'board:light', 'board:sound',
  // M7: a message from another micro:bit — its bytes, how many, and a count of the messages sent
  'radio:seq', 'radio:len', ...Array.from({ length: 32 }, (_, i) => `radio:${i}`)];

export function inputSlots(project: Project): string[] {
  const own = project.board === 'microbit-v2' ? MICROBIT_SLOTS : [];
  return [...own, ...project.parts.flatMap((p) => (SLOT[p.type] ?? []).map((kind) => `${kind}:${p.id}`))];
}

const newWorker = (): WorkerLike => new Worker(new URL('../sim/worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;

export function startRun(req: { doc: ProjectDoc; entry: string; burnt?: string[] }, events: RunEvents, makeWorker: () => WorkerLike = newWorker): RunHandle {
  const { project, files } = req.doc;
  const inputs = inputSlots(project);
  const control = new Control(inputs);
  const worker = makeWorker();
  let ended = false;    // the program's end told
  let closed = false;   // the worker gone
  let killer: ReturnType<typeof setTimeout> | undefined;

  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(killer);
    worker.terminate();
  };
  const end = (result: RunResult) => {
    if (closed) return;
    close();
    if (!ended) {
      ended = true;
      events.onEnd(result);
    }
  };

  worker.onmessage = (e) => {
    const m = e.data;
    if (closed) return;
    if (m.type === 'output') {
      if (m.echo) events.onOutput(m.text, true);
      else events.onOutput(m.text);
    }
    else if (m.type === 'parts') events.onParts(m.states);
    else if (m.type === 'board') events.onBoard({ pins: m.pins, ...(m.display !== undefined ? { display: m.display } : {}), ...(m.sound !== undefined ? { sound: m.sound, ...(m.tone ? { tone: m.tone } : {}) } : {}), ...(m.radio ? { radio: m.radio } : {}), ...(m.state ? { state: m.state } : {}) });
    else if (m.type === 'ended') {
      // M9: the program has ended; the worker goes on with the REPL
      ended = true;
      events.onEnd(m.result);
    } else if (m.type === 'repl-error') events.onReplError?.(m.error);
    else if (m.type === 'fault') events.onFault?.(m.fault);
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
    circuit: { ...toCircuit(project, boardData(project.board as BoardId)), ...(req.burnt?.length ? { burnt: req.burnt } : {}) },
    repl: true,
  });

  return {
    stop() {
      if (closed) return;
      if (ended) { close(); return; }   // at the REPL: nothing runs to stop
      control.stop();
      killer ??= setTimeout(() => end(emptyResult('stopped')), STOP_GRACE_MS);
    },
    setInput(name, value) {
      if (!closed) control.setInput(name, value);
    },
    type(text) {
      if (!closed) control.type(text);
    },
    close,
  };
}

function emptyResult(ended: RunResult['ended']): RunResult {
  return { output: '', trace: [], pwm: [], analog: [], display: [], sound: [], bus: [], radio: [], parts: [], faults: [], ended };
}
