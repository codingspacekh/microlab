import { checkBoard, modelOf, ReplError, sendFiles, type ReplOptions, type SendRequest, type SendResult, type Uname } from '@lib/repl';
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

const answered = (uname?: Uname): BoardCheck => (uname ? { state: 'micropython', uname } : { state: 'micropython' });

/** What each board said, by its id; one thing at a time per board; a board unplugged meanwhile is forgotten. */
export class Boards {
  checks: Record<string, BoardCheck> = {};
  private checking = new Map<string, Promise<void>>();
  private tail = new Map<string, Promise<unknown>>();
  private era = new Map<string, number>();

  constructor(private readonly deps: PortDeps, private readonly onChange: (checks: Record<string, BoardCheck>) => void) {}

  /** Runs one thing with a board's port, after whatever is already running with it. */
  private queue<T>(id: string, job: () => Promise<T>): Promise<T> {
    const run = (this.tail.get(id) ?? Promise.resolve()).catch(() => {}).then(job);
    this.tail.set(id, run);
    return run;
  }

  check(board: FoundBoard): Promise<void> {
    const already = this.checking.get(board.id);
    if (already) return already;
    const era = this.eraOf(board.id);
    this.set(board.id, { state: 'checking' }, era);
    const p = this.queue(board.id, async () => {
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
    return this.queue(board.id, async (): Promise<SendResult> => {
      const o = await openPort(board, this.deps);
      if ('failed' in o) {
        this.set(board.id, o.failed, era);
        const f = o.failed;
        return {
          ok: false,
          message: f.state === 'busy'
            ? `The board is used by ${f.by ?? 'another program'}. Close ${f.by ?? 'it'}, or press Stop/Disconnect in it, then send again.`
            : `MicroLab can't talk to the board: ${(f as { message: string }).message}`,
        };
      }
      let keptIn: string | undefined;
      const short = () => (uname ? modelOf(uname).short : 'board');
      try {
        const r = await sendFiles(o.link, files, {
          ...this.deps.repl,
          run: req.run,
          onProgress: (p) => { if (p.uname) uname = p.uname; sending(p.done); },
          ...(req.keep && this.deps.keepOld ? { keepOld: async (path: string, data: Uint8Array) => { keptIn = await this.deps.keepOld!(short(), path, data); } } : {}),
        });
        this.set(board.id, answered(r.uname ?? uname), era);
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
      } finally {
        await o.link.close().catch(() => {});
      }
    });
  }

  forget(ids: string[]): void {
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
