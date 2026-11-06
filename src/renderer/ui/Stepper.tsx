import { useEffect, useState, type KeyboardEvent } from 'react';
import { formatValue, parseValue, stepE12 } from '@lib/units';
import { cls, FieldFrame, labelling, useFieldIds, type FieldText } from './field';
import { Icon } from './Icon';

/**
 * A number with − and + (screen 12b), never a native number input (N-14). − / + and the arrow keys step through the
 * E12 values (series "e12") or by `step`; PageUp / PageDown are ten steps (a quarter decade in E12), Home / End the
 * limits. The number can be typed — "4k7", "1 M" — and Enter or leaving the field sets it; what isn't a number goes
 * back to the value it had.
 */
export interface StepperProps extends FieldText {
  value: number;
  onChange: (value: number) => void;
  series?: 'e12';
  step?: number;
  min?: number;
  max?: number;
  /** After the number, quieter: "°", "Ω". */
  unit?: string;
  format?: (value: number) => string;
  parse?: (text: string) => number | undefined;
  disabled?: boolean;
  size?: 'sm';
}

const decimals = (step: number) => (String(step).split('.')[1]?.length ?? 0);

export function Stepper({ value, onChange, series, step = 1, min = -Infinity, max = Infinity, unit, format, parse = parseValue, disabled = false, size, ...text }: StepperProps) {
  const ids = useFieldIds();
  const show = format ?? (series === 'e12' ? formatValue : (v: number) => String(Number(v.toFixed(decimals(step)))));
  const [draft, setDraft] = useState<string | null>(null);   // what is being typed, until it is set
  useEffect(() => setDraft(null), [value]);

  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const set = (v: number) => {
    const next = clamp(v);
    if (!disabled && Number.isFinite(next) && next !== value) onChange(next);
    setDraft(null);
  };
  const stepBy = (dir: 1 | -1, times = 1) => {
    let v = value;
    for (let i = 0; i < times; i++) v = series === 'e12' ? stepE12(v, dir) : Number((v + dir * step).toFixed(decimals(step)));
    set(v);
  };
  const commit = () => {
    if (draft === null) return;
    const v = parse(draft);
    if (v === undefined) setDraft(null);
    else set(v);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (disabled) return;
    const act: Record<string, () => void> = {
      ArrowUp: () => stepBy(1), ArrowDown: () => stepBy(-1),
      PageUp: () => stepBy(1, series === 'e12' ? 3 : 10), PageDown: () => stepBy(-1, series === 'e12' ? 3 : 10),
      Enter: commit, Escape: () => setDraft(null),
      ...(Number.isFinite(min) ? { Home: () => set(min) } : {}),
      ...(Number.isFinite(max) ? { End: () => set(max) } : {}),
    };
    const f = act[e.key];
    if (!f) return;
    e.preventDefault();
    f();
  };

  return (
    <FieldFrame ids={ids} {...text}>
      <div className={cls('stepper', size, text.error && 'err', disabled && 'dis')}>
        <button type="button" tabIndex={-1} aria-label="Less" disabled={disabled || value <= min} onClick={() => stepBy(-1)}>
          <Icon name="minus" size={14} />
        </button>
        <span className="v">
          <input
            id={ids.control}
            type="text"
            inputMode="decimal"
            role="spinbutton"
            autoComplete="off"
            spellCheck={false}
            value={draft ?? show(value)}
            size={Math.max(2, (draft ?? show(value)).length)}
            disabled={disabled}
            aria-valuenow={value}
            aria-valuetext={`${show(value)}${unit ? ` ${unit}` : ''}`}
            {...(Number.isFinite(min) ? { 'aria-valuemin': min } : {})}
            {...(Number.isFinite(max) ? { 'aria-valuemax': max } : {})}
            {...labelling(ids, text)}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={onKeyDown}
            onFocus={(e) => e.target.select()}
          />
          {unit && <small>{unit}</small>}
        </span>
        <button type="button" tabIndex={-1} aria-label="More" disabled={disabled || value >= max} onClick={() => stepBy(1)}>
          <Icon name="plus" size={14} />
        </button>
      </div>
    </FieldFrame>
  );
}

/** Quick values under a stepper (screen 12b): 100 · 220 · 330 · 1k …; the one that is the value is pressed. */
export interface ChipsProps {
  label: string;
  values: number[];
  value: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  disabled?: boolean;
}

export function Chips({ label, values, value, onChange, format = formatValue, disabled = false }: ChipsProps) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {values.map((v) => (
        <button key={v} type="button" className={cls('chip', v === value && 'on')} aria-pressed={v === value} disabled={disabled}
          onClick={() => v !== value && onChange(v)}>
          {format(v)}
        </button>
      ))}
    </div>
  );
}
