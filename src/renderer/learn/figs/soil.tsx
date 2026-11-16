import { useState, type ReactNode } from 'react';
import { POWER_SUPPLY, sensorDrive, SENSORS, SENSOR_START } from '@lib/circuit';
import { Icon, Slider } from '../../ui';
import { Callout, f, Label, num } from '../fig-kit';
import '../figures.css';

/**
 * Learn's picture of the soil moisture sensor (M8) — the capacitive kind the simulator has: its blade pushed into a
 * pot, the two metal plates sealed inside it, and the soil slid from dry to soaked. The wetter the soil, the more
 * charge the plates hold and the lower OUT: the volts are the simulator's (sensorDrive), 2.4 V dry to 0.9 V in water.
 */

/** The supply it is drawn on: the lowest the simulator offers (3.3 V), which is enough for it. */
const SUPPLY = Math.min(...POWER_SUPPLY.choices);
const S = SENSORS['soil-moisture'];
const outVolts = (percent: number) => sensorDrive('soil-moisture', {}, { position: percent / 100 }, SUPPLY).volts;

type Wet = 'dry' | 'damp' | 'wet' | 'soaked';
const wetness = (percent: number): Wet => (percent < 15 ? 'dry' : percent < 70 ? 'damp' : percent < 100 ? 'wet' : 'soaked');
const WORD: Record<Wet, string> = { dry: 'dry', damp: 'damp', wet: 'wet', soaked: 'in water' };
const HOLDS: Record<Wet, string> = { dry: 'little charge', damp: 'more charge', wet: 'a lot of charge', soaked: 'a lot of charge' };

function soilSays(wet: Wet, v: string): ReactNode {
  switch (wet) {
    case 'dry': return <>Dry soil: the plates hold little charge, and OUT is high — <b>{v} V</b>.</>;
    case 'damp': return <>Damp soil: the water lets the plates hold more charge, and OUT comes down to <b>{v} V</b>. Wetter means lower volts.</>;
    case 'wet': return <>Wet soil: the plates hold a lot of charge, and OUT is down to <b>{v} V</b>. Wetter means lower volts.</>;
    case 'soaked': return <>Soaked: the plates hold a lot of charge, and OUT is low — <b>{v} V</b>. Wetter means LOWER volts.</>;
  }
}

// ------------------------------------------------------------------ the drawing
/** Dry soil's colour and soaked soil's, and the colour between. */
const DRY = [0x8a, 0x5b, 0x34] as const;
const SOAKED = [0x4a, 0x2f, 0x1c] as const;
const soilColour = (m: number) => `#${DRY.map((d, i) => Math.round(d + (SOAKED[i]! - d) * m).toString(16).padStart(2, '0')).join('')}`;

const BLADE = { x: 212, w: 36, top: 64, line: 186, shoulder: 300, tip: 330 };
const PLATES = [BLADE.x + 5, BLADE.x + 22];
/** Where a drop of water can be: either side of the blade, scattered. */
const DROPS: [number, number][] = [
  [160, 236], [292, 262], [186, 300], [312, 226], [150, 282], [276, 318], [178, 252], [304, 296],
  [196, 222], [268, 232], [158, 322], [320, 266], [188, 276], [284, 288], [170, 304],
];
/** Where a charge sits on the plates: left, right, left … from the top down. */
const SEATS: [number, number][] = Array.from({ length: 12 }, (_, i) => [PLATES[i % 2]! + 4.5, 218 + i * 6.6]);

const BAR = { x: 520, w: 18, top: 150, bottom: 340 };
const HELD = { x: 440, y: 78, w: 210 };

export function SoilInside() {
  const [percent, setPercent] = useState(Math.round(SENSOR_START.moisture * 100));
  const m = percent / 100;
  const wet = wetness(percent);
  const volts = outVolts(percent);
  const v = num(volts, 2);
  const share = volts / SUPPLY;
  const held = 0.2 + 0.8 * m;
  const drops = DROPS.slice(0, Math.round(m * DROPS.length));
  const charges = SEATS.slice(0, 2 + Math.round(m * (SEATS.length - 2)));
  const yAt = (volt: number) => BAR.bottom - ((BAR.bottom - BAR.top) * volt) / SUPPLY;
  const py = yAt(volts);

  const says = `A soil moisture sensor pushed into a pot of ${wet} soil (${percent} % wet). The two metal plates sealed inside its blade `
    + `never touch the soil; they hold ${HOLDS[wet]}. OUT gives ${v} V: between ${num(S.dry, 1)} V in dry soil and ${num(S.wet, 1)} V in water.`;
  return (
    <>
      <svg className="scene lfig" style={{ maxWidth: 720 }} viewBox="-90 0 780 384" role="img" aria-label={says}>
        {/* the three wires */}
        {([['AOUT', 186, '#e3c25a'], ['VCC', 230, '#de3b3b'], ['GND', 274, '#3a3d42']] as const).map(([name, x, colour], i) => (
          <g key={name}>
            <path d={`M${BLADE.x + 8 + i * 10},${BLADE.top + 4} V52 L${x},40 V30`} stroke={colour} strokeWidth={3} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            <Label x={x} y={22} anchor="middle" size={12.5} weight={700}>{name}</Label>
          </g>
        ))}
        {/* the pot and its soil */}
        <path d="M104,192 H356 L334,356 H126 Z" fill="#c9744a" stroke="#9b5333" strokeWidth={1.5} />
        <path data-part="soil" d="M115,202 H345 L326,346 H134 Z" fill={soilColour(m)} />
        {drops.map(([x, y]) => (
          <path key={`${x},${y}`} data-part="drop" d={`M${x},${y - 7} C${x + 6},${y} ${x + 5},${y + 5} ${x},${y + 5} C${x - 5},${y + 5} ${x - 6},${y} ${x},${y - 7} Z`} fill="#58b0ea" stroke="#2f7fc0" strokeWidth={0.8} />
        ))}
        {/* the blade: its chip above the line, its two plates sealed inside below it */}
        <path d={`M${BLADE.x},${BLADE.top} H${BLADE.x + BLADE.w} V${BLADE.shoulder} L${BLADE.x + BLADE.w / 2},${BLADE.tip} L${BLADE.x},${BLADE.shoulder} Z`} fill="#23262b" stroke="#0e0f11" strokeWidth={1.5} />
        <rect x={BLADE.x + 8} y={104} width={20} height={26} rx={2} fill="#0b0c0d" stroke="#5b626b" />
        {[108, 116, 124].map((y) => <path key={y} d={`M${BLADE.x + 4},${y} h4 M${BLADE.x + 28},${y} h4`} stroke="#a5abb2" strokeWidth={1.6} />)}
        <rect x={BLADE.x + 10} y={142} width={7} height={12} rx={1} fill="#c9a227" />
        <rect x={BLADE.x + 21} y={146} width={7} height={5} rx={1} fill="#8c8f94" />
        <path d={`M${BLADE.x},${BLADE.line} H${BLADE.x + BLADE.w}`} stroke="#f4f5f7" strokeWidth={2} />
        {PLATES.map((x) => <rect key={x} x={x} y={208} width={9} height={86} rx={2} fill="#c9a227" opacity={0.55} stroke="#e3c25a" strokeDasharray="3 2" />)}
        {charges.map(([x, y]) => <circle key={`${x},${f(y)}`} data-part="charge" className="lf-dot" cx={x} cy={f(y)} r={2.8} stroke="#fff" strokeWidth={0.8} />)}
        <Callout from={[BLADE.x + 10, 117]} to={[90, 96]} text="The chip" sub="turns the charge into volts" anchor="end" />
        <Callout from={[PLATES[0]! + 2, 262]} to={[90, 250]} text="Two metal plates" sub="sealed inside: nothing rusts" anchor="end" />
        <Callout from={[BLADE.x + BLADE.w, BLADE.line]} to={[282, 150]} text="The line" sub="soil only up to here" />
        {/* how much charge the plates hold */}
        <Label x={HELD.x} y={HELD.y - 16} size={14} weight={700}>Charge held</Label>
        <rect x={HELD.x} y={HELD.y - 6} width={HELD.w} height={12} rx={6} fill="rgba(127,127,127,.28)" />
        <rect data-part="held" data-share={num(held, 3)} className="lf-dot" x={HELD.x} y={HELD.y - 6} width={f(HELD.w * held)} height={12} rx={6} />
        <Label x={HELD.x} y={HELD.y + 24} size={12.5} weight={500} tone="muted">{HOLDS[wet]}</Label>
        {/* OUT's volts, between the supply and 0 V */}
        <Label x={BAR.x + BAR.w / 2} y={BAR.top - 14} anchor="middle" size={14} weight={700}>OUT</Label>
        <rect x={BAR.x} y={BAR.top} width={BAR.w} height={BAR.bottom - BAR.top} rx={9} fill="rgba(127,127,127,.28)" />
        <rect className="lf-dot" x={BAR.x} y={f(py)} width={BAR.w} height={f(BAR.bottom - py)} rx={9} opacity={0.85} />
        <Label x={BAR.x - 12} y={BAR.top + 5} anchor="end" size={12.5} weight={500} tone="muted">{num(SUPPLY, 1)} V</Label>
        <Label x={BAR.x - 12} y={BAR.bottom + 3} anchor="end" size={12.5} weight={500} tone="muted">0 V</Label>
        {([[S.dry, 'dry soil'], [S.wet, 'in water']] as const).map(([at, name]) => (
          <g key={name}>
            <path d={`M${BAR.x - 8},${f(yAt(at))} H${BAR.x}`} className="lf-lead" />
            <Label x={BAR.x - 12} y={yAt(at) + 4} anchor="end" size={12.5} weight={600}>{name}: {num(at, 1)} V</Label>
          </g>
        ))}
        <path data-part="out" data-share={num(share, 4)} d={`M${BAR.x + BAR.w + 3},${f(py)} l11,-7 v14 Z`} fill="#e3c25a" stroke="#8a6d12" />
        <Label x={BAR.x + BAR.w + 20} y={py + 5} size={15} weight={800} tone="accent">{v} V</Label>
        <Label x={BAR.x + BAR.w + 20} y={py + 22} size={12.5} weight={500} tone="muted">its answer</Label>
      </svg>
      <div className="ctl lf-steps">
        <Slider
          label="How wet the soil is" value={percent} min={0} max={100} step={1}
          format={(p) => `${p} % · ${WORD[wetness(p)]}`} ticks={['dry', 'damp', 'in water']} onChange={setPercent}
        />
      </div>
      <div className="says" role="status"><Icon name="info" size={14} /><span>{soilSays(wet, v)}</span></div>
    </>
  );
}
