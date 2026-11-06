import { PRELUDE, sha256 } from './files';
import { UNAME_CODE, type Link } from './raw';

/**
 * A board in memory that answers like MicroPython at its prompts (architecture §2.6): the tests use it to stage
 * what real boards do — a program running or idle, one that catches Ctrl-C, one that never stops, no MicroPython at
 * all, a cable pulled mid-way — and the app uses it when MICROLAB_FAKE_USB stands in for USB (the e2e tests).
 * Its bytes are checked against exchanges recorded on the real boards (tests/fixtures/repl); its file helpers do
 * what files.ts's PRELUDE does on a real board (that Python is itself run on MicroPython in tests/python).
 */
export type FakePreset = 'pico-w' | 'microbit-v2' | 'esp32';

interface Preset {
  uname: string;
  banner: string;
  /** The micro:bit: no folders, no os.rename, no hashlib. */
  flat?: boolean;
}

export const PRESETS: Record<FakePreset, Preset> = {
  // recorded on the teacher's Pico W, 2026-11-06
  'pico-w': {
    uname: "(sysname='rp2', nodename='rp2', release='1.29.0', version='v1.29.0 on 2026-08-24 (GNU 16.1.0 MinSizeRel)', machine='Raspberry Pi Pico W with RP2040')",
    banner: 'MicroPython v1.29.0 on 2026-08-24; Raspberry Pi Pico W with RP2040',
  },
  // uname recorded on the teacher's micro:bit V2 (golden 07_system); the banner not recorded yet
  'microbit-v2': {
    uname: "(sysname='microbit', nodename='microbit', release='2.1.2', version='micro:bit v2.1.2+0697c6d on 2023-10-30; MicroPython v1.18 on 2023-10-30', machine='micro:bit with nRF52833')",
    banner: 'MicroPython v2.1.2+0697c6d on 2023-10-30; micro:bit v2.1.2 with nRF52833',
    flat: true,
  },
  // MicroPython's generic ESP32 build, in the same form (no ESP32 at hand yet)
  esp32: {
    uname: "(sysname='esp32', nodename='esp32', release='1.29.0', version='v1.29.0 on 2026-08-24', machine='Generic ESP32 module with ESP32')",
    banner: 'MicroPython v1.29.0 on 2026-08-24; Generic ESP32 module with ESP32',
  },
};

export interface FakeProgram {
  /** What it prints when Ctrl-C stops it; a KeyboardInterrupt traceback when not given. */
  stop?: string;
  /** What it prints when it starts (and, for one that won't stop, each time Ctrl-C is ignored). */
  output?: string;
  /** How many Ctrl-Cs it ignores (Infinity: it never stops). */
  stubborn?: number;
}

type Answer = { out?: string; err?: string } | undefined;

export interface FakeBoardOptions {
  preset: FakePreset;
  /** A main.py running when the port is opened (and after each soft reset); none: idle at >>>. */
  program?: FakeProgram;
  /** No MicroPython: nothing ever comes back (MakeCode, Arduino code). */
  silent?: boolean;
  /** Already gone: every write fails. */
  unplugged?: boolean;
  /** The files on the board, by path ("lib/x.py"); their folders are there too. */
  files?: Record<string, Uint8Array>;
  /** A flaky cable: every piece of a file arrives with its last byte changed. */
  corrupt?: boolean;
  /** A slow board: a helper's answer comes a line at a time, this many ms apart (a real Pico W reads ~13 KB/s). */
  pace?: number;
  /** …and goes quiet for good after this many lines. */
  stallAfter?: number;
  /** Answers other code sent at the raw prompt; undefined: it never finishes. */
  exec?: (code: string) => Answer;
}

const HELP = 'Type "help()" for more information.\r\n';
const TRACEBACK = 'Traceback (most recent call last):\r\n  File "main.py", line 1, in <module>\r\nKeyboardInterrupt: \r\n';
const oserror = (fn: string, no: string) => ({ err: `Traceback (most recent call last):\r\n  File "<stdin>", line 1, in <module>\r\n  File "<stdin>", in ${fn}\r\nOSError: [Errno ${no}]\r\n` });

/** One call as files.ts writes it — `_mlc(b'..')`, `_mlmv('a','b')` — with its Python literal arguments. */
export function parsePyCall(code: string): { name: string; args: (string | Uint8Array)[] } | null {
  const m = /^(_ml\w+)\((.*)\)$/s.exec(code.trim());
  if (!m) return null;
  const args: (string | Uint8Array)[] = [];
  const src = m[2]!;
  let i = 0;
  while (i < src.length) {
    if (src[i] === ',' || src[i] === ' ') { i++; continue; }
    const bytes = src[i] === 'b';
    if (bytes) i++;
    if (src[i] !== "'") return null;
    i++;
    const out: number[] = [];
    while (src[i] !== "'") {
      if (i >= src.length) return null;
      if (src[i] === '\\') {
        const c = src[i + 1]!;
        if (c === 'x') { out.push(parseInt(src.slice(i + 2, i + 4), 16)); i += 4; continue; }
        out.push(({ n: 10, r: 13, t: 9 } as Record<string, number>)[c] ?? c.charCodeAt(0));
        i += 2;
        continue;
      }
      out.push(src.charCodeAt(i));
      i++;
    }
    i++;
    args.push(bytes ? Uint8Array.from(out) : new TextDecoder().decode(Uint8Array.from(out)));
  }
  return { name: m[1]!, args };
}

const hexOf = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

export class FakeBoard implements Link {
  state: 'program' | 'friendly' | 'raw';
  softReboots = 0;
  readonly files = new Map<string, Uint8Array>();
  readonly dirs = new Set<string>();
  private listeners = new Set<(d: Uint8Array) => void>();
  private closers = new Set<() => void>();
  private queue: Promise<void> = Promise.resolve();
  private raw: number[] = [];
  private stubborn: number;
  private writesLeft = Infinity;
  private gone: boolean;
  private open: string | undefined;
  private unplugOn: { name: string; left: number } | undefined;

  constructor(private readonly opts: FakeBoardOptions) {
    this.state = opts.program ? 'program' : 'friendly';
    this.stubborn = opts.program?.stubborn ?? 0;
    this.gone = !!opts.unplugged;
    for (const [path, data] of Object.entries(opts.files ?? {})) {
      this.files.set(path, data);
      const parts = path.split('/');
      for (let i = 1; i < parts.length; i++) this.dirs.add(parts.slice(0, i).join('/'));
    }
  }

  onData(listener: (d: Uint8Array) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onClose(listener: () => void): () => void {
    this.closers.add(listener);
    return () => this.closers.delete(listener);
  }

  /** The cable is pulled after this many more writes. */
  unplugAfter(writes: number): void {
    this.writesLeft = writes;
  }

  /** The cable is pulled as the nth call of this helper (`_mlc`) arrives — mid-copy. */
  unplugAt(name: string, nth: number): void {
    this.unplugOn = { name, left: nth };
  }

  /** Pulled out now: the port closes. */
  unplug(): void {
    this.gone = true;
    for (const c of this.closers) c();
  }

  /** Plugged back in: it starts again, files as they were left. */
  replug(): void {
    this.gone = false;
    this.writesLeft = Infinity;
    this.state = this.opts.program ? 'program' : 'friendly';
    this.raw = [];
    this.open = undefined;
  }

  /** Resolves when everything the board has to say has been said. */
  settled(): Promise<void> {
    return this.queue;
  }

  async write(data: Uint8Array): Promise<void> {
    if (this.gone || this.writesLeft <= 0) throw new Error('the port is gone (unplugged)');
    this.writesLeft--;
    if (this.opts.silent) return;
    if (this.state === 'program') {
      if (!data.includes(3)) return;
      if (this.stubborn > 0) {
        this.stubborn--;
        if (this.opts.program?.output) this.say(this.opts.program.output);
        return;
      }
      this.say(`${this.opts.program?.stop ?? TRACEBACK}${PRESETS[this.opts.preset].banner}\r\n${HELP}>>> `);
      this.state = 'friendly';
      return; // the rest of the chunk goes with the program
    }
    for (const b of data) this.byte(b);
  }

  private byte(b: number): void {
    const p = PRESETS[this.opts.preset];
    if (this.state === 'raw') {
      if (b === 2) {
        this.state = 'friendly';
        this.say(`\r\n${p.banner}\r\n${HELP}>>> `);
      } else if (b === 3) {
        this.raw = [];
      } else if (b === 4) {
        const code = new TextDecoder().decode(Uint8Array.from(this.raw));
        this.raw = [];
        const call = parsePyCall(code);
        if (call && this.unplugOn?.name === call.name && --this.unplugOn.left <= 0) {
          this.unplugOn = undefined;
          this.unplug();
          return;
        }
        this.later(async () => {
          const r = await this.run(code);
          if (!r) return ['OK'];
          if (!this.opts.pace || !call) return [`OK${r.out ?? ''}\x04${r.err ?? ''}\x04>`];
          const parts = ['OK', ...(r.out ?? '').split(/(?<=\n)/).filter(Boolean)];
          if (this.opts.stallAfter !== undefined && parts.length > this.opts.stallAfter) return parts.slice(0, this.opts.stallAfter);
          return [...parts, `\x04${r.err ?? ''}\x04>`];
        });
      } else {
        this.raw.push(b);
      }
      return;
    }
    // the normal prompt
    if (b === 13 || b === 3) this.say('\r\n>>> ');
    else if (b === 1) {
      this.state = 'raw';
      this.raw = [];
      this.say('\r\nraw REPL; CTRL-B to exit\r\n>');
    } else if (b === 4) {
      this.softReboots++;
      this.stubborn = this.opts.program?.stubborn ?? 0;
      if (this.opts.program) {
        this.state = 'program';
        this.say(`\r\nMPY: soft reboot\r\n${this.opts.program.output ?? ''}`);
      } else {
        this.say(`\r\nMPY: soft reboot\r\n${p.banner}\r\n${HELP}>>> `);
      }
    }
  }

  private async run(code: string): Promise<Answer> {
    if (code === UNAME_CODE) return { out: `${PRESETS[this.opts.preset].uname}\r\n` };
    if (code === PRELUDE) return {};
    const call = parsePyCall(code);
    if (call) return this.helper(call.name, call.args);
    if (this.opts.exec) return this.opts.exec(code);
    return { err: 'Traceback (most recent call last):\r\n  File "<stdin>", line 1, in <module>\r\nNameError: the fake board runs no code\r\n' };
  }

  /** files.ts's helpers, as PRELUDE does them on a board. */
  private async helper(name: string, args: (string | Uint8Array)[]): Promise<Answer> {
    const flat = PRESETS[this.opts.preset].flat;
    const [a, b] = args as [string, string];
    switch (name) {
      case '_mlls': {
        const out: string[] = [];
        const walk = (d: string) => {
          const inside = (x: string) => (d ? x.startsWith(`${d}/`) && !x.slice(d.length + 1).includes('/') : !x.includes('/'));
          for (const dir of [...this.dirs].filter(inside).sort()) { out.push(`D ${dir}`); walk(dir); }
          for (const f of [...this.files.keys()].filter(inside).sort()) out.push(`F ${this.files.get(f)!.length} ${f}`);
        };
        walk(a);
        return { out: out.map((l) => `${l}\r\n`).join('') };
      }
      case '_mlh':
        if (flat) return { out: '-\r\n' };
        return this.files.has(a) ? { out: `${await sha256(this.files.get(a)!)}\r\n` } : oserror('_mlh', '2] ENOENT');
      case '_mlr': {
        const f = this.files.get(a);
        if (!f) return oserror('_mlr', '2] ENOENT');
        let out = '';
        for (let i = 0; i < f.length; i += 128) out += `${hexOf(f.subarray(i, i + 128))}\r\n`;
        return { out };
      }
      case '_mlo': {
        const dir = a.split('/').slice(0, -1).join('/');
        if (dir && !this.dirs.has(dir)) return oserror('_mlo', '2] ENOENT');
        this.files.set(a, new Uint8Array());
        this.open = a;
        return {};
      }
      case '_mlc': {
        if (!this.open) return oserror('_mlc', '9] EBADF');
        const piece = Uint8Array.from(args[0] as Uint8Array);
        if (this.opts.corrupt && piece.length) piece[piece.length - 1]! ^= 1;
        const was = this.files.get(this.open)!;
        const next = new Uint8Array(was.length + piece.length);
        next.set(was);
        next.set(piece, was.length);
        this.files.set(this.open, next);
        return {};
      }
      case '_mlx':
        this.open = undefined;
        return {};
      case '_mlmd':
        if (flat) return { err: "Traceback (most recent call last):\r\nAttributeError: 'module' object has no attribute 'mkdir'\r\n" };
        this.dirs.add(a);
        return {};
      case '_mlrm':
        this.files.delete(a);
        return {};
      case '_mlmv': {
        const f = this.files.get(a);
        if (!f) return oserror('_mlmv', '2] ENOENT');
        this.files.delete(b);
        this.files.set(b, f);
        this.files.delete(a);
        return {};
      }
      default:
        return { err: `Traceback (most recent call last):\r\nNameError: name '${name}' isn't defined\r\n` };
    }
  }

  private say(s: string): void {
    this.later(async () => [s]);
  }

  /** Says the parts in turn — at once, or `pace` ms apart. */
  private later(make: () => Promise<string[]>): void {
    this.queue = this.queue.then(async () => {
      const parts = await make();
      for (const [i, s] of parts.entries()) {
        await new Promise<void>((r) => setTimeout(r, i && this.opts.pace ? this.opts.pace : 0));
        if (this.gone) return;
        const bytes = new TextEncoder().encode(s);
        for (const l of this.listeners) l(bytes);
      }
    });
  }
}
