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
  /** The micro:bit keeps what came with the Ctrl-C that stopped its program and answers it at the prompt; the Pico W
   *  drops it (both recorded). */
  keepsInput?: boolean;
}

export const PRESETS: Record<FakePreset, Preset> = {
  // recorded on the teacher's Pico W, 2026-11-06
  'pico-w': {
    uname: "(sysname='rp2', nodename='rp2', release='1.29.0', version='v1.29.0 on 2026-08-24 (GNU 16.1.0 MinSizeRel)', machine='Raspberry Pi Pico W with RP2040')",
    banner: 'MicroPython v1.29.0 on 2026-08-24; Raspberry Pi Pico W with RP2040',
  },
  // recorded on the teacher's micro:bit V2, 2026-11-06 (uname also golden 07_system)
  'microbit-v2': {
    uname: "(sysname='microbit', nodename='microbit', release='2.1.2', version='micro:bit v2.1.2+0697c6d on 2023-10-30; MicroPython v1.18 on 2023-10-30', machine='micro:bit with nRF52833')",
    banner: 'MicroPython v1.18 on 2023-10-30; micro:bit v2.1.2 with nRF52833',
    flat: true,
    keepsInput: true,
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
  /** Raw-paste mode: taken (the default, a window of 128 as the micro:bit's), refused ("R\x00"), or unknown to
   *  older firmware (Ctrl-A just gives the raw prompt again). */
  paste?: 'yes' | 'refused' | 'unknown';
  /** A slow serial input (the micro:bit's, found 2026-11-06): what comes faster than it is asked for is lost — in
   *  the plain raw REPL, all but the first 64 bytes of each write; in raw-paste mode, what goes past the window. */
  lossy?: boolean;
  /** Answers other code sent at the raw prompt, a line typed at >>> or a block pasted (Ctrl-E); undefined: it never
   *  finishes (Ctrl-C stops it). */
  exec?: (code: string) => Answer;
}

const HELP = 'Type "help()" for more information.\r\n';
/** A Pico W's file system: 848 KB. */
const SPACE = 868352;
/** The raw-paste window, as the teacher's micro:bit gave it. */
const WINDOW = 128;
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
  state: 'program' | 'friendly' | 'raw' | 'paste' | 'pasting';
  softReboots = 0;
  /** Soft restarts asked at an empty raw prompt (M11.8): boot.py runs, main.py doesn't; the raw prompt again. */
  rawResets = 0;
  /** Commands taken in raw-paste mode. */
  pastes = 0;
  /** Asked to restart into its bootloader (a Pico's BOOTSEL: machine.bootloader()). */
  bootloaded = false;
  private asked = '';
  private line = '';
  private hung = false;
  private windowLeft = 0;
  private taken = 0;
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

  /** The running program (or a command) prints this. */
  emit(text: string): void {
    this.say(text);
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
      if (!PRESETS[this.opts.preset].keepsInput) return; // the rest of the chunk goes with the program
      const stop = data.indexOf(3);
      for (const b of [...data.subarray(0, stop), ...data.subarray(stop + 1)]) this.byte(b);
      return;
    }
    const take = this.opts.lossy && this.state === 'raw' ? data.subarray(0, 64) : data;
    for (const b of take) this.byte(b);
  }

  private byte(b: number): void {
    const p = PRESETS[this.opts.preset];
    if (this.state === 'paste') {
      if (b === 4) {
        this.state = 'raw';
        this.say('\x04');
        this.runRaw(false);
        return;
      }
      if (this.windowLeft <= 0 && this.opts.lossy) return;
      this.raw.push(b);
      this.windowLeft--;
      if (++this.taken === WINDOW) {
        this.taken = 0;
        this.windowLeft += WINDOW;
        this.say('\x01');
      }
      return;
    }
    if (this.state === 'raw') {
      // raw-paste asked for: Ctrl-E A Ctrl-A at the start of a command
      const paste = this.opts.paste ?? 'yes';
      if (paste !== 'unknown' && this.raw.length === 0 && (this.asked + String.fromCharCode(b)) === '\x05A\x01'.slice(0, this.asked.length + 1)) {
        this.asked += String.fromCharCode(b);
        if (this.asked.length < 3) return;
        this.asked = '';
        if (paste === 'refused') { this.say('R\x00'); return; }
        this.pastes++;
        this.state = 'paste';
        this.windowLeft = WINDOW;
        this.taken = 0;
        this.say(Uint8Array.from([0x52, 1, WINDOW & 0xff, WINDOW >> 8]));   // "R\x01" and the window, as bytes
        return;
      }
      this.asked = '';
      if (b === 1) {
        this.raw = [];
        this.say('\r\nraw REPL; CTRL-B to exit\r\n>');
        return;
      }
      if (b === 2) {
        this.state = 'friendly';
        this.say(`\r\n${p.banner}\r\n${HELP}>>> `);
      } else if (b === 3) {
        this.raw = [];
        if (this.hung) {
          this.hung = false;
          this.say('\x04Traceback (most recent call last):\r\n  File "<stdin>", line 1, in <module>\r\nKeyboardInterrupt: \r\n\x04>');
        }
      } else if (b === 4 && this.raw.length === 0) {
        // Ctrl-D with nothing typed: a soft restart, as pyexec.c's raw REPL does — "OK", the reboot, the raw prompt
        this.rawResets++;
        this.say('OK\r\nMPY: soft reboot\r\nraw REPL; CTRL-B to exit\r\n>');
      } else if (b === 4) {
        this.runRaw(true);
      } else {
        this.raw.push(b);
      }
      return;
    }
    if (this.state === 'pasting') {
      if (b === 3) { this.state = 'friendly'; this.line = ''; this.say('\r\n>>> '); return; }
      if (b === 4) {
        const code = this.line;
        this.line = '';
        this.state = 'friendly';
        this.answerLine(code, '\r\n');
        return;
      }
      // the line break and the next "=== " come in pieces, as on the teacher's micro:bit
      if (b === 13) { this.line += '\n'; this.say('\r\n='); this.say('== '); return; }
      this.line += String.fromCharCode(b);
      this.say(String.fromCharCode(b));
      return;
    }
    // the normal prompt: what is typed is echoed; Enter runs the line; Ctrl-E pastes a block
    if (b === 13 && this.line) {
      const code = this.line;
      this.line = '';
      this.answerLine(code, '\r\n');
    } else if (b === 13 || b === 3) {
      this.line = '';
      this.say('\r\n>>> ');
    } else if (b === 5) {
      this.state = 'pasting';
      this.line = '';
      this.say('\r\npaste mode; Ctrl-C to cancel, Ctrl-D to finish\r\n=== ');
    } else if (b >= 32 || b === 9) {
      this.line += String.fromCharCode(b);
      this.say(String.fromCharCode(b));
    } else if (b === 1) {
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

  /** A line typed at >>> or a pasted block: what it prints, then the prompt (errors print there too). */
  private answerLine(code: string, before: string): void {
    this.later(async () => {
      const r = this.opts.exec?.(code.replace(/\n$/, '')) ?? { err: `Traceback (most recent call last):\r\n  File "<stdin>", line 1, in <module>\r\nNameError: name '${code.split(/\W/)[0]}' isn't defined\r\n` };
      return [`${before}${r.out ?? ''}${r.err ?? ''}>>> `];
    });
  }

  /** Runs what came at the raw prompt; "OK" first in the plain raw REPL (raw-paste has acknowledged with Ctrl-D). */
  private runRaw(ok: boolean): void {
    const code = new TextDecoder().decode(Uint8Array.from(this.raw));
    this.raw = [];
    const call = parsePyCall(code);
    if (call && this.unplugOn?.name === call.name && --this.unplugOn.left <= 0) {
      this.unplugOn = undefined;
      this.unplug();
      return;
    }
    const OK = ok ? 'OK' : '';
    this.later(async () => {
      const r = await this.run(code);
      if (!r) { this.hung = true; return OK ? [OK] : []; }
      if (!this.opts.pace || !call) return [`${OK}${r.out ?? ''}\x04${r.err ?? ''}\x04>`];
      const parts = [OK, ...(r.out ?? '').split(/(?<=\n)/)].filter(Boolean);
      if (this.opts.stallAfter !== undefined && parts.length > this.opts.stallAfter) return parts.slice(0, this.opts.stallAfter);
      return [...parts, `\x04${r.err ?? ''}\x04>`];
    });
  }

  private async run(code: string): Promise<Answer> {
    if (code === UNAME_CODE) return { out: `${PRESETS[this.opts.preset].uname}\r\n` };
    if (code === PRELUDE) return {};
    if (/machine\.bootloader\(\)/.test(code)) {
      // it restarts into BOOTSEL at once: its serial port goes (the RPI-RP2 drive comes instead)
      this.bootloaded = true;
      setTimeout(() => this.unplug(), 0);
      return undefined;
    }
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
      case '_mlrd': {
        if (!this.dirs.has(a)) return oserror('_mlrd', '2] ENOENT');
        for (const f of [...this.files.keys()]) if (f.startsWith(`${a}/`)) this.files.delete(f);
        for (const d of [...this.dirs]) if (d === a || d.startsWith(`${a}/`)) this.dirs.delete(d);
        return {};
      }
      case '_mldf': {
        if (flat) return { out: '-\r\n' };
        const used = [...this.files.values()].reduce((n, f) => n + f.length, 0);
        return { out: `${SPACE} ${SPACE - used}\r\n` };
      }
      default:
        return { err: `Traceback (most recent call last):\r\nNameError: name '${name}' isn't defined\r\n` };
    }
  }

  private say(s: string | Uint8Array): void {
    this.later(async () => [s]);
  }

  /** Says the parts in turn — at once, or `pace` ms apart. */
  private later(make: () => Promise<(string | Uint8Array)[]>): void {
    this.queue = this.queue.then(async () => {
      const parts = await make();
      for (const [i, s] of parts.entries()) {
        await new Promise<void>((r) => setTimeout(r, i && this.opts.pace ? this.opts.pace : 0));
        if (this.gone) return;
        const bytes = typeof s === 'string' ? new TextEncoder().encode(s) : s;
        for (const l of this.listeners) l(bytes);
      }
    });
  }
}
