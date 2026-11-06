import { BoardConsole, checkBoard, modelOf, ReplError, sendFiles, type ConsoleAction, type ConsoleKind, type ConsoleState, type ReplOptions, type SendRequest, type SendResult, type Uname } from '@lib/repl';
import { openFailure, type BoardCheck, type FoundBoard } from '@lib/usb';
import type { SerialLink } from './serial-link';

/**
 * Talking to the boards (F-50, F-55, R10): asking a board what it is when it is plugged in — it has just restarted
 * anyway — and sending a project's files to it. The port is opened for each, and closed again so Thonny can use the
 * board in between; one at a time per board. A port that won't open says why: another program holds it, or it can't
 * be reached (F-56).
 */
export interface PortDeps {
  open(port: string): Promise<SerialLink>;
  whoHolds(port: string): Promise<string | undefined>;
  /** Keeps a copy of a board's old file on the laptop; returns the folder it went in. */
  keepOld?: (board: string, path: string, data: Uint8Array) => Promise<string>;
  repl?: ReplOptions;
}

/** The folder a board's old files are kept in: "micro-bit 2026-11-06 14-03-39" — no character Windows or macOS
 *  refuses in a name (the micro:bit's colon). */
export function backupFolder(board: string, t: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  const stamp = `${t.getFullYear()}-${two(t.getMonth() + 1)}-${two(t.getDate())} ${two(t.getHours())}-${two(t.getMinutes())}-${two(t.getSeconds())}`;
  return `${board.replace(/[\\/:*?"<>|]/g, '-')} ${stamp}`;
}

type Opened = { link: SerialLink } | { failed: BoardCheck };

async function openPort(board: FoundBoard, deps: PortDeps): Promise<Opened> {
  try {
    return { link: await deps.open(board.port) };
  } catch (e) {
    const message = (e as Error).message;
    if (openFailure(message) !== 'busy') return { failed: { state: 'cant-open', message } };
    const by = await deps.whoHolds(board.port).catch(() => undefined);
    return { failed: by ? { state: 'busy', by } : { state: 'busy' } };
  }
}

export async function checkPort(board: FoundBoard, deps: PortDeps): Promise<BoardCheck> {
  const o = await openPort(board, deps);
  if ('failed' in o) return o.failed;
  try {
    const a = await checkBoard(o.link, deps.repl);
    if (a.kind === 'no-micropython') return { state: 'no-micropython', seen: a.seen };
    return a.uname ? { state: 'micropython', uname: a.uname } : { state: 'micropython' };
  } catch (e) {
    return { state: 'cant-open', message: (e as Error).message };
  } finally {
    await o.link.close().catch(() => {});
  }
}

/** What the window is told of the consoles: each one's output as it comes, and which are open and how. */
export interface ConsoleEvents {
  output(id: string, text: string, kind: ConsoleKind): void;
  sessions(states: Record<string, ConsoleState>): void;
}

interface Session {
  link: SerialLink;
  console: BoardConsole;
  off?: () => void;
}

const busyMessage = (f: BoardCheck) => (f.state === 'busy'
  ? `The board is used by ${f.by ?? 'another program'}. Close ${f.by ?? 'it'}, or press Stop/Disconnect in it, then try again.`
  : `MicroLab can't talk to the board: ${(f as { message: string }).message}`);

const unameOf = (c: BoardCheck | undefined) => (c && (c.state === 'micropython' || c.state === 'sending') ? c.uname : undefined);

const answered = (uname?: Uname): BoardCheck => (uname ? { state: 'micropython', uname } : { state: 'micropython' });

/** What each board said, by its id; one thing at a time per board; a board unplugged meanwhile is forgotten. */
export class Boards {
  checks: Record<string, BoardCheck> = {};
  private checking = new Map<string, Promise<void>>();
  private tail = new Map<string, Promise<unknown>>();
  private era = new Map<string, number>();
  private sessions = new Map<string, Session>();
  private consoleStates: Record<string, ConsoleState> = {};

  constructor(
    private readonly deps: PortDeps,
    private readonly onChange: (checks: Record<string, BoardCheck>) => void,
    private readonly events?: ConsoleEvents,
  ) {}

  get consoles(): Record<string, ConsoleState> {
    return this.consoleStates;
  }

  /**
   * A job with the board's port: the console's open port when there is one (the console muted meanwhile, so none of
   * the job's talk shows), else the port opened for it and closed after — or kept, as the console's (`keep`).
   */
  private async withPort<T>(board: FoundBoard, job: (link: SerialLink) => Promise<T>, keep = false): Promise<T | { failed: BoardCheck }> {
    const s = this.sessions.get(board.id);
    if (s) {
      s.console.mute();
      try {
        return await job(s.link);
      } finally {
        s.console.unmute();
      }
    }
    const o = await openPort(board, this.deps);
    if ('failed' in o) return o;
    let kept = false;
    try {
      const r = await job(o.link);
      if (keep) { this.startSession(board.id, o.link); kept = true; }
      return r;
    } finally {
      if (!kept) await o.link.close().catch(() => {});
    }
  }

  private startSession(id: string, link: SerialLink): Session {
    const s: Session = {
      link,
      console: new BoardConsole(link, {
        output: (text, kind) => this.events?.output(id, text, kind),
        state: (st) => this.setConsole(id, st),
      }, this.deps.repl),
    };
    s.off = link.onClose?.(() => this.endSession(id));
    this.sessions.set(id, s);
    this.setConsole(id, s.console.state);
    return s;
  }

  private endSession(id: string): void {
    const s = this.sessions.get(id);
    if (!s) return;
    this.sessions.delete(id);
    s.off?.();
    s.console.dispose();
    const rest = { ...this.consoleStates };
    delete rest[id];
    this.consoleStates = rest;
    this.events?.sessions(rest);
  }

  private setConsole(id: string, st: ConsoleState): void {
    if (!this.sessions.has(id)) return;
    this.consoleStates = { ...this.consoleStates, [id]: st };
    this.events?.sessions(this.consoleStates);
  }

  /** Opens the board's console (F-51): the port stays open — Thonny can't use the board until it is closed. */
  async openConsole(board: FoundBoard): Promise<{ ok: true } | { ok: false; message: string }> {
    return this.queue(board.id, async () => {
      if (this.sessions.has(board.id)) return { ok: true as const };
      const o = await openPort(board, this.deps);
      if ('failed' in o) {
        this.set(board.id, o.failed, this.eraOf(board.id));
        return { ok: false as const, message: busyMessage(o.failed) };
      }
      this.startSession(board.id, o.link);
      return { ok: true as const };
    });
  }

  /** Closes it: the port is let go, so Thonny and other programs can use the board. */
  async closeConsole(id: string): Promise<void> {
    const s = this.sessions.get(id);
    if (!s) return;
    if (s.console.runningFile) await s.console.interrupt().catch(() => {});
    await this.queue(id, async () => {
      const link = this.sessions.get(id)?.link;
      this.endSession(id);
      await link?.close().catch(() => {});
    });
  }

  /** Typing and Stop go straight to the board — Stop must reach a file that runs for ever; restarting and running a
   *  file wait their turn for the port. */
  async console(id: string, a: ConsoleAction): Promise<void> {
    const s = this.sessions.get(id);
    if (!s) return;
    if (a.do === 'interrupt') return s.console.interrupt();
    if (a.do === 'type') return s.console.type(a.text);
    await this.stopFile(id);
    await this.queue(id, async () => {
      const now = this.sessions.get(id);
      if (!now) return;
      if (a.do === 'restart') await now.console.restart();
      else await now.console.runFile(a.name, a.code);
    }).catch(() => {});
  }

  /** A file run on the board holds the port until it ends: whatever comes next stops it first. */
  private async stopFile(id: string): Promise<void> {
    const s = this.sessions.get(id);
    if (s?.console.runningFile) await s.console.interrupt();
  }

  /** Runs one thing with a board's port, after whatever is already running with it. */
  private queue<T>(id: string, job: () => Promise<T>): Promise<T> {
    const run = (this.tail.get(id) ?? Promise.resolve()).catch(() => {}).then(job);
    this.tail.set(id, run);
    return run;
  }

  check(board: FoundBoard): Promise<void> {
    if (this.sessions.has(board.id)) return Promise.resolve();   // its console is open: it is already talking
    const already = this.checking.get(board.id);
    if (already) return already;
    const era = this.eraOf(board.id);
    this.set(board.id, { state: 'checking' }, era);
    const p = this.queue(board.id, async () => {
      // its console may have opened meanwhile (Send and run): it is talking already
      if (this.sessions.has(board.id)) { this.set(board.id, answered(unameOf(this.checks[board.id])), era); return; }
      this.set(board.id, await checkPort(board, this.deps), era);
    }).finally(() => this.checking.delete(board.id));
    this.checking.set(board.id, p);
    return p;
  }

  send(board: FoundBoard, files: Record<string, string | Uint8Array>, req: SendRequest): Promise<SendResult> {
    const era = this.eraOf(board.id);
    const total = Object.keys(files).length;
    const before = this.checks[board.id];
    let uname = before?.state === 'micropython' ? before.uname : undefined;
    const sending = (done: number) => this.set(board.id, { state: 'sending', done, total, ...(uname ? { uname } : {}) }, era);
    sending(0);
    void this.stopFile(board.id);
    return this.queue(board.id, async (): Promise<SendResult> => {
      let keptIn: string | undefined;
      const short = () => (uname ? modelOf(uname).short : 'board');
      try {
        const r = await this.withPort(board, (link) => sendFiles(link, files, {
          ...this.deps.repl,
          // run: the board restarts in its console, so what main.py prints is seen (F-51, screen 16)
          run: false,
          onProgress: (p) => { if (p.uname) uname = p.uname; sending(p.done); },
          ...(req.keep && this.deps.keepOld ? { keepOld: async (path: string, data: Uint8Array) => { keptIn = await this.deps.keepOld!(short(), path, data); } } : {}),
        }), req.run);
        if ('failed' in r) {
          this.set(board.id, r.failed, era);
          return { ok: false, message: busyMessage(r.failed).replace('try again', 'send again') };
        }
        this.set(board.id, answered(r.uname ?? uname), era);
        if (req.run) await this.sessions.get(board.id)?.console.softReset();
        return { ok: true, board: short(), sent: r.sent, same: r.same, kept: r.kept, ...(keptIn ? { keptIn } : {}) };
      } catch (e) {
        const reason = e instanceof ReplError ? e.reason : undefined;
        if (reason === 'no-micropython') {
          this.set(board.id, { state: 'no-micropython', seen: (e as ReplError).seen }, era);
          return { ok: false, message: "The board didn't answer as MicroPython does — it may be running a MakeCode or Arduino program, or a program that doesn't stop when asked. Nothing was sent." };
        }
        this.set(board.id, answered(uname), era);
        if (reason === 'lost') return { ok: false, message: 'The board was unplugged while sending. Its files are as they were before — plug it back in and send again.' };
        if (reason === 'timeout') return { ok: false, message: 'The board stopped answering. Unplug it, plug it back in, and send again.' };
        return { ok: false, message: (e as Error).message };
      }
    });
  }

  forget(ids: string[]): void {
    for (const id of ids) this.endSession(id);
    const next = { ...this.checks };
    for (const id of ids) {
      this.checking.delete(id);
      this.era.set(id, this.eraOf(id) + 1);
      delete next[id];
    }
    if (Object.keys(next).length === Object.keys(this.checks).length) return;
    this.checks = next;
    this.onChange(next);
  }

  private eraOf(id: string): number {
    return this.era.get(id) ?? 0;
  }

  /** A board's state — unless it was unplugged since this began (its era moved on). */
  private set(id: string, check: BoardCheck, era: number): void {
    if (era !== this.eraOf(id)) return;
    this.checks = { ...this.checks, [id]: check };
    this.onChange(this.checks);
  }
}
