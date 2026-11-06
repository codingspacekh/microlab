import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { cls } from './field';
import { Icon } from './Icon';

/**
 * A menu button (the project menu, screen 02's ⌄ by the project's name). A click, Enter, Space or ArrowDown opens it
 * on the first item, ArrowUp on the last; arrows move (wrapping, past disabled items), Home / End; Enter, Space or a
 * click chooses; Esc closes and gives focus back to the button; Tab or a click elsewhere closes it.
 */
export interface MenuItem {
  label: string;
  icon?: string;
  /** On the right, quieter: a shortcut, as shown ("⌘S"). */
  hint?: string;
  /** The shortcut for screen readers (aria-keyshortcuts: "Meta+S Control+S"). */
  keys?: string;
  disabled?: boolean;
  /** Under the label, quieter: what it does (screen 16's Send menu). */
  description?: string;
  onSelect: () => void;
}

export interface MenuButtonProps {
  /** Said to screen readers; shown as the tooltip. */
  label: string;
  icon?: string;
  items: MenuItem[];
  className?: string;
  /** Opens under the button's right edge, leftwards (at the right of the top bar). */
  alignRight?: boolean;
  disabled?: boolean;
}

export function MenuButton({ label, icon = 'chevd', items, className, alignRight, disabled }: MenuButtonProps) {
  const [open, setOpen] = useState(false);
  const [hl, setHl] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const refs = useRef<(HTMLLIElement | null)[]>([]);

  const enabled = (i: number) => !items[i]?.disabled;
  const move = (from: number, dir: 1 | -1) => {
    for (let k = 1; k <= items.length; k++) {
      const i = (from + dir * k + items.length * k) % items.length;
      if (enabled(i)) return i;
    }
    return from;
  };
  const first = () => move(items.length - 1, 1);
  const last = () => move(0, -1);

  const show = (at: number) => { setHl(at); setOpen(true); };
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };
  const choose = (i: number) => {
    if (!enabled(i)) return;
    close(true);
    items[i]!.onSelect();
  };

  useEffect(() => {
    if (open) refs.current[hl]?.focus();
  }, [open, hl]);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) close(false); };
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, [open]);

  const onButtonKey = (e: KeyboardEvent) => {
    const at = { ArrowDown: first(), Enter: first(), ' ': first(), ArrowUp: last() }[e.key];
    if (at === undefined) return;
    e.preventDefault();
    show(at);
  };

  const onMenuKey = (e: KeyboardEvent) => {
    const to = { ArrowDown: move(hl, 1), ArrowUp: move(hl, -1), Home: first(), End: last() }[e.key];
    if (to !== undefined) { e.preventDefault(); setHl(to); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(hl); return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); return; }
    if (e.key === 'Tab') close(false);
  };

  return (
    <div className="menuwrap" ref={wrap}>
      <button
        ref={button}
        type="button"
        className={cls('btn ghost sm icon', open && 'on', className)}
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => (open ? close(false) : show(first()))}
        onKeyDown={onButtonKey}
      >
        <Icon name={icon} size={14} />
      </button>
      {open && (
        <ul className={cls('menu', alignRight && 'right', items.some((x) => x.description) && 'described')} role="menu" aria-label={label} onKeyDown={onMenuKey}>
          {items.map((it, i) => (
            <li
              key={it.label}
              ref={(el) => { refs.current[i] = el; }}
              role="menuitem"
              tabIndex={-1}
              aria-disabled={it.disabled || undefined}
              aria-keyshortcuts={it.keys}
              className={cls('mi', i === hl && 'hl', it.disabled && 'dis')}
              onMouseMove={() => enabled(i) && i !== hl && setHl(i)}
              onClick={() => choose(i)}
            >
              {it.icon && <Icon name={it.icon} size={14} />}
              {it.description ? <span className="tx"><b>{it.label}</b><span className="dsc">{it.description}</span></span> : it.label}
              {it.hint && <small aria-hidden="true">{it.hint}</small>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
