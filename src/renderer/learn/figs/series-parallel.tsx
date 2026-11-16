import { useState, type ReactNode } from 'react';
import { BATTERIES } from '@lib/circuit';
import { Icon, Segmented, Switch } from '../../ui';
import { f, Label, num, useDefId } from '../fig-kit';
import '../figures.css';

/**
 * Learn's picture of series and parallel (M8, a big idea): a battery and two lamps, joined one after the other or
 * side by side; either lamp can be taken out of its holder. In series they share the push and one gap stops both; in
 * parallel each has the whole push and its own path. The battery's volts are the simulator's (src/lib/circuit); the
 * rest is Ohm's law.
 */

// ------------------------------------------------------------------ the numbers
/** The battery: a pack of four cells (its own small resistance is left out: it changes nothing a lamp shows). */
const VOLTS = BATTERIES['4xAA']!.volts;
/** A lamp is a plain resistance here, the same whatever goes through it: a round value, so that the sums are easy
 *  to follow (6 V across 100 Ω is 60 mA). The simulator has no lamp of its own to take it from. */
export const LAMP_OHMS = 100;
/** One lamp alone on the battery: its current, and its power — what "as bright as it gets" is measured against. */
const ALONE_AMPS = VOLTS / LAMP_OHMS;
const ALONE_WATTS = VOLTS * ALONE_AMPS;

type Join = 'series' | 'parallel';
type LampState = 'out' | 'dark' | 'dim' | 'bright';

interface Lamp {
  volts: number;
  amps: number;
  /** Its power beside one lamp alone on the battery: 0–1. */
  bright: number;
  state: LampState;
}

interface Solved {
  lamps: [Lamp, Lamp];
  /** What the battery gives. */
  amps: number;
}

function lamp(isIn: boolean, volts: number): Lamp {
  const amps = volts / LAMP_OHMS;
  const bright = (volts * amps) / ALONE_WATTS;
  return { volts, amps, bright, state: !isIn ? 'out' : bright <= 0 ? 'dark' : bright < 0.99 ? 'dim' : 'bright' };
}

/** Ohm's law. In series: one loop, the resistances add up, and a lamp out breaks it. In parallel: each lamp that is
 *  in has the battery's volts across it, and the battery gives the sum of their currents. */
function solve(join: Join, in1: boolean, in2: boolean): Solved {
  if (join === 'series') {
    const amps = in1 && in2 ? VOLTS / (2 * LAMP_OHMS) : 0;
    return { lamps: [lamp(in1, amps * LAMP_OHMS), lamp(in2, amps * LAMP_OHMS)], amps };
  }
  const lamps: [Lamp, Lamp] = [lamp(in1, in1 ? VOLTS : 0), lamp(in2, in2 ? VOLTS : 0)];
  return { lamps, amps: lamps[0].amps + lamps[1].amps };
}

const volts = (v: number) => num(v, 1);
const mA = (amps: number) => num(amps * 1000, 1);

// ------------------------------------------------------------------ what it says
function lampsSay(join: Join, in1: boolean, in2: boolean, { lamps, amps }: Solved): ReactNode {
  if (!in1 && !in2) {
    return <><b>Both lamps are out.</b> {join === 'series' ? 'The loop has two gaps' : 'Each path has a gap'}: no current flows.</>;
  }
  if (!in1 || !in2) {
    const out = in1 ? 2 : 1, left = in1 ? 1 : 2;
    if (join === 'series') return <><b>Lamp {out} is out.</b> In series that is a gap in the only loop: lamp {left} goes dark too. No current flows.</>;
    return <><b>Lamp {out} is out.</b> In parallel lamp {left} still has its own path and the whole {volts(VOLTS)} V: it stays bright. The battery gives <b>{mA(amps)} mA</b> now — only one lamp&apos;s worth.</>;
  }
  if (join === 'series') {
    return <><b>In series</b> the two lamps share the push: <b>{volts(lamps[0].volts)} V</b> each, so each is dimmer. The same <b>{mA(amps)} mA</b> goes through both.</>;
  }
  return <><b>In parallel</b> each lamp has its own path and the whole <b>{volts(VOLTS)} V</b>: both are bright, and the battery gives <b>{mA(amps)} mA</b> — twice as much.</>;
}

function lampsLabel(join: Join, { lamps, amps }: Solved): string {
  const how = join === 'series' ? 'in series, one after the other in one loop' : 'in parallel, side by side, each on its own path';
  const each = lamps.map(({ state, volts: v }, i) => {
    if (state === 'out') return `Lamp ${i + 1} is out of its holder.`;
    if (state === 'dark') return `Lamp ${i + 1} is in, but dark.`;
    return `Lamp ${i + 1} has ${volts(v)} V and is ${state}.`;
  });
  return `A ${volts(VOLTS)} V battery and two lamps ${how}. ${each.join(' ')} The battery gives ${mA(amps)} mA.`;
}

// ------------------------------------------------------------------ the drawing
const TOP = 60, BOTTOM = 250, LEFT = 70;
/** In series the lamps sit on the top wire; the loop turns down at FAR. In parallel each hangs on its own path. */
const SERIES = { x: [240, 410], far: 540 } as const;
const PARALLEL = { x: [250, 450], y: (TOP + BOTTOM) / 2 } as const;
/** A lamp is drawn this many times its own size. In its own measure: a holder's two contacts are this far from the
 *  lamp's middle, and a lamp taken out is drawn this far to the side. */
const SCALE = 1.25, CONTACT = 23, ASIDE = 37;
/** Where the wires stop at a holder. */
const GAP = f(CONTACT * SCALE);

const WIRE = { stroke: '#a5abb2', strokeWidth: 2.4, fill: 'none', strokeLinejoin: 'round' } as const;
/** How thick a current is drawn: the battery's with both lamps in parallel is the thickest. */
const thick = (amps: number) => f(1.4 + 2.4 * (amps / ALONE_AMPS));

/** A lamp in its holder, drawn along the wire (the wire runs left to right through 0,0): the two contacts, the glass,
 *  the filament, and its glow by how bright it is. Taken out, it is drawn to one side and the contacts are left open. */
function Bulb({ k, lamp: { state, bright, volts: v }, x, y, upright, aside, glow }: {
  k: 1 | 2; lamp: Lamp; x: number; y: number; upright: boolean; aside: number; glow: string;
}) {
  const out = state === 'out';
  const lit = bright > 0;
  return (
    <g data-lamp={k} data-state={state} data-volts={f(v)} data-bright={Number(bright.toFixed(3))}
      transform={`translate(${x},${y})${upright ? ' rotate(90)' : ''} scale(${SCALE})`}>
      <rect x={-CONTACT - 4} y={-5} width={8} height={10} rx={2} fill="#c7ccd2" stroke="#8f969f" />
      <rect x={CONTACT - 4} y={-5} width={8} height={10} rx={2} fill="#c7ccd2" stroke="#8f969f" />
      <g transform={out ? `translate(0,${aside})` : undefined} opacity={out ? 0.7 : 1}>
        {lit && <circle data-glow cx={0} cy={0} r={f(24 + 24 * bright)} fill={`url(#${glow})`} opacity={f(0.35 + 0.65 * bright)} />}
        <circle cx={0} cy={0} r={19} fill="#fffbe8" fillOpacity={0.6} stroke="#8f969f" strokeWidth={1.4} />
        {lit && <circle cx={0} cy={0} r={19} fill="#ffd23f" opacity={f(0.9 * Math.sqrt(bright))} />}
        <path d="M-19,0 H-10 l3,-6 l4.5,12 l5,-12 l4.5,12 l3,-6 H19" fill="none" strokeLinejoin="round"
          stroke={lit ? '#d9480f' : '#6b7280'} strokeWidth={lit ? 2 : 1.6} />
        <ellipse cx={-7} cy={-9} rx={4.5} ry={3} fill="#fff" opacity={0.6} transform="rotate(-30 -7 -9)" />
      </g>
    </g>
  );
}

function LampsDrawing({ join, solved }: { join: Join; solved: Solved }) {
  const id = useDefId();
  const { lamps, amps } = solved;
  const series = join === 'series';
  const [x1, x2] = series ? SERIES.x : PARALLEL.x;
  const py = PARALLEL.y;
  /** The wires, with a space at each holder. */
  const wires = series
    ? [`M${LEFT},110 V${TOP} H${x1 - GAP}`, `M${x1 + GAP},${TOP} H${x2 - GAP}`, `M${x2 + GAP},${TOP} H${SERIES.far} V${BOTTOM} H${LEFT} V210`]
    : [
        `M${LEFT},110 V${TOP} H${x2} V${py - GAP}`, `M${x2},${py + GAP} V${BOTTOM} H${LEFT} V210`,
        `M${x1},${TOP} V${py - GAP}`, `M${x1},${py + GAP} V${BOTTOM}`,
      ];
  /** The current, along the paths that carry any: [its name, its way, its amps, where its arrows end]. */
  const flows: [name: string, d: string, amps: number, arrows: string[]][] = series
    ? [['loop', `M${LEFT},110 V${TOP} H${SERIES.far} V${BOTTOM} H${LEFT} V210`, amps, [`M${LEFT},${TOP} H${x1 - 70}`, `M${SERIES.far},${BOTTOM} H${(LEFT + SERIES.far) / 2}`]]]
    : [
        ['trunk', `M${LEFT},110 V${TOP} H${x1} M${x1},${BOTTOM} H${LEFT} V210`, amps, [`M${LEFT},${TOP} H${x1 - 70}`, `M${x1},${BOTTOM} H${x1 - 80}`]],
        ['lamp1', `M${x1},${TOP} V${BOTTOM}`, lamps[0].amps, [`M${x1},${TOP} V${TOP + 44}`]],
        ['lamp2', `M${x1},${TOP} H${x2} V${BOTTOM} H${x1}`, lamps[1].amps, [`M${x1},${TOP} H${(x1 + x2) / 2}`, `M${x2},${TOP} V${TOP + 44}`]],
      ];
  const carrying = flows.filter(([, , a]) => a > 0);
  const note = (k: 0 | 1) => (lamps[k].state === 'out' ? 'out' : `${volts(lamps[k].volts)} V · ${mA(lamps[k].amps)} mA`);
  return (
    <svg className="scene lfig" style={{ maxWidth: 640 }} viewBox="0 -12 600 300" role="img" aria-label={lampsLabel(join, solved)}>
      <defs>
        <radialGradient id={`${id}g`}>
          <stop offset="0" stopColor="#ffc93a" stopOpacity={0.85} />
          <stop offset=".5" stopColor="#ffc93a" stopOpacity={0.35} />
          <stop offset="1" stopColor="#ffc93a" stopOpacity={0} />
        </radialGradient>
        <marker id={`${id}a`} viewBox="0 0 10 10" refX={6} refY={5} markerUnits="userSpaceOnUse" markerWidth={13} markerHeight={13} orient="auto">
          <path className="lf-dot" d="M0,0 L10,5 L0,10 Z" />
        </marker>
      </defs>
      {wires.map((d) => <path key={d} d={d} {...WIRE} />)}
      {!series && [TOP, BOTTOM].map((y) => <circle key={y} cx={x1} cy={y} r={3.4} fill="#8f969f" />)}
      {/* the current: thicker where there is more of it; none along a path with a gap */}
      {carrying.map(([name, d, a]) => <path key={name} className="lf-flow" data-flow={name} data-ma={mA(a)} d={d} strokeWidth={thick(a)} />)}
      {carrying.flatMap(([, , , arrows]) => arrows).map((d) => <path key={d} d={d} stroke="none" fill="none" markerEnd={`url(#${id}a)`} />)}
      {/* the battery */}
      <rect x={LEFT - 6} y={102} width={12} height={8} rx={2} fill="#c7ccd2" stroke="#8f969f" />
      <rect x={LEFT - 34} y={110} width={68} height={100} rx={7} fill="#2d3136" stroke="#15181b" />
      <rect x={LEFT - 34} y={110} width={68} height={30} rx={7} fill="#e8b10f" />
      <text x={LEFT} y={131} fontSize={18} fontWeight={800} fill="#15171a" textAnchor="middle">+</text>
      <text x={LEFT} y={200} fontSize={18} fontWeight={800} fill="#cfd3d8" textAnchor="middle">−</text>
      <g data-battery-ma={mA(amps)}>
        <Label x={LEFT + 44} y={150} size={14} weight={700}>Battery</Label>
        <Label x={LEFT + 44} y={168} size={13} weight={600} tone="muted">{volts(VOLTS)} V</Label>
        <Label x={LEFT + 44} y={190} size={14} weight={800} tone="accent">gives {mA(amps)} mA</Label>
      </g>
      {/* the two lamps: on the one loop, or each on its own path */}
      {([0, 1] as const).map((k) => {
        const x = k === 0 ? x1 : x2;
        const y = series ? TOP : py;
        const [lx, ly, anchor] = series ? [x, TOP + 54, 'middle'] as const : [x + 38, py - 3, 'start'] as const;
        return (
          <g key={k}>
            <Bulb k={k === 0 ? 1 : 2} lamp={lamps[k]} x={x} y={y} upright={!series} aside={series ? -ASIDE : ASIDE} glow={`${id}g`} />
            <Label x={lx} y={ly} anchor={anchor} size={14} weight={700}>Lamp {k + 1}</Label>
            <Label x={lx} y={ly + 18} anchor={anchor} size={12.5} weight={600} tone={lamps[k].state === 'out' ? 'plus' : 'muted'}>{note(k)}</Label>
          </g>
        );
      })}
      <Label x={series ? (LEFT + SERIES.far) / 2 : (LEFT + x2) / 2} y={BOTTOM + 24} anchor="middle" size={13} weight={500} tone="muted">
        {series ? 'one loop: the same current all the way round' : 'two paths: their currents add up at the battery'}
      </Label>
    </svg>
  );
}

export function SeriesParallel() {
  const [join, setJoin] = useState<Join>('series');
  const [in1, setIn1] = useState(true);
  const [in2, setIn2] = useState(true);
  const solved = solve(join, in1, in2);
  return (
    <>
      <LampsDrawing join={join} solved={solved} />
      <div className="ctl">
        <Segmented label="Join them" value={join} onChange={setJoin}
          options={[{ value: 'series', label: 'In series' }, { value: 'parallel', label: 'In parallel' }]} />
      </div>
      <div className="ctl">
        <Switch label="Lamp 1 is in" value={in1} onChange={setIn1} />
        <Switch label="Lamp 2 is in" value={in2} onChange={setIn2} />
      </div>
      <div className="says" role="status"><Icon name="info" size={14} /><span>{lampsSay(join, in1, in2, solved)}</span></div>
    </>
  );
}
