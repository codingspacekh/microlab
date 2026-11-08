import { describeFault, type CircuitSpec, type Fault } from '@lib/circuit';
import { CircuitHost, type PartChange, type PartTraceEntry } from './circuit';
import { RealClock, type Clock } from './clock';
import type { Control } from './control';
import { PinBank, RP2040_RESET, type AnalogEntry, type InputChange, type Level, type PinMode, type PinState, type Pull, type PwmEntry, type TraceEntry } from './pins';
import { Motion, type MotionChange } from './motion';
import { soundSteps, type Wave } from './soundfx';
import { TimerBank } from './timers';
import { HELP } from './help-text';
import { Stdin } from './stdin';
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
  /** Every message the micro:bit's radio sent (M7): [µs, its bytes as hex]. */
  radio: [number, string][];
  /** Every change of the micro:bit's speaker (music, pitch, audio): [µs, Hz], 0 for silence (M2.6c); with its volume
   *  (0–1) and waveform when not full and square (M7 slice 4: set_volume, a sound effect). */
  sound: SoundEntry[];
  /** Bus traffic (I²C, SPI, UART, bitstream) as it reaches the bridge: [µs, 'i2c sda=4 scl=5 write 3c 00 nack'] (M2.7). */
  bus: [number, string][];
  /** Every change of a part in the circuit (M3.4); [] without a circuit. The Pico W's LED is in `trace` ('LED'). */
  parts: PartTraceEntry[];
  /** done: the program ended (or there was no main.py); error: an exception; stopped: KeyboardInterrupt (Stop);
   *  fault: the circuit was damaged (M3.5) and the run stopped. */
  ended: 'done' | 'error' | 'stopped' | 'fault';
  error?: SimError;
  /** The damage that stopped the run. */
  fault?: Fault & { message: string };
  /** Every fault seen, warnings too, each once with its worst numbers. */
  faults: (Fault & { message: string })[];
  /** The REPL followed the program (M9, F-23): it ended by itself, with an error or by Ctrl+C, and `repl` was asked. */
  repl?: boolean;
}

/** The boards with simulated MicroPython modules: the folder of src/python each one uses, and its pins after
 *  reset. The ESP32 with the extension board runs the same firmware as the plain one. */
const ESP32_RESET: PinState = { mode: 'in', pull: 'none', out: 0 };
/** CODAL's pins pull down by default; buttons A / B (P5, P11) and I²C (P19, P20) have 10 kΩ pull-ups on the
 *  board (library/boards/microbit-v2/board.json). */
const MICROBIT_RESET: PinState = { mode: 'reset', pull: 'down', out: 0 };
export const BOARDS = {
  // GP23 and GP24 (WL_ON, WL_D: the Wi-Fi chip's) start with no pull on a real Pico W; 25 and 29 pulled down (2026-11-06)
  'pico-w': { python: 'rp2', reset: RP2040_RESET, pulledUp: [], noPull: ['23', '24'] },
  'esp32-devkit-v1': { python: 'esp32', reset: ESP32_RESET, pulledUp: [] },
  'esp32-devkit-v1-ext': { python: 'esp32', reset: ESP32_RESET, pulledUp: [] },
  'microbit-v2': { python: 'microbit', reset: MICROBIT_RESET, pulledUp: ['5', '11', '19', '20'] },
} as const satisfies Record<string, { python: string; reset: PinState; pulledUp: readonly string[]; noPull?: readonly string[] }>;
export type SimBoard = keyof typeof BOARDS;

export interface RunOptions {
  /** Which board's modules (machine, ...) the program gets; none: only MicroPython's own. */
  board?: SimBoard;
  files: ProjectFiles;
  /** Levels driven onto pins from outside, over time (buttons; M3 replaces these with the circuit). */
  inputs?: InputChange[];
  /** What the board prints; `echo` marks what the student typed, echoed back (M9). */
  onOutput?: (text: string, echo?: boolean) => void;
  /** The board's time (M2.2): the RealClock in the app, a VirtualClock in tests. */
  clock?: Clock;
  /** What the board's own temperature sensor reads (°C); 25 if not set (M6 adds the slider, F-35). */
  temperatureC?: number;
  /** The micro:bit's light level, 0–255; 128 if not set (F-35). */
  lightLevel?: number;
  /** The line being run each time the program starts to sleep (screen 03: where a program spends its time). */
  onSleep?: (at: Where | undefined) => void;
  /** Stop and live inputs from the window (src/sim/control.ts); the RealClock should wait on it too. */
  control?: Control;
  /** The circuit the board is in (M3): pins read the solved circuit; part inputs drive it. */
  circuit?: CircuitSpec;
  /** Part inputs over time (buttons, knobs, light), in tests; the app sets them through `control`. */
  partInputs?: PartChange[];
  /** Each change of a part's state (LED brightness, servo angle), as it happens (M3.4). */
  onParts?: (entry: PartTraceEntry) => void;
  /** Stop the run, quietly, when the clock reaches this (µs): the acceptance suite's `seconds` (M3.6). */
  maxUs?: number;
  /** The file Run runs (M4.5, requirements Rev 7, Q19): the one open in the editor; main.py when the board is
   *  "switched on". After boot.py on boards that have one — the micro:bit doesn't. */
  entry?: string;
  /** Each output level change, as it happens (the window draws the board's own LED). */
  onPin?: (pin: string, level: number) => void;
  /** Each new frame of the micro:bit's display: 25 brightnesses 0–9, row by row. */
  onDisplay?: (pixels: string) => void;
  /** Each change of the micro:bit speaker's pitch, Hz (0: silence) (M6.2). */
  onSound?: (hz: number, volume: number, wave: Wave) => void;
  /** Seeds the sound effects' randomness (M7 slice 4: tests); otherwise each run differs, as on the real one. */
  seed?: number;
  /** Each message the micro:bit's radio sends (M7): its bytes as hex. */
  onRadio?: (hex: string) => void;
  /** Messages another micro:bit sends to this one (M7, tests and examples): [µs, the text], on its group and channel. */
  radioIn?: [number, string][];
  /** What is typed in the console over time (M9, tests): [µs, text]; '\n' ends a line, '\x03' is Ctrl+C. The app
   *  types through `control`. */
  stdin?: [number, string][];
  /** After the program — unless Stop or a fault ended it — the REPL (F-23, screen 29c): each line typed runs in the
   *  program's names until Stop (or the time limit). */
  repl?: boolean;
  /** The program has ended and the REPL starts (M9): how it ended. runProject's result comes when the REPL ends. */
  onProgramEnd?: (result: RunResult) => void;
  /** An error in a line typed at the REPL (M9: the window explains it as one in the code). */
  onReplError?: (error: SimError) => void;
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
  // the time the pins and the circuit see: the clock's, or — inside time_pulse_us — the moment a scheduled change was
  // due, so a late wake-up doesn't stretch a pulse (M6.4)
  let asOf: number | undefined;
  const now = () => asOf ?? clock.nowUs();
  const spec = options.board ? BOARDS[options.board] : undefined;
  const pins = new PinBank(options.inputs, now, spec?.reset, new Set<string>(spec?.pulledUp ?? []), options.control,
    new Set<string>(spec && 'noPull' in spec ? spec.noPull : []));
  const circuit = options.circuit ? new CircuitHost(options.circuit, pins, now, options.partInputs, options.control) : undefined;
  const timeUp = () => options.maxUs !== undefined && clock.nowUs() >= options.maxUs;
  const quiet = () => circuit?.damage !== undefined || timeUp();
  const stdin = new Stdin(options.control, options.stdin, () => clock.nowUs());
  const stop = stopper(mp, options.control, quiet, () => stdin.interrupted());
  pins.onLevel = options.onPin;
  if (circuit) {
    pins.attach(circuit);
    circuit.onChange = options.onParts;
    circuit.onDamage = () => mp._module._mp_sched_keyboard_interrupt();   // stop at once, as Stop does
  }
  const timers = new TimerBank(now);
  const events = new Events(mp, pins, timers);
  const display: [number, string][] = [];
  const sound: SoundEntry[] = [];
  const bus: [number, string][] = [];
  const radio: [number, string][] = [];
  const motion = new Motion((options.inputs ?? []).filter((c) => c.pin === 'ACCEL') as MotionChange[], now);
  mp.registerJsModule('_ream', bridge(mp, clock, pins, timers, events, {
    console, display, sound, motion, bus, radio, stop, quiet, circuit, stdin,
    asOf: (t, read) => { asOf = t; try { return read(); } finally { asOf = undefined; } },
  }, options));
  mp._module.microlabHook = () => {
    clock.poll();
    stop();
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
  let sim: { last: unknown; repl: () => void } | undefined;
  try {
    mp.runPython(`import sys\nsys.path.insert(0, '${SIM_DIR}')\nimport _sim`);   // setup() takes the folder off the path
    sim = mp.pyimport('_sim') as unknown as typeof sim;   // our handle: setup() takes _sim out of sys.modules
    mp.runPython([
      `_sim.setup('${PROJECT_DIR}', ${JSON.stringify(hidden)}, ${JSON.stringify(boardModules)}, ${JSON.stringify(options.board ? HELP[options.board] : '')})`,
      '__sim = _sim',
      'del _sim',
      `__sim.run(${JSON.stringify(startFiles(options))}, globals())`,   // run() drops __sim from the program's namespace
    ].join('\n'));
    last = String(sim!.last);
  } catch (e) {
    last = /KeyboardInterrupt/.test(String(e)) ? 'stopped\n' : `error\n${String(e)}`;
  }
  circuit?.update();   // the last writes since the last solve: the parts end as the program left them
  console.flush();

  const nl = last.indexOf('\n');
  const ended = (): RunResult['ended'] => (circuit?.damage ? 'fault' : (last.slice(0, nl) as RunResult['ended']));
  const traceback = last.slice(nl + 1);
  const withText = (f: Fault) => ({ ...f, message: describeFault(f) });
  const result = (): RunResult => {
    const damage = circuit?.damage;
    return { output: console.output, trace: pins.trace, pwm: pins.pwmTrace, analog: pins.analogTrace, display, sound, bus, radio, parts: circuit?.partTrace ?? [],
      faults: [...(circuit?.seen.values() ?? [])].map(withText), ...(damage ? { fault: withText(damage) } : {}), ended: ended(),
      ...(ended() === 'error' ? { error: parseTraceback(traceback) } : {}), ...(repl ? { repl: true } : {}) };
  };
  // the REPL (M9): after a program that ended by itself, with an error or by Ctrl+C — not after Stop, a fault or the
  // time limit, which end the session
  const repl = !!options.repl && !!sim && ended() !== 'fault' && !options.control?.stopRequested() && !quiet();
  if (repl) {
    options.onProgramEnd?.(result());
    try {
      sim!.repl();
    } catch { /* Stop while a line ran: the session is over */ }
    circuit?.update();
    console.flush();
  }
  return result();
}

/** What a run starts: boot.py (not on the micro:bit, which has none — its firmware runs main.py only), then the
 *  entry file (Q19; checked in ports/rp2/main.c, ports/esp32/main.c and the micro:bit's codal_port/main.c). */
function startFiles(options: RunOptions): string[] {
  const entry = options.entry ?? 'main.py';
  return options.board === 'microbit-v2' ? [entry] : ['boot.py', entry];
}

/** [µs, Hz] — or [µs, Hz, volume 0–1, waveform] when not full and square. */
export type SoundEntry = [number, number] | [number, number, number, Wave];

/** A small seeded generator (mulberry32): random(n) is 0 … n − 1. */
function seeded(seed: number): (n: number) => number {
  let a = seed >>> 0;
  return (n: number) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
}

/** The `_ream` bridge (architecture §2.4): the board-neutral calls the board modules make into the sim. */
interface MicrobitParts {
  console: Console;
  display: [number, string][];
  radio: [number, string][];
  sound: SoundEntry[];
  motion: Motion;
  bus: [number, string][];
  /** True once Stop is asked for (and KeyboardInterrupt is on its way). */
  stop: () => boolean;
  /** A stop the runner reports without a traceback: a fault, or the run's time limit. */
  quiet: () => boolean;
  /** The circuit, when there is one: the parts that answer a protocol (a DHT, M6.4). */
  circuit?: CircuitHost;
  /** What is typed in the console (M9). */
  stdin: Stdin;
  /** Reads the pins as of `t` (µs) while `read` runs (time_pulse_us, M6.4). */
  asOf: <T>(t: number, read: () => T) => T;
}

/** Stop (N-03): KeyboardInterrupt is scheduled when the window asks, and again every 50 ms while it still asks, in
 *  case the program catches it (the sim-client ends the worker after 300 ms if even that fails, architecture §2.3). */
function stopper(mp: MicroPython, control: Control | undefined, faulted: () => boolean, interrupted: () => boolean): () => boolean {
  let last = -Infinity;
  return () => {
    // Ctrl+C typed in the console (M9): one KeyboardInterrupt, as a board's console raises it; the program may go on
    if (interrupted()) {
      mp._module._mp_sched_keyboard_interrupt();
      return true;
    }
    if (!control?.stopRequested() && !faulted()) return false;
    const t = performance.now();
    if (t - last >= 50) {
      last = t;
      mp._module._mp_sched_keyboard_interrupt();
    }
    return true;
  };
}

function bridge(mp: MicroPython, clock: Clock, pins: PinBank, timers: TimerBank, events: Events, mb: MicrobitParts, options: RunOptions) {
  const { console, display, sound, motion, bus, radio, stop, quiet, circuit, stdin, asOf } = mb;
  const random = seeded(options.seed ?? Date.now());
  const log = (entry: string) => bus.push([clock.nowUs(), entry]);
  // the micro:bit's own inputs from the window (M6.6, screen 06): 'board:…' slots, NaN until the window sets them
  const slot = (name: string): number => {
    const c = options.control;
    const i = c ? c.names.indexOf(name) : -1;
    return c && i >= 0 ? c.input(i) : NaN;
  };
  let tilt: [number, number, number] | undefined;
  let shakes = 0;
  /** The window's tilt (mg; z what is left of 1 g, face up — or set: face down, freefall, 3g … M7) and its Shake
   *  count, into the accelerometer. */
  const fromWindow = () => {
    const x = slot('board:accelx');
    const y = slot('board:accely');
    const z = slot('board:accelz');
    if (!Number.isNaN(x) || !Number.isNaN(y) || !Number.isNaN(z)) {
      const xx = Number.isNaN(x) ? 0 : x;
      const yy = Number.isNaN(y) ? 0 : y;
      const zz = Number.isNaN(z) ? -Math.round(Math.sqrt(Math.max(0, 1024 * 1024 - xx * xx - yy * yy))) : z;
      if (!tilt || tilt[0] !== xx || tilt[1] !== yy || tilt[2] !== zz) {
        tilt = [xx, yy, zz];
        motion.live([xx, yy, zz]);
      }
    }
    const s = slot('board:shake');
    if (!Number.isNaN(s) && s > shakes) { shakes = s; motion.shake(); }
  };
  const or = (v: number, otherwise: number) => (Number.isNaN(v) ? otherwise : v);
  // the radio: its settings, the messages waiting (a queue of `queue`, the newest dropped when full, as modradio.c),
  // the script's messages still to come, and the window's last ('radio:seq' counts them; 'radio:len', 'radio:0' …)
  const air = { on: false, channel: 7, group: 0, queue: 3, length: 32, waiting: [] as { hex: string; at: number }[] };
  const script = [...(options.radioIn ?? [])].sort((a, b) => a[0] - b[0]);
  let heardSeq = 0;
  const STRING = '010001';
  const arrive = (bytes: number[], at: number) => {
    if (!air.on || air.waiting.length >= air.queue) return;
    air.waiting.push({ hex: STRING + bytes.slice(0, air.length - 3).map(hexByte).join(''), at });
  };
  const hearRadio = () => {
    const t = clock.nowUs();
    while (script.length && script[0]![0] <= t) {
      const [at, text] = script.shift()!;
      arrive([...new TextEncoder().encode(text)], at);
    }
    const seq = slot('radio:seq');
    if (!Number.isNaN(seq) && seq > heardSeq) {
      heardSeq = seq;
      const n = Math.max(0, Math.min(32, slot('radio:len') || 0));
      arrive(Array.from({ length: n }, (_, i) => slot(`radio:${i}`) & 0xff), t);
    }
  };
  return {
    ticks_us: () => clock.ticksUs(),
    /** Sleeps; returns early, with the µs left, when an IRQ or timer callback is due (it is scheduled first, and
     *  runs in Python before the sleep carries on). Wakes exactly at the next input change or timer. */
    sleep_us: (us: number): number => {
      options.onSleep?.(lineBeingRun(mp));
      events.update();   // what the program did just before the sleep is in the circuit as the sleep starts
      const end = clock.nowUs() + us;
      for (;;) {
        const left = end - clock.nowUs();
        if (left <= 0) return 0;
        const next = Math.min(pins.nextChangeUs(), timers.nextDueUs(), options.maxUs ?? Infinity) - clock.nowUs();
        clock.sleepUs(Math.min(left, Math.max(0, next)), () => events.update() || stop());
        if (stop()) return Math.max(1, end - clock.nowUs());   // KeyboardInterrupt is raised as Python goes on
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
    timer_start: (id: number, periodUs: number, periodic: boolean, handler: unknown, owner: unknown, firstDueUs?: number) =>
      timers.start(id, periodUs, periodic, handler, owner, firstDueUs === undefined || firstDueUs < 0 ? undefined : firstDueUs),
    /** µs now, for a board module that aligns a timer to its own tick. */
    now_us: (): number => clock.nowUs(),
    timer_stop: (id: number) => timers.stop(id),
    temperature: (): number => or(slot('board:celsius'), options.temperatureC ?? 25),
    /** True when the run is being stopped by a fault: the runner prints no KeyboardInterrupt traceback then. */
    quiet_stop: (): boolean => quiet(),
    /** A line typed in the console, or None while there is none (M9: input(), the REPL); what was printed before it
     *  (input()'s prompt, >>>) is shown while it waits. */
    stdin_line: (): string | null => {
      const line = stdin.line();
      if (line === undefined) console.flush();
      return line ?? null;
    },
    /** Stop (or a fault, or the time limit) ends the session; Ctrl+C only the line (M9). */
    echo: (text: string) => console.echo(text),
    session_over: (): boolean => !!options.control?.stopRequested() || quiet(),
    repl_error: (traceback: string) => options.onReplError?.(parseTraceback(traceback)),
    dac_out: (pin: string, volts: number) => pins.setAnalog(pin, volts),
    touched: (pin: string): boolean => { clock.ticksUs(); return pins.touched(pin); },
    pin_falls: (pin: string): number => pins.takeFalls(pin),
    display_frame: (pixels: string) => {
      if (display.at(-1)?.[1] !== pixels && !(display.length === 0 && pixels === '0'.repeat(25))) {
        display.push([clock.nowUs(), pixels]);
        options.onDisplay?.(pixels);
      }
    },
    light: (): number => or(slot('board:light'), options.lightLevel ?? 128),
    /** The microphone's sound level, 0–255 (M6.6): the window's slider; 0 in a silent room. */
    sound_level: (): number => or(slot('board:sound'), 0),
    /** The speaker's sound now: its pitch, volume (0–1) and waveform. Several changes at one moment (a note switches on,
     *  then gets its pitch) are one change. */
    sound: (hz: number, volume = 1, wave: Wave = 'square') => {
      const t = clock.nowUs();
      const v = Math.round(volume * 1000) / 1000;
      const h = Math.round(hz * 100) / 100;
      const entry: SoundEntry = !h || (v === 1 && wave === 'square') ? [t, h] : [t, h, v, wave];   // silence is silence, at any volume
      const same = (a?: SoundEntry, b?: SoundEntry) => (a?.[1] ?? 0) === (b?.[1] ?? 0) && (a?.[2] ?? 1) === (b?.[2] ?? 1) && (a?.[3] ?? 'square') === (b?.[3] ?? 'square');
      const last = sound.at(-1);
      if (last && last[0] === t) {
        sound[sound.length - 1] = entry;
        if (same(sound.at(-2), entry) || (sound.length === 1 && !h)) sound.pop();
      } else if (!same(last, entry)) {
        sound.push(entry);
      }
      options.onSound?.(h, v, wave);
    },
    /** A sound expression's steps (M7 slice 4: audio.play of a Sound or a SoundEffect), as CODAL synthesizes it:
     *  'µs,Hz,volume,wave;…', '' when it isn't one. */
    sound_steps: (expression: string): string =>
      soundSteps(expression, random)?.map((x) => `${x.us},${Math.round(x.hz * 100) / 100},${Math.round(x.volume * 1000) / 1000},${x.wave}`).join(';') ?? '',
    accel_values: (): string => { clock.ticksUs(); fromWindow(); return motion.values().join(' '); },
    accel_gesture: (): string => { fromWindow(); return motion.gesture(); },
    accel_events: (): string => { fromWindow(); return motion.takeEvents().join(','); },

    // --- the micro:bit's radio (M7): what it sends goes to the window; what another micro:bit sends waits in its queue
    // what came before a change is heard under the settings it came under
    radio_config: (channel: number, group: number, queue: number, length: number) => { hearRadio(); Object.assign(air, { channel, group, queue, length }); },
    radio_on: (on: number) => { hearRadio(); air.on = !!on; if (!on) air.waiting = []; },
    radio_send: (hex: string) => {
      log(`radio channel=${air.channel} group=${air.group} send ${spaced(hex)}`);
      radio.push([clock.nowUs(), hex]);
      options.onRadio?.(hex);
    },
    /** The oldest message waiting: 'hex rssi µs', or '' when none is. */
    radio_receive: (): string => {
      hearRadio();
      const m = air.waiting.shift();
      return m ? `${m.hex} -45 ${m.at}` : '';
    },

    // --- buses (M2.7): transaction level; the parts on the nets answer (M6.4b: an MPU6050) ---
    /** Addresses that answer on this bus, comma-separated hex. */
    i2c_scan: (sda: string, scl: string): string => {
      const found = [...(circuit?.i2c(sda, scl).keys() ?? [])].sort((a, b) => a - b).map(hexByte).join(',');
      log(`i2c sda=${sda} scl=${scl} scan${found ? ` ${found}` : ''}`);
      return found;
    },
    /** Bytes ACKed, or -1 when the address is not ACKed. */
    i2c_write: (sda: string, scl: string, addr: number, hex: string): number => {
      clock.sleepUs(I2C_BYTE_US * (1 + hex.length / 2));   // the address and the bytes, on the wire
      const chip = circuit?.i2c(sda, scl).get(addr);
      log(`i2c sda=${sda} scl=${scl} write ${hexByte(addr)}${hex ? ' ' + spaced(hex) : ''}${chip ? '' : ' nack'}`);
      if (!chip) return -1;
      chip.write((hex.match(/../g) ?? []).map((b) => parseInt(b, 16)));
      circuit?.traceDisplays();
      return hex.length / 2;
    },
    /** The bytes read (hex), or -1 when the address is not ACKed. */
    i2c_read: (sda: string, scl: string, addr: number, n: number): string | number => {
      clock.sleepUs(I2C_BYTE_US * (1 + n));
      const chip = circuit?.i2c(sda, scl).get(addr);
      if (!chip) { log(`i2c sda=${sda} scl=${scl} read ${hexByte(addr)} ${n} nack`); return -1; }
      const data = chip.read(n).map(hexByte).join('');
      log(`i2c sda=${sda} scl=${scl} read ${hexByte(addr)} ${n} ${spaced(data)}`);
      return data;
    },
    /** Clocks `hex` out on MOSI; returns what MISO gave back (its idle level: 0x00 low, 0xff high). */
    spi_xfer: (sck: string, mosi: string, miso: string, hex: string, kind: string, mode = 0, lsb = 0, baud = 0): string => {
      log(`spi sck=${sck} mosi=${mosi} miso=${miso} ${kind}${kind === 'read' ? ' ' + hex.length / 2 : ' ' + spaced(hex)}`);
      const sent = (hex.match(/../g) ?? []).map((b) => parseInt(b, 16));
      if (baud > 0) clock.sleepUs(Math.round((sent.length * 8 * 1e6) / baud));   // each byte's 8 clocks (M7 slice 5)
      const got = circuit?.spi(sck, mosi, miso, spiAsSeen(sent, mode, !!lsb));
      if (got) return spiAsRead(got, mode, !!lsb).map(hexByte).join('');   // a part on MISO answered (M7: an RC522)
      const idle = miso && pins.level(miso) ? 'ff' : '00';
      return idle.repeat(hex.length / 2);
    },
    /** A board UART on its pins (M7 slice 5): its handle (0 with no circuit: nothing to send to). */
    uart_open: (tx: string, rx: string, baud: number, bits: number, parity: number, stop: number, rxbuf: number): number =>
      circuit?.uartOpen(tx, rx, { baud, bits, parity, stop }, rxbuf) ?? 0,
    uart_close: (h: number) => { circuit?.serial.close(h); },
    /** Sends `hex` from the port; returns how long until its last byte has gone (µs). */
    uart_write: (h: number, tx: string, rx: string, baud: number, hex: string): number => {
      log(`uart tx=${tx} rx=${rx} ${baud} write ${hex}`);
      const t = clock.nowUs();
      const done = circuit?.serial.send(h, (hex.match(/../g) ?? []).map((b) => parseInt(b, 16)), t) ?? t;
      return Math.max(0, Math.round(done - t));
    },
    /** How long until the port's last byte has gone (µs). */
    uart_busy: (h: number): number => Math.max(0, Math.round((circuit?.serial.busyUntil(h) ?? 0) - clock.nowUs())),
    uart_any: (h: number): number => { circuit?.update(); return circuit?.serial.available(h, clock.nowUs()) ?? 0; },
    uart_take: (h: number, n: number): string => (circuit?.serial.take(h, n, clock.nowUs()) ?? []).map(hexByte).join(''),
    /** How long until the next byte reaches the port (µs); -1 when none is on its way. */
    uart_next: (h: number): number => circuit?.serial.nextUs(h, clock.nowUs()) ?? -1,
    /** The micro:bit's stdout (M7 slice 5): on a port's pins after uart.init(tx=…), back on USB with 0. */
    console_uart: (h: number) => {
      console.flush();
      console.divert = h && circuit ? (bytes: Uint8Array) => { circuit.serial.send(h, [...bytes], clock.nowUs()); } : h ? () => {} : undefined;
    },
    /** The bytes out on the pin with `timing` (ns: high and low of a 0, of a 1), each bit taking its time — into the
     *  NeoPixels on the pin's net (M7 slice 3). */
    bitstream: (pin: string, timing: string, hex: string) => {
      log(`bitstream pin=${pin} timing=${timing} ${hex}`);
      const t = timing.split(',').map(Number);
      const bytes = (hex.match(/../g) ?? []).map((b) => parseInt(b, 16));
      const ones = bytes.reduce((n, b) => { let k = 0; for (let v = b; v; v &= v - 1) k++; return n + k; }, 0);
      const ns = ones * ((t[2] ?? 0) + (t[3] ?? 0)) + (bytes.length * 8 - ones) * ((t[0] ?? 0) + (t[1] ?? 0));
      circuit?.bitstream(pin, t, bytes);
      clock.sleepUs(Math.round(ns / 1000));
    },
    /** _onewire (drivers/onewire, M6.5b): a reset (≈ 960 µs; true with a presence pulse), a bit (≈ 70 µs; -1 reads it),
     *  a byte (≈ 560 µs; -1 reads it), on the bus of the pin's net. */
    ow_reset: (pin: string): boolean => {
      clock.sleepUs(960);
      return circuit?.oneWire(pin).reset() ?? false;
    },
    ow_bit: (pin: string, v: number): number => {
      clock.sleepUs(70);
      const bus = circuit?.oneWire(pin);
      if (v < 0) return bus?.readBit() ?? 1;
      bus?.writeBit(v);
      return 0;
    },
    ow_byte: (pin: string, v: number): number => {
      clock.sleepUs(560);
      const bus = circuit?.oneWire(pin);
      if (v < 0) return bus?.readByte() ?? 0xff;
      bus?.writeByte(v);
      return 0;
    },
    /** dht_readinto (drivers/dht/dht.c): the line high 250 ms, low 18 ms (the start), then ≈ 4 ms of bits — the 5
     *  bytes of the DHT on the pin as hex, or -1 when none answers (the driver raises ETIMEDOUT). */
    dht_read: (pin: string): string | number => {
      clock.sleepUs(250_000 + 18_000);
      const bytes = circuit?.dhtRead(pin);
      clock.sleepUs(4_000);
      log(`dht pin=${pin} ${bytes ?? 'timeout'}`);
      return bytes ?? -1;
    },
    /** machine_time_pulse_us (extmod/machine_pulse.c, v1.29): two changes, -2 / -1 on a timeout. It steps from one
     *  input change to the next: it sleeps until a change is due, then reads the pin as of then — a late wake-up
     *  (a busy laptop) doesn't stretch the pulse, nor miss a short one (M6.4: an HC-SR04's echo). */
    pulse_us: (pin: string, level: number, timeoutUs: number): number => {
      let want = level ? 1 : 0;
      let left = 2;
      let t = clock.ticksUs();
      let start = t;
      for (;;) {
        if (asOf(t, () => pins.level(pin)) === want) {
          want = 1 - want;
          if (--left === 0) return t - start;
          start = t;
          continue;
        }
        if (t - start >= timeoutUs || stop()) return -left;
        const until = Math.min(asOf(t, () => pins.nextChangeUs()), start + timeoutUs);
        const wait = until - clock.nowUs();
        if (wait > 0) clock.sleepUs(wait);
        // a change from outside (the window) isn't scheduled: it is seen as of now
        t = until === Infinity ? clock.ticksUs() : Math.max(t + 1, Math.min(until, clock.ticksUs()));
      }
    },
  };
}

/** A byte on I²C at 400 kHz, with its acknowledge: 9 bits (M6.5b: a chip polled in a loop sees time pass). */
const I2C_BYTE_US = 22.5;

const hexByte = (n: number) => n.toString(16).padStart(2, '0');

/** A byte's bits the other way round. */
const reversed = (b: number) => { let r = 0; for (let i = 0; i < 8; i++) r |= ((b >> i) & 1) << (7 - i); return r; };
/** Modes 1 and 2 put a bit out on the edge modes 0 and 3 read it on (M7 slice 5). */
const otherEdge = (mode: number) => (((mode >> 1) ^ mode) & 1) === 1;
/** What a part (mode 0, the highest bit first, as the MAX7219 and the RC522) reads of bytes sent in `mode`: LSB first
 *  reverses each; the other edge shifts every bit one place (each byte takes the next one's first bit). */
export function spiAsSeen(bytes: number[], mode: number, lsb: boolean): number[] {
  let out = lsb ? bytes.map(reversed) : [...bytes];
  if (otherEdge(mode)) out = out.map((b, i) => ((b << 1) | ((out[i + 1] ?? 0) >> 7)) & 0xff);
  return out;
}
/** And what the board reads of a part's answer, the same way back. */
export function spiAsRead(bytes: number[], mode: number, lsb: boolean): number[] {
  let out = [...bytes];
  if (otherEdge(mode)) out = out.map((b, i) => ((b >> 1) | ((out[i - 1] ?? 0) << 7)) & 0xff);
  return lsb ? out.map(reversed) : out;
}
const spaced = (hex: string) => hex.match(/../g)?.join(' ') ?? '';

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
