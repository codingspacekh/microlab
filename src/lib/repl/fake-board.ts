import { UNAME_CODE, type Link } from './raw';

/**
 * A board in memory that answers like MicroPython at its prompts (architecture §2.6): the tests use it to stage
 * what real boards do — a program running or idle, one that catches Ctrl-C, one that never stops, no MicroPython at
 * all, a cable pulled mid-way — and the app uses it when MICROLAB_FAKE_USB stands in for USB (the e2e tests).
 * Its bytes are checked against exchanges recorded on the real boards (tests/fixtures/repl).
 */
export type FakePreset = 'pico-w' | 'microbit-v2' | 'esp32';

interface Preset { uname: string; banner: string }

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

export interface FakeBoardOptions {
  preset: FakePreset;
  /** A main.py running when the port is opened (and after each soft reset); none: idle at >>>. */
  program?: FakeProgram;
  /** No MicroPython: nothing ever comes back (MakeCode, Arduino code). */
  silent?: boolean;
  /** Already gone: every write fails. */
  unplugged?: boolean;
  /** Answers code sent at the raw prompt; undefined: it never finishes. os.uname() is always answered. */
  exec?: (code: string) => { out?: string; err?: string } | undefined;
}

const HELP = 'Type "help()" for more information.\r\n';
const TRACEBACK = 'Traceback (most recent call last):\r\n  File "main.py", line 1, in <module>\r\nKeyboardInterrupt: \r\n';

export class FakeBoard implements Link {
  state: 'program' | 'friendly' | 'raw';
  softReboots = 0;
  private listeners = new Set<(d: Uint8Array) => void>();
  private queue: Promise<void> = Promise.resolve();
  private raw: number[] = [];
  private stubborn: number;
  private writesLeft = Infinity;

  constructor(private readonly opts: FakeBoardOptions) {
    this.state = opts.program ? 'program' : 'friendly';
    this.stubborn = opts.program?.stubborn ?? 0;
  }

  onData(listener: (d: Uint8Array) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The cable is pulled after this many more writes. */
  unplugAfter(writes: number): void {
    this.writesLeft = writes;
  }

  /** Resolves when everything the board has to say has been said. */
  settled(): Promise<void> {
    return this.queue;
  }

  async write(data: Uint8Array): Promise<void> {
    if (this.opts.unplugged || this.writesLeft <= 0) throw new Error('the port is gone (unplugged)');
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
        const r = code === UNAME_CODE ? { out: `${p.uname}\r\n` }
          : this.opts.exec ? this.opts.exec(code)
            : { err: 'Traceback (most recent call last):\r\n  File "<stdin>", line 1, in <module>\r\nNameError: the fake board runs no code\r\n' };
        this.say(r ? `OK${r.out ?? ''}\x04${r.err ?? ''}\x04>` : 'OK');
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

  private say(s: string): void {
    const bytes = new TextEncoder().encode(s);
    this.queue = this.queue.then(() => new Promise<void>((r) => setTimeout(() => {
      for (const l of this.listeners) l(bytes);
      r();
    }, 0)));
  }
}
