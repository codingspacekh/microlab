import { useState, type ReactNode } from 'react';
import { POWER_SUPPLY, sensorDrive, SENSORS, SENSOR_START } from '@lib/circuit';
import { Icon, Segmented, Slider } from '../../ui';
import { f, Label, num } from '../fig-kit';
import '../figures.css';

/**
 * Learn's picture of the temperature sensor (M8): the little black chip with its three legs, a thermometer beside it,
 * and the graph of its volts — a straight line, 10 thousandths of a volt for each degree, the TMP36's starting half a
 * volt up. The volts are the simulator's (sensorDrive), on 5 V so that both kinds work.
 */

type Kind = 'TMP36' | 'LM35';
/** The supply it is drawn on: the highest the simulator offers (5 V), enough for the LM35 too. */
const SUPPLY = Math.max(...POWER_SUPPLY.choices);
const T = SENSORS['temp-sensor'];
const voltsAt = (kind: Kind, celsius: number) => sensorDrive('temp-sensor', { kind }, { celsius }, SUPPLY).volts;
/** −10 °C with a real minus. */
const deg = (c: number) => `${c < 0 ? `−${-c}` : c} °C`;
const clamp = (kind: Kind, c: number) => Math.min(T[kind].max, Math.max(T[kind].min, c));

function tempSays(kind: Kind, c: number, v: string): ReactNode {
  const { min, max } = T[kind];
  return (
    <>
      At {deg(c)} the {kind} gives <b>{v} V</b>:{' '}
      {kind === 'TMP36' ? 'half a volt to start with, and 10 thousandths of a volt for each degree.' : '10 thousandths of a volt for each degree, starting from 0 V at 0 °C.'}
      {kind === 'TMP36' && c < 0 && ' Below zero it still gives more than 0 V.'}
      {c === min && ' This is as cold as it goes: it cannot measure lower.'}
      {c === max && ' This is as hot as it goes: it cannot measure higher.'}
    </>
  );
}

// ------------------------------------------------------------------ the graph: −40 to 150 °C across, 0 to 2 V up
const G = { x: 330, y: 50, w: 330, h: 250, c0: -40, c1: 150, v1: 2 };
const gx = (c: number) => G.x + ((c - G.c0) / (G.c1 - G.c0)) * G.w;
const gy = (v: number) => G.y + G.h - (v / G.v1) * G.h;
/** The thermometer's tube. */
const TUBE = { x: 214, top: 70, bottom: 286, w: 14 };

export function TempInside() {
  const [kind, setKind] = useState<Kind>('TMP36');
  const [c, setC] = useState<number>(SENSOR_START.celsius);
  const { min, max, offset } = T[kind];
  const v = voltsAt(kind, c).toFixed(2);
  const share = (c - min) / (max - min);
  const level = TUBE.bottom - (TUBE.bottom - TUBE.top) * share;
  const dot = { x: gx(c), y: gy(Number(v)) };
  const sum = kind === 'TMP36' ? `(${v} V − ${num(offset, 1)} V) × 100 = ${deg(c)}` : `${v} V × 100 = ${deg(c)}`;

  const choose = (next: Kind) => { setKind(next); setC((now) => clamp(next, now)); };

  const says = `A ${kind} temperature sensor at ${deg(c)}: its Vout leg gives ${v} V. On the graph the line climbs 10 thousandths `
    + `of a volt for each degree, from ${voltsAt(kind, min).toFixed(2)} V at ${deg(min)} to ${voltsAt(kind, max).toFixed(2)} V at ${deg(max)}.`;
  return (
    <>
      <svg className="scene lfig" style={{ maxWidth: 720 }} viewBox="-10 0 700 380" role="img" aria-label={says} data-kind={kind} data-volts={v}>
        {/* the chip: a flat face, a round back, three legs */}
        <path d="M28,96 H136 V150 A54 22 0 0 1 28,150 Z" fill="#23262b" stroke="#0e0f11" strokeWidth={1.5} />
        <Label x={82} y={128} anchor="middle" size={13} weight={800} tone="muted">{kind}</Label>
        {(['+Vs', 'Vout', 'GND'] as const).map((leg, i) => {
          const x = 46 + i * 36;
          return (
            <g key={leg}>
              <path d={`M${x},168 V276`} stroke="#a5abb2" strokeWidth={4} />
              <Label x={x} y={296} anchor="middle" size={12.5} weight={700} tone={leg === 'Vout' ? 'accent' : 'ink'}>{leg}</Label>
            </g>
          );
        })}
        <Label x={82} y={318} anchor="middle" size={12.5} weight={500} tone="muted">the flat face towards you</Label>
        <Label x={82} y={350} anchor="middle" size={16} weight={800} tone="accent">{v} V</Label>
        {/* the thermometer */}
        <rect x={TUBE.x} y={TUBE.top - 8} width={TUBE.w} height={TUBE.bottom - TUBE.top + 16} rx={7} fill="rgba(127,127,127,.18)" stroke="rgba(127,127,127,.5)" />
        <rect data-part="mercury" data-share={num(share, 3)} x={TUBE.x + 3} y={f(level)} width={TUBE.w - 6} height={f(TUBE.bottom + 8 - level)} rx={4} fill="#d94545" />
        <circle cx={TUBE.x + TUBE.w / 2} cy={TUBE.bottom + 18} r={14} fill="#d94545" stroke="rgba(127,127,127,.5)" />
        <Label x={TUBE.x + TUBE.w / 2} y={TUBE.bottom + 52} anchor="middle" size={14} weight={700}>{deg(c)}</Label>
        {/* the graph */}
        <path d={`M${G.x},${G.y} V${G.y + G.h} H${G.x + G.w}`} stroke="rgba(127,127,127,.7)" fill="none" strokeWidth={1.2} />
        {[0, 0.5, 1, 1.5, 2].map((at) => (
          <g key={at}>
            <path d={`M${G.x - 4},${f(gy(at))} H${G.x + G.w}`} stroke="rgba(127,127,127,.18)" />
            <Label x={G.x - 8} y={gy(at) + 4} anchor="end" size={11} weight={500} tone="muted">{at} V</Label>
          </g>
        ))}
        {[-40, 0, 50, 100, 150].map((at) => <Label key={at} x={gx(at)} y={G.y + G.h + 18} anchor="middle" size={11} weight={500} tone="muted">{at}</Label>)}
        <Label x={G.x + G.w} y={G.y + G.h + 36} anchor="end" size={12.5} weight={600} tone="muted">degrees</Label>
        <path
          data-part="line" stroke="#d94545" strokeWidth={3} strokeLinecap="round"
          d={`M${f(gx(min))},${f(gy(voltsAt(kind, min)))} L${f(gx(max))},${f(gy(voltsAt(kind, max)))}`}
        />
        {kind === 'TMP36' && (
          <>
            <circle cx={f(gx(0))} cy={f(gy(offset))} r={3.5} fill="#d94545" />
            <Label x={gx(0) - 8} y={gy(offset) - 12} anchor="end" size={12.5} weight={600}>starts 0.5 V up</Label>
          </>
        )}
        <path data-part="drop-lines" className="lf-lead" strokeDasharray="3 3" d={`M${f(dot.x)},${G.y + G.h} V${f(dot.y)} H${G.x}`} />
        <circle data-part="dot" className="lf-dot" cx={f(dot.x)} cy={f(dot.y)} r={6} stroke="#fff" strokeWidth={1.5} />
        <Label x={G.x + 12} y={G.y + 6} size={14} weight={700}>{sum}</Label>
      </svg>
      <div className="ctl">
        <Segmented<Kind> label="Kind" value={kind} onChange={choose} options={[{ value: 'TMP36', label: 'TMP36' }, { value: 'LM35', label: 'LM35' }]} />
      </div>
      <div className="ctl">
        <Slider label="Temperature" icon="therm" value={c} min={min} max={max} step={1} format={deg} ticks={[deg(min), deg(max)]} onChange={setC} />
      </div>
      <div className="says" role="status"><Icon name="info" size={14} /><span>{tempSays(kind, c, v)}</span></div>
    </>
  );
}
