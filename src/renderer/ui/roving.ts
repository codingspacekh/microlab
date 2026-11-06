import { useRef, type KeyboardEvent } from 'react';

/**
 * Arrow keys in a group where one is chosen (radio buttons, segments, swatches): the chosen one is the group's only
 * Tab stop; arrows choose the next enabled one (wrapping), Home / End the first and last, and focus follows.
 */
export function useRoving<V>(items: { value: V; disabled?: boolean }[], value: V | undefined, onChange: (v: V) => void, disabled = false) {
  const refs = useRef<(HTMLElement | null)[]>([]);
  const chosen = items.findIndex((it) => it.value === value);
  const stop = chosen >= 0 && !items[chosen]!.disabled ? chosen : items.findIndex((it) => !it.disabled);

  const choose = (i: number) => {
    const it = items[i];
    if (disabled || !it || it.disabled) return;
    if (it.value !== value) onChange(it.value);
    refs.current[i]?.focus();
  };

  const move = (from: number, dir: 1 | -1) => {
    for (let k = 1; k <= items.length; k++) {
      const i = (from + dir * k + items.length * k) % items.length;
      if (!items[i]!.disabled) return i;
    }
    return from;
  };

  const onKeyDown = (i: number) => (e: KeyboardEvent) => {
    if (disabled) return;
    const last = items.length - 1;
    const to = {
      ArrowRight: move(i, 1), ArrowDown: move(i, 1), ArrowLeft: move(i, -1), ArrowUp: move(i, -1),
      Home: move(last, 1), End: move(0, -1), ' ': i, Enter: i,
    }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    choose(to);
  };

  return {
    ref: (i: number) => (el: HTMLElement | null) => { refs.current[i] = el; },
    tabIndex: (i: number) => (!disabled && i === stop ? 0 : -1),
    onKeyDown,
    choose,
  };
}
