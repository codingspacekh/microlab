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
  /** The VM hook (every 64 backward jumps, MICROLAB patch) and the call that raises KeyboardInterrupt. */
  _module: { microlabHook?: () => void; _mp_sched_keyboard_interrupt(): void };
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

/** The board's console: bytes from MicroPython, decoded as UTF-8 as they come, partial lines included. */
export class Console {
  private readonly decoder = new TextDecoder();
  private text = '';
  private pending = '';

  constructor(private readonly onOutput?: (text: string) => void) {}

  write = (bytes: Uint8Array): void => {
    const t = this.decoder.decode(bytes, { stream: true });
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
