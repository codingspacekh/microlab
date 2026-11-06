import type { Project } from '../project';

/**
 * Undo / redo for the circuit (M5.1, F-16): whole projects before each edit, so every command undoes the same way
 * and none needs its own inverse. Projects are never changed in place (every edit makes a new one), so keeping
 * them costs only the parts that changed. The code keeps CodeMirror's own undo.
 */
export interface History {
  past: Project[];
  future: Project[];
  /** The last step's merge key: the same key again (a stepper held down, a value typed) makes no new step. */
  last?: string;
}

export const EMPTY_HISTORY: History = { past: [], future: [] };
export const HISTORY_LIMIT = 200;

/** `before` is the project as it was before an edit. */
export function record(h: History, before: Project, merge?: string): History {
  if (merge !== undefined && merge === h.last && h.past.length) return { ...h, future: [] };
  const past = [...h.past, before].slice(-HISTORY_LIMIT);
  return merge === undefined ? { past, future: [] } : { past, future: [], last: merge };
}

export function undo(h: History, now: Project): { history: History; project: Project } | undefined {
  const project = h.past[h.past.length - 1];
  if (!project) return undefined;
  return { project, history: { past: h.past.slice(0, -1), future: [now, ...h.future] } };
}

export function redo(h: History, now: Project): { history: History; project: Project } | undefined {
  const [project, ...future] = h.future;
  if (!project) return undefined;
  return { project, history: { past: [...h.past, now].slice(-HISTORY_LIMIT), future } };
}
