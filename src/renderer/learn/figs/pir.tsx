import { useState, type ReactNode } from 'react';
import { POWER_SUPPLY, sensorDrive, SENSORS } from '@lib/circuit';
import { Icon, Segmented, Slider } from '../../ui';
import { Callout, f, Label, num, RedGlow, useDefId } from '../fig-kit';
import '../figures.css';

/**
 * Learn's picture of the PIR motion sensor (M8): its white dome lifted — a lens of many little windows — and under it
 * the sensor with its two halves side by side; in front, the room split into the zones each half looks at, and a
 * person or a torch's light to place across it. A half sees warmth only when the warm person is in one of its zones;
 * when the two halves see different amounts, something warm is crossing and OUT goes high. OUT's volts and the time
 * the real part holds them are the simulator's (sensorDrive, SENSORS.pir).
 */

// ------------------------------------------------------------------ the simulator's sensor
/** The supply it is drawn on: the first the simulator offers that is enough for it (5 V). */
const SUPPLY = POWER_SUPPLY.choices.find((v) => v >= SENSORS.pir.minVolts) ?? SENSORS.pir.minVolts;
const HOLD_S = SENSORS.pir.holdS;
const outVolts = (motion: boolean) => sensorDrive('pir', {}, { motion }, SUPPLY).volts;
const HIGH = outVolts(true);

// ------------------------------------------------------------------ the room (the picture's own geometry)
type What = 'person' | 'torch';
type Where = 'outside' | 'A' | 'between' | 'B';

/** The slider runs across the room, 0–100. The sensor sees from 10 to 90, through four zones: A, B, A, B. */
const ROOM = { min: 0, max: 100, start: 0 };
const VIEW = { from: 10, to: 90 };
/** Where one zone ends and the next begins; within a step of a seam the person is half in each. */
const SEAMS = [29, 50, 71];
const SEAM_REACH = 1;
/** The zones as drawn, seam to seam. */
const ZONES = [VIEW.from - 0.5, ...SEAMS, VIEW.to + 0.5].slice(0, -1).map((from, i, all) => ({
  half: i % 2 === 0 ? 'A' as const : 'B' as const,
  from,
  to: all[i + 1] ?? VIEW.to + 0.5,
}));

function whereIs(at: number): Where {
  if (at < VIEW.from || at > VIEW.to) return 'outside';
  if (SEAMS.some((seam) => Math.abs(at - seam) <= SEAM_REACH)) return 'between';
  return SEAMS.filter((seam) => at > seam).length % 2 === 0 ? 'A' : 'B';
}

/** How much warmth each half sees, 0–1: only a warm thing counts, and only in that half's zone. */
function seen(what: What, where: Where): { a: number; b: number } {
  if (what !== 'person' || where === 'outside') return { a: 0, b: 0 };
  if (where === 'between') return { a: 0.5, b: 0.5 };
  return { a: where === 'A' ? 1 : 0, b: where === 'B' ? 1 : 0 };
}

const WHERE_TEXT: Record<Where, string> = {
  outside: 'outside the view', A: 'in a zone of half A', between: 'between A and B', B: 'in a zone of half B',
};
const SEES_TEXT = (amount: number) => (amount === 0 ? 'sees nothing' : amount === 1 ? 'sees warmth' : 'sees half the warmth');

function pirSays(what: What, where: Where, volts: number): ReactNode {
  if (what === 'torch') {
    return <>A torch&apos;s light is bright but <b>not warm</b>: neither half sees it. OUT stays at <b>{num(volts, 1)} V</b>.</>;
  }
  if (where === 'outside') {
    return <>The person is outside what the sensor can see. Neither half sees any warmth — both the same: OUT stays at <b>{num(volts, 1)} V</b>.</>;
  }
  if (where === 'between') {
    return (
      <>
        The person is half in front of A and half in front of B. Both halves see the <b>same</b> warmth, so they cancel: the sensor
        reads <b>{num(volts, 1)} V</b> here. The real part keeps OUT at {num(HIGH, 1)} V for {HOLD_S} s after the last movement, so you
        would not see this gap.
      </>
    );
  }
  return (
    <>
      The person is in front of <b>half {where} only</b>. The two halves see different warmth — something warm is moving across:
      {' '}OUT goes to <b>{num(volts, 1)} V</b>, and stays there for {HOLD_S} s after the last movement.
    </>
  );
}

// ------------------------------------------------------------------ the drawing
const COLOUR = { A: '#e8590c', B: '#7e57c2' } as const;
/** The dome's middle, where the zones fan out from; the row the thing moves along; how far the zones are drawn. */
const APEX = { x: 320, y: 300 };
const ROW_Y = 78;
const FAR_Y = 36;
const xAt = (at: number) => 60 + at * 5.2;
/** A point on the line from the dome through the row at `at`, at height `y`. */
const onRay = (at: number, y: number) => APEX.x + ((xAt(at) - APEX.x) * (APEX.y - y)) / (APEX.y - ROW_Y);

const METER = { x: 452, bar: 512, w: 110 };

export function PirInside() {
  const id = useDefId();
  const [at, setAt] = useState(ROOM.start);
  const [what, setWhat] = useState<What>('person');

  const where = whereIs(at);
  const { a, b } = seen(what, where);
  const volts = outVolts(a !== b);
  const high = volts > 0;
  const sees = { A: a, B: b };
  const x = xAt(at);

  const says = `A motion sensor with its dome lifted and the room in front of it: ${what === 'person' ? 'a person' : 'a torch\'s light'}, `
    + `${WHERE_TEXT[where]}. ${b > a ? `Half B ${SEES_TEXT(b)}, half A ${SEES_TEXT(a)}` : `Half A ${SEES_TEXT(a)}, half B ${SEES_TEXT(b)}`}. OUT is at ${num(volts, 1)} V.`;
  return (
    <>
      <svg
        className="scene lfig" style={{ maxWidth: 700 }} viewBox="-20 0 700 392" role="img" aria-label={says}
        data-where={where} data-a={a} data-b={b} data-out={volts}
      >
        <defs><RedGlow id={`${id}g`} /></defs>
        {/* the room, and the zones each half looks at through the dome's little windows */}
        <rect x={30} y={FAR_Y - 8} width={580} height={98} rx={8} fill="rgba(127,127,127,.1)" />
        <Label x={36} y={FAR_Y - 14} size={12.5} weight={500} tone="muted">the room, seen from above</Label>
        {ZONES.map((zone) => (
          <g key={zone.from} data-zone={zone.half} data-lit={sees[zone.half] > 0}>
            <path
              d={`M${APEX.x},${APEX.y} L${f(onRay(zone.from, FAR_Y))},${FAR_Y} L${f(onRay(zone.to, FAR_Y))},${FAR_Y} Z`}
              fill={COLOUR[zone.half]} opacity={sees[zone.half] > 0 ? 0.42 : 0.13} stroke={COLOUR[zone.half]} strokeWidth={1}
            />
            <Label x={onRay((zone.from + zone.to) / 2, 150)} y={155} anchor="middle" size={14} weight={800}>{zone.half}</Label>
          </g>
        ))}
        {/* what passes: a warm person, or a torch's light */}
        <g data-part="thing" data-what={what} transform={`translate(${f(x)},${ROW_Y})`}>
          {what === 'person' ? (
            <>
              <circle r={36} fill={`url(#${id}g)`} />
              <ellipse rx={21} ry={10} fill="#c96f4a" stroke="#8f4527" />
              <circle r={9.5} fill="#f0b68f" stroke="#b97a54" />
            </>
          ) : (
            <>
              <path d="M-7,6 L-24,34 H24 L7,6 Z" fill="#f2b705" opacity={0.4} />
              <rect x={-6} y={-22} width={12} height={22} rx={2} fill="#3a3d42" stroke="#15171a" />
              <path d="M-9,0 H9 L7,8 H-7 Z" fill="#8c8f94" stroke="#5b626b" />
            </>
          )}
        </g>
        <Label x={x} y={ROW_Y - 30} anchor="middle" size={12.5} weight={700}>{what === 'person' ? 'a person: warm' : 'a torch: light, not warm'}</Label>
        {/* the dome, lifted off: a lens of many little windows */}
        <path className="lf-lead" strokeDasharray="3 4" d={`M${APEX.x - 48},${APEX.y} V346 M${APEX.x + 48},${APEX.y} V346`} />
        <path d={`M${APEX.x - 48},${APEX.y} A48 48 0 0 1 ${APEX.x + 48},${APEX.y} Z`} fill="#f4f4f1" stroke="#d3d3cc" strokeWidth={1.5} />
        {[34, 20].map((r) => <path key={r} d={`M${APEX.x - r},${APEX.y} A${r} ${r} 0 0 1 ${APEX.x + r},${APEX.y}`} fill="none" stroke="#d3d3cc" strokeWidth={1.2} />)}
        {[20, 40, 60, 80, 100, 120, 140, 160].map((deg) => {
          const c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180);
          return <path key={deg} d={`M${f(APEX.x + 20 * c)},${f(APEX.y - 20 * s)} L${f(APEX.x + 48 * c)},${f(APEX.y - 48 * s)}`} stroke="#d3d3cc" strokeWidth={1.2} />;
        })}
        {/* under it: the board, and the sensor with its two halves side by side */}
        <rect x={APEX.x - 74} y={350} width={148} height={18} rx={3} fill="#2f7d3f" stroke="#1f5a2b" />
        <rect x={APEX.x - 28} y={322} width={56} height={28} rx={4} fill="#a5abb2" stroke="#6b7280" />
        <rect x={APEX.x - 20} y={327} width={40} height={16} rx={2} fill="#1c1e21" />
        {(['A', 'B'] as const).map((half, i) => (
          <rect key={half} data-half={half} x={APEX.x - 17 + i * 18} y={330} width={16} height={10} rx={1} fill={COLOUR[half]} opacity={sees[half] > 0 ? 1 : 0.4} />
        ))}
        <Label x={APEX.x - 9} y={384} anchor="middle" size={12.5} weight={800}>A</Label>
        <Label x={APEX.x + 9} y={384} anchor="middle" size={12.5} weight={800}>B</Label>
        <Callout from={[APEX.x - 36, APEX.y - 24]} to={[196, 244]} text="The dome" sub="a lens of many little windows" anchor="end" />
        <Callout from={[APEX.x - 22, 335]} to={[196, 312]} text="The sensor" sub="two halves, side by side" anchor="end" />
        {/* what each half sees, and OUT */}
        <Label x={METER.x} y={234} size={14} weight={700}>What each half sees</Label>
        {(['A', 'B'] as const).map((half, i) => {
          const y = 258 + i * 26;
          return (
            <g key={half}>
              <Label x={METER.x} y={y + 5} size={12.5} weight={600}>Half {half}</Label>
              <rect x={METER.bar} y={y - 6} width={METER.w} height={12} rx={6} fill="rgba(127,127,127,.28)" />
              <rect
                data-part={`bar-${half.toLowerCase()}`} data-fill={sees[half]}
                x={METER.bar} y={y - 6} width={f(METER.w * sees[half])} height={12} rx={6} fill={COLOUR[half]}
              />
            </g>
          );
        })}
        <Label x={METER.x} y={326} size={14} weight={700}>OUT</Label>
        <rect className={high ? 'lf-now' : undefined} x={METER.bar} y={308} width={74} height={26} rx={6} fill="rgba(127,127,127,.16)" />
        <Label x={METER.bar + 37} y={327} anchor="middle" size={16} weight={800} tone={high ? 'accent' : 'ink'}>{num(volts, 1)} V</Label>
        <Label x={METER.x} y={352} size={12.5} weight={500} tone="muted">{high ? `kept for ${HOLD_S} s after the last movement` : a === b && a > 0 ? 'the two halves cancel' : 'nothing warm is crossing'}</Label>
      </svg>
      <div className="ctl lf-long">
        <Slider
          label="Where it is" value={at} min={ROOM.min} max={ROOM.max} step={1}
          format={(v) => WHERE_TEXT[whereIs(v)]} ticks={['left', 'in front', 'right']} onChange={setAt}
        />
      </div>
      <div className="ctl">
        <Segmented<What>
          label="What passes" value={what} onChange={setWhat}
          options={[{ value: 'person', label: 'A person (warm)' }, { value: 'torch', label: 'A torch\'s light' }]}
        />
      </div>
      <div className="says" role="status"><Icon name="info" size={14} /><span>{pirSays(what, where, volts)}</span></div>
    </>
  );
}
