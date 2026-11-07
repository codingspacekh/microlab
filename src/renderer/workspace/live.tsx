import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ldrOhms } from '@lib/circuit';
import type { Point } from '@lib/editor';
import type { PartView } from '../../sim/circuit';
import { Icon, Slider } from '../ui';
import { UsbPlug } from './drawings';

/**
 * The circuit's inputs while a program runs (M6.1, screen 17) and what the parts say on hover: a slide switch is
 * clicked to slide it, a knob dragged up (more) or down (less), the light on a light sensor set on its card. Each is a
 * live slot of the run ('position:sw1', 'position:pot1', 'lux:ldr1'); the sim's own start values are shown until one
 * is changed, and a new run starts from them again. Hovering an LED or an RGB LED says its current (screen 03, 17);
 * hovering the micro:bit GPIO board's micro-USB says what it gives (screen 17b).
 */

/** The values the sim starts with (lib/circuit solve: a switch at 0, a knob in the middle, 300 lux on a sensor). */
export const START: Record<string, number> = { position: 0, lux: 300 };
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

  const value = (slot: string) => values[slot] ?? (slot.startsWith('position:pot') ? KNOB_START : START[slot.slice(0, slot.indexOf(':'))] ?? 0);
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

/** The light card's slider runs on a log scale, 10^−1 (dark) to 10^5 lux (daylight), a room (100 lux) in the middle. */
const LOG = { min: -1, max: 5, step: 0.05 };

/** The card of a light sensor (screen 17): the light on it from dark to daylight, and its resistance now. */
export function LightCard({ id, lux, onLux, onClose, style }: { id: string; lux: number; onLux: (lux: number) => void; onClose: () => void; style: CSSProperties }) {
  const name = id.toUpperCase();
  return (
    <div className="float inputs light-card" role="group" aria-label={`Light on ${name}`} style={style}>
      <div className="ih">
        <Icon name="sun" size={14} /> <b>Light on {name}</b>
        <span className="spacer" />
        <button type="button" className="btn ghost sm icon" aria-label="Close the light card" title="Close" onClick={onClose}><Icon name="x" size={14} /></button>
      </div>
      <Slider label="Light" value={Math.log10(lux)} min={LOG.min} max={LOG.max} step={LOG.step}
        format={(v) => luxText(10 ** v)} ticks={['dark', 'room', 'daylight']}
        onChange={(v) => onLux(Number((10 ** v).toPrecision(v < 1 ? 1 : 2)))} />
      <p className="tiny muted">{name} is <b>{ohmsText(ldrOhms(lux))}</b> now</p>
    </div>
  );
}

const mA = (amps: number) => `${Number((amps * 1000).toFixed(1))} mA`;

/** What an LED or an RGB LED says on hover while running: its current, each die's for an RGB LED. */
export function PartTip({ id, type, common, views, style }: { id: string; type: string; common?: string; views: Record<string, PartView>; style: CSSProperties }) {
  const led = (key: string) => {
    const v = views[key];
    return v?.kind === 'led' ? v : { amps: 0, brightness: 0 };
  };
  if (type === 'led') {
    return <div className="tip part-tip" role="tooltip" style={style}><b>{id.toUpperCase()} · {mA(led(id).amps)}</b></div>;
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
