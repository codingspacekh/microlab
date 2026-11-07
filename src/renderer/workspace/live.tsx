import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { echoUs, ldrOhms, SENSOR_START } from '@lib/circuit';
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
export const START: Record<string, number> = {
  position: 0, lux: 300, celsius: SENSOR_START.celsius, humidity: SENSOR_START.humidity, cm: SENSOR_START.cm, tiltx: 0, tilty: 0,
};
const KNOB_START = 0.5;
/** Pixels of drag from one end of a knob's turn to the other. */
const KNOB_PX = 150;

export interface Live {
  /** A slot's value now: what was set in this run, or the sim's start value. */
  value: (slot: string) => number;
  set: (slot: string, v: number) => void;
  /** A drag on a knob starts (a potentiometer, a potentiometer module). */
  turn: (id: string, e: { clientY: number }) => void;
  /** A drag on a joystick's stick starts (M6.5a): it follows, springs back when let go; a click presses SW. */
  stick: (id: string, e: { clientX: number; clientY: number }) => void;
  /** A drag round a rotary encoder starts (M6.5a), `centre` its middle on screen: a step each 15°; a click presses it. */
  dial: (id: string, e: { clientX: number; clientY: number }, centre: { x: number; y: number }) => void;
}

/** Pixels from the middle to the edge of a joystick's travel; degrees for an encoder's step; a click is shorter. */
const STICK_PX = 60;
const STEP_DEG = 15;
const CLICK_PX = 4;
const PRESS_MS = 200;

type Drag =
  | { kind: 'knob'; id: string; y: number; from: number }
  | { kind: 'stick'; id: string; x: number; y: number; moved: boolean }
  | { kind: 'dial'; id: string; x: number; y: number; cx: number; cy: number; last: number; total: number; from: number; moved: boolean };

export function useLive(running: boolean, onInput?: (name: string, value: number) => void): Live {
  const [values, setValues] = useState<Record<string, number>>({});
  const drag = useRef<Drag | null>(null);
  const latest = useRef({ values, onInput });
  latest.current = { values, onInput };

  // each run starts from the sim's start values
  useEffect(() => { if (running) setValues({}); else drag.current = null; }, [running]);

  const startOf = (slot: string) => (slot.startsWith('position:pot') || slot.startsWith('position:knob') || slot.startsWith('x:') || slot.startsWith('y:') ? KNOB_START
    : slot.startsWith('position:soil') ? SENSOR_START.moisture : START[slot.slice(0, slot.indexOf(':'))] ?? 0);
  const value = (slot: string) => values[slot] ?? startOf(slot);
  /** Sets a slot (and tells the run) unless it already has that value. */
  const put = (slot: string, v: number) => {
    if ((latest.current.values[slot] ?? startOf(slot)) === v) return;
    latest.current.values = { ...latest.current.values, [slot]: v };
    setValues((vs) => ({ ...vs, [slot]: v }));
    latest.current.onInput?.(slot, v);
  };
  const press = (id: string) => {
    latest.current.onInput?.(`pressed:${id}`, 1);
    setTimeout(() => latest.current.onInput?.(`pressed:${id}`, 0), PRESS_MS);
  };

  useEffect(() => {
    const clamp = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;
    const move = (e: MouseEvent) => {
      const d = drag.current;
      if (!d) return;
      if (d.kind === 'knob') { put(`position:${d.id}`, clamp(d.from + (d.y - e.clientY) / KNOB_PX)); return; }
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) >= CLICK_PX) d.moved = true;
      if (d.kind === 'stick') {
        if (!d.moved) return;
        put(`x:${d.id}`, clamp(0.5 + (e.clientX - d.x) / STICK_PX));
        put(`y:${d.id}`, clamp(0.5 - (e.clientY - d.y) / STICK_PX));
        return;
      }
      const a = Math.atan2(e.clientY - d.cy, e.clientX - d.cx) * (180 / Math.PI);
      let delta = a - d.last;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      d.last = a;
      d.total += delta;
      put(`steps:${d.id}`, d.from + Math.trunc(d.total / STEP_DEG));   // clockwise on screen (y down): more steps
    };
    const up = () => {
      const d = drag.current;
      drag.current = null;
      if (!d || d.kind === 'knob') return;
      if (!d.moved) { press(d.id); return; }
      if (d.kind === 'stick') { put(`x:${d.id}`, 0.5); put(`y:${d.id}`, 0.5); }   // it springs back
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, []);

  return {
    value, set: put,
    turn: (id, e) => { drag.current = { kind: 'knob', id, y: e.clientY, from: value(`position:${id}`) }; },
    stick: (id, e) => { drag.current = { kind: 'stick', id, x: e.clientX, y: e.clientY, moved: false }; },
    dial: (id, e, c) => {
      const a = Math.atan2(e.clientY - c.y, e.clientX - c.x) * (180 / Math.PI);
      drag.current = { kind: 'dial', id, x: e.clientX, y: e.clientY, cx: c.x, cy: c.y, last: a, total: 0, from: value(`steps:${id}`), moved: false };
    },
  };
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
export const SLIDER_PARTS = new Set(['ldr', 'soil-moisture', 'temp-sensor', 'dht', 'hc-sr04', 'mpu6050',
  'ldr-module', 'flame', 'raindrop', 'water-level', 'mq2', 'speed-sensor']);

/** The kit's modules set with a 0–1 slider (M6.5a): its name on the card, the slider's label, its ends, its output's name. */
const LEVELS: Record<string, { icon: string; kind: string; label: string; ticks: [string, string]; out: string }> = {
  flame: { icon: 'bolt', kind: 'flame', label: 'Flame at', ticks: ['none', 'close'], out: 'AO' },
  raindrop: { icon: 'drop', kind: 'rain', label: 'Rain on', ticks: ['dry', 'wet'], out: 'AO' },
  'water-level': { icon: 'drop', kind: 'depth', label: 'Water at', ticks: ['dry', 'under'], out: 'S' },
  mq2: { icon: 'alert', kind: 'gas', label: 'Gas at', ticks: ['clean air', 'smoke'], out: 'AO' },
};

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
        if (LEVELS[p.type]) {
          const l = LEVELS[p.type]!;
          return (
            <Row key={p.id} icon={l.icon} name={name} kind={l.kind} reading={volts(views[p.id], l.out)}>
              <Slider label={`${l.label} ${name}`} value={Math.round(live.value(`position:${p.id}`) * 100)} min={0} max={100} step={1}
                format={(v) => `${v} %`} ticks={l.ticks} onChange={(v) => live.set(`position:${p.id}`, v / 100)} />
            </Row>
          );
        }
        if (p.type === 'speed-sensor') {
          const rpm = live.value(`rpm:${p.id}`);
          return (
            <Row key={p.id} icon="restart" name={name} kind="wheel" reading={`${Math.round((rpm / 60) * 20)} pulses/s`}>
              <Slider label={`Speed of ${name}`} value={rpm} min={0} max={300} step={1} format={(v) => `${v} rpm`} ticks={['still', '300 rpm']}
                onChange={(v) => live.set(`rpm:${p.id}`, v)} />
            </Row>
          );
        }
        if (p.type === 'ldr' || p.type === 'ldr-module') {
          const lux = live.value(`lux:${p.id}`);
          return (
            <Row key={p.id} icon="sun" name={name} kind="light" reading={ohmsText(ldrOhms(lux))}>
              <Slider label={`Light on ${name}`} value={Math.log10(lux)} min={LOG.min} max={LOG.max} step={LOG.step}
                format={(v) => luxText(10 ** v)} ticks={['dark', 'room', 'daylight']}
                onChange={(v) => live.set(`lux:${p.id}`, Number((10 ** v).toPrecision(v < 1 ? 1 : 2)))} />
            </Row>
          );
        }
        if (p.type === 'dht') {
          return (
            <Row key={p.id} icon="therm" name={name} kind={String(p.props?.kind ?? 'DHT11')} reading="">
              <Slider label={`Temperature of ${name}`} value={live.value(`celsius:${p.id}`)} min={-20} max={60} step={1}
                format={(v) => `${v} °C`} onChange={(v) => live.set(`celsius:${p.id}`, v)} />
              <Slider label={`Humidity of ${name}`} value={live.value(`humidity:${p.id}`)} min={0} max={100} step={1}
                format={(v) => `${v} %`} onChange={(v) => live.set(`humidity:${p.id}`, v)} />
            </Row>
          );
        }
        if (p.type === 'hc-sr04') {
          const cm = live.value(`cm:${p.id}`);
          return (
            <Row key={p.id} icon="ruler" name={name} kind="object" reading={`echo ${echoUs(cm)} µs`}>
              <Slider label={`Distance from ${name}`} value={cm} min={2} max={400} step={1}
                format={(v) => `${v.toFixed(1)} cm`} ticks={['2 cm', '400 cm']} onChange={(v) => live.set(`cm:${p.id}`, v)} />
            </Row>
          );
        }
        if (p.type === 'mpu6050') {
          const tx = live.value(`tiltx:${p.id}`);
          const ty = live.value(`tilty:${p.id}`);
          const g = (v: number) => Math.sin((v * Math.PI) / 180).toFixed(2);
          return (
            <Row key={p.id} icon="tilt" name={name} kind="tilt" reading={`x ${g(tx)} g · y ${g(ty)} g`}>
              <Slider label={`Tilt of ${name} about X`} value={tx} min={-90} max={90} step={1} format={(v) => `X ${v}°`} onChange={(v) => live.set(`tiltx:${p.id}`, v)} />
              <Slider label={`Tilt of ${name} about Y`} value={ty} min={-90} max={90} step={1} format={(v) => `Y ${v}°`} onChange={(v) => live.set(`tilty:${p.id}`, v)} />
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
export function PartTip({ id, type, common, views, overLine = false, values = {}, style }: {
  id: string; type: string; common?: string; views: Record<string, PartView>; overLine?: boolean; values?: Record<string, number>; style: CSSProperties;
}) {
  if (type === 'joystick') {
    return (
      <div className="tip part-tip" role="tooltip" style={style}>
        <b>{id.toUpperCase()} · x {(values.x ?? 0.5).toFixed(2)} · y {(values.y ?? 0.5).toFixed(2)}</b>
        <div>Drag the stick; let go and it springs back. Click it to press SW.</div>
      </div>
    );
  }
  if (type === 'rotary-encoder') {
    return (
      <div className="tip part-tip" role="tooltip" style={style}>
        <b>{id.toUpperCase()} · {values.steps ?? 0} steps</b>
        <div>Drag round it to turn it, a step each 15°. Click it to press SW.</div>
      </div>
    );
  }
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
