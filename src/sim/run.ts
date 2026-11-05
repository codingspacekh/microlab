import { RealClock, type Clock } from './clock';
import { PinBank, RP2040_RESET, type AnalogEntry, type InputChange, type Level, type PinMode, type PinState, type Pull, type PwmEntry, type TraceEntry } from './pins';
import { TimerBank } from './timers';
import { Console, lineBeingRun, startMicroPython, type LoadMicroPython, type MicroPython, type Where } from './vm';

/**
 * The sim core without a worker (M2.1): a fresh MicroPython, the project's files in its file system, boot.py then
 * main.py, the console, and the error with its file and line (F-21, F-30). The worker (M2.8) wraps this.
 */

/** The project's files by path from the board's root: 'main.py', 'lib/ssd1306.py', 'data/levels.txt'. */
export type ProjectFiles = Record<string, string | Uint8Array>;

export interface SimError {
  /** NameError, OSError, SyntaxError, or the student's own exception class. */
  type: string;
  /** As printed after "Type: " ("name 'y' isn't defined", "[Errno 19] ENODEV"); '' when there is none. */
  message: string;
  /** The innermost frame in the student's own files ('main.py', 'lib/util.py'), if any. */
  file?: string;
  line?: number;
}

export interface RunResult {
  /** Everything the board printed, tracebacks included, as the console shows it. */
  output: string;
  /** Every change of an output pin's level, in time order (M2.3). */
  trace: TraceEntry[];
  /** Every change of a PWM output (M2.4). */
  pwm: PwmEntry[];
  /** Every change of an analog output (ESP32 DAC, M2.5). */
  analog: AnalogEntry[];
  /** Every change of the micro:bit's 5×5 display: [µs, 25 brightnesses 0–9, row by row] (M2.6). */
  display: [number, string][];
  /** done: the program ended (or there was no main.py); error: an exception; stopped: KeyboardInterrupt (Stop). */
  ended: 'done' | 'error' | 'stopped';
  error?: SimError;
}

/** The boards with simulated MicroPython modules: the folder of src/python each one uses, and its pins after
 *  reset. The ESP32 with the extension board runs the same firmware as the plain one. */
const ESP32_RESET: PinState = { mode: 'in', pull: 'none', out: 0 };
/** CODAL's pins pull down by default; buttons A / B (P5, P11) and I²C (P19, P20) have 10 kΩ pull-ups on the
 *  board (library/boards/microbit-v2/board.json). */
const MICROBIT_RESET: PinState = { mode: 'reset', pull: 'down', out: 0 };
export const BOARDS = {
  'pico-w': { python: 'rp2', reset: RP2040_RESET, pulledUp: [] },
  'esp32-devkit-v1': { python: 'esp32', reset: ESP32_RESET, pulledUp: [] },
  'esp32-devkit-v1-ext': { python: 'esp32', reset: ESP32_RESET, pulledUp: [] },
  'microbit-v2': { python: 'microbit', reset: MICROBIT_RESET, pulledUp: ['5', '11', '19', '20'] },
} as const satisfies Record<string, { python: string; reset: PinState; pulledUp: readonly string[] }>;
export type SimBoard = keyof typeof BOARDS;

export interface RunOptions {
  /** Which board's modules (machine, ...) the program gets; none: only MicroPython's own. */
  board?: SimBoard;
  files: ProjectFiles;
  /** Levels driven onto pins from outside, over time (buttons; M3 replaces these with the circuit). */
  inputs?: InputChange[];
  onOutput?: (text: string) => void;
  /** The board's time (M2.2): the RealClock in the app, a VirtualClock in tests. */
  clock?: Clock;
  /** What the board's own temperature sensor reads (°C); 25 if not set (M6 adds the slider, F-35). */
  temperatureC?: number;
  /** The micro:bit's light level, 0–255; 128 if not set (F-35). */
  lightLevel?: number;
  /** The line being run each time the program starts to sleep (screen 03: where a program spends its time). */
  onSleep?: (at: Where | undefined) => void;
}

/** The sim's own Python (src/python/common) and the boards' (src/python/<folder>), written to a folder the
 *  program can't reach once it starts. */
const PYTHON = import.meta.glob<string>('../python/*/*.py', { query: '?raw', import: 'default', eager: true });
const SIM_DIR = '/_sim';
const PROJECT_DIR = '/flash';

export async function runProject(load: LoadMicroPython, options: RunOptions): Promise<RunResult> {
  const console = new Console(options.onOutput);
  const mp = await startMicroPython(load, console);
  const clock = options.clock ?? new RealClock();
  const now = () => clock.nowUs();
  const spec = options.board ? BOARDS[options.board] : undefined;
  const pins = new PinBank(options.inputs, now, spec?.reset, new Set<string>(spec?.pulledUp ?? []));
  const timers = new TimerBank(now);
  const events = new Events(mp, pins, timers);
  const display: [number, string][] = [];
  mp.registerJsModule('_ream', bridge(mp, clock, pins, timers, events, display, options));
  mp._module.microlabHook = () => {
    clock.poll();
    events.update();
    events.deliver();
  };
  const common = modules('common');
  const board = options.board ? modules(BOARDS[options.board].python) : {};
  writeTree(mp, SIM_DIR, { ...common, ...board });
  writeTree(mp, PROJECT_DIR, options.files);

  const hidden = Object.keys(common).map(moduleName);
  const boardModules = Object.keys(board).map(moduleName);
  let last: string;
  try {
    mp.runPython(`import sys\nsys.path.insert(0, '${SIM_DIR}')\nimport _sim`);   // setup() takes the folder off the path
    const sim = mp.pyimport('_sim');   // our handle: setup() takes _sim out of sys.modules
    mp.runPython([
      `_sim.setup('${PROJECT_DIR}', ${JSON.stringify(hidden)}, ${JSON.stringify(boardModules)})`,
      '__sim = _sim',
      'del _sim',
      "__sim.run(['boot.py', 'main.py'], globals())",   // run() drops __sim from the program's namespace
    ].join('\n'));
    last = String(sim.last);
  } catch (e) {
    // Only reached if Python fails outside the student's code (Stop landing in the runner itself).
    last = /KeyboardInterrupt/.test(String(e)) ? 'stopped\n' : `error\n${String(e)}`;
  }
  console.flush();

  const nl = last.indexOf('\n');
  const ended = last.slice(0, nl) as RunResult['ended'];
  const traceback = last.slice(nl + 1);
  return { output: console.output, trace: pins.trace, pwm: pins.pwmTrace, analog: pins.analogTrace, display, ended, ...(ended === 'error' ? { error: parseTraceback(traceback) } : {}) };
}

/** The `_ream` bridge (architecture §2.4): the board-neutral calls the board modules make into the sim. */
function bridge(mp: MicroPython, clock: Clock, pins: PinBank, timers: TimerBank, events: Events, display: [number, string][], options: RunOptions) {
  return {
    ticks_us: () => clock.ticksUs(),
    /** Sleeps; returns early, with the µs left, when an IRQ or timer callback is due (it is scheduled first, and
     *  runs in Python before the sleep carries on). Wakes exactly at the next input change or timer. */
    sleep_us: (us: number): number => {
      options.onSleep?.(lineBeingRun(mp));
      const end = clock.nowUs() + us;
      for (;;) {
        const left = end - clock.nowUs();
        if (left <= 0) return 0;
        const next = Math.min(pins.nextChangeUs(), timers.nextDueUs()) - clock.nowUs();
        clock.sleepUs(Math.min(left, Math.max(0, next)), () => events.update());
        events.update();
        if (events.deliver()) return Math.max(0, end - clock.nowUs());
      }
    },
    /** '' leaves the mode or pull as it is; out -1 leaves the output register. */
    pin_config: (pin: string, mode: PinMode | '', pull: Pull | '', out: number) => {
      const s = pins.get(pin);
      pins.configure(pin, mode || s.mode, pull || s.pull, out < 0 ? undefined : (out ? 1 : 0));
    },
    pin_write: (pin: string, value: number) => pins.write(pin, (value ? 1 : 0) as Level),
    pin_toggle: (pin: string) => pins.toggle(pin),
    // a reading takes a little time, as the call does on a board (VirtualClock; nothing on the RealClock)
    pin_level: (pin: string): number => { clock.ticksUs(); return pins.level(pin); },
    pin_state: (pin: string): string => {
      const s = pins.get(pin);
      return `${s.mode} ${s.pull} ${s.out}`;
    },
    pin_irq: (pin: string, rising: boolean, falling: boolean, handler: unknown, owner: unknown) =>
      pins.irq(pin, rising, falling, handler, owner),
    adc_volts: (pin: string): number => { clock.ticksUs(); return pins.volts(pin); },
    /** duty 0–1, or < 0 for no PWM on the pin. */
    pwm_out: (pin: string, freq: number, duty: number) => pins.setPwm(pin, freq, duty),
    timer_start: (id: number, periodUs: number, periodic: boolean, handler: unknown, owner: unknown) =>
      timers.start(id, periodUs, periodic, handler, owner),
    timer_stop: (id: number) => timers.stop(id),
    temperature: (): number => options.temperatureC ?? 25,
    dac_out: (pin: string, volts: number) => pins.setAnalog(pin, volts),
    touched: (pin: string): boolean => { clock.ticksUs(); return pins.touched(pin); },
    pin_falls: (pin: string): number => pins.takeFalls(pin),
    display_frame: (pixels: string) => {
      if (display.at(-1)?.[1] !== pixels && !(display.length === 0 && pixels === '0'.repeat(25))) display.push([clock.nowUs(), pixels]);
    },
    light: (): number => options.lightLevel ?? 128,
  };
}

/** Pin IRQs and timer callbacks that are due, handed to micropython.schedule: they run at the VM's next pending
 *  check, as soft IRQs do on the boards. */
class Events {
  private schedule: ((handler: unknown, arg: unknown) => unknown) | undefined;

  constructor(private readonly mp: MicroPython, private readonly pins: PinBank, private readonly timers: TimerBank) {}

  /** Brings inputs and timers up to now; true if something is waiting to be delivered. */
  update(): boolean {
    this.pins.update();
    this.timers.update();
    return this.pins.hasPending() || this.timers.hasPending();
  }

  /** Schedules everything due; true if anything was. */
  deliver(): boolean {
    const due = [...this.pins.takePending(), ...this.timers.takePending()];
    if (!due.length) return false;
    this.schedule ??= this.mp.pyimport('micropython').schedule as typeof this.schedule;
    for (const e of due) {
      try {
        this.schedule!(e.handler, e.owner);
      } catch {
        // the schedule queue is full: the board drops the event too
      }
    }
    return true;
  }
}

/** The .py files of one folder of src/python, by file name. */
function modules(folder: string): ProjectFiles {
  const out: ProjectFiles = {};
  for (const [path, src] of Object.entries(PYTHON)) {
    const [dir, file] = path.split('/').slice(-2);
    if (dir === folder) out[file!] = src;
  }
  return out;
}

const moduleName = (file: string) => file.replace(/\.py$/, '');

function writeTree(mp: MicroPython, root: string, files: ProjectFiles): void {
  const made = new Set<string>();
  const dir = (path: string) => {
    if (made.has(path)) return;
    made.add(path);
    mp.FS.mkdir(path);
  };
  dir(root);
  for (const [path, data] of Object.entries(files)) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) dir(`${root}/${parts.slice(0, i).join('/')}`);
    mp.FS.writeFile(`${root}/${path}`, data);
  }
}

/** The traceback as the board printed it → the error: its last line, and the innermost frame of a student file. */
export function parseTraceback(text: string): SimError {
  const lines = text.trimEnd().split('\n');
  const last = lines[lines.length - 1] ?? '';
  const m = /^([A-Za-z_][\w.]*)(?:: ?(.*))?$/.exec(last);
  const error: SimError = m ? { type: m[1]!, message: m[2] ?? '' } : { type: 'Error', message: last };
  for (const line of lines) {
    const f = /^ {2}File "([^"]+)", line (\d+)/.exec(line);
    if (f) {
      error.file = f[1]!.replace(/^\//, '');
      error.line = Number(f[2]);
    }
  }
  return error;
}
