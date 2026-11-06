import { useEffect, useId, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { cls } from './field';

/**
 * A dialog (screen 08's look; M4.6 "Save your changes?"): over the window, centred, its width following the window
 * up to a readable limit. It holds the keyboard — Tab and Shift+Tab go round its controls, Esc cancels — and gives
 * the focus back to where it was when it goes.
 */
export interface DialogAction {
  label: string;
  onClick: () => void;
  /** The main choice: drawn as such, and it has the focus first. */
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}

export interface DialogProps {
  title: string;
  children: ReactNode;
  actions: DialogAction[];
  onCancel: () => void;
  /** 'alertdialog' (the default) asks a question; 'dialog' holds a form (screen 08). */
  role?: 'dialog' | 'alertdialog';
  /** Its widest, in px (it narrows with the window). */
  width?: number;
  /** Before the title, in the accent colour. */
  icon?: ReactNode;
  /** At the left of the buttons: what will happen. */
  note?: ReactNode;
}

export function Dialog({ title, children, actions, onCancel, role = 'alertdialog', width, icon, note }: DialogProps) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    first.current?.focus();
    return () => before?.focus?.();
  }, []);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); return; }
    if (e.key !== 'Tab') return;
    const all = [...(box.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]') ?? [])];
    if (!all.length) return;
    const i = all.indexOf(document.activeElement as HTMLElement);
    const next = e.shiftKey ? (i <= 0 ? all.length - 1 : i - 1) : (i === all.length - 1 ? 0 : i + 1);
    e.preventDefault();
    all[next]!.focus();
  };

  const main = Math.max(0, actions.findIndex((a) => a.primary));
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && e.preventDefault()}>
      <div ref={box} className="dialog center" role={role} aria-modal="true" aria-labelledby={`${id}t`}
        aria-describedby={role === 'alertdialog' ? `${id}d` : undefined} onKeyDown={onKeyDown}
        style={width ? ({ '--dw': `${width}px` } as CSSProperties) : undefined}>
        <div className="dh">{icon && <span className="dicon">{icon}</span>}<h2 id={`${id}t`}>{title}</h2></div>
        <div className="db" id={`${id}d`}>{children}</div>
        <div className="df">
          {note && <span className="small muted row dnote">{note}</span>}
          <span className="spacer" />
          {actions.map((a, i) => (
            <button key={a.label} ref={i === main ? first : undefined} type="button" className={cls('btn', a.primary && 'primary', a.danger && 'danger')} disabled={a.disabled} onClick={a.onClick}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
