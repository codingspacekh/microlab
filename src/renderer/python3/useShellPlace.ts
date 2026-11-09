import { useCallback, useEffect, useState } from 'react';
import type { MicrolabApi } from '../app/api';

/**
 * Where the Python 3 shell sits and how big it is (M12 Rev 11, F-98, screens 31b, 31f): below the editor or on its
 * right; its size a share of the space it splits with the editor. Remembered in MicroLab's settings.
 */
export type ShellPlace = 'below' | 'right';
export interface ShellLayout { place: ShellPlace; size: number }

export const SHELL_DEFAULT: ShellLayout = { place: 'below', size: 0.4 };
/** Neither the editor nor the shell is ever squeezed away: from a quarter (a fifth, below) to three quarters. */
export const SHELL_MIN = { below: 0.2, right: 0.25 } as const;
export const SHELL_MAX = 0.75;
const KEY = 'pyShell';

export const clampSize = (place: ShellPlace, size: number) => Math.round(Math.min(SHELL_MAX, Math.max(SHELL_MIN[place], size)) * 100) / 100;

export function useShellPlace(api: MicrolabApi): [ShellLayout, (next: ShellLayout, save?: boolean) => void] {
  const [layout, setLayout] = useState<ShellLayout>(SHELL_DEFAULT);
  useEffect(() => {
    let live = true;
    void api.settings.get(KEY).then((saved) => {
      const s = saved as Partial<ShellLayout> | undefined;
      if (!live || !s) return;
      const place: ShellPlace = s.place === 'right' ? 'right' : 'below';
      setLayout({ place, size: clampSize(place, typeof s.size === 'number' ? s.size : SHELL_DEFAULT.size) });
    });
    return () => { live = false; };
  }, [api]);
  /** A new place or size; `save` false while the edge is being dragged (saved once it is let go). */
  const update = useCallback((next: ShellLayout, save = true) => {
    const l = { place: next.place, size: clampSize(next.place, next.size) };
    setLayout(l);
    if (save) void api.settings.set(KEY, l);
  }, [api]);
  return [layout, update];
}
