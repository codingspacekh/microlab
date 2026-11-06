import { useState } from 'react';
import { boardData, deletePart, deleteWire, partKind, setBreadboardSize, setPartProp, setWireColour } from '@lib/editor';
import type { BoardId } from '@lib/boards';
import type { BreadboardSize } from '@lib/circuit';
import type { Project } from '@lib/project';
import { formatValue } from '@lib/units';
import { Chips, Icon, Segmented, Stepper, Swatches } from '../ui';
import { wireColour, type Selection } from './Canvas';
import { bands, LED_SWATCHES, PartIcon, WIRE_COLOURS } from './drawings';

/**
 * The inspector (screen 02b, F-14): what the selected part, wire or breadboard is, and what can be set — a resistor's
 * value (E12 stepper, quick values, its colour bands), an LED's colour, a potentiometer's value, a wire's colour, the
 * breadboard's size. Delete removes a part or a wire (F-11). Only the kit's controls (N-14).
 */
export const SHRINK = 'Parts or wires use columns 31–63: move them first.';
const QUICK_OHMS = [100, 220, 330, 1000, 4700, 10_000];
const POTS = [1000, 10_000, 100_000];
const WIRE_SWATCHES = Object.entries(WIRE_COLOURS).map(([value, [colour]]) => ({ value, name: value[0]!.toUpperCase() + value.slice(1), colour }));

export interface InspectorProps {
  project: Project;
  selection: Selection;
  onChange: (project: Project) => void;
  onClose: () => void;
}

export function Inspector({ project, selection, onChange, onClose }: InspectorProps) {
  const [error, setError] = useState<string | null>(null);
  const board = project.board as BoardId;
  const label = (ref: string) => {
    if (!ref.startsWith('board.')) return ref.slice(ref.indexOf('.') + 1);
    const pin = boardData(board).pins.find((p) => `board.${p.id}` === ref);
    return pin?.label ?? ref.slice(6);
  };

  let icon: React.ReactNode;
  let title: string;
  let rows: React.ReactNode;
  let remove: (() => Project) | undefined;

  if (selection.kind === 'part') {
    const part = project.parts.find((p) => p.id === selection.id);
    if (!part) return null;
    const kind = partKind(part.type);
    const set = (key: string, v: number | string) => onChange(setPartProp(project, part.id, key, v));
    icon = <PartIcon type={part.type} />;
    title = `${part.id.toUpperCase()} · ${kind.name}`;
    remove = () => deletePart(project, part.id);
    const ohms = Number(part.props?.ohms ?? kind.props.ohms ?? 0);
    rows = (
      <>
        {part.type === 'resistor' && (
          <>
            <Row name="Resistance">
              <Stepper label="Resistance" hideLabel series="e12" min={1} max={10_000_000} unit="Ω" size="sm" value={ohms} onChange={(v) => set('ohms', v)} />
            </Row>
            <Row name=""><Chips label="Common values" values={QUICK_OHMS} value={ohms} onChange={(v) => set('ohms', v)} /></Row>
            <Row name="Colour bands">
              <span className="bands" aria-label={`Colour bands for ${formatValue(ohms)} Ω`}>
                {bands(ohms).map((c, i) => <i key={i} style={{ background: c }} />)}
              </span>
            </Row>
          </>
        )}
        {part.type === 'led' && (
          <Row name="Colour">
            <Swatches label="LED colour" hideLabel colours={LED_SWATCHES} value={String(part.props?.color ?? 'red')} onChange={(v) => set('color', v)} />
          </Row>
        )}
        {part.type === 'potentiometer' && (
          <Row name="Value">
            <Segmented label="Potentiometer value" hideLabel value={String(ohms)} onChange={(v) => set('ohms', Number(v))}
              options={POTS.map((v) => ({ value: String(v), label: `${formatValue(v)}Ω` }))} />
          </Row>
        )}
        {part.type === 'led' ? (
          <Row name="Legs in">
            <span className="small legs">
              <span><b className="plus">+</b> anode <span className="mono">{label(part.legs.a!)}</span></span>
              <span><b className="minus">−</b> cathode <span className="mono">{label(part.legs.k!)}</span></span>
            </span>
          </Row>
        ) : (
          <Row name="Legs in"><span className="small mono">{Object.values(part.legs).map(label).join(', ')}</span></Row>
        )}
        {part.type === 'led' && (
          <p className="tiny muted led-tip">The long leg (+) goes towards the pin or 3.3 V, the short leg (−) by the flat edge towards GND. Turned round, an LED doesn't light.</p>
        )}
      </>
    );
  } else if (selection.kind === 'wire') {
    const wire = project.wires.find((w) => w.id === selection.id);
    if (!wire) return null;
    const role = (ref: string) => boardData(board).pins.find((p) => `board.${p.id}` === ref)?.role;
    const colour = wire.color ?? wireColour(wire.id, role(wire.a) ?? role(wire.b));
    icon = <span className="wire-sw" style={{ background: WIRE_COLOURS[colour]?.[0] }} />;
    title = `${wire.id.toUpperCase()} · Wire`;
    remove = () => deleteWire(project, wire.id);
    rows = (
      <>
        <Row name="Colour">
          <Swatches label="Wire colour" hideLabel colours={WIRE_SWATCHES} value={colour} onChange={(v) => onChange(setWireColour(project, wire.id, v))} />
        </Row>
        <Row name="Joins"><span className="small mono">{label(wire.a)} ↔ {label(wire.b)}</span></Row>
      </>
    );
  } else {
    const bb = project.breadboards.find((b) => b.id === selection.id);
    if (!bb) return null;
    icon = <Icon name="grid" />;
    title = `${bb.id.toUpperCase()} · Breadboard`;
    rows = (
      <>
        <Row name="Size">
          <Segmented<BreadboardSize> label="Breadboard size" hideLabel value={bb.size}
            options={[{ value: 'half', label: 'Half · 30' }, { value: 'full', label: 'Full · 63' }]}
            onChange={(size) => {
              const next = setBreadboardSize(project, bb.id, size);
              if (!next) { setError(SHRINK); return; }
              setError(null);
              onChange(next);
            }} />
        </Row>
        {error && <p className="small inspector-error" role="alert">{error}</p>}
      </>
    );
  }

  return (
    <aside className="float inspector" aria-label="Inspector">
      <div className="ih">
        <span className="pic">{icon}</span>
        <b>{title}</b>
        <span className="spacer" />
        <button type="button" className="btn ghost sm icon" aria-label="Close the inspector" title="Close (Esc)" onClick={onClose}><Icon name="x" size={14} /></button>
      </div>
      {rows}
      {remove && (
        <div className="actions">
          <button type="button" className="btn sm danger" onClick={() => { onChange(remove!()); onClose(); }}>
            <Icon name="trash" size={14} /> Delete
          </button>
          <span className="tiny muted">or press Delete</span>
        </div>
      )}
    </aside>
  );
}

function Row({ name, children }: { name: string; children: React.ReactNode }) {
  return <div className="prop"><span>{name}</span><div className="pv">{children}</div></div>;
}
