import { useCallback, useEffect, useState } from 'react';
import type { MicrolabApi } from '../app/api';

/**
 * A board project's console under the code (the teacher, 2026-11-09): shown or hidden, and its height — a share of
 * the code side's — as Python 3's shell is (useShellPlace). Remembered in MicroLab's settings.
 */
export interface BoardConsole { shown: boolean; size: number }

export const CONSOLE_DEFAULT: BoardConsole = { shown: true, size: 0.32 };
/** Neither the code nor the console is ever squeezed away. */
export const CONSOLE_MIN = 0.15;
export const CONSOLE_MAX = 0.75;
const KEY = 'boardConsole';

export const clampConsole = (size: number) => Math.round(Math.min(CONSOLE_MAX, Math.max(CONSOLE_MIN, size)) * 100) / 100;

export function useBoardConsole(api: MicrolabApi): [BoardConsole, (next: BoardConsole, save?: boolean) => void] {
  const [state, setState] = useState<BoardConsole>(CONSOLE_DEFAULT);
  useEffect(() => {
    let live = true;
    void api.settings.get(KEY).then((saved) => {
      const s = saved as Partial<BoardConsole> | undefined;
      if (!live || !s) return;
      setState({ shown: s.shown !== false, size: clampConsole(typeof s.size === 'number' ? s.size : CONSOLE_DEFAULT.size) });
    });
    return () => { live = false; };
  }, [api]);
  /** Shown or hidden, a new height; `save` false while its edge is being dragged (saved once it is let go). */
  const update = useCallback((next: BoardConsole, save = true) => {
    const s = { shown: next.shown, size: clampConsole(next.size) };
    setState(s);
    if (save) void api.settings.set(KEY, s);
  }, [api]);
  return [state, update];
}
