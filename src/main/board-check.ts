import { checkBoard, type ReplOptions } from '@lib/repl';
import { openFailure, type BoardCheck, type FoundBoard } from '@lib/usb';
import type { SerialLink } from './serial-link';

/**
 * Asking a board what it is (F-55, R10): when a board is plugged in — it has just restarted anyway — its port is
 * opened, its program stopped, its name and MicroPython version asked, its program started again with a soft reset,
 * and the port closed. A port that won't open says why: another program holds it, or it can't be reached (F-56).
 */
export interface PortDeps {
  open(port: string): Promise<SerialLink>;
  whoHolds(port: string): Promise<string | undefined>;
  repl?: ReplOptions;
}

export async function checkPort(board: FoundBoard, deps: PortDeps): Promise<BoardCheck> {
  let link: SerialLink;
  try {
    link = await deps.open(board.port);
  } catch (e) {
    const message = (e as Error).message;
    if (openFailure(message) !== 'busy') return { state: 'cant-open', message };
    const by = await deps.whoHolds(board.port).catch(() => undefined);
    return by ? { state: 'busy', by } : { state: 'busy' };
  }
  try {
    const a = await checkBoard(link, deps.repl);
    if (a.kind === 'no-micropython') return { state: 'no-micropython', seen: a.seen };
    return a.uname ? { state: 'micropython', uname: a.uname } : { state: 'micropython' };
  } catch (e) {
    return { state: 'cant-open', message: (e as Error).message };
  } finally {
    await link.close().catch(() => {});
  }
}

/** What each board said, by its id; one check at a time per board; a board unplugged mid-check is forgotten. */
export class BoardChecker {
  checks: Record<string, BoardCheck> = {};
  private running = new Map<string, Promise<void>>();

  constructor(private readonly deps: PortDeps, private readonly onChange: (checks: Record<string, BoardCheck>) => void) {}

  check(board: FoundBoard): Promise<void> {
    const already = this.running.get(board.id);
    if (already) return already;
    this.set(board.id, { state: 'checking' });
    const p: Promise<void> = checkPort(board, this.deps).then((answer) => {
      if (this.running.get(board.id) === p) this.set(board.id, answer);
    }).finally(() => {
      if (this.running.get(board.id) === p) this.running.delete(board.id);
    });
    this.running.set(board.id, p);
    return p;
  }

  forget(ids: string[]): void {
    const next = { ...this.checks };
    for (const id of ids) {
      this.running.delete(id);
      delete next[id];
    }
    if (Object.keys(next).length === Object.keys(this.checks).length) return;
    this.checks = next;
    this.onChange(next);
  }

  private set(id: string, check: BoardCheck): void {
    this.checks = { ...this.checks, [id]: check };
    this.onChange(this.checks);
  }
}
