import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Help while typing Python 3 (M12 slice 5b, F-97): Jedi in a process of its own (src/python3/assist.py), started
 * when the editor first asks and kept ready — never the student's program's process, and Jedi never on its path.
 * Each question has an answer or, after ASSIST_MS (Jedi busy, or not there), nothing: typing never waits on it.
 */
export interface Completion {
  name: string;
  /** CodeMirror's kinds: namespace, class, function, variable, keyword, property, text. */
  type: string;
  /** Its signature on the first line (for a function or class), then its explanation; only the first names have one. */
  doc?: string;
  /** A function or class: taken with its brackets — the cursor inside them when it takes arguments. */
  call?: 'args' | 'empty';
}
export interface Signature { name: string; params: string[]; active: number; doc: string }
/** Where in the code: line from 1, column from 0 (Jedi's), the file's path (or name, not saved). */
export interface Place { code: string; line: number; column: number; path: string }

export const ASSIST_MS = 4000;

/** Jedi and parso: in the app's resources, or fetched into vendor/ (development); undefined if not there. */
export function findTools(resources = process.resourcesPath ?? '', cwd = process.cwd()): string | undefined {
  return [...(resources ? [join(resources, 'python-tools')] : []), join(cwd, 'vendor', 'python-tools')].find((d) => existsSync(join(d, 'jedi')));
}

export function findAssist(resources = process.resourcesPath ?? '', cwd = process.cwd()): string {
  const shipped = join(resources, 'python3', 'assist.py');
  return resources && existsSync(shipped) ? shipped : join(cwd, 'src', 'python3', 'assist.py');
}

export class Assistant {
  private child: ChildProcess | null = null;
  private buffer = '';
  private last = 0;
  private readonly asked = new Map<number, (reply: Record<string, unknown>) => void>();

  constructor(private readonly opts: { python: string; tools: string | undefined; libs: string; script?: string; timeoutMs?: number }) {}

  /** False when Jedi isn't there: nothing is offered (the editor still has Python's own words). */
  get available(): boolean {
    return !!this.opts.tools;
  }

  complete(at: Place): Promise<Completion[]> {
    return this.ask({ complete: at }).then((r) => (r?.completions as Completion[] | undefined) ?? []);
  }

  signature(at: Place): Promise<Signature | null> {
    return this.ask({ signature: at }).then((r) => (r?.signature as Signature | null | undefined) ?? null);
  }

  /** Ends the helper (MicroLab closing, or a library installed: the next question starts one that sees it). */
  dispose(): void {
    const child = this.child;
    this.child = null;
    child?.kill();
    this.unanswered();
  }

  /** The questions still waiting get nothing. */
  private unanswered(): void {
    for (const answer of this.asked.values()) answer({});
    this.asked.clear();
  }

  private start(): ChildProcess | null {
    if (this.child && this.child.exitCode === null && !this.child.killed) return this.child;
    if (!this.opts.tools) return null;
    const args = ['-I', '-u', '-X', 'utf8', this.opts.script ?? findAssist(), '--tools', this.opts.tools, '--libs', this.opts.libs];
    const child = spawn(this.opts.python, args, { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
    child.stdout!.setEncoding('utf8');
    child.stdout!.on('data', (text: string) => {
      this.buffer += text;
      let nl: number;
      while ((nl = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, nl);
        this.buffer = this.buffer.slice(nl + 1);
        let msg: Record<string, unknown>;
        try { msg = JSON.parse(line) as Record<string, unknown>; } catch { continue; }
        const id = msg.id as number | undefined;
        if (id !== undefined) { this.asked.get(id)?.(msg); this.asked.delete(id); }
      }
    });
    // a helper that ended (or couldn't start) — only if it is still the one asked: a disposed one's late exit
    // would otherwise take the new one's questions with it
    const gone = () => {
      if (this.child !== child) return;
      this.child = null;
      this.unanswered();
    };
    child.on('exit', gone);
    child.on('error', gone);
    // a question written as the helper ends fails with EPIPE: unheard, it would be an uncaught error in the main
    // process; its exit is what says it is gone (the question gets no answer, as on a timeout)
    child.stdin?.on('error', () => {});
    this.child = child;
    this.buffer = '';
    return child;
  }

  private ask(question: object): Promise<Record<string, unknown> | undefined> {
    const child = this.start();
    if (!child?.stdin?.writable) return Promise.resolve(undefined);
    const id = ++this.last;
    return new Promise((answer) => {
      const timer = setTimeout(() => { this.asked.delete(id); answer(undefined); }, this.opts.timeoutMs ?? ASSIST_MS);
      this.asked.set(id, (r) => { clearTimeout(timer); answer(r); });
      child.stdin!.write(`${JSON.stringify({ id, ...question })}\n`);
    });
  }
}
