import { useId } from 'react';
import { cls } from './field';
import { Icon } from './Icon';
import { useRoving } from './roving';

/**
 * One of a few, side by side (screen 12b): segments and colour swatches. Each is a radio group — the chosen one is
 * the Tab stop, the arrows choose the next and wrap, a click chooses.
 */
export interface SegmentOption<V extends string = string> {
  value: V;
  label: string;
  icon?: string;
  disabled?: boolean;
}

export interface SegmentedProps<V extends string = string> {
  /** Said; shown above as a field label unless hideLabel. */
  label: string;
  hideLabel?: boolean;
  options: SegmentOption<V>[];
  value: V;
  onChange: (value: V) => void;
  /** Share the whole width. */
  full?: boolean;
  disabled?: boolean;
}

export function Segmented<V extends string = string>({ label, hideLabel, options, value, onChange, full, disabled }: SegmentedProps<V>) {
  const id = useId();
  const roving = useRoving(options, value, onChange, disabled);
  const group = (
    <div role="radiogroup" className={cls('seg', full && 'full', disabled && 'dis')}
      {...(hideLabel ? { 'aria-label': label } : { 'aria-labelledby': `${id}l` })}>
      {options.map((o, i) => (
        <button key={o.value} ref={roving.ref(i)} type="button" role="radio" aria-checked={o.value === value}
          tabIndex={roving.tabIndex(i)} disabled={disabled || o.disabled} className={o.value === value ? 'on' : undefined}
          onKeyDown={roving.onKeyDown(i)} onClick={() => roving.choose(i)}>
          {o.icon && <Icon name={o.icon} size={14} />}{o.label}
        </button>
      ))}
    </div>
  );
  if (hideLabel) return group;
  return <div className="fld"><label id={`${id}l`}>{label}</label>{group}</div>;
}

export interface Swatch {
  value: string;
  /** Said, and shown on hover: "Green". */
  name: string;
  /** What is drawn, if not the value itself. */
  colour?: string;
}

export interface SwatchesProps {
  label: string;
  hideLabel?: boolean;
  colours: Swatch[];
  value: string | undefined;
  onChange: (value: string) => void;
  help?: string;
  disabled?: boolean;
}

export function Swatches({ label, hideLabel, colours, value, onChange, help, disabled }: SwatchesProps) {
  const id = useId();
  const roving = useRoving(colours, value, onChange, disabled);
  return (
    <div className="fld">
      {!hideLabel && <label id={`${id}l`}>{label}</label>}
      <div role="radiogroup" className="swatches" {...(hideLabel ? { 'aria-label': label } : { 'aria-labelledby': `${id}l` })}
        aria-describedby={help ? `${id}h` : undefined}>
        {colours.map((c, i) => (
          <button key={c.value} ref={roving.ref(i)} type="button" role="radio" aria-checked={c.value === value} aria-label={c.name}
            title={c.name} tabIndex={roving.tabIndex(i)} disabled={disabled} className={cls('swatch', c.value === value && 'on')}
            style={{ background: c.colour ?? c.value }} onKeyDown={roving.onKeyDown(i)} onClick={() => roving.choose(i)} />
        ))}
      </div>
      {help && <span id={`${id}h`} className="help">{help}</span>}
    </div>
  );
}
