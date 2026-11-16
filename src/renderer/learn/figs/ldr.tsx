import { LDR_PARTNER_OHMS } from '@lib/learn';
import { useState, type ReactNode } from 'react';
import { BATTERIES, ldrOhms } from '@lib/circuit';
import { Icon, Slider } from '../../ui';
import { Callout, f, Label, num, useDefId } from '../fig-kit';
import '../figures.css';

/**
 * Learn's picture of the light sensor (M8): its face drawn big — the wiggly track, the light falling on it and the
 * charges it knocks loose — and beside it the sensor with its partner resistor on a battery, pulled straight: the
 * volts at the point between the two. The resistance is the simulator's (ldrOhms), the battery its pack of two cells.
 */

/** The resistor after the sensor: the one that suits room light. */
const PARTNER_OHMS = LDR_PARTNER_OHMS;
const VOLTS = BATTERIES['2xAA']!.volts;

/** The slider runs on a log scale, as the app's own light slider does: 10^−1 lux (nearly dark) to 10^4 (sunlight). */
const LOG = { min: -1, max: 4, step: 0.05, start: 2 };
/** The slider's place as light, rounded as the app's light slider rounds it. */
const luxAt = (log: number) => Number((10 ** log).toPrecision(log < 1 ? 1 : 2));

/** Light as said: 0.1 lux, 5 lux, 300 lux, 10 000 lux. */
function luxText(lux: number): string {
  const v = lux < 10 ? Number(lux.toPrecision(1)) : Number(lux.toPrecision(2));
  return `${v >= 1000 ? v.toLocaleString('en-GB').replace(/,/g, ' ') : v} lux`;
}

/** A resistance in two figures: 3 kΩ, 380 kΩ, 120 Ω. */
function ohmsText(ohms: number): string {
  const [div, suffix] = ohms >= 1e6 ? [1e6, 'M'] : ohms >= 1e3 ? [1e3, 'k'] : [1, ''];
  return `${Number((ohms / div).toPrecision(2))} ${suffix}Ω`;
}

/** How bright it is in a word, where that is, and what the track does there. */
function light(lux: number): { word: string; where: string; track: string } {
  if (lux < 1) return { word: 'dark', where: 'in the dark', track: 'holds the current back hard' };
  if (lux < 50) return { word: 'dim', where: 'in dim light', track: 'lets a little current through' };
  if (lux < 1000) return { word: 'bright room', where: 'in a bright room', track: 'lets current through easily' };
  return { word: 'sunlight', where: 'in sunlight', track: 'hardly holds the current back' };
}

/** The sensor's resistance in this light, and the volts at the point between it and its resistor. */
function divider(lux: number) {
  const ohms = ldrOhms(lux);
  const share = PARTNER_OHMS / (ohms + PARTNER_OHMS);
  return { ohms, share, volts: VOLTS * share };
}

// ------------------------------------------------------------------ the face
const FACE = { cx: 130, cy: 190, r: 78 };
/** The track's rows across the face: how far each is from the middle, and how far it reaches each side. */
const TRACK_ROWS = [-48, -24, 0, 24, 48].map((dy) => ({ y: FACE.cy + dy, half: Math.sqrt(56 ** 2 - dy ** 2) }));
/** The track: along a row, down to the next, back along it — from the top left to the bottom right. */
const TRACK = TRACK_ROWS.map(({ y, half }, i) => {
  const [from, to] = i % 2 === 0 ? [FACE.cx - half, FACE.cx + half] : [FACE.cx + half, FACE.cx - half];
  return `${i === 0 ? 'M' : 'L'}${f(from)},${y} L${f(to)},${y}`;
}).join(' ');
/** Where a loose charge can sit: spread along the rows, more on the longer ones. */
const SEATS: [number, number][] = TRACK_ROWS.flatMap(({ y, half }, i) => {
  const n = [3, 5, 8, 5, 3][i]!;
  return Array.from({ length: n }, (_, j): [number, number] => [FACE.cx - half + ((j + 0.5) * 2 * half) / n, y]);
});
/** The order they fill in, so they look scattered; the first is low on the left, where its name points. */
const SEAT_ORDER = SEATS.map((_, i) => (i * 7 + 16) % SEATS.length);
/** The rays fall from above, the middle one first. */
const RAY_ORDER = [3, 2, 4, 1, 5, 0, 6];

function ldrSays(lux: number, ohms: number, volts: number): ReactNode {
  const { word, where, track } = light(lux);
  return (
    <>
      {where[0]!.toUpperCase() + where.slice(1)} ({luxText(lux)}) the track {track}: about <b>{ohmsText(ohms)}</b>.
      {' '}The point between the two reads {word === 'dark' && 'only '}<b>{num(volts, 2)} V</b> of {num(VOLTS, 1)} V.
    </>
  );
}

export function LdrInside() {
  const id = useDefId();
  const [log, setLog] = useState(LOG.start);
  const lux = luxAt(log);
  const { ohms, share, volts } = divider(lux);
  const { where } = light(lux);
  /** 0 at the darkest, 1 at the brightest. */
  const t = (log - LOG.min) / (LOG.max - LOG.min);
  const rays = RAY_ORDER.slice(0, Math.round(t * RAY_ORDER.length));
  const charges = SEAT_ORDER.slice(0, 2 + Math.round(t * (SEATS.length - 2))).map((i) => SEATS[i]!);

  const { cx, cy, r } = FACE;
  const first = TRACK_ROWS[0]!, last = TRACK_ROWS.at(-1)!;
  const rim = (deg: number): [number, number] => [cx + 70 * Math.cos((deg * Math.PI) / 180), cy + 70 * Math.sin((deg * Math.PI) / 180)];
  const [ax, ay] = rim(215), [bx, by] = rim(110);
  const legs = [cx - 24, cx + 24] as const;

  const bar = { x: 470, w: 18, top: 78, bottom: 300 };
  const py = bar.bottom - (bar.bottom - bar.top) * share;
  const v = num(volts, 2);
  const says = `A light sensor's face ${where} (${luxText(lux)}): its track resists about ${ohmsText(ohms)}. `
    + `With a ${ohmsText(PARTNER_OHMS)} resistor after it on a ${num(VOLTS, 1)} V battery, the point between them reads ${v} V.`;
  return (
    <>
      <svg className="scene lfig" style={{ maxWidth: 680 }} viewBox="-160 0 790 360" role="img" aria-label={says}>
        <defs>
          <marker id={`${id}a`} viewBox="0 0 10 10" refX={6} refY={5} markerWidth={5} markerHeight={5} orient="auto">
            <path d="M0,0 L10,5 L0,10 Z" fill="#f2b705" />
          </marker>
        </defs>
        {/* the light falling on the face */}
        <Label x={-150} y={34} size={14} weight={700}>The light: {luxText(lux)}</Label>
        <Label x={-150} y={52} size={12.5} weight={500} tone="muted">{where}</Label>
        {rays.map((i) => {
          const x = cx + (i - 3) * 22;
          return <path key={i} data-part="ray" d={`M${x},${f(96 - 24 - 46 * t)} V96`} stroke="#f2b705" strokeWidth={3} strokeLinecap="round" opacity={f(0.45 + 0.55 * t)} markerEnd={`url(#${id}a)`} />;
        })}
        {/* the face: its two legs, the leads to the track's ends, the track */}
        {legs.map((x) => <path key={x} d={`M${x},${cy + r - 12} V${cy + r + 66}`} stroke="#a5abb2" strokeWidth={4} />)}
        <circle cx={cx} cy={cy} r={r} fill="#efe3c8" stroke="#b9a77f" strokeWidth={2} />
        <path d={`M${f(cx - first.half)},${first.y} L${f(ax)},${f(ay)} A70 70 0 0 0 ${f(bx)},${f(by)} L${legs[0]},${cy + r - 8}`} stroke="#a5abb2" strokeWidth={3} fill="none" strokeLinejoin="round" />
        <path d={`M${f(cx + last.half)},${last.y} L${legs[1]},${cy + r - 8}`} stroke="#a5abb2" strokeWidth={3} fill="none" />
        <path d={TRACK} stroke="#b5462f" strokeWidth={9} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {charges.map(([x, y]) => <circle key={`${f(x)},${y}`} data-part="charge" className="lf-dot" cx={f(x)} cy={y} r={3.4} stroke="#fff" strokeWidth={1} />)}
        <Label x={cx} y={cy + r + 86} anchor="middle" size={12.5} weight={500} tone="muted">two legs, either way round</Label>
        <Callout from={[cx - TRACK_ROWS[1]!.half + 6, TRACK_ROWS[1]!.y]} to={[-10, 118]} text="The track" sub="it feels the light" anchor="end" />
        <Callout from={charges[0]!} to={[-10, 262]} text="Loose charges" sub="they carry the current" anchor="end" />
        {/* the sensor and its resistor on a battery, pulled straight: the bar is the battery's volts, top to bottom */}
        <Label x={bar.x + bar.w} y={34} anchor="end" size={14} weight={700}>With a resistor after it</Label>
        <rect x={bar.x} y={bar.top} width={bar.w} height={bar.bottom - bar.top} rx={9} fill="#b5462f" />
        <rect className="lf-dot" x={bar.x} y={f(py)} width={bar.w} height={f(bar.bottom - py)} rx={Math.min(9, f((bar.bottom - py) / 2))} opacity={0.85} />
        <path data-part="point" data-share={num(share, 3)} d={`M${bar.x + bar.w + 3},${f(py)} l11,-7 v14 Z`} fill="#e3c25a" stroke="#8a6d12" />
        <Label x={bar.x - 14} y={bar.top + 5} anchor="end" size={12.5} weight={500} tone="muted">battery + · {num(VOLTS, 1)} V</Label>
        <Label x={bar.x - 14} y={bar.top + 34} anchor="end" size={14} weight={700}>Light sensor: {ohmsText(ohms)}</Label>
        <Label x={bar.x - 14} y={bar.bottom - 26} anchor="end" size={14} weight={700}>Resistor: {ohmsText(PARTNER_OHMS)}</Label>
        <Label x={bar.x - 14} y={bar.bottom + 3} anchor="end" size={12.5} weight={500} tone="muted">battery − · 0 V</Label>
        <Label x={bar.x + bar.w + 20} y={py + 5} size={15} weight={800} tone="accent">{v} V</Label>
        <Label x={bar.x + bar.w + 20} y={py + 22} size={12.5} weight={500} tone="muted">the point between</Label>
      </svg>
      <div className="ctl lf-wide">
        <Slider
          label="Light" icon="sun" value={log} min={LOG.min} max={LOG.max} step={LOG.step}
          format={(at) => { const now = luxAt(at); return `${luxText(now)} · ${light(now).word}`; }}
          ticks={['dark', 'dim', 'bright room', 'sunlight']} onChange={setLog}
        />
      </div>
      <div className="says" role="status"><Icon name="info" size={14} /><span>{ldrSays(lux, ohms, volts)}</span></div>
    </>
  );
}
