import { useCallback, useEffect, useState } from 'react';
import type { MicrolabApi } from './api';
import { Icon } from '../ui/Icon';
import { MenuButton } from '../ui/Menu';

/**
 * The app's size (M12 Rev 12, F-106; screens 31b, 31h): in the status bar, "100 %" to start; − and + go a step, the
 * menu chooses one or goes Back to 100 %. ⌘− / ⌘+ / ⌘0 (Ctrl on Windows: the View menu's) change it too — the window
 * is resized then, and the number follows. Remembered for next time.
 */
export const SIZES = [0.75, 0.9, 1, 1.1, 1.25, 1.5];
const pct = (f: number) => `${Math.round(f * 100)} %`;

export function useZoom(api: MicrolabApi): [number, (f: number) => void] {
  const [factor, setFactor] = useState(() => api.app.zoom.get());
  const set = useCallback((f: number) => {
    const z = Math.min(3, Math.max(0.5, Math.round(f * 100) / 100));
    api.app.zoom.set(z);
    setFactor(z);
    void api.settings.set('zoom', z);
  }, [api]);
  // the size kept last time
  useEffect(() => {
    let live = true;
    void api.settings.get('zoom').then((saved) => {
      if (live && typeof saved === 'number' && saved !== api.app.zoom.get()) { api.app.zoom.set(saved); setFactor(saved); }
    });
    return () => { live = false; };
  }, [api]);
  // changed from the View menu: the page is resized
  useEffect(() => {
    const follow = () => {
      const f = Math.round(api.app.zoom.get() * 100) / 100;
      setFactor((cur) => {
        if (cur !== f) void api.settings.set('zoom', f);
        return f;
      });
    };
    window.addEventListener('resize', follow);
    return () => window.removeEventListener('resize', follow);
  }, [api]);
  return [factor, set];
}

export function ZoomControl({ api }: { api: MicrolabApi }) {
  const [factor, set] = useZoom(api);
  const smaller = [...SIZES].reverse().find((s) => s < factor - 0.001);
  const bigger = SIZES.find((s) => s > factor + 0.001);
  return (
    <span className="zoom" role="group" aria-label="The app's size">
      <button type="button" className="btn ghost icon" aria-label="Smaller" title="Smaller (⌘− / Ctrl+−)" disabled={!smaller} onClick={() => smaller && set(smaller)}><Icon name="minus" size={12} /></button>
      <MenuButton label={`The app's size: ${pct(factor)}`} text={pct(factor)} up alignRight className="zoom-now" items={[
        ...SIZES.map((s) => ({ label: pct(s), checked: Math.abs(s - factor) < 0.005, onSelect: () => set(s) })),
        { label: 'Back to 100 %', hint: '⌘0', onSelect: () => set(1) },
      ]} />
      <button type="button" className="btn ghost icon" aria-label="Bigger" title="Bigger (⌘+ / Ctrl+=)" disabled={!bigger} onClick={() => bigger && set(bigger)}><Icon name="plus" size={12} /></button>
    </span>
  );
}
