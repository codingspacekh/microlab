import { useCallback, useEffect, useState } from 'react';
import type { MicrolabApi } from '../app/api';

/**
 * The board's side of a board project — its rail and the circuit — shown or folded away (the teacher, 2026-11-09:
 * younger students write code before they build circuits). The student's choice is remembered in MicroLab's
 * settings; `show` brings it back for a moment (a run, the check before one) without changing that choice.
 */
const KEY = 'boardPanel';

export function useBoardPanel(api: MicrolabApi): { shown: boolean; choose: (shown: boolean) => void; show: () => void } {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    let live = true;
    void api.settings.get(KEY).then((saved) => {
      const s = saved as { shown?: unknown } | undefined;
      if (live && s && s.shown === false) setShown(false);
    });
    return () => { live = false; };
  }, [api]);
  const choose = useCallback((next: boolean) => {
    setShown(next);
    void api.settings.set(KEY, { shown: next });
  }, [api]);
  const show = useCallback(() => setShown(true), []);
  return { shown, choose, show };
}
