import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A Python 3 session (M12, requirements Rev 10, architecture §2.11): MicroLab's runner (src/python3/runner.py) in
 * the bundled CPython, the student's program in its own process — as Thonny runs it. The window runs a file, answers
 * input(), sends the shell's lines and Ctrl+C; Stop ends the process if the program doesn't stop.
 */
export interface PyError { type: string; message: string; file: string; line: number | null }
export type Ended = { ended: 'done' | 'stopped' } | { ended: 'error'; error: PyError };
export type PythonEvent =
  | { ready: string }
  | { out: string }
  | { err: string }
  | { input: true }
  | { prompt: string }
  | Ended
  | { replError: PyError }
  /** A tkinter or turtle window has opened (beside MicroLab). */
  | { window: true }
  | { exit: number | null };

export interface PythonSession {
  /** The Python version, once the runner is ready. */
  readonly ready: Promise<string>;
  readonly alive: boolean;
  /** Runs a file's code as __main__ in its folder (once per session: a new Run is a new session). */
  run(file: { code: string; file: string; cwd: string }): void;
  /** input()'s answer, or a line for the shell. */
  line(text: string): void;
  /** Ctrl+C: a KeyboardInterrupt in the program, or the shell's line. */
  interrupt(): void;
  /** Stop: Ctrl+C, then the process ended if the program hasn't stopped within STOP_GRACE_MS (N-03); at the shell, at once. */
  stop(): Promise<void>;
  kill(): void;
  on(listener: (e: PythonEvent) => void): () => void;
  /** How the program ended, once it has. */
  ended(): Promise<Ended>;
}

export const STOP_GRACE_MS = 500;

const BIN = process.platform === 'win32' ? 'python.exe' : join('bin', 'python3');

/** The CPython MicroLab runs: MICROLAB_PYTHON; the one shipped in the app's resources; the one the build fetched
 *  into vendor/python (development); else the computer's own python3 (development only). */
export function findPython(env: NodeJS.ProcessEnv = process.env, resources = process.resourcesPath ?? '', cwd = process.cwd()): string {
  if (env.MICROLAB_PYTHON) return env.MICROLAB_PYTHON;
  const dirs = [...(resources ? [join(resources, 'python')] : []), join(cwd, 'vendor', 'python', `${process.platform}-${process.arch}`, 'python')];
  for (const dir of dirs) {
    const exe = join(dir, BIN);
    if (existsSync(exe)) return exe;
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

/** runner.py: in the app's resources, or in the source tree (development, tests). */
export function findRunner(resources = process.resourcesPath ?? '', cwd = process.cwd()): string {
  const shipped = join(resources, 'python3', 'runner.py');
  return resources && existsSync(shipped) ? shipped : join(cwd, 'src', 'python3', 'runner.py');
}

export function startPython(opts: { python: string; runner?: string; libs?: string; env?: NodeJS.ProcessEnv }): PythonSession {
  const args = ['-I', '-u', '-X', 'utf8', opts.runner ?? findRunner(), ...(opts.libs ? ['--libs', opts.libs] : [])];
  const child = spawn(opts.python, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, ...(opts.env ? { env: opts.env } : {}) });
  const listeners = new Set<(e: PythonEvent) => void>();
  const emit = (e: PythonEvent) => { for (const l of [...listeners]) l(e); };
  let alive = true;
  let atShell = false;
  let endedAs: Ended | undefined;
  const waiting: ((e: Ended) => void)[] = [];
  let exited: () => void = () => {};
  const exit = new Promise<void>((r) => { exited = r; });

  let readyResolve: (v: string) => void = () => {};
  let readyReject: (e: Error) => void = () => {};
  const ready = new Promise<string>((res, rej) => { readyResolve = res; readyReject = rej; });
  ready.catch(() => {});

  let buffer = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk;
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (!line.trim()) continue;
      let msg: PythonEvent;
      try { msg = JSON.parse(line) as PythonEvent; } catch { emit({ out: `${line}\n` }); continue; }
      if ('ready' in msg) readyResolve(msg.ready);
      if ('ended' in msg) {
        endedAs = msg;
        for (const w of waiting.splice(0)) w(msg);
      }
      if ('prompt' in msg) atShell = true;
      if ('out' in msg || 'err' in msg || 'input' in msg) atShell = false;
      emit(msg);
    }
  });
  // what Python itself says outside the runner's channel (it couldn't start, a crash): shown as an error
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (text: string) => emit({ err: text }));
  /** The process is gone: whatever waits for the program's end hears it stopped. */
  const over = () => {
    alive = false;
    if (!endedAs) {
      const stopped: Ended = { ended: 'stopped' };
      endedAs = stopped;
      for (const w of waiting.splice(0)) w(stopped);
    }
    exited();
  };
  // a Python that can't start (no such file, not executable): Node says so here, and no exit follows
  child.on('error', (e) => {
    readyReject(new Error(`Python couldn't start: ${e.message}`));
    emit({ err: `Python couldn't start: ${e.message}\n` });
    over();
  });
  child.on('exit', (code) => {
    readyReject(new Error('Python ended before it was ready'));
    emit({ exit: code });
    over();
  });

  const send = (msg: object) => {
    if (alive && child.stdin.writable) child.stdin.write(`${JSON.stringify(msg)}\n`);
  };

  return {
    ready,
    get alive() { return alive; },
    run(file) {
      endedAs = undefined;
      send({ run: file });
    },
    line(text) { send({ line: text }); },
    interrupt() { send({ interrupt: true }); },
    async stop() {
      if (!alive) return;
      if (endedAs || atShell) {
        child.kill();
        return exit;
      }
      send({ interrupt: true });
      const timer = setTimeout(() => child.kill('SIGKILL'), STOP_GRACE_MS);
      await Promise.race([new Promise<void>((r) => waiting.push(() => r())), exit]);
      clearTimeout(timer);
      child.kill();   // Stop switches the program off: its windows close with it
      return exit;
    },
    kill() { if (alive) child.kill('SIGKILL'); },
    on(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    ended() {
      if (endedAs) return Promise.resolve(endedAs);
      return new Promise<Ended>((r) => { waiting.push(r); });
    },
  };
}
