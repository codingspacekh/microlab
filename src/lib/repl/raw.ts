import { parseUname, type Uname } from './greeting';

/**
 * MicroPython's raw REPL over any byte stream (Q15, R10) — the same protocol Thonny and mpremote use, so it works on
 * every board with MicroPython and needs no driver or extra firmware:
 *   Ctrl-C stops the running program; Ctrl-A gives the raw prompt, which runs what is sent up to Ctrl-D and answers
 *   "OK", the output, Ctrl-D, the error, Ctrl-D and ">"; Ctrl-B goes back to the normal prompt, where Ctrl-D restarts
 *   the board softly and its main.py runs again.
 * Pure: the stream is a Link (a serial port in the app, a FakeBoard or a recording in the tests).
 */
export interface Link {
  write(data: Uint8Array): Promise<void>;
  onData(listener: (data: Uint8Array) => void): () => void;
}

export type ReplErrorReason = 'timeout' | 'lost' | 'refused';

export class ReplError extends Error {
  constructor(readonly reason: ReplErrorReason, message: string, readonly seen = '') {
    super(message);
    this.name = 'ReplError';
  }
}

export interface ReplOptions {
  /** How long to wait after Ctrl-C for a program to stop before asking for the raw prompt. */
  pauseMs?: number;
  /** How long an answer may take. */
  replyMs?: number;
}

const RAW_PROMPT = 'raw REPL; CTRL-B to exit\r\n>';
/** Bytes ↔ text one char per byte, so markers are found byte for byte whatever the bytes are. */
export const latin1 = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
export function bytesText(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192));
  return s;
}
const utf8Out = (s: string) => new TextDecoder().decode(latin1(s));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** What came from the board, kept until it is read; bytes as latin1 text so markers are found byte for byte. */
class Reader {
  private buf = '';
  private wake: (() => void) | undefined;

  constructor(link: Link) {
    link.onData((d) => {
      this.buf += bytesText(d);
      this.wake?.();
    });
  }

  /** Everything up to the marker (the marker itself is taken too); a timeout keeps the text for the error. */
  async until(marker: string, ms: number): Promise<string> {
    const end = Date.now() + ms;
    for (;;) {
      const i = this.buf.indexOf(marker);
      if (i >= 0) {
        const before = this.buf.slice(0, i);
        this.buf = this.buf.slice(i + marker.length);
        return before;
      }
      const left = end - Date.now();
      if (left <= 0) throw new ReplError('timeout', `No answer from the board (waiting for ${JSON.stringify(marker)})`, this.buf);
      await new Promise<void>((r) => {
        const t = setTimeout(r, left);
        this.wake = () => { clearTimeout(t); r(); };
      });
      this.wake = undefined;
    }
  }

  take(): string {
    const b = this.buf;
    this.buf = '';
    return b;
  }
}

export class RawRepl {
  private readonly reader: Reader;
  private readonly pauseMs: number;
  private readonly replyMs: number;
  /** What the board printed before it gave the raw prompt (its program's last words), for a "no MicroPython" answer. */
  seen = '';

  constructor(private readonly link: Link, opts: ReplOptions = {}) {
    this.reader = new Reader(link);
    this.pauseMs = opts.pauseMs ?? 100;
    this.replyMs = opts.replyMs ?? 1000;
  }

  private send(s: string): Promise<void> {
    return this.write(latin1(s));
  }

  private async write(bytes: Uint8Array): Promise<void> {
    try {
      await this.link.write(bytes);
    } catch (e) {
      throw new ReplError('lost', `The board stopped answering: ${(e as Error).message}`, this.seen);
    }
  }

  /** Stops the program and gets the raw prompt; asks twice (a program may catch the first Ctrl-C). */
  async enter(tries = 2): Promise<void> {
    for (let i = 0; i < tries; i++) {
      await this.send('\r\x03\x03');
      if (this.pauseMs) await wait(this.pauseMs);
      await this.send('\r\x01');
      try {
        this.seen += await this.reader.until(RAW_PROMPT, this.replyMs);
        return;
      } catch (e) {
        if (!(e instanceof ReplError)) throw e;
        this.seen += this.reader.take();
      }
    }
    throw new ReplError('refused', 'The board did not give the raw REPL prompt', this.seen);
  }

  /** Runs code at the raw prompt; its output and its error (a traceback) come back apart. */
  async exec(code: string, ms = this.replyMs): Promise<{ out: string; err: string }> {
    const bytes = new TextEncoder().encode(code);
    const all = new Uint8Array(bytes.length + 1);
    all.set(bytes);
    all[bytes.length] = 4;
    await this.write(all);
    await this.reader.until('OK', ms).catch((e: ReplError) => { throw new ReplError('refused', 'The board did not take the command', e.seen); });
    const out = await this.reader.until('\x04', ms);
    const err = await this.reader.until('\x04>', ms);
    return { out: utf8Out(out), err: utf8Out(err) };
  }

  /** Back to the normal prompt. */
  async leave(): Promise<void> {
    await this.send('\x02');
    await this.reader.until('>>> ', this.replyMs);
  }

  /** At the normal prompt: restarts the board softly; boot.py and main.py run again (R10). A board that words its
   *  restart otherwise has still restarted: only a lost board is an error. */
  async softReset(): Promise<void> {
    await this.send('\x04');
    await this.reader.until('soft reboot', this.replyMs).catch((e: ReplError) => { if (e.reason !== 'timeout') throw e; });
  }
}

/** The question the check asks — the words recorded on the real board (tests/fixtures/repl). */
export const UNAME_CODE = 'import os\nprint(os.uname())';

export type BoardAnswer =
  | { kind: 'micropython'; uname?: Uname }
  | { kind: 'no-micropython'; seen: string };

/**
 * The check when a board is plugged in (F-55, R10): stop its program, ask its name and MicroPython version, and start
 * its program again with a soft reset. No raw prompt in time means no MicroPython (or a program that won't stop).
 */
export async function checkBoard(link: Link, opts: ReplOptions = {}): Promise<BoardAnswer> {
  const repl = new RawRepl(link, opts);
  try {
    await repl.enter();
  } catch (e) {
    if (e instanceof ReplError && e.reason === 'refused') return { kind: 'no-micropython', seen: utf8Out(repl.seen) };
    throw e;
  }
  let uname: Uname | null;
  try {
    uname = parseUname((await repl.exec(UNAME_CODE)).out);
  } finally {
    await repl.leave();
    await repl.softReset();
  }
  return uname ? { kind: 'micropython', uname } : { kind: 'micropython' };
}
