import type { CSSProperties } from 'react';
import type { FaultCard } from '@lib/circuit';
import { Icon } from '../ui/Icon';

/**
 * A fault on the workspace (M9 slice 2, F-37; screens 04, 25c, 26c, 27c): beside what it is on. A damage is a card —
 * what happened, why, its numbers, the fix, and Replace the LED or Undo; a warning a short note. "Show me how"
 * (screen 04) opens the part's Learn page, which comes with M8.
 */
export function FaultCardView({ card, style, onReplace, onUndo, onClose }: {
  card: FaultCard; style?: CSSProperties; onReplace?: () => void; onUndo?: () => void; onClose: () => void;
}) {
  return (
    <div className="float fault-card" role="group" aria-label={card.title} style={style}>
      <div className="fh">
        <Icon name="alert" size={16} />
        <b>{card.title}</b>
        <span className="spacer" />
        <button type="button" className="btn ghost icon sm" aria-label="Close the card" title="Close — it stays in Problems" onClick={onClose}><Icon name="x" size={14} /></button>
      </div>
      <p>{card.why}</p>
      {card.numbers.length > 0 && (
        <div className="nums">
          {card.numbers.map((n) => (
            <div key={n.label} className={n.bad ? 'num bad' : 'num'}><span>{n.label}</span><b>{n.value}</b></div>
          ))}
        </div>
      )}
      <p><b>Fix:</b> {card.fix}</p>
      {(onReplace || onUndo) && (
        <div className="row">
          {onReplace && <button type="button" className="btn sm" onClick={onReplace}>Replace the LED</button>}
          {onUndo && <button type="button" className="btn ghost sm" onClick={onUndo}><Icon name="undo" size={14} /> Undo</button>}
        </div>
      )}
    </div>
  );
}

/** A warning beside its part (screens 25c, 26c, 27c): it works, but shouldn't be built so. */
export function FaultNote({ card, style, onClose }: { card: FaultCard; style?: CSSProperties; onClose: () => void }) {
  return (
    <div className="float fault-note" role="note" aria-label={card.title} style={style}>
      <div className="fh">
        <b>{card.title}</b>
        <span className="spacer" />
        <button type="button" className="btn ghost icon sm" aria-label="Close the note" title="Close — it stays in Problems" onClick={onClose}><Icon name="x" size={12} /></button>
      </div>
      <p>{card.line}</p>
    </div>
  );
}

/** Problems (F-24, screens 04, 25c): each fault of the run, the damage first, with Show. */
export function ProblemsList({ cards, onShow, onReplace }: { cards: FaultCard[]; onShow: (card: FaultCard) => void; onReplace?: (led: string) => void }) {
  if (!cards.length) return <span className="sys">No problems in the circuit. A part used wrongly — an LED with no resistor, a short, 5 V on a pin — shows here while it runs.</span>;
  const sorted = [...cards.filter((c) => c.severity === 'damage'), ...cards.filter((c) => c.severity !== 'damage')];
  return (
    <ul className="problems" aria-label="Problems">
      {sorted.map((c) => (
        <li key={c.key} className={c.severity === 'damage' ? 'problem damage' : 'problem'}>
          <Icon name={c.severity === 'damage' ? 'alert' : 'warn'} size={16} />
          <div className="pbody">
            <b>{c.heading}</b>
            <span>{c.line}</span>
          </div>
          <span className="pacts">
            {c.hurt?.led && onReplace && <button type="button" className="btn ghost sm" onClick={() => onReplace(c.hurt!.led!)}>Replace</button>}
            {(c.show.part || c.show.pin) && <button type="button" className="btn sm" aria-label={`Show: ${c.heading}`} onClick={() => onShow(c)}>Show</button>}
          </span>
        </li>
      ))}
    </ul>
  );
}
