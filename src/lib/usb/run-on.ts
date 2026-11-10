import type { BoardId } from '../boards';
import { chipState, type Detection, type FoundBoard } from './detect';

/**
 * Run on (M11.8, F-125, Rev 18, screens 37–37c): Run's ⌄ menu chooses where Run (F5) runs the open file — the
 * simulator, the real board, or both at once — kept in the settings. The teacher's classroom trial asked for it.
 */
export type RunOn = 'sim' | 'board' | 'both';

/** The setting's key. */
export const RUN_ON_KEY = 'run.on';

/** The choice as kept in the settings; anything else (nothing kept yet) is the simulator. */
export function runOnOf(v: unknown): RunOn {
  return v === 'board' || v === 'both' ? v : 'sim';
}

/**
 * Where a run goes: the simulator, a real board, or both. `missing`: a board was wanted, but none that fits this
 * project is plugged in and ready — the simulator runs instead, and the Run button says so.
 */
export type RunPlace =
  | { sim: true; board?: undefined; missing?: true }
  | { sim: boolean; board: FoundBoard; missing?: undefined };

/** The board is the one the board chip shows (the one chosen, else one that fits), only when it is ready for it. */
export function runPlace(choice: RunOn, d: Detection, project: BoardId, chosen?: string): RunPlace {
  if (choice === 'sim') return { sim: true };
  const state = chipState(d, project, chosen);
  if (state.kind !== 'ready') return { sim: true, missing: true };
  return { sim: choice === 'both', board: state.board };
}

/** The words after the file's name on the Run button: '' for the simulator alone, as before. */
export function runWhere(choice: RunOn, place: RunPlace, short = 'board'): string {
  if (choice === 'sim') return '';
  if (!place.board) return 'sim — no board';
  return place.sim ? `sim + ${short}` : short;
}

/** What goes to the board before Run runs there: the project's files but main.py, the board's own start-up program. */
export function boardCopy<T>(files: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [path, v] of Object.entries(files)) if (path !== 'main.py') out[path] = v;
  return out;
}
