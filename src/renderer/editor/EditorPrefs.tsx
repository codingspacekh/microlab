import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { MicrolabApi } from '../app/api';
import { Stepper } from '../ui';

/**
 * The editor's text size and theme (M6.8, screen 23): Aa in the code panel opens them; kept as a setting ('editor')
 * for next time. ⌘+ / ⌘− / ⌘0 stay the window's own zoom (Electron's View menu), so the size is set here.
 */
export type EditorTheme = 'light' | 'dark' | 'contrast';
export interface EditorLook { size: number; theme: EditorTheme }

export const EDITOR_LOOK: EditorLook = { size: 13, theme: 'light' };
const SIZE = { min: 11, max: 24 } as const;
const THEMES: { value: EditorTheme; label: string; bg: string; kw: string; fn: string; edge?: string }[] = [
  { value: 'light', label: 'Light', bg: '#fbfcfd', kw: '#8b3fd1', fn: '#1b6ac9', edge: 'var(--line)' },
  { value: 'dark', label: 'Dark', bg: '#1e2430', kw: '#c792ea', fn: '#82aaff' },
  { value: 'contrast', label: 'High contrast', bg: '#000', kw: '#ffd700', fn: '#7fdbff', edge: '#fff' },
];

/** The look, read from the settings and kept there when changed. */
export function useEditorLook(api: MicrolabApi): [EditorLook, (l: EditorLook) => void] {
  const [look, setLook] = useState<EditorLook>(EDITOR_LOOK);
  useEffect(() => {
    let live = true;
    void api.settings.get('editor').then((saved) => {
      const s = saved as Partial<EditorLook> | undefined;
      if (!live || !s) return;
      setLook({
        size: typeof s.size === 'number' ? Math.min(SIZE.max, Math.max(SIZE.min, s.size)) : EDITOR_LOOK.size,
        theme: THEMES.some((t) => t.value === s.theme) ? s.theme! : EDITOR_LOOK.theme,
      });
    });
    return () => { live = false; };
  }, [api]);
  return [look, (l) => { setLook(l); void api.settings.set('editor', l); }];
}

/** What the code panel carries for the look: its theme, and the size as a CSS variable. */
export const lookAttrs = (l: EditorLook) => ({ 'data-theme': l.theme, style: { '--code-size': `${l.size}px` } as CSSProperties });

export function EditorPrefs({ look, onLook }: { look: EditorLook; onLook: (l: EditorLook) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, [open]);
  return (
    <span className="aa-wrap" ref={wrap}>
      <button type="button" className={open ? 'btn ghost sm icon aa on' : 'btn ghost sm icon aa'} aria-label="Text size and theme" title="Text size and theme"
        aria-expanded={open} onClick={() => setOpen((o) => !o)}>Aa</button>
      {open && (
        <div className="float aa-pop" role="dialog" aria-label="Text size and theme"
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } }}>
          <div className="lbl">Text size</div>
          <div className="row aa-size">
            <Stepper label="Text size" hideLabel value={look.size} min={SIZE.min} max={SIZE.max} unit="px" size="sm"
              onChange={(size) => onLook({ ...look, size })} />
            <span className="tiny muted">13 px to start · ⌘+ / ⌘− zoom the whole window</span>
          </div>
          <div className="lbl">Theme</div>
          <div className="aa-themes" role="radiogroup" aria-label="Theme">
            {THEMES.map((t) => (
              <button key={t.value} type="button" role="radio" aria-checked={look.theme === t.value} aria-label={t.label}
                className={look.theme === t.value ? 'th on' : 'th'} onClick={() => onLook({ ...look, theme: t.value })}>
                <i style={{ background: t.bg, color: t.kw, border: t.edge ? `1px solid ${t.edge}` : undefined }}>while <span style={{ color: t.fn }}>True</span>:</i>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </span>
  );
}
