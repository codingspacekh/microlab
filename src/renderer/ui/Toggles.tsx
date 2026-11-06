import { useId, type KeyboardEvent, type ReactNode } from 'react';
import { cls } from './field';
import { Icon } from './Icon';
import { useRoving } from './roving';

/**
 * Checkboxes, switches and radio buttons (screen 12b): a 16 px box on a row that is clickable as a whole, with the
 * label in bold and a quieter hint under it. Space or Enter toggles; radio buttons move with the arrows.
 */
interface RowText {
  label: string;
  hint?: ReactNode;
  disabled?: boolean;
}

function Row({ id, label, hint, disabled, onToggle, children }: RowText & { id: string; onToggle: () => void; children: ReactNode }) {
  return (
    <div className={cls('crow', disabled && 'dis')} onClick={disabled ? undefined : onToggle}>
      {children}
      <div className="tx">
        <b id={`${id}l`}>{label}</b>
        {hint && <span id={`${id}h`}>{hint}</span>}
      </div>
    </div>
  );
}

const pressKeys = (act: () => void) => (e: KeyboardEvent) => {
  if (e.key !== ' ' && e.key !== 'Enter') return;
  e.preventDefault();
  act();
};

export interface CheckboxProps extends RowText {
  /** 'mixed': some of what it stands for (2 of 3 files). */
  value: boolean | 'mixed';
  onChange: (value: boolean) => void;
}

export function Checkbox({ value, onChange, ...row }: CheckboxProps) {
  const id = useId();
  const toggle = () => { if (!row.disabled) onChange(value !== true); };
  return (
    <Row id={id} {...row} onToggle={toggle}>
      <span
        role="checkbox"
        tabIndex={row.disabled ? -1 : 0}
        aria-checked={value}
        aria-disabled={row.disabled || undefined}
        aria-labelledby={`${id}l`}
        aria-describedby={row.hint ? `${id}h` : undefined}
        className={cls('check', value === true && 'on', value === 'mixed' && 'mixed', row.disabled && 'dis')}
        onKeyDown={pressKeys(toggle)}
      >
        {value === true && <Icon name="check" size={12} />}
      </span>
    </Row>
  );
}

export interface SwitchProps extends RowText {
  value: boolean;
  onChange: (value: boolean) => void;
}

export function Switch({ value, onChange, ...row }: SwitchProps) {
  const id = useId();
  const toggle = () => { if (!row.disabled) onChange(!value); };
  return (
    <Row id={id} {...row} onToggle={toggle}>
      <span
        role="switch"
        tabIndex={row.disabled ? -1 : 0}
        aria-checked={value}
        aria-disabled={row.disabled || undefined}
        aria-labelledby={`${id}l`}
        aria-describedby={row.hint ? `${id}h` : undefined}
        className={cls('switch', value && 'on', row.disabled && 'dis')}
        onKeyDown={pressKeys(toggle)}
      />
    </Row>
  );
}

export interface RadioOption<V extends string = string> extends RowText {
  value: V;
}

export interface RadioGroupProps<V extends string = string> {
  /** Said, and shown above as a small heading unless hideLabel. */
  label: string;
  hideLabel?: boolean;
  options: RadioOption<V>[];
  value: V | undefined;
  onChange: (value: V) => void;
  disabled?: boolean;
}

export function RadioGroup<V extends string = string>({ label, hideLabel, options, value, onChange, disabled }: RadioGroupProps<V>) {
  const id = useId();
  const roving = useRoving(options, value, onChange, disabled);
  return (
    <div className="radios">
      {!hideLabel && <div className="tag" id={`${id}g`}>{label}</div>}
      <div role="radiogroup" className="col" {...(hideLabel ? { 'aria-label': label } : { 'aria-labelledby': `${id}g` })}>
        {options.map((o, i) => {
          const off = disabled || o.disabled;
          return (
            <Row key={o.value} id={`${id}-${i}`} {...o} disabled={off} onToggle={() => roving.choose(i)}>
              <span
                ref={roving.ref(i)}
                role="radio"
                tabIndex={roving.tabIndex(i)}
                aria-checked={o.value === value}
                aria-disabled={off || undefined}
                aria-labelledby={`${id}-${i}l`}
                aria-describedby={o.hint ? `${id}-${i}h` : undefined}
                className={cls('radio', o.value === value && 'on', off && 'dis')}
                onKeyDown={roving.onKeyDown(i)}
              />
            </Row>
          );
        })}
      </div>
    </div>
  );
}
