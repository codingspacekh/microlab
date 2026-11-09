import { useCallback, useEffect, useRef, useState } from 'react';
import { addOutput, emptyPlot, type Plot } from '@lib/plot';
import type { MicrolabApi, PyError, PyEvent } from '../app/api';
import { append, type ConsoleChunk } from '../app/useRun';

/**
 * A Python 3 run as the window sees it (M12, F-92, screen 31b): the shell's text (what the program prints, its
 * errors in red, what the student typed, the app's notes), input() answered on the shell's last line, then >>> in
 * the program's names; Stop; the numbers it printed for the Plotter. The session itself is the main process's.
 */
export interface PyRunState {
  status: 'idle' | 'running' | 'stopping';
  /** The program has ended and its >>> takes lines. */
  repl: boolean;
  startedAt?: number;
  /** The file being run, as its tab names it. */
  file?: string;
  console: ConsoleChunk[];
  plot: Plot;
  /** How the program ended, and its error. */
  ended?: { ended: 'done' | 'error' | 'stopped'; error?: PyError };
  version?: string;
}

const IDLE: PyRunState = { status: 'idle', repl: false, console: [], plot: emptyPlot() };

export function usePython(api: MicrolabApi) {
  const [state, setState] = useState<PyRunState>(() => ({ ...IDLE, plot: emptyPlot() }));
  const live = useRef(false);   // a session is there: running, or at its >>>
  const t0 = useRef(0);
  const name = useRef('');

  useEffect(() => api.python3.onEvent((e: PyEvent) => {
    if (!live.current) return;
    const add = (c: ConsoleChunk) => setState((s) => ({ ...s, console: append(s.console, c) }));
    if ('out' in e) {
      setState((s) => ({ ...s, console: append(s.console, { kind: 'out', text: e.out }), plot: addOutput(s.plot, e.out, (Date.now() - t0.current) / 1000) }));
    } else if ('err' in e) {
      add({ kind: 'err', text: e.err });
    } else if ('prompt' in e) {
      setState((s) => ({ ...s, status: 'idle', repl: true, console: append(s.console, { kind: 'out', text: e.prompt }) }));
    } else if ('ended' in e) {
      const note = e.ended === 'done' ? `${name.current} ended. Its names are still here: type Python and press Enter.\n`
        : e.ended === 'stopped' ? 'Stopped (Ctrl+C). Its names are still here.\n'
        : 'Its names are still here: type Python and press Enter.\n';
      // after Stop the session is ended: no names to offer
      setState((s) => (s.status === 'stopping' ? { ...s, ended: e } : { ...s, ended: e, console: append(s.console, { kind: 'sys', text: note }) }));
    } else if ('exit' in e) {
      live.current = false;
      setState((s) => ({ ...s, status: 'idle', repl: false, ...(s.status === 'idle' && s.repl ? {} : { ended: s.ended ?? { ended: 'stopped' } }) }));
    }
  }), [api]);

  /** Runs the file's code (its text as it is in the editor) in a new session; `path` is its file, or its name if new. */
  const run = useCallback((code: string, path: string, label: string) => {
    live.current = true;
    t0.current = Date.now();
    name.current = label;
    const folder = /[\\/]/.test(path) ? path.replace(/[\\/][^\\/]*$/, '').split(/[\\/]/).slice(-2).join('/') : 'Documents/Python';
    setState({ ...IDLE, plot: emptyPlot(), status: 'running', startedAt: t0.current, file: label,
      console: [{ kind: 'sys', text: `Running ${label} in ${folder}\n` }] });
    void api.python3.run(code, path).then((r) => {
      if (r.ok) setState((s) => ({ ...s, version: r.version }));
      else {
        live.current = false;
        setState((s) => ({ ...s, status: 'idle', console: append(s.console, { kind: 'err', text: `${r.message}\n` }) }));
      }
    });
  }, [api]);

  /** Stop: the program ends, and its windows close; at >>>, the session ends. */
  const stop = useCallback(() => {
    if (!live.current) return;
    setState((s) => ({ ...s, status: s.repl ? 'idle' : 'stopping', console: append(s.console, { kind: 'sys', text: '\nStopped.\n' }) }));
    void api.python3.stop();
  }, [api]);

  /** What the student typed: input()'s answer, or a line for >>> — echoed as typed; '\x03' is Ctrl+C. */
  const type = useCallback((text: string) => {
    if (!live.current) return;
    if (text === '\x03') { void api.python3.interrupt(); return; }
    setState((s) => ({ ...s, console: append(s.console, { kind: 'me', text: `${text}\n` }) }));
    void api.python3.line(text);
  }, [api]);

  const clear = useCallback(() => setState((s) => ({ ...s, console: [] })), []);
  const clearPlot = useCallback(() => setState((s) => ({ ...s, plot: emptyPlot() })), []);

  return { state, run, stop, type, clear, clearPlot };
}
