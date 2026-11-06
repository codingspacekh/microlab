import { useId, type ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * What every labelled control shares (N-14): its label above, its help or error below — the error is said to screen
 * readers as the control's description and marks it invalid.
 */
export interface FieldText {
  label: string;
  /** The label is said, not shown (a control whose label is elsewhere on screen). */
  hideLabel?: boolean;
  help?: ReactNode;
  /** A message, or true for the red state alone. */
  error?: ReactNode | boolean;
}

export function useFieldIds() {
  const id = useId();
  return { control: `${id}c`, label: `${id}l`, desc: `${id}d` };
}
export type FieldIds = ReturnType<typeof useFieldIds>;

const message = ({ help, error }: FieldText) => (error && error !== true ? error : help);

/** aria attributes naming and describing the control. */
export function labelling(ids: FieldIds, f: FieldText) {
  return {
    ...(f.hideLabel ? { 'aria-label': f.label } : { 'aria-labelledby': ids.label }),
    ...(message(f) ? { 'aria-describedby': ids.desc } : {}),
    ...(f.error ? { 'aria-invalid': true as const } : {}),
  };
}

export function FieldFrame({ ids, children, ...f }: FieldText & { ids: FieldIds; children: ReactNode }) {
  const msg = message(f);
  const isError = Boolean(f.error && f.error !== true);
  return (
    <div className="fld">
      {!f.hideLabel && <label id={ids.label} htmlFor={ids.control}>{f.label}</label>}
      {children}
      {msg && (
        <span id={ids.desc} className={isError ? 'help err' : 'help'}>
          {isError && <Icon name="alert" size={12} />}{msg}
        </span>
      )}
    </div>
  );
}

export const cls = (...names: unknown[]) => names.filter((n): n is string => typeof n === 'string' && n !== '').join(' ');
