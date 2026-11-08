/**
 * MicroLab's MicroPython (vendor/micropython, the webassembly port built with our VM hook): the few parts of its
 * loader the sim uses. Loaded fresh for every run, so nothing is left over from the last one (architecture §2.3).
 */

/** Emscripten's file system, as far as the sim uses it. */
export interface EmscriptenFS {
  mkdir(path: string): void;
  writeFile(path: string, data: string | Uint8Array): void;
  readdir(path: string): string[];
}

/** A Python object seen from JavaScript (pyscript-style proxy): attributes, and calling it. */
export type PyProxy = Record<string, unknown> & ((...args: unknown[]) => unknown);

export interface MicroPython {
  runPython(code: string): unknown;
  registerJsModule(name: string, module: object): void;
  pyimport(name: string): PyProxy;
  FS: EmscriptenFS;
  /** The VM hook (every 64 backward jumps, MICROLAB patch), the call that raises KeyboardInterrupt, and the chain
   *  of running frames (MICROLAB_FRAMES: depth 0 is the innermost; line 0 = no frame that deep). */
  _module: {
    microlabHook?: () => void;
    _mp_sched_keyboard_interrupt(): void;
    _microlab_frame_line(depth: number): number;
    _microlab_frame_file(depth: number): number;
    HEAPU8: Uint8Array;
  };
}

/** A place in the student's code. */
export interface Where {
  file: string;
  line: number;
}

/** The innermost running frame in one of the student's files ('main.py', 'lib/util.py'), skipping the sim's own
 *  modules: the line being run (screen 03). Valid while Python waits in a call into JavaScript, or in the hook. */
export function lineBeingRun(mp: MicroPython): Where | undefined {
  const m = mp._module;
  for (let depth = 0; ; depth++) {
    const line = m._microlab_frame_line(depth);
    if (!line) return undefined;
    const file = cString(m.HEAPU8, m._microlab_frame_file(depth));
    if (!file.startsWith('/_sim/') && !file.startsWith('<')) return { file: file.replace(/^\//, ''), line };
  }
}

function cString(heap: Uint8Array, at: number): string {
  let end = at;
  while (heap[end]) end++;
  return new TextDecoder().decode(heap.subarray(at, end));
}

export interface LoadOptions {
  stdout: (byte: Uint8Array) => void;
  stderr: (byte: Uint8Array) => void;
  linebuffer: false;
  heapsize?: number;
  pystack?: number;
}

/** The loader's own `loadMicroPython` (vendor/micropython/micropython.mjs): `url` is where the .wasm is. */
export type RawLoadMicroPython = (options: LoadOptions & { url: string }) => Promise<MicroPython>;

/** `loadMicroPython` bound to where the .wasm is (a Node path in tests, an asset URL in the worker). */
export type LoadMicroPython = (options: LoadOptions) => Promise<MicroPython>;

/** The board's console: bytes from MicroPython, decoded as UTF-8 as they come, partial lines included. Line ends
 *  are '\n': MicroPython prints some text "cooked" for a serial terminal ('\r\n'; tracebacks from soft IRQ
 *  handlers), which a console like Thonny's shows as plain lines. */
export class Console {
  private readonly decoder = new TextDecoder();
  private text = '';
  private pending = '';

  constructor(private readonly onOutput?: (text: string) => void) {}

  /** Where the program's output goes instead of the console (M7 slice 5: the micro:bit's print() follows its uart
   *  out of a pin after uart.init(tx=…)). */
  divert?: (bytes: Uint8Array) => void;

  write = (bytes: Uint8Array): void => {
    if (this.divert) { this.divert(bytes); return; }
    const t = this.decoder.decode(bytes, { stream: true }).replace(/\r/g, '');
    if (!t) return;
    this.text += t;
    this.pending += t;
    if (t.includes('\n')) this.flush();
  };

  /** Hands what has come since the last flush to onOutput (at a newline, and at the end of a run). */
  flush(): void {
    if (this.pending && this.onOutput) this.onOutput(this.pending);
    this.pending = '';
  }

  get output(): string {
    return this.text;
  }
}

/** The boards' heap is smaller than a laptop's; 1 MB is about what a Pico W's MicroPython has free (~190 kB on
 *  a micro:bit — per-board sizes come with the board modules, M2.6). */
export const DEFAULT_HEAP = 1024 * 1024;

export async function startMicroPython(load: LoadMicroPython, console: Console): Promise<MicroPython> {
  return load({ stdout: console.write, stderr: console.write, linebuffer: false, heapsize: DEFAULT_HEAP });
}
