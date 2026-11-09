import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { MicrolabApi } from '../app/api';
import { Select, Stepper } from '../ui';

/**
 * The editor's text size and theme (M6.8, screen 23): Aa in the code panel opens them; kept as a setting ('editor')
 * for next time. ⌘+ / ⌘− / ⌘0 stay the window's own zoom (Electron's View menu), so the size is set here.
 */
export type EditorTheme = 'light' | 'dark' | 'contrast';
export interface EditorLook { size: number; theme: EditorTheme; font: string }

/** The code fonts (Rev 12, F-105, screen 31h): shipped inside MicroLab (src/renderer/src/fonts.ts; SIL Open Font
 *  License), so they work offline. Each one's family as its package names it, then the plain name. */
export const CODE_FONTS: { value: string; label: string; family: string }[] = [
  { value: 'jetbrains-mono', label: 'JetBrains Mono', family: '"JetBrains Mono Variable", "JetBrains Mono"' },
  { value: 'fira-code', label: 'Fira Code', family: '"Fira Code Variable", "Fira Code"' },
  { value: 'source-code-pro', label: 'Source Code Pro', family: '"Source Code Pro Variable", "Source Code Pro"' },
  { value: 'cascadia-code', label: 'Cascadia Code', family: '"Cascadia Code Variable", "Cascadia Code"' },
  { value: 'ibm-plex-mono', label: 'IBM Plex Mono', family: '"IBM Plex Mono"' },
  { value: 'atkinson-hyperlegible-mono', label: 'Atkinson Hyperlegible Mono', family: '"Atkinson Hyperlegible Mono Variable", "Atkinson Hyperlegible Mono"' },
  { value: 'roboto-mono', label: 'Roboto Mono', family: '"Roboto Mono Variable", "Roboto Mono"' },
  { value: 'inconsolata', label: 'Inconsolata', family: '"Inconsolata Variable", "Inconsolata"' },
  { value: 'noto-sans-mono', label: 'Noto Sans Mono', family: '"Noto Sans Mono Variable", "Noto Sans Mono"' },
  { value: 'red-hat-mono', label: 'Red Hat Mono', family: '"Red Hat Mono Variable", "Red Hat Mono"' },
  { value: 'space-mono', label: 'Space Mono', family: '"Space Mono"' },
  { value: 'courier-prime', label: 'Courier Prime', family: '"Courier Prime"' },
  { value: 'anonymous-pro', label: 'Anonymous Pro', family: '"Anonymous Pro"' },
];
const FALLBACK = 'ui-monospace, "SF Mono", Consolas, monospace';
const familyOf = (font: string) => `${(CODE_FONTS.find((f) => f.value === font) ?? CODE_FONTS[0]!).family}, ${FALLBACK}`;

export const EDITOR_LOOK: EditorLook = { size: 13, theme: 'light', font: 'jetbrains-mono' };
/** Up to 36 px (Rev 12, the teacher: for a projector, or a student who needs it larger). */
const SIZE = { min: 11, max: 36 } as const;
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
        font: CODE_FONTS.some((f) => f.value === s.font) ? s.font! : EDITOR_LOOK.font,
      });
    });
    return () => { live = false; };
  }, [api]);
  return [look, (l) => { setLook(l); void api.settings.set('editor', l); }];
}

/** What the code panel carries for the look: its theme, the size and the code font as CSS variables (the font is the
 *  panel's --mono: the editor, its tabs, the console and its prompt all follow it). */
export const lookAttrs = (l: EditorLook) => ({ 'data-theme': l.theme, style: { '--code-size': `${l.size}px`, '--mono': familyOf(l.font) } as CSSProperties });

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
            <span className="tiny muted">13 px to start, up to 36 px · the whole app's size is in the status bar</span>
          </div>
          <div className="lbl">Code font</div>
          <Select label="Code font" hideLabel options={CODE_FONTS.map(({ value, label }) => ({ value, label }))} value={look.font}
            onChange={(font) => onLook({ ...look, font })} />
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
