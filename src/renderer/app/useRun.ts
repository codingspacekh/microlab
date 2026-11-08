import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProjectDoc } from '@lib/project';
import type { PartView } from '../../sim/circuit';
import type { RunResult } from '../../sim/run';
import type { Tone } from '../../sim/worker-core';
import { startRun as realStart, type RunEvents, type RunHandle } from '../sim-client';

/**
 * A run as the window sees it (F-22, F-23, screen 03): idle, running or stopping; the console's text in pieces
 * (the board's own output, the app's notes, errors in red); the latest state of every part and of the board's own
 * outputs; how it ended. Restart stops the run and starts it again with the project as it is now.
 */
export type StartRun = (req: { doc: ProjectDoc; entry: string }, events: RunEvents) => RunHandle;
export type ConsoleKind = 'out' | 'sys' | 'err';
export interface ConsoleChunk { kind: ConsoleKind; text: string }
/** The board's own outputs while running: pin levels, the micro:bit's display, its speaker's pitch (Hz; M6.2). */
export interface BoardOutputs { pins: Record<string, number>; display?: string; sound?: number; tone?: Tone; radio?: string[] }

export interface RunState {
  status: 'idle' | 'running' | 'stopping';
  startedAt?: number;
  console: ConsoleChunk[];
  parts: Record<string, PartView>;
  board: BoardOutputs;
  ended?: RunResult;
}

/** The console keeps about this much text: a program printing in a loop can't fill the memory. */
export const CONSOLE_LIMIT = 200_000;
const IDLE: RunState = { status: 'idle', console: [], parts: {}, board: { pins: {} } };

export function useRun(start: StartRun = realStart) {
  const [state, setState] = useState<RunState>(IDLE);
  const handle = useRef<RunHandle | null>(null);
  const again = useRef<(() => ProjectDoc) | null>(null);

  const add = (chunk: ConsoleChunk) => setState((s) => ({ ...s, console: append(s.console, chunk) }));

  const run = useCallback((doc: ProjectDoc, entry: string, boardName: string) => {
    if (handle.current) return;
    const greeting = `${firmwareOf(doc.project.board)} on ${boardName} (simulated) — running ${entry}\n`;
    setState({ ...IDLE, status: 'running', startedAt: Date.now(), console: [{ kind: 'sys', text: greeting }] });
    handle.current = start({ doc, entry }, {
      onOutput: (text) => add({ kind: 'out', text }),
      onParts: (states) => setState((s) => ({ ...s, parts: { ...s.parts, ...states } })),
      // the radio's messages sent (M7): the last six, as hex
      onBoard: (b) => setState((s) => ({ ...s, board: { pins: { ...s.board.pins, ...b.pins }, display: b.display ?? s.board.display, sound: b.sound ?? s.board.sound, tone: b.sound !== undefined ? b.tone : s.board.tone,
        radio: b.radio ? [...(s.board.radio ?? []), ...b.radio].slice(-6) : s.board.radio } })),
      onEnd: (result) => {
        handle.current = null;
        setState((s) => ({
          ...s,
          status: 'idle',
          ended: result,
          console: append(s.console, endNote(result, entry)),
          // stopped by the student: the board goes dark; ended by itself: the parts stay as the program left them
          ...(result.ended === 'stopped' ? { parts: {}, board: { pins: {} } } : {}),
        }));
        const next = again.current;
        again.current = null;
        if (next) setTimeout(() => runRef.current(next(), entry, boardName), 0);
      },
    });
  }, [start]);
  const runRef = useRef(run);
  runRef.current = run;

  const stop = useCallback(() => {
    if (!handle.current) return;
    setState((s) => ({ ...s, status: 'stopping' }));
    handle.current.stop();
  }, []);

  /** Stop, then run again with the project as `latest` gives it then. */
  const restart = useCallback((latest: () => ProjectDoc) => {
    if (!handle.current) return;
    again.current = latest;
    stop();
  }, [stop]);

  const setInput = useCallback((name: string, value: number) => handle.current?.setInput(name, value), []);
  const clear = useCallback(() => setState((s) => ({ ...s, console: [] })), []);
  /** Another project: stop what runs, forget the last run. */
  const reset = useCallback(() => {
    again.current = null;
    handle.current?.stop();
    handle.current = null;
    setState(IDLE);
  }, []);

  useEffect(() => () => handle.current?.stop(), []);

  return { state, run, stop, restart, setInput, clear, reset };
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

/** Adds to the console, joining text of the same kind; keeps the last CONSOLE_LIMIT characters. */
export function append(chunks: ConsoleChunk[], c: ConsoleChunk): ConsoleChunk[] {
  const last = chunks.at(-1);
  let out = last?.kind === c.kind ? [...chunks.slice(0, -1), { kind: c.kind, text: last.text + c.text }] : [...chunks, c];
  let size = out.reduce((n, x) => n + x.text.length, 0);
  while (size > CONSOLE_LIMIT && out.length) {
    const first = out[0]!;
    const cut = Math.min(first.text.length, size - CONSOLE_LIMIT);
    size -= cut;
    out = cut === first.text.length ? out.slice(1) : [{ ...first, text: first.text.slice(cut) }, ...out.slice(1)];
  }
  return out;
}
