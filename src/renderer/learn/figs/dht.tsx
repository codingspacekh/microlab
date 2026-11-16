import { useState, type ReactNode } from 'react';
import { dhtBytes, SENSORS, SENSOR_START } from '@lib/circuit';
import { Icon, Segmented, Slider } from '../../ui';
import { Callout, f, Label, num } from '../fig-kit';
import '../figures.css';

/**
 * Learn's picture of the DHT11 / DHT22 (M8): its case opened — the dampness sensor, the warmth sensor and the chip —
 * and the message the chip sends down DATA: forty pulses, short for a 0 and long for a 1, in five numbers, the last
 * one to check the others by. The bytes are the simulator's (dhtBytes).
 */

type Kind = 'DHT11' | 'DHT22';
const K = SENSORS.dht;
/** The DHT11 gives whole numbers; the DHT22 to a tenth, so its sliders go in halves. */
const STEP: Record<Kind, number> = { DHT11: 1, DHT22: 0.5 };
const clampTo = (lo: number, hi: number, v: number) => Math.min(hi, Math.max(lo, v));
const degText = (c: number) => `${c < 0 ? '−' : ''}${num(Math.abs(c), 1)} °C`;

/** What the five numbers mean: the DHT11 sends each in one byte; the DHT22 its dampness and warmth in two, times ten. */
function groups(kind: Kind, bytes: number[], c: number): { from: number; to: number; text: string }[] {
  if (kind === 'DHT11') return ['dampness', 'tenths: 0', 'warmth', 'tenths: 0', 'check'].map((text, i) => ({ from: i, to: i + 1, text }));
  const two = (i: number) => (bytes[i]! & (i === 2 ? 0x7f : 0xff)) * 256 + bytes[i + 1]!;
  return [
    { from: 0, to: 2, text: `dampness × 10 = ${two(0)}` },
    { from: 2, to: 4, text: `warmth × 10 = ${two(2)}${c < 0 ? ', below 0' : ''}` },
    { from: 4, to: 5, text: 'check' },
  ];
}

function dhtSays(c: number, h: number, bytes: number[]): ReactNode {
  const parts = bytes.slice(0, 4);
  const total = parts.reduce((x, y) => x + y, 0);
  return (
    <>
      The chip measures <b>{degText(c)}</b> and <b>{num(h, 1)} %</b> dampness, and sends them as forty pulses: short for 0, long for 1.
      {' '}The last number checks the others: {parts.join(' + ')} = {total > 255 ? total : <b>{total}</b>}
      {total > 255 ? <>, and only its last 8 bits are sent: <b>{bytes[4]}</b>.</> : '.'}
    </>
  );
}

// ------------------------------------------------------------------ the drawing
const BITS = { x: 30, y: 400, w: 640, high: 26 };
const cell = BITS.w / 40;

export function DhtInside() {
  const [kind, setKind] = useState<Kind>('DHT11');
  const [c, setC] = useState<number>(SENSOR_START.celsius);
  const [h, setH] = useState<number>(SENSOR_START.humidity);
  const k = K[kind];
  const bytes = dhtBytes(kind, c, h);
  const bits = bytes.flatMap((b) => Array.from({ length: 8 }, (_, i) => (b >> (7 - i)) & 1));

  const choose = (next: Kind) => {
    setKind(next);
    const step = STEP[next];
    setC((now) => Math.round(clampTo(K[next].min, K[next].max, now) / step) * step);
    setH((now) => Math.round(clampTo(K[next].hMin, K[next].hMax, now) / step) * step);
  };

  const shown = kind === 'DHT11' ? { c: Math.round(c), h: Math.round(h) } : { c, h };
  const says = `A ${kind} opened up: a dampness sensor, a warmth sensor and a chip. It measures ${degText(shown.c)} and ${num(shown.h, 1)} % `
    + `and sends five numbers down DATA — ${bytes.join(', ')} — as forty short and long pulses.`;
  return (
    <>
      <svg className="scene lfig" style={{ maxWidth: 720 }} viewBox="0 0 700 460" role="img" aria-label={says} data-kind={kind} data-bytes={bytes.join(' ')}>
        {/* the case, opened: its grille lifted off */}
        <rect x={40} y={30} width={150} height={190} rx={8} fill={kind === 'DHT11' ? '#2f6fd6' : '#f4f5f7'} stroke={kind === 'DHT11' ? '#1f4f9e' : '#c9ccd1'} strokeWidth={2} />
        <rect x={58} y={48} width={70} height={90} rx={4} fill="#e9dfc5" stroke="#b9a77f" />
        {[60, 72, 84, 96, 108, 120].map((y) => <path key={y} d={`M64,${y} H122`} stroke="#b5462f" strokeWidth={2} />)}
        <rect x={140} y={60} width={36} height={14} rx={7} fill="#3a3d42" />
        <rect x={74} y={156} width={50} height={40} rx={3} fill="#1c1e21" stroke="#5b626b" />
        {(['VCC', 'DATA', 'GND'] as const).map((leg, i) => (
          <g key={leg}>
            <path d={`M${80 + i * 35},220 V262`} stroke="#a5abb2" strokeWidth={3.5} />
            <Label x={80 + i * 35} y={280} anchor="middle" size={12.5} weight={700} tone={leg === 'DATA' ? 'accent' : 'ink'}>{leg}</Label>
          </g>
        ))}
        <Callout from={[176, 67]} to={[240, 60]} text="Feels warmth" sub="a resistance that changes with heat" />
        <Callout from={[124, 100]} to={[240, 118]} text="Feels dampness" sub="a strip that soaks up water" />
        <Callout from={[124, 176]} to={[240, 180]} text="The chip" sub="measures, then sends numbers" />
        {/* the five numbers */}
        {bytes.map((b, i) => (
          <g key={i} data-part="byte" data-value={b}>
            <rect x={BITS.x + i * 8 * cell + 2} y={BITS.y - 98} width={8 * cell - 4} height={40} rx={6} className={i === 4 ? 'lf-now' : undefined} fill="rgba(127,127,127,.14)" />
            <Label x={BITS.x + (i + 0.5) * 8 * cell} y={BITS.y - 72} anchor="middle" size={17} weight={800} tone={i === 4 ? 'accent' : 'ink'}>{b}</Label>
          </g>
        ))}
        {groups(kind, bytes, shown.c).map((g) => (
          <Label key={g.from} x={BITS.x + ((g.from + g.to) / 2) * 8 * cell} y={BITS.y - 42} anchor="middle" size={11.5} weight={500} tone="muted">{g.text}</Label>
        ))}
        {/* forty pulses down DATA: a short one is a 0, a long one a 1 */}
        <path
          data-part="pulses"
          d={`M${BITS.x},${BITS.y} ${bits.map((bit, i) => {
            const x0 = BITS.x + i * cell;
            return `H${f(x0 + 4)} V${BITS.y - BITS.high} H${f(x0 + 4 + (bit ? cell - 6 : 3))} V${BITS.y}`;
          }).join(' ')} H${BITS.x + BITS.w}`}
          className="lf-lead" strokeWidth={1.8}
        />
        {bits.map((bit, i) => <Label key={i} x={BITS.x + (i + 0.5) * cell} y={BITS.y + 16} anchor="middle" size={9.5} weight={600} tone="muted">{String(bit)}</Label>)}
        <Label x={BITS.x} y={BITS.y + 44} size={12.5} weight={500} tone="muted">DATA, in time: a short pulse is a 0, a long one a 1</Label>
      </svg>
      <div className="ctl">
        <Segmented<Kind> label="Kind" value={kind} onChange={choose} options={[{ value: 'DHT11', label: 'DHT11 (blue)' }, { value: 'DHT22', label: 'DHT22 (white)' }]} />
      </div>
      <div className="ctl">
        <Slider label="Warmth" icon="therm" value={c} min={k.min} max={k.max} step={STEP[kind]} format={degText} ticks={[degText(k.min), degText(k.max)]} onChange={setC} />
      </div>
      <div className="ctl">
        <Slider label="Dampness" icon="drop" value={h} min={k.hMin} max={k.hMax} step={STEP[kind]} format={(v) => `${num(v, 1)} %`} ticks={[`${k.hMin} %`, `${k.hMax} %`]} onChange={setH} />
      </div>
      <div className="says" role="status"><Icon name="info" size={14} /><span>{dhtSays(shown.c, shown.h, bytes)}</span></div>
    </>
  );
}
