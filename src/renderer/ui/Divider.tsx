import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from 'react';

/**
 * A draggable divider between two panels (N-13): drag it, or focus it and use the arrow keys (16 px, Shift 64 px),
 * Home and End. `value` is the width of the panel it sizes, in px; `edge` says which side of that panel it is on
 * (a divider on a panel's left edge grows the panel when dragged left). onChange while dragging, onCommit at the end.
 */
export interface DividerProps {
  label: string;
  value: number;
  min: number;
  max: number;
  edge?: 'left' | 'right';
  onChange: (px: number) => void;
  onCommit: (px: number) => void;
}

const STEP = 16;
const BIG_STEP = 64;

export function Divider({ label, value, min, max, edge = 'left', onChange, onCommit }: DividerProps) {
  const drag = useRef<{ x: number; start: number; last: number } | null>(null);
  const clamp = (px: number) => Math.round(Math.min(max, Math.max(min, px)));
  const sign = edge === 'left' ? 1 : -1;

  useEffect(() => {
    const move = (e: globalThis.MouseEvent) => {
      const d = drag.current;
      if (!d) return;
      d.last = clamp(d.start + sign * (e.clientX - d.x));
      onChange(d.last);
    };
    const up = () => {
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      document.body.classList.remove('resizing');
      onCommit(d.last);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  });

  const down = (e: MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    drag.current = { x: e.clientX, start: value, last: value };
    document.body.classList.add('resizing');
  };

  const key = (e: KeyboardEvent) => {
    const step = e.shiftKey ? BIG_STEP : STEP;
    const to = { ArrowRight: value + sign * step, ArrowLeft: value - sign * step, Home: min, End: max }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const px = clamp(to);
    onChange(px);
    onCommit(px);
  };

  return (
    <div
      className="divider"
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onMouseDown={down}
      onKeyDown={key}
    />
  );
}
