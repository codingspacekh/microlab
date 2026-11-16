import { useState, type ReactNode } from 'react';
import { echoUs, POWER_SUPPLY, sensorDrive, SENSORS, SENSOR_START } from '@lib/circuit';
import { Icon, Segmented, Slider } from '../../ui';
import { Callout, f, Label, num } from '../fig-kit';
import '../figures.css';

/**
 * Learn's picture of the ultrasonic distance sensor (M8): its two round cans — one that clicks, one that listens —
 * facing a wall or a curtain, the click going out and its echo coming back; under it, the Echo leg's answer, high for
 * as long as the echo took. The times are the simulator's (echoUs: 58 µs a cm, 2–400 cm, 38 ms when nothing answers),
 * Echo's volts its sensorDrive on 5 V.
 */

const S = SENSORS['hc-sr04'];
const SUPPLY = Math.max(...POWER_SUPPLY.choices);
const HIGH = sensorDrive('hc-sr04', {}, { echo: true }, SUPPLY).volts;
/** The slider goes a little past what it can see, to show that too. */
const RANGE = { min: S.minCm, max: 450, start: SENSOR_START.cm };

type Faces = 'wall' | 'curtain';
type Heard = 'echo' | 'far' | 'soft';
const heard = (faces: Faces, cm: number): Heard => (faces === 'curtain' ? 'soft' : cm > S.maxCm ? 'far' : 'echo');
/** 5800 → "5 800". */
const grouped = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const msText = (us: number) => `${num(us / 1000, 1)} ms`;

function sonarSays(h: Heard, cm: number, us: number): ReactNode {
  if (h === 'soft') return <>The curtain is soft: it swallows the click, and no echo comes back. After <b>{msText(us)}</b> the sensor gives up — it looks as if nothing is there.</>;
  if (h === 'far') return <>The wall is {cm} cm away: farther than {S.maxCm} cm, the echo is too faint to hear. After <b>{msText(us)}</b> the sensor gives up.</>;
  return (
    <>
      The click goes {cm} cm to the wall and {cm} cm back: the echo takes <b>{grouped(us)} µs</b> — {msText(us)}. Echo stays high that long:
      {' '}{grouped(us)} ÷ {S.usPerCm} = <b>{cm} cm</b>.
    </>
  );
}

// ------------------------------------------------------------------ the drawing
const CAN = { t: 64, r: 124, y: 110, rad: 24 };
const wallX = (cm: number) => 180 + cm * 1.08;
const T = { x: 40, w: 620, y: 370, h: 40, ms: 40 };
const tx = (us: number) => T.x + (us / 1000 / T.ms) * T.w;

export function SonarInside() {
  const [cm, setCm] = useState<number>(RANGE.start);
  const [faces, setFaces] = useState<Faces>('wall');
  const h = heard(faces, cm);
  const us = h === 'soft' ? S.noneUs : echoUs(cm);
  const wx = wallX(cm);
  const out = [0.3, 0.6, 0.9].map((k) => CAN.t + CAN.rad + (wx - CAN.t - CAN.rad) * k);
  const back = h === 'echo' ? [0.25, 0.55, 0.85].map((k) => (wx - CAN.r) * k) : [];

  const says = `An ultrasonic distance sensor facing ${faces === 'wall' ? 'a wall' : 'a curtain'} ${cm} cm away. `
    + (h === 'echo' ? `The echo comes back after ${grouped(us)} µs, and Echo stays high at ${num(HIGH, 1)} V that long.`
      : `No echo comes back: after ${grouped(us)} µs it gives up.`);
  return (
    <>
      <svg className="scene lfig" style={{ maxWidth: 720 }} viewBox="0 0 700 424" role="img" aria-label={says} data-heard={h} data-us={us}>
        {/* the board and its two cans */}
        <rect x={20} y={60} width={150} height={100} rx={6} fill="#2f6fd6" stroke="#1f4f9e" />
        {[CAN.t, CAN.r].map((x) => (
          <g key={x}>
            <circle cx={x} cy={CAN.y} r={CAN.rad} fill="#c9ccd1" stroke="#8c8f94" strokeWidth={2} />
            <circle cx={x} cy={CAN.y} r={CAN.rad - 7} fill="#3a3d42" />
          </g>
        ))}
        <Label x={CAN.t} y={52} anchor="middle" size={12.5} weight={700}>T</Label>
        <Label x={CAN.r} y={52} anchor="middle" size={12.5} weight={700}>R</Label>
        <Callout from={[CAN.t - 10, CAN.y + 18]} to={[30, 196]} text="Clicks" sub="ultrasound out" />
        <Callout from={[CAN.r + 6, CAN.y + 20]} to={[160, 196]} text="Listens" sub="for the echo" />
        {/* the click going out, and its echo */}
        {out.map((x) => (
          <path key={`o${f(x)}`} data-part="click" d={`M${f(x)},${CAN.y - 46} A60 60 0 0 1 ${f(x)},${CAN.y + 46}`}
            className="lf-lead" strokeWidth={2.4} />
        ))}
        {back.map((d) => (
          <path key={`e${f(d)}`} data-part="echo" d={`M${f(wx - d)},${CAN.y - 40} A60 60 0 0 0 ${f(wx - d)},${CAN.y + 40}`}
            stroke="#e8590c" strokeWidth={2.4} fill="none" strokeDasharray="6 4" />
        ))}
        {/* what it faces */}
        {faces === 'wall'
          ? <rect data-part="wall" x={f(wx)} y={30} width={16} height={180} fill="#a39c8c" stroke="#6b6558" />
          : <path data-part="curtain" d={`M${f(wx)},30 ${Array.from({ length: 8 }, (_, i) => `q${i % 2 ? -10 : 10},11.25 0,22.5`).join(' ')}`} stroke="#7e57c2" strokeWidth={7} fill="none" />}
        <path d={`M${CAN.r + CAN.rad},250 H${f(wx)}`} className="lf-lead" />
        <Label x={(CAN.r + CAN.rad + wx) / 2} y={270} anchor="middle" size={14} weight={700}>{cm} cm</Label>
        {/* Echo's answer, in time */}
        <Label x={T.x} y={T.y - T.h - 12} size={14} weight={700}>The Echo leg</Label>
        <path d={`M${T.x},${T.y} H${T.x + T.w}`} stroke="rgba(127,127,127,.6)" />
        {[0, 10, 20, 30, 40].map((ms) => <Label key={ms} x={tx(ms * 1000)} y={T.y + 18} anchor="middle" size={11} weight={500} tone="muted">{ms} ms</Label>)}
        <path data-part="pulse" data-us={us} d={`M${T.x},${T.y} H${T.x + 12} V${T.y - T.h} H${f(tx(us) + 12)} V${T.y} H${T.x + T.w}`}
          stroke={h === 'echo' ? 'var(--accent)' : 'var(--danger)'} strokeWidth={2.6} fill="none" />
        <Label x={f(tx(us) + 18)} y={T.y - T.h + 14} size={13} weight={800} tone={h === 'echo' ? 'accent' : 'plus'}>
          {h === 'echo' ? `${grouped(us)} µs` : 'no echo: it gives up'}
        </Label>
        <Label x={T.x} y={T.y + 44} size={12.5} weight={500} tone="muted">high ({num(HIGH, 1)} V) while it waits for the echo</Label>
      </svg>
      <div className="ctl">
        <Slider label="How far" value={cm} min={RANGE.min} max={RANGE.max} step={1} format={(v) => `${v} cm`} ticks={[`${S.minCm} cm`, '2 m', '4 m']} onChange={setCm} />
      </div>
      <div className="ctl">
        <Segmented<Faces> label="What it faces" value={faces} onChange={setFaces}
          options={[{ value: 'wall', label: 'A wall' }, { value: 'curtain', label: 'A curtain' }]} />
      </div>
      <div className="says" role="status"><Icon name="info" size={14} /><span>{sonarSays(h, cm, us)}</span></div>
    </>
  );
}
