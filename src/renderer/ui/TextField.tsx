import { useRef, type KeyboardEvent } from 'react';
import { cls, FieldFrame, labelling, useFieldIds, type FieldText } from './field';
import { Icon } from './Icon';

/**
 * Text fields (screen 12b): a name, a search, a value with its unit; and the text area for notes. The field
 * stretches to its column (N-13); its error is said as its description.
 */
export interface TextFieldProps extends FieldText {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** An icon at the start (search). */
  icon?: string;
  /** A × to empty it; Esc empties it too. */
  clearable?: boolean;
  /** After the text, quieter: "mA". */
  unit?: string;
  mono?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Enter pressed in it. */
  onEnter?: () => void;
}

export function TextField({ value, onChange, placeholder, icon, clearable, unit, mono, disabled = false, autoFocus, onEnter, ...text }: TextFieldProps) {
  const ids = useFieldIds();
  const input = useRef<HTMLInputElement>(null);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && clearable && value) { e.preventDefault(); e.stopPropagation(); onChange(''); }
    else if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter(); }
  };
  return (
    <FieldFrame ids={ids} {...text}>
      <div className={cls('field', text.error && 'err', disabled && 'dis')} onMouseDown={(e) => {
        if (e.target !== input.current) { e.preventDefault(); input.current?.focus(); }
      }}>
        {icon && <Icon name={icon} size={14} />}
        <input
          ref={input}
          id={ids.control}
          type="text"
          className={cls('val', mono && 'mono')}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          spellCheck={false}
          {...labelling(ids, text)}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {unit && <span className="unit">{unit}</span>}
        {clearable && value && !disabled && (
          <button type="button" className="clr" tabIndex={-1} aria-label="Clear" onClick={() => { onChange(''); input.current?.focus(); }}>
            <Icon name="x" size={12} />
          </button>
        )}
      </div>
    </FieldFrame>
  );
}

export interface TextAreaProps extends FieldText {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
}

export function TextArea({ value, onChange, placeholder, rows = 3, disabled = false, ...text }: TextAreaProps) {
  const ids = useFieldIds();
  return (
    <FieldFrame ids={ids} {...text}>
      <textarea id={ids.control} className={cls('area', text.error && 'err')} value={value} placeholder={placeholder} rows={rows}
        disabled={disabled} {...labelling(ids, text)} onChange={(e) => onChange(e.target.value)} />
    </FieldFrame>
  );
}
