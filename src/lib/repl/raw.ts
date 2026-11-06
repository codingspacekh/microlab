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
  /** Told when the link goes away (the cable pulled): a wait for an answer ends at once. */
  onClose?(listener: () => void): () => void;
}

/** timeout: no answer in time; lost: unplugged; refused: it answered no; no-micropython: no raw prompt at all. */
export type ReplErrorReason = 'timeout' | 'lost' | 'refused' | 'no-micropython';

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
  /** Long commands go in pieces of this many bytes, with a pause between (an ESP32's serial input is small). */
  chunkBytes?: number;
  chunkPauseMs?: number;
}

const RAW_PROMPT = 'raw REPL; CTRL-B to exit\r\n>';
/** Commands this long or longer go in raw-paste mode. */
const PASTE_FROM = 64;
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
  private closed = false;
  private heard = 0;
  private readonly offs: (() => void)[] = [];

  constructor(link: Link) {
    this.offs.push(link.onData((d) => {
      this.buf += bytesText(d);
      this.heard = Date.now();
      this.wake?.();
    }));
    const off = link.onClose?.(() => {
      this.closed = true;
      this.wake?.();
    });
    if (off) this.offs.push(off);
  }

  /** Stops listening (a console keeps the port open across many commands). */
  dispose(): void {
    for (const off of this.offs.splice(0)) off();
  }

  /** Passes everything up to the marker on as it comes, with no time limit — a program's output (it ends when the
   *  program does, or is stopped). A possible start of the marker is held back until it is sure. */
  async pipe(marker: string, on: (text: string) => void): Promise<void> {
    for (;;) {
      const i = this.buf.indexOf(marker);
      if (i >= 0) {
        if (i) on(this.buf.slice(0, i));
        this.buf = this.buf.slice(i + marker.length);
        return;
      }
      let keep = 0;
      for (let k = Math.min(marker.length - 1, this.buf.length); k > 0; k--) {
        if (marker.startsWith(this.buf.slice(-k))) { keep = k; break; }
      }
      if (this.buf.length > keep) {
        on(this.buf.slice(0, this.buf.length - keep));
        this.buf = this.buf.slice(this.buf.length - keep);
      }
      if (this.closed) throw new ReplError('lost', 'The board was unplugged', this.buf);
      await new Promise<void>((r) => { this.wake = r; });
      this.wake = undefined;
    }
  }

  /**
   * Everything up to the marker (the marker itself is taken too); a timeout keeps the text for the error.
   * `quiet`: ms is how long the board may stay silent, not how long the whole answer may take — a long answer that
   * keeps coming (a file read back) is waited for. Not for a program's own output, which may never end.
   */
  async until(marker: string, ms: number, quiet = false): Promise<string> {
    let end = Date.now() + ms;
    for (;;) {
      if (quiet) end = Math.max(end, this.heard + ms);
      const i = this.buf.indexOf(marker);
      if (i >= 0) {
        const before = this.buf.slice(0, i);
        this.buf = this.buf.slice(i + marker.length);
        return before;
      }
      if (this.closed) throw new ReplError('lost', 'The board was unplugged', this.buf);
      const left = end - Date.now();
      if (left <= 0) throw new ReplError('timeout', `No answer from the board (waiting for ${JSON.stringify(marker)})`, this.buf);
      await new Promise<void>((r) => {
        const t = setTimeout(r, left);
        this.wake = () => { clearTimeout(t); r(); };
      });
      this.wake = undefined;
    }
  }

  /** Exactly n bytes (raw-paste's short answers), within ms. */
  async takeN(n: number, ms: number): Promise<string> {
    const end = Date.now() + ms;
    for (;;) {
      if (this.buf.length >= n) {
        const b = this.buf.slice(0, n);
        this.buf = this.buf.slice(n);
        return b;
      }
      if (this.closed) throw new ReplError('lost', 'The board was unplugged', this.buf);
      const left = end - Date.now();
      if (left <= 0) throw new ReplError('timeout', `No answer from the board (waiting for ${n} bytes)`, this.buf);
      await new Promise<void>((r) => {
        const t = setTimeout(r, left);
        this.wake = () => { clearTimeout(t); r(); };
      });
      this.wake = undefined;
    }
  }

  /** Whether the board has said something not yet read. */
  get pending(): boolean {
    return this.buf.length > 0;
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
  private readonly chunkBytes: number;
  private readonly chunkPauseMs: number;
  /** Raw-paste mode (MicroPython 1.14+): true once the board took it, false once it didn't. */
  private paste: boolean | undefined;
  private window = 0;
  /** What the board printed before it gave the raw prompt (its program's last words), for a "no MicroPython" answer. */
  seen = '';

  constructor(private readonly link: Link, opts: ReplOptions = {}) {
    this.reader = new Reader(link);
    this.pauseMs = opts.pauseMs ?? 100;
    this.replyMs = opts.replyMs ?? 1000;
    this.chunkBytes = opts.chunkBytes ?? 256;
    this.chunkPauseMs = opts.chunkPauseMs ?? 5;
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

  /**
   * Runs code at the raw prompt; its output and its error (a traceback) come back apart. A long command goes in
   * raw-paste mode when the board has it — the board asks for it a window at a time, so a board whose serial input
   * is slow (the micro:bit's) never drops a byte; short ones go as they are (as recorded on the boards).
   */
  async exec(code: string, ms = this.replyMs): Promise<{ out: string; err: string }> {
    // taken whole, or stopped in the middle (raw-paste, out of memory): either way its answer follows
    await this.sendCode(code, ms);
    return this.answer(ms);
  }

  /**
   * Runs code and passes its output and its error on as they come, for as long as it runs (a student's file on the
   * board, F-50); Ctrl-C (interrupt) ends it with a KeyboardInterrupt in its error.
   */
  async execStream(code: string, onOut: (text: string) => void, onErr: (text: string) => void): Promise<void> {
    await this.sendCode(code, this.replyMs);
    const utf8 = (on: (t: string) => void) => {
      const d = new TextDecoder();
      return { on: (t: string) => { const x = d.decode(latin1(t), { stream: true }); if (x) on(x); }, end: () => { const x = d.decode(); if (x) on(x); } };
    };
    const out = utf8(onOut);
    await this.reader.pipe('\x04', out.on);
    out.end();
    const err = utf8(onErr);
    await this.reader.pipe('\x04>', err.on);
    err.end();
  }

  /** Stop at once (Ctrl-C): a running command ends with a KeyboardInterrupt. */
  interrupt(): Promise<void> {
    return this.send('\x03');
  }

  dispose(): void {
    this.reader.dispose();
  }

  /** Sends a command; true when the board took all of it (false: it stopped in the middle, its error follows). */
  private async sendCode(code: string, ms: number): Promise<boolean> {
    const bytes = new TextEncoder().encode(code);
    if (bytes.length >= PASTE_FROM && this.paste !== false && await this.startPaste()) return this.pasteRun(bytes, ms);
    const all = new Uint8Array(bytes.length + 1);
    all.set(bytes);
    all[bytes.length] = 4;
    for (let i = 0; i < all.length; i += this.chunkBytes) {
      if (i && this.chunkPauseMs) await wait(this.chunkPauseMs);
      await this.write(all.subarray(i, i + this.chunkBytes));
    }
    await this.reader.until('OK', ms).catch((e: ReplError) => {
      throw e.reason === 'lost' ? e : new ReplError('refused', 'The board did not take the command', e.seen);
    });
    return true;
  }

  private async answer(ms: number): Promise<{ out: string; err: string }> {
    const out = await this.reader.until('\x04', ms, true);
    const err = await this.reader.until('\x04>', ms, true);
    return { out: utf8Out(out), err: utf8Out(err) };
  }

  /** Asks for raw-paste mode: "R\x01" and its window, "R\x00" no; older firmware just shows the raw prompt again. */
  private async startPaste(): Promise<boolean> {
    await this.send('\x05A\x01');
    const r = await this.reader.takeN(2, this.replyMs);
    if (r === 'R\x01') {
      const w = await this.reader.takeN(2, this.replyMs);
      this.window = w.charCodeAt(0) | (w.charCodeAt(1) << 8);
      this.paste = true;
      return true;
    }
    this.paste = false;
    if (r !== 'R\x00') await this.reader.until(RAW_PROMPT, this.replyMs);
    return false;
  }

  private async pasteRun(bytes: Uint8Array, ms: number): Promise<boolean> {
    let left = this.window;
    let i = 0;
    while (i < bytes.length) {
      while (left === 0 || this.reader.pending) {
        const c = await this.reader.takeN(1, ms);
        if (c === '\x01') left += this.window;
        else if (c === '\x04') {
          await this.send('\x04');
          return false;
        } else throw new ReplError('refused', `The board answered ${JSON.stringify(c)} in the middle of a command`);
      }
      const piece = bytes.subarray(i, i + left);
      await this.write(piece);
      i += piece.length;
      left -= piece.length;
    }
    await this.send('\x04');
    await this.reader.until('\x04', ms);
    return true;
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
    repl.dispose();
    if (e instanceof ReplError && e.reason === 'refused') return { kind: 'no-micropython', seen: utf8Out(repl.seen) };
    throw e;
  }
  let uname: Uname | null;
  try {
    uname = parseUname((await repl.exec(UNAME_CODE)).out);
  } finally {
    await repl.leave();
    await repl.softReset();
    repl.dispose();
  }
  return uname ? { kind: 'micropython', uname } : { kind: 'micropython' };
}
