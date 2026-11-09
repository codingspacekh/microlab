import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import type { MeterMode } from '@lib/circuit';
import type { Point } from '@lib/editor';
import { Icon } from '../ui/Icon';

/**
 * The multimeter (M9 slice 4, F-38, screen 29): its card — the display, V / A / Ω, where each probe is — and its two
 * probes on the canvas, red (+) and black (COM), dragged onto any hole, pin or terminal.
 */
export interface MeterState {
  mode: MeterMode;
  /** Where each probe's tip is: on a point (it reads), or lying free on the canvas. */
  red: { point?: string; at: Point };
  black: { point?: string; at: Point };
  /** A: the wire or the leg clicked. */
  through?: { wire: string } | { leg: string };
}

const MODES: { mode: MeterMode; label: string }[] = [
  { mode: 'V', label: 'Volts' }, { mode: 'A', label: 'Amps' }, { mode: 'Ω', label: 'Ohms' },
];

export function MeterCard({ reading, mode, onMode, red, black, through, onClose, style }: {
  reading: { text: string; unit: string }; mode: MeterMode; onMode: (m: MeterMode) => void;
  red: string; black: string; through?: string; onClose: () => void; style?: CSSProperties;
}) {
  return (
    <div className="float meter-card" role="group" aria-label="Multimeter" style={style}>
      <div className="fh">
        <Icon name="meter" size={14} />
        <b>Multimeter</b>
        <span className="spacer" />
        <button type="button" className="btn ghost icon sm" aria-label="Put the multimeter away" title="Put it away (Esc)" onClick={onClose}><Icon name="x" size={14} /></button>
      </div>
      <output className="lcd" aria-label="Reading" aria-live="polite">
        <span className="v">{reading.text}</span><span className="u">{reading.unit}</span>
      </output>
      <div className="seg" role="radiogroup" aria-label="Measure">
        {MODES.map((m) => (
          <button key={m.mode} type="button" role="radio" aria-checked={mode === m.mode} aria-label={m.label} title={m.label}
            className={mode === m.mode ? 'on' : undefined} onClick={() => onMode(m.mode)}>{m.mode}</button>
        ))}
      </div>
      {mode === 'A' ? (
        <div className="probes"><span className="lab">Through</span><span>{through ?? 'click a wire or a leg'}</span></div>
      ) : (
        <div className="probes">
          <span className="lab red">+</span><span>{red}</span>
          <span className="lab">COM</span><span>{black}</span>
        </div>
      )}
      <p className="hint">{mode === 'A' ? 'Click a wire or a leg: the meter goes in its place, in series.'
        : mode === 'Ω' ? 'Reads with the power off, as a real meter needs. Drag a probe onto a hole, a pin or a terminal.'
        : 'Drag a probe onto a hole, a pin or a terminal.'}</p>
    </div>
  );
}

/** A probe on the canvas: its tip where it measures, its body leaning up and right, its lead trailing off. */
export function Probe({ which, at, onMouseDown, on }: { which: 'red' | 'black'; at: Point; on: boolean; onMouseDown: (e: ReactMouseEvent) => void }) {
  const colour = which === 'red' ? '#d94545' : '#2b2e33';
  const dx = which === 'red' ? -14 : 14;   // the two lean apart, so both can be seen on neighbouring holes
  const top = { x: at.x + dx * 3.2, y: at.y - 64 };
  const mid = { x: at.x + dx * 1.2, y: at.y - 24 };
  return (
    <g className={`probe ${which}`} data-probe={which} data-on={on ? '1' : '0'} role="button"
      aria-label={which === 'red' ? 'Red probe (+)' : 'Black probe (COM)'} onMouseDown={onMouseDown}>
      <path d={`M${top.x},${top.y} q${dx * 2},-40 ${dx * 5},-70`} stroke={colour} strokeWidth={3} fill="none" opacity={0.7} />
      <line x1={at.x} y1={at.y} x2={mid.x} y2={mid.y} stroke="#9aa0a6" strokeWidth={2.2} />
      <line x1={mid.x} y1={mid.y} x2={top.x} y2={top.y} stroke={colour} strokeWidth={9} strokeLinecap="round" />
      <circle cx={at.x} cy={at.y} r={on ? 5 : 4} fill="none" stroke={colour} strokeWidth={2} />
      <text x={top.x + dx * 0.9} y={top.y + 4} fontSize={10} fontWeight={800} fill={colour} textAnchor="middle" pointerEvents="none"
        fontFamily="Inter Variable, Inter, sans-serif">{which === 'red' ? '+' : 'COM'}</text>
    </g>
  );
}
