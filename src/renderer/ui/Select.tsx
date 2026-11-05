import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { cls, FieldFrame, labelling, useFieldIds, type FieldText } from './field';
import { Icon } from './Icon';

/**
 * The dropdown (screen 12b) — never a native <select> (N-14). Enter, Space or an arrow opens it on the chosen
 * option; arrows move (past disabled options), Home / End, a letter jumps to the option that starts with it;
 * Enter or Space chooses, Esc and Tab close. The list is drawn over everything (fixed), so a panel's edge never
 * cuts it off, and opens upwards when there is no room below.
 */
export interface SelectOption<V extends string = string> {
  value: V;
  label: string;
  /** On the right, quieter: "2.0 V". */
  hint?: string;
  /** A colour dot before the label. */
  dot?: string;
  disabled?: boolean;
}

export interface SelectProps<V extends string = string> extends FieldText {
  options: SelectOption<V>[];
  value: V | undefined;
  onChange: (value: V) => void;
  placeholder?: string;
  disabled?: boolean;
}

const TYPEAHEAD_MS = 700;

export function Select<V extends string = string>({ options, value, onChange, placeholder = 'Choose…', disabled = false, ...text }: SelectProps<V>) {
  const ids = useFieldIds();
  const [open, setOpen] = useState(false);
  const [hl, setHl] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const [pos, setPos] = useState<CSSProperties>({});

  const chosen = options.findIndex((o) => o.value === value);
  const current = options[chosen];
  const enabled = (i: number) => i >= 0 && i < options.length && !options[i]!.disabled;
  const step = (from: number, dir: 1 | -1) => {
    for (let i = from + dir; i >= 0 && i < options.length; i += dir) if (enabled(i)) return i;
    return from;
  };
  const first = () => step(-1, 1);
  const last = () => step(options.length, -1);

  const show = () => {
    if (disabled) return;
    setHl(enabled(chosen) ? chosen : first());
    setOpen(true);
  };
  const close = () => setOpen(false);
  const pick = (i: number) => {
    if (!enabled(i)) return;
    if (options[i]!.value !== value) onChange(options[i]!.value);
    close();
    box.current?.focus();
  };

  // a click elsewhere closes it
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) close(); };
    document.addEventListener('mousedown', down);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', down);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  // where the list goes: under the field, or over it when there is no room below
  useLayoutEffect(() => {
    if (!open || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 8;
    const above = r.top - 8;
    const want = Math.min(320, options.length * 30 + 10);
    const up = below < want && above > below;
    setPos({
      position: 'fixed', left: r.left, width: r.width, maxHeight: Math.max(120, Math.min(want, up ? above : below)),
      ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
    });
  }, [open, options.length]);

  // keep the highlighted option in view
  useEffect(() => {
    if (!open || hl < 0) return;
    const el = list.current?.children[hl] as HTMLElement | undefined;
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [open, hl]);

  const typeahead = (ch: string) => {
    const now = Date.now();
    const t = typed.current;
    t.text = now - t.at < TYPEAHEAD_MS ? t.text + ch.toLowerCase() : ch.toLowerCase();
    t.at = now;
    const from = open ? hl : chosen;
    const order = [...options.keys()].map((k) => (from + 1 + k) % options.length);
    const match = (s: string) => order.find((i) => enabled(i) && options[i]!.label.toLowerCase().startsWith(s));
    // a repeated letter cycles through the options that start with it
    const hit = match(t.text) ?? (t.text.split('').every((c) => c === t.text[0]) ? match(t.text[0]!) : undefined);
    if (hit === undefined) return;
    if (!open) setOpen(true);
    setHl(hit);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (disabled) return;
    const k = e.key;
    if (!open) {
      if (k === 'Enter' || k === ' ' || k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); show(); }
      else if (k.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); typeahead(k); }
      return;
    }
    const to = { ArrowDown: step(hl, 1), ArrowUp: step(hl, -1), Home: first(), End: last(), PageDown: last(), PageUp: first() }[k];
    if (to !== undefined) { e.preventDefault(); setHl(to); return; }
    if (k === 'Enter' || k === ' ') { e.preventDefault(); pick(hl); return; }
    if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (k === 'Tab') { close(); return; }
    if (k.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); typeahead(k); }
  };

  const optionId = (i: number) => `${ids.control}-o${i}`;

  return (
    <FieldFrame ids={ids} {...text}>
      <div className="selwrap" ref={wrap}>
        <div
          ref={box}
          id={ids.control}
          role="combobox"
          tabIndex={disabled ? -1 : 0}
          className={cls('field select', open && 'open', text.error && 'err', disabled && 'dis')}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? `${ids.control}-list` : undefined}
          aria-activedescendant={open && hl >= 0 ? optionId(hl) : undefined}
          aria-disabled={disabled || undefined}
          {...labelling(ids, text)}
          onKeyDown={onKeyDown}
          onClick={() => (open ? close() : show())}
        >
          <span className="val">
            {current ? <>{current.dot && <Dot colour={current.dot} />}{current.label}</> : <span className="ph">{placeholder}</span>}
          </span>
          <Icon name="chevd" size={14} />
        </div>
        {open && (
          <ul ref={list} id={`${ids.control}-list`} role="listbox" className="menu" style={pos} aria-labelledby={text.hideLabel ? undefined : ids.label}>
            {options.map((o, i) => (
              <li
                key={o.value}
                id={optionId(i)}
                role="option"
                aria-selected={i === chosen}
                aria-disabled={o.disabled || undefined}
                className={cls('mi', i === chosen && 'on', i === hl && 'hl', o.disabled && 'dis')}
                onMouseMove={() => enabled(i) && i !== hl && setHl(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(i)}
              >
                <span className="ck">{i === chosen && <Icon name="check" size={12} />}</span>
                {o.dot && <Dot colour={o.dot} />}
                {o.label}
                {o.hint && <small>{o.hint}</small>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </FieldFrame>
  );
}

function Dot({ colour }: { colour: string }) {
  return <i className="dot" style={{ width: 10, height: 10, background: colour, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.12)' }} />;
}
