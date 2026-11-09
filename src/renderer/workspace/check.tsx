import type { CSSProperties } from 'react';
import type { CheckItem } from '@lib/project';
import { Icon } from '../ui/Icon';
import { Checkbox } from '../ui/Toggles';

/**
 * The check before running (M9 slice 3, F-18, screen 29b): over the canvas when Run finds something to look at. Each
 * thing with Show (rung on the canvas) or Line N (the editor goes there); Run anyway runs it as it is — the sim shows
 * what a real board would do; Cancel goes back to fix it.
 */
export function CheckCard({ items, enabled, onEnabled, onShow, onRunAnyway, onCancel, style }: {
  items: CheckItem[]; enabled: boolean; onEnabled: (on: boolean) => void; onShow: (item: CheckItem) => void;
  onRunAnyway: () => void; onCancel: () => void; style?: CSSProperties;
}) {
  const n = items.length;
  return (
    <div className="float check-card" role="dialog" aria-label="Before it runs" style={style}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } }}>
      <div className="fh"><Icon name="warn" size={14} /><b>Before it runs: {n} thing{n === 1 ? '' : 's'} to look at</b></div>
      <ul>
        {items.map((i) => (
          <li key={i.key}>
            <Icon name="warn" size={14} />
            <span className="tx"><b>{i.title}</b>{i.text.startsWith(',') || i.text.startsWith(' ') ? '' : ' '}{i.text}</span>
            <button type="button" className="btn sm" onClick={() => onShow(i)}>{showLabel(i)}</button>
          </li>
        ))}
      </ul>
      <div className="row">
        <Checkbox label="Check each time I press Run" value={enabled} onChange={onEnabled} />
        <span className="spacer" />
        <button type="button" className="btn sm" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn primary sm" onClick={onRunAnyway} autoFocus>Run anyway</button>
      </div>
    </div>
  );
}

/** "Line 6" for a pin the code uses (the editor goes there), Show for the rest (rung on the canvas). */
export const showLabel = (i: CheckItem) => (i.show.line && !i.show.point && !i.show.part ? `Line ${i.show.line.line}` : 'Show');

/** A check item as Problems lists it: the sentence, then what to do. */
export function checkProblem(i: CheckItem) {
  const joined = i.text.startsWith(',') || i.text.startsWith(' ');
  return {
    key: `check:${i.key}`, severity: 'warning' as const,
    heading: joined ? `${i.title}${i.text}` : i.title.replace(/\.$/, ''),
    line: joined ? '' : i.text,
    show: i.show,
    action: showLabel(i),
  };
}
