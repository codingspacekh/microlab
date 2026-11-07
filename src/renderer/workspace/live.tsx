import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ldrOhms, SENSOR_START } from '@lib/circuit';
import type { Point } from '@lib/editor';
import type { PartView } from '../../sim/circuit';
import { noteName } from '../audio';
import { Icon, Slider } from '../ui';
import { UsbPlug } from './drawings';

/**
 * The circuit's inputs while a program runs (M6.1, screen 17) and what the parts say on hover: a slide switch is
 * clicked to slide it, a knob dragged up (more) or down (less), the light on a light sensor set on its card. Each is a
 * live slot of the run ('position:sw1', 'position:pot1', 'lux:ldr1'); the sim's own start values are shown until one
 * is changed, and a new run starts from them again. Hovering an LED or an RGB LED says its current (screen 03, 17), a
 * buzzer its pitch and note (M6.2);
 * hovering the micro:bit GPIO board's micro-USB says what it gives (screen 17b).
 */

/** The values the sim starts with (lib/circuit: a switch at 0, a knob in the middle, 300 lux on a light sensor, a soil
 *  sensor in damp soil, room temperature). */
export const START: Record<string, number> = { position: 0, lux: 300, celsius: SENSOR_START.celsius };
const KNOB_START = 0.5;
/** Pixels of drag from one end of a knob's turn to the other. */
const KNOB_PX = 150;

export interface Live {
  /** A slot's value now: what was set in this run, or the sim's start value. */
  value: (slot: string) => number;
  set: (slot: string, v: number) => void;
  /** A drag on a knob starts. */
  turn: (id: string, e: { clientY: number }) => void;
}

export function useLive(running: boolean, onInput?: (name: string, value: number) => void): Live {
  const [values, setValues] = useState<Record<string, number>>({});
  const knob = useRef<{ id: string; y: number; from: number } | null>(null);
  const latest = useRef({ values, onInput });
  latest.current = { values, onInput };

  // each run starts from the sim's start values
  useEffect(() => { if (running) setValues({}); else knob.current = null; }, [running]);

  const value = (slot: string) => values[slot] ?? (slot.startsWith('position:pot') ? KNOB_START : slot.startsWith('position:soil') ? SENSOR_START.moisture
    : START[slot.slice(0, slot.indexOf(':'))] ?? 0);
  const set = (slot: string, v: number) => {
    setValues((vs) => ({ ...vs, [slot]: v }));
    latest.current.onInput?.(slot, v);
  };

  useEffect(() => {
    const move = (e: MouseEvent) => {
      const k = knob.current;
      if (!k) return;
      const v = Math.round(Math.min(1, Math.max(0, k.from + (k.y - e.clientY) / KNOB_PX)) * 100) / 100;
      const slot = `position:${k.id}`;
      if (latest.current.values[slot] === v) return;
      latest.current.values = { ...latest.current.values, [slot]: v };
      setValues((vs) => ({ ...vs, [slot]: v }));
      latest.current.onInput?.(slot, v);
    };
    const up = () => { knob.current = null; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, []);

  return { value, set, turn: (id, e) => { knob.current = { id, y: e.clientY, from: value(`position:${id}`) }; } };
}

/** A resistance in two figures: 1.4 kΩ, 380 kΩ, 100 Ω. */
export function ohmsText(ohms: number): string {
  const [div, suffix] = ohms >= 1e6 ? [1e6, 'M'] : ohms >= 1e3 ? [1e3, 'k'] : [1, ''];
  return `${Number((ohms / div).toPrecision(2))} ${suffix}Ω`;
}

/** Light in lux as said: 0.1 lux, 5 lux, 300 lux, 12 000 lux. */
export function luxText(lux: number): string {
  const v = lux < 10 ? Number(lux.toPrecision(1)) : Number(lux.toPrecision(2));
  return `${v >= 1000 ? v.toLocaleString('en-GB').replace(/,/g, ' ') : v} lux`;
}

/** The light slider runs on a log scale, 10^−1 (dark) to 10^5 lux (daylight), a room (100 lux) in the middle. */
const LOG = { min: -1, max: 5, step: 0.05 };
const volts = (v: PartView | undefined, name: string) => (v?.kind !== 'sensor' ? '' : v.powered ? `${name} ${Number(v.volts.toFixed(2))} V` : 'not powered');

/** The parts the Inputs card has a row for (screen 18): a light sensor, a soil moisture sensor, a temperature sensor. */
export const SLIDER_PARTS = new Set(['ldr', 'soil-moisture', 'temp-sensor']);

/**
 * The Inputs card (screen 18, M6.3; it took the place of screen 17's light card): a row for every sensor set with a
 * slider while the program runs — the light on a light sensor (and its resistance), the moisture round a soil sensor,
 * a temperature sensor's °C (and the volts of their outputs).
 */
export function InputsCard({ parts, live, views, onClose, style }: {
  parts: { id: string; type: string; props?: Record<string, unknown> }[];
  live: Live; views: Record<string, PartView>; onClose: () => void; style: CSSProperties;
}) {
  return (
    <div className="float inputs" role="group" aria-label="Inputs" style={style}>
      <div className="ih">
        <Icon name="sliders" size={14} /> <b>Inputs</b>
        <span className="spacer" />
        <span className="tiny muted">while it runs</span>
        <button type="button" className="btn ghost sm icon" aria-label="Close the inputs card" title="Close" onClick={onClose}><Icon name="x" size={14} /></button>
      </div>
      {parts.map((p) => {
        const name = p.id.toUpperCase();
        if (p.type === 'ldr') {
          const lux = live.value(`lux:${p.id}`);
          return (
            <Row key={p.id} icon="sun" name={name} kind="light" reading={ohmsText(ldrOhms(lux))}>
              <Slider label={`Light on ${name}`} value={Math.log10(lux)} min={LOG.min} max={LOG.max} step={LOG.step}
                format={(v) => luxText(10 ** v)} ticks={['dark', 'room', 'daylight']}
                onChange={(v) => live.set(`lux:${p.id}`, Number((10 ** v).toPrecision(v < 1 ? 1 : 2)))} />
            </Row>
          );
        }
        if (p.type === 'temp-sensor') {
          return (
            <Row key={p.id} icon="therm" name={name} kind={String(p.props?.kind ?? 'TMP36')} reading={volts(views[p.id], 'Vout')}>
              <Slider label={`Temperature of ${name}`} value={live.value(`celsius:${p.id}`)} min={-20} max={60} step={1}
                format={(v) => `${v} °C`} ticks={['−20 °C', '20', '60 °C']} onChange={(v) => live.set(`celsius:${p.id}`, v)} />
            </Row>
          );
        }
        return (
          <Row key={p.id} icon="drop" name={name} kind="moisture" reading={volts(views[p.id], 'AOUT')}>
            <Slider label={`Moisture around ${name}`} value={Math.round(live.value(`position:${p.id}`) * 100)} min={0} max={100} step={1}
              format={(v) => `${v} %`} ticks={['dry', 'damp', 'in water']} onChange={(v) => live.set(`position:${p.id}`, v / 100)} />
          </Row>
        );
      })}
    </div>
  );
}

function Row({ icon, name, kind, reading, children }: { icon: string; name: string; kind: string; reading: string; children: React.ReactNode }) {
  return (
    <div className="sec">
      <div className="sh small"><Icon name={icon} size={12} /> <b>{name}</b> <span className="muted">· {kind}</span><span className="spacer" /><span className="mono tiny muted">{reading}</span></div>
      {children}
    </div>
  );
}

const mA = (amps: number) => `${Number((amps * 1000).toFixed(1))} mA`;

/** What an LED or an RGB LED says on hover while running: its current, each die's for an RGB LED. */
export function PartTip({ id, type, common, views, overLine = false, style }: {
  id: string; type: string; common?: string; views: Record<string, PartView>; overLine?: boolean; style: CSSProperties;
}) {
  const led = (key: string) => {
    const v = views[key];
    return v?.kind === 'led' ? v : { amps: 0, brightness: 0 };
  };
  if (type === 'led') {
    return <div className="tip part-tip" role="tooltip" style={style}><b>{id.toUpperCase()} · {mA(led(id).amps)}</b></div>;
  }
  if (type === 'pir') {
    const v = views[id];
    const high = v?.kind === 'sensor' && v.volts > 1;
    return (
      <div className="tip part-tip" role="tooltip" style={style}>
        <b>{id.toUpperCase()} · {high ? 'motion' : 'no motion'}</b>
        <div>OUT is high while you hold the mouse on it, and for 3 s after.</div>
        {v?.kind === 'sensor' && !v.powered && <div className="note">Not powered: it needs 5 V (VBUS, VIN or 5V)</div>}
      </div>
    );
  }
  if (type === 'line-sensor') {
    return (
      <div className="tip part-tip" role="tooltip" style={style}>
        <b>{id.toUpperCase()} · {overLine ? 'over the line' : 'over white'}</b> — OUT {overLine ? 1 : 0}. Click to slide it over {overLine ? 'white' : 'the line'}.
      </div>
    );
  }
  if (type === 'buzzer') {
    const v = views[id];
    const hz = v?.kind === 'buzzer' && v.volume > 0 ? v.hz : 0;
    const note = noteName(hz);
    return <div className="tip part-tip" role="tooltip" style={style}><b>{id.toUpperCase()} · {hz ? `${hz} Hz${note ? ` · ${note}` : ''}` : 'silent'}</b></div>;
  }
  const [r, g, b] = ['r', 'g', 'b'].map((d) => led(`${id}:${d}`));
  const dim = [g!, b!].some((d) => d.amps > 0 && d.brightness < 0.25);
  return (
    <div className="tip part-tip" role="tooltip" style={style}>
      <b>{id.toUpperCase()} · common {common === 'anode' ? 'anode' : 'cathode'}</b>
      <div className="dies">
        <span className="r">R</span> {mA(r!.amps)} · <span className="g">G</span> {mA(g!.amps)} · <span className="b">B</span> {mA(b!.amps)}
      </div>
      {dim && <div className="note">Green and blue need about 3 V: on 3.3 V they are dim</div>}
    </div>
  );
}

/** The micro:bit GPIO board's micro-USB socket (screen 17b): the plug drawn when it is in; a click takes it out or
 *  puts it in (while building). */
export function UsbSocket({ at, plugged, onToggle, onHover }: { at: Point; plugged: boolean; onToggle: () => void; onHover: (on: boolean) => void }) {
  return (
    <g data-usb={plugged ? 'in' : 'out'} className="usb" role="button" aria-label={plugged ? 'Take out the micro-USB cable' : 'Plug in the micro-USB cable'}
      onMouseDown={(e) => e.stopPropagation()} onClick={onToggle}
      onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}>
      {plugged && <UsbPlug at={at} />}
      <rect className="hit" x={at.x - (plugged ? 40 : 6)} y={at.y - 4} width={plugged ? 54 : 20} height={24} rx={4} fill="transparent" />
    </g>
  );
}

export function UsbTip({ plugged, style }: { plugged: boolean; style: CSSProperties }) {
  return (
    <div className="tip usb-tip" role="tooltip" style={style}>
      <b>micro-USB · 5V in</b>
      {plugged
        ? <div>The GPIO board's own cable is <b>plugged in</b>: its 5V pins give 5 V (from the laptop's USB, 500 mA at most). Click to take it out.</div>
        : <div>The GPIO board's own cable is <b>not plugged in</b>: its 5V pins give nothing. Click to plug it in.</div>}
    </div>
  );
}
