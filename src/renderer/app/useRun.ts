import { useCallback, useEffect, useRef, useState } from 'react';
import type { Fault, SimState } from '@lib/circuit';
import type { ProjectDoc } from '@lib/project';
import { explain, type Explanation } from '@lib/errors';
import type { PartView } from '../../sim/circuit';
import type { RunResult, SimError } from '../../sim/run';
import type { Tone } from '../../sim/worker-core';
import { startRun as realStart, type RunEvents, type RunHandle } from '../sim-client';
import { PACK } from './libpack';

/**
 * A run as the window sees it (F-22, F-23, screen 03): idle, running or stopping; the console's text in pieces
 * (the board's own output, the app's notes, errors in red); the latest state of every part and of the board's own
 * outputs; how it ended. Restart stops the run and starts it again with the project as it is now.
 */
export type StartRun = (req: { doc: ProjectDoc; entry: string }, events: RunEvents) => RunHandle;
/** out: what the board prints; sys: the app's notes; err: errors; me: what the student typed, echoed (M9); why: an
 *  error explained (M9, screen 05). */
export type ConsoleKind = 'out' | 'sys' | 'err' | 'me' | 'why';
export interface ConsoleChunk { kind: ConsoleKind; text: string; why?: Explanation }
/** The board's own outputs while running: pin levels, the micro:bit's display, its speaker's pitch (Hz; M6.2). */
export interface BoardOutputs {
  pins: Record<string, number>; display?: string; sound?: number; tone?: Tone; radio?: string[];
  /** The circuit's pins and parts as the board's run has them (M9 slice 4: the multimeter reads with them). */
  state?: SimState;
}

export interface RunState {
  /** idle also while the REPL waits after the program (`repl`). */
  status: 'idle' | 'running' | 'stopping';
  /** The program has ended and the REPL takes lines (M9, F-23): the board is still on. */
  repl?: boolean;
  startedAt?: number;
  console: ConsoleChunk[];
  parts: Record<string, PartView>;
  board: BoardOutputs;
  ended?: RunResult;
  /** The faults of this run or the last, each once (M9 slice 2): as they are seen, then with their worst numbers. */
  faults: Fault[];
  /** LEDs burnt out in a run: dead in the next ones until replaced (screen 04: "Replace the LED"). */
  burnt: string[];
}

/** The console keeps about this much text: a program printing in a loop can't fill the memory. */
export const CONSOLE_LIMIT = 200_000;
const IDLE: RunState = { status: 'idle', console: [], parts: {}, board: { pins: {} }, faults: [], burnt: [] };
const keyOf = (f: Fault) => `${f.kind}:${f.on}`;

export function useRun(start: StartRun = realStart) {
  const [state, setState] = useState<RunState>(IDLE);
  // the session: from Run until Stop — the program, then the REPL
  const handle = useRef<RunHandle | null>(null);
  const atRepl = useRef(false);
  const again = useRef<(() => ProjectDoc) | null>(null);
  const typed = useRef('');
  const burnt = useRef<string[]>([]);
  burnt.current = state.burnt;

  const add = (chunk: ConsoleChunk) => setState((s) => ({ ...s, console: append(s.console, chunk) }));
  /** Ends a session at the REPL at once (a new run, another project). */
  const close = () => {
    handle.current?.close?.();
    handle.current = null;
    atRepl.current = false;
  };

  const run = useCallback((doc: ProjectDoc, entry: string, boardName: string) => {
    if (handle.current && !atRepl.current) return;
    close();
    const greeting = `${firmwareOf(doc.project.board)} on ${boardName} (simulated) — running ${entry}\n`;
    // a burnt LED whose part is gone — deleted, or another project's — is forgotten
    const dead = burnt.current.filter((id) => doc.project.parts.some((p) => p.id === id.split(':')[0]));
    setState({ ...IDLE, status: 'running', startedAt: Date.now(), console: [{ kind: 'sys', text: greeting }], burnt: dead });
    const context = { files: doc.files, board: doc.project.board, libraries: LIBRARIES };
    const session: RunHandle = start({ doc, entry, ...(dead.length ? { burnt: dead } : {}) }, {
      onOutput: (text, echo) => add({ kind: echo ? 'me' : 'out', text }),
      onParts: (states) => setState((s) => ({ ...s, parts: { ...s.parts, ...states } })),
      // the radio's messages sent (M7): the last six, as hex
      onBoard: (b) => setState((s) => ({ ...s, board: { pins: { ...s.board.pins, ...b.pins }, display: b.display ?? s.board.display, sound: b.sound ?? s.board.sound, tone: b.sound !== undefined ? b.tone : s.board.tone,
        radio: b.radio ? [...(s.board.radio ?? []), ...b.radio].slice(-6) : s.board.radio, state: b.state ?? s.board.state } })),
      onFault: (f) => {
        if (handle.current !== session) return;
        setState((s) => (s.faults.some((x) => keyOf(x) === keyOf(f)) ? s : { ...s, faults: [...s.faults, f] }));
      },
      onEnd: (result) => {
        if (handle.current !== session) return;
        if (result.repl) atRepl.current = true;
        else handle.current = null;
        const why = result.ended === 'error' && result.error ? explain(result.error, context) : undefined;
        setState((s) => ({
          ...s,
          status: 'idle',
          ended: result,
          repl: !!result.repl,
          console: [...endNotes(result, entry, why)].reduce(append, s.console),
          // the run's faults with their worst numbers, in the order they were seen; its burnt LEDs stay dead
          faults: ordered(s.faults, result.faults ?? []),
          burnt: [...new Set([...s.burnt, ...(result.faults ?? []).filter((f) => f.kind === 'led-burnt').map((f) => f.on)])],
          // stopped by the student: the board goes dark; ended by itself (or Ctrl+C, at the REPL): the parts stay
          ...(result.ended === 'stopped' && !result.repl ? { parts: {}, board: { pins: {} } } : {}),
        }));
        const next = again.current;
        again.current = null;
        if (next) setTimeout(() => runRef.current(next(), entry, boardName), 0);
      },
      onReplError: (error: SimError) => {
        const why = explain(error, { ...context, typed: typed.current });
        if (why) add({ kind: 'why', text: '', why });
      },
    });
    handle.current = session;
  }, [start]);
  const runRef = useRef(run);
  runRef.current = run;

  const stop = useCallback(() => {
    if (!handle.current) return;
    if (atRepl.current) {
      // at the REPL, Stop switches the board off
      close();
      setState((s) => ({ ...s, repl: false, parts: {}, board: { pins: {} }, console: append(s.console, { kind: 'sys', text: '\nStopped.\n' }) }));
      return;
    }
    setState((s) => ({ ...s, status: 'stopping' }));
    handle.current.stop();
  }, []);

  /** Stop, then run again with the project as `latest` gives it then. */
  const restart = useCallback((latest: () => ProjectDoc) => {
    if (!handle.current) return;
    if (atRepl.current) {
      runRef.current(latest(), state.ended ? entryOf(state) : 'main.py', boardOf(state));
      return;
    }
    again.current = latest;
    stop();
  }, [stop, state]);

  const setInput = useCallback((name: string, value: number) => handle.current?.setInput(name, value), []);
  /** What the student typed in the console (M9): a line (sent with its Enter), or Ctrl+C ('\x03'). */
  const type = useCallback((text: string) => {
    if (!handle.current) return;
    if (text !== '\x03') typed.current = text;
    handle.current.type?.(text === '\x03' ? text : `${text}\n`);
  }, []);
  /** The REPL can't go on (the circuit changed): it ends, with why. */
  const endRepl = useCallback((why: string) => {
    if (!atRepl.current) return;
    close();
    setState((s) => ({ ...s, repl: false, console: append(s.console, { kind: 'sys', text: `\n${why}\n` }) }));
  }, []);
  const clear = useCallback(() => setState((s) => ({ ...s, console: [] })), []);
  /** Problems' Clear: the faults go until the next run (burnt LEDs stay burnt). */
  const clearFaults = useCallback(() => setState((s) => ({ ...s, faults: [] })), []);
  /** "Replace the LED" (screen 04): a new one in its place — it lights again in the next run. */
  const replace = useCallback((led: string) => {
    const part = led.split(':')[0];
    setState((s) => ({
      ...s,
      burnt: s.burnt.filter((id) => id.split(':')[0] !== part),
      faults: s.faults.filter((f) => !(f.kind === 'led-burnt' && f.on.split(':')[0] === part)),
    }));
  }, []);
  /** Another project: stop what runs, forget the last run. */
  const reset = useCallback(() => {
    again.current = null;
    if (atRepl.current) close();
    handle.current?.stop();
    handle.current = null;
    setState(IDLE);
  }, []);

  useEffect(() => () => { if (atRepl.current) close(); else handle.current?.stop(); }, []);

  return { state, run, stop, restart, setInput, type, endRepl, clear, clearFaults, replace, reset };
}

/** The run's faults in the order they were told, each with the end's numbers (its worst); any not told, after. */
function ordered(told: Fault[], end: Fault[]): Fault[] {
  const worst = new Map(end.map((f) => [keyOf(f), f]));
  const out = told.map((f) => worst.get(keyOf(f)) ?? f);
  for (const f of end) if (!told.some((t) => keyOf(t) === keyOf(f))) out.push(f);
  return out;
}

/** The library pack's modules, for an ImportError (M9). */
const LIBRARIES = PACK.libraries.flatMap((l) => l.builds.flatMap((b) => Object.keys(b.files).filter((f) => f.endsWith('.py')).map((f) => ({ module: f.replace(/\.py$/, '').split('/').pop()!, title: l.title }))));

/** The greeting's file and board, for Restart at the REPL: "… on Pico W (simulated) — running main.py". */
function entryOf(s: RunState): string {
  const text = s.console[0]?.text ?? '';
  return / — running (.+)\n/.exec(text)?.[1] ?? 'main.py';
}
function boardOf(s: RunState): string {
  const text = s.console[0]?.text ?? '';
  return / on (.+) \(simulated\)/.exec(text)?.[1] ?? '';
}

/** The firmware the simulator copies on each board (as the real board's banner names it). */
function firmwareOf(board: string): string {
  return board === 'microbit-v2' ? 'micro:bit MicroPython v2.1.2 (MicroPython v1.18)' : 'MicroPython v1.29.0';
}

function endNote(r: RunResult, entry: string): ConsoleChunk {
  if (r.ended === 'fault' && r.fault) return { kind: 'err', text: `\n${r.fault.message}\n` };
  if (r.ended === 'error') {
    const e = r.error;
    const where = e?.line ? ` (${e.file ?? entry}, line ${e.line})` : '';
    return { kind: 'err', text: `\nThe program stopped with an error${where}: ${e?.type ?? 'Error'}${e?.message ? `: ${e.message}` : ''}\n` };
  }
  if (r.ended === 'stopped') return { kind: 'sys', text: '\nStopped.\n' };
  return { kind: 'sys', text: '\nThe program ended.\n' };
}

/** How the program ended; what its error means (M9, screen 05); the REPL ready (screen 29c). */
function* endNotes(r: RunResult, entry: string, why?: Explanation): Generator<ConsoleChunk> {
  const ready = 'Its names are still here: type Python and press Enter.';
  if (r.repl && r.ended === 'done') yield { kind: 'sys', text: `\n${entry} ended. ${ready}\n` };
  else if (r.repl && r.ended === 'stopped') yield { kind: 'sys', text: `\nStopped (Ctrl+C). ${ready}\n` };
  else yield endNote(r, entry);
  if (why) yield { kind: 'why', text: '', why };
  if (r.repl && r.ended === 'error') yield { kind: 'sys', text: `${ready}\n` };
}

/** Adds to the console, joining text of the same kind; keeps the last CONSOLE_LIMIT characters. */
export function append(chunks: ConsoleChunk[], c: ConsoleChunk): ConsoleChunk[] {
  let last = chunks.at(-1);
  // what the student typed: with the prompt it answers (>>> , input()'s), which ends the board's output
  if (c.kind === 'me' && last?.kind === 'out' && !last.text.endsWith('\n')) {
    const cut = last.text.lastIndexOf('\n') + 1;
    c = { kind: 'me', text: last.text.slice(cut) + c.text };
    chunks = cut ? [...chunks.slice(0, -1), { kind: 'out', text: last.text.slice(0, cut) }] : chunks.slice(0, -1);
    last = chunks.at(-1);
  }
  let out = last?.kind === c.kind && c.kind !== 'why' ? [...chunks.slice(0, -1), { kind: c.kind, text: last.text + c.text }] : [...chunks, c];
  let size = out.reduce((n, x) => n + x.text.length, 0);
  while (size > CONSOLE_LIMIT && out.length) {
    const first = out[0]!;
    const cut = Math.min(first.text.length, size - CONSOLE_LIMIT);
    size -= cut;
    out = cut === first.text.length ? out.slice(1) : [{ ...first, text: first.text.slice(cut) }, ...out.slice(1)];
  }
  return out;
}
