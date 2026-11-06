import { useEffect, useId, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { cls } from './field';
import { Icon } from './Icon';

/**
 * A slider (screen 12b) — the inputs while a program runs (light, temperature, a knob), never a native range input
 * (N-14). The label on the left, the value on the right; drag anywhere on the track, or focus the thumb: arrows
 * step, PageUp / PageDown ten steps, Home / End the ends.
 */
export interface SliderProps {
  label: string;
  /** An icon before the label (sun, therm …). */
  icon?: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
  /** The fill and the thumb's ring (R, G, B of a NeoPixel). */
  colour?: string;
  /** Labels spread evenly under the track. */
  ticks?: ReactNode[];
  /** A one-letter label and a short value (the R / G / B rows). */
  compact?: boolean;
  disabled?: boolean;
}

const decimals = (step: number) => (String(step).split('.')[1]?.length ?? 0);

export function Slider({ label, icon, value, onChange, min, max, step = 1, format = String, colour, ticks, compact, disabled = false }: SliderProps) {
  const id = useId();
  const track = useRef<HTMLSpanElement>(null);
  const thumb = useRef<HTMLElement>(null);
  const dragging = useRef(false);

  const snap = (v: number) => {
    const s = Math.round((Math.min(max, Math.max(min, v)) - min) / step) * step + min;
    return Number(Math.min(max, s).toFixed(decimals(step)));
  };
  const set = (v: number) => {
    const next = snap(v);
    if (!disabled && next !== value) onChange(next);
  };
  const fromX = (x: number) => {
    const r = track.current!.getBoundingClientRect();
    return min + (r.width > 0 ? Math.min(1, Math.max(0, (x - r.left) / r.width)) : 0) * (max - min);
  };

  useEffect(() => {
    const move = (e: globalThis.MouseEvent) => { if (dragging.current) set(fromX(e.clientX)); };
    const up = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.classList.remove('dragging');
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  });

  const down = (e: MouseEvent) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    dragging.current = true;
    document.body.classList.add('dragging');
    thumb.current?.focus();
    set(fromX(e.clientX));
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (disabled) return;
    const to = {
      ArrowRight: value + step, ArrowUp: value + step, ArrowLeft: value - step, ArrowDown: value - step,
      PageUp: value + 10 * step, PageDown: value - 10 * step, Home: min, End: max,
    }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    set(to);
  };

  const pct = max > min ? ((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100 : 0;
  const text = format(value);
  return (
    <div className={cls('slider', compact && 'compact', disabled && 'dis')}>
      <span id={`${id}l`}>{icon && <Icon name={icon} size={12} />}{icon && ' '}{label}</span>
      <span className="track" ref={track} onMouseDown={down}>
        <i style={{ width: `${pct}%`, ...(colour ? { background: colour } : {}) }} />
        <b
          ref={thumb}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-labelledby={`${id}l`}
          aria-valuenow={value}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuetext={text}
          aria-disabled={disabled || undefined}
          style={{ left: `${pct}%`, ...(colour ? { borderColor: colour } : {}) }}
          onKeyDown={onKeyDown}
        />
      </span>
      <span className={cls('v', disabled && 'muted')} aria-hidden="true">{text}</span>
      {ticks && <span className="ticks" aria-hidden="true">{ticks.map((t, i) => <span key={i}>{t}</span>)}</span>}
    </div>
  );
}
