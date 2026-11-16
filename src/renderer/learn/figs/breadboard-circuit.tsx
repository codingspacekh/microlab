import { useState, type ReactNode } from 'react';
import { BATTERIES, COLUMNS, holes, LED, LED_COLORS, RAILS, strips, type BreadboardSize } from '@lib/circuit';
import { stepE12 } from '@lib/units';
import { Icon, Slider, Switch } from '../../ui';
import { bands, Breadboard, f, Label, num, P, RedGlow, ROWS, SmallLed, useDefId, Wire } from '../fig-kit';
import '../figures.css';

/**
 * Learn's picture of a whole circuit on a breadboard (M8, a big idea): a battery pack, a wire, a resistor, an LED
 * and a wire back. Slide to follow the current a step at a time: the strip of metal it is in lights up, and the way
 * it has come is drawn. No two parts touch — each is joined to the next by sharing a strip. Which holes a strip
 * joins is the simulator's (src/lib/circuit/breadboard.ts); the picture is the first columns of a half breadboard.
 */

// ------------------------------------------------------------------ the simulator's breadboard and numbers
const SIZE: BreadboardSize = 'half';
/** As many columns as fit the page: a mini breadboard's width. */
const COLS = COLUMNS.mini;
const columnOf = (hole: string) => Number(/\d+$/.exec(hole)![0]);
const rowOf = (hole: string) => hole.replace(/\d+$/, '');
const shown = (hole: string) => columnOf(hole) <= COLS;
const isRail = (row: string) => (RAILS as readonly string[]).includes(row);

const HOLES = holes(SIZE).filter(shown);
/** The strips of metal, each with the holes it joins (those of the picture's columns). */
const STRIPS = strips(SIZE).map((strip) => strip.filter(shown)).filter((strip) => strip.length > 0);
const stripOf = (hole: string) => STRIPS.find((strip) => strip.includes(hole))!;

/** The battery: a pack of four cells. The resistor: the one a red LED needs on it (the next common value above). */
const VOLTS = BATTERIES['4xAA']!.volts;
const OHMS = stepE12((VOLTS - LED_COLORS.red!.vf) / LED.ratedA, 1);

// ------------------------------------------------------------------ where each part is pushed in
const AT = {
  /** The battery's leads. */
  plus: 'T+2', minus: 'T-2',
  /** The red wire, from the + rail down to a column. */
  redTop: 'T+5', redFoot: 'a5',
  /** The resistor's two legs. */
  res1: 'b5', res2: 'b9',
  /** The LED's long leg and its short one. */
  long: 'c9', short: 'c11',
  /** The black wire, from a column up to the − rail. */
  blackFoot: 'a11', blackTop: 'T-11',
};
const PLUS = stripOf(AT.plus), MINUS = stripOf(AT.minus);
const S1 = stripOf(AT.redFoot), S2 = stripOf(AT.res2), S3 = stripOf(AT.short);
/** Every strip the current goes through, in its order. */
const USED = [PLUS, S1, S2, S3, MINUS];

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'];
const word = (n: number) => WORDS[n] ?? String(n);
/** "a5–e5"; a rail: "the + rail". */
const stripName = (strip: string[]) => {
  const row = rowOf(strip[0]!);
  return isRail(row) ? `the ${row.endsWith('+') ? '+' : '−'} rail` : `${strip[0]}–${strip.at(-1)}`;
};
const span = (strip: string[]) => `${strip[0]}–${strip.at(-1)}`;
const list = (names: string[]) => `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

// ------------------------------------------------------------------ the steps of the current's way, and what each says
interface Stage {
  /** The slider's word for it. */
  name: string;
  /** The strips of metal the current is in. */
  strips: string[][];
  says: ReactNode;
}

const STAGES: Stage[] = [
  {
    name: 'the whole circuit',
    strips: USED,
    says: <><b>The whole circuit:</b> the current leaves the battery&apos;s +, goes down the red wire, through the {OHMS} Ω resistor and the LED, and comes back up the black wire to the battery&apos;s −. No two parts touch each other: each is joined to the next by a strip of metal under the holes — {word(USED.length)} strips on the way. Slide to follow the current, a step at a time.</>,
  },
  {
    name: 'out of the battery',
    strips: [PLUS],
    says: <>The battery&apos;s red lead is pushed into hole {columnOf(AT.plus)} of the + rail. The current comes out of the battery&apos;s + and into <b>the strip of metal under that rail</b>.</>,
  },
  {
    name: 'along the + rail',
    strips: [PLUS],
    says: <>Under the + rail <b>one long strip of metal</b> joins every hole of the rail. The current runs along it from hole {columnOf(AT.plus)} to hole {columnOf(AT.redTop)}, where the red wire is pushed in.</>,
  },
  {
    name: 'down the red wire',
    strips: [S1],
    says: <>The red wire brings the current from the + rail down to {AT.redFoot}. Under {AT.redFoot} one strip joins <b>{span(S1)}</b>, so the resistor&apos;s leg in {AT.res1} is joined to the wire. They share a strip: they do not touch.</>,
  },
  {
    name: 'through the resistor',
    strips: [S2],
    says: <>The current goes through the {OHMS} Ω resistor from {AT.res1} to {AT.res2}. Under {AT.res2} one strip joins <b>{span(S2)}</b>, so the LED&apos;s long leg in {AT.long} is joined to the resistor.</>,
  },
  {
    name: 'through the LED',
    strips: [S3],
    says: <>The current goes through the LED from its long leg in {AT.long} to its short leg in {AT.short}, and the LED lights. Under {AT.short} one strip joins <b>{span(S3)}</b>, so the black wire in {AT.blackFoot} is joined to the LED.</>,
  },
  {
    name: 'up the black wire',
    strips: [MINUS],
    says: <>The black wire takes the current from {AT.blackFoot} up to hole {columnOf(AT.blackTop)} of the − rail. <b>One long strip of metal</b> joins every hole of that rail.</>,
  },
  {
    name: 'back to the battery',
    strips: [MINUS],
    says: <>The current runs along the − rail&apos;s strip from hole {columnOf(AT.blackTop)} to hole {columnOf(AT.minus)}, into the battery&apos;s black lead and back to the battery&apos;s −. <b>The loop is closed:</b> that is why the current flows.</>,
  },
];
const LAST = STAGES.length - 1;

/** "the strip of metal a5–e5", "the strip of metal under the + rail". */
const inStrip = (strip: string[]) => (isRail(rowOf(strip[0]!)) ? `the strip of metal under ${stripName(strip)}` : `the strip of metal ${stripName(strip)}`);

function circuitLabel(stage: number, lifted: boolean): string {
  const parts = `A small circuit on a breadboard: a ${num(VOLTS, 1)} V battery pack on the top rails, a red wire, a ${OHMS} Ω resistor, an LED and a black wire.`;
  const cover = lifted ? ' The cover is lifted: the strips of metal under the holes show.' : ' The cover is on.';
  const { name, strips: now } = STAGES[stage]!;
  if (stage === 0) return `${parts} The whole circuit: the current goes all the way round, through ${word(now.length)} strips of metal: ${list(now.map(stripName))}.${cover}`;
  return `${parts} Step ${stage} of ${LAST}, ${name}: the current is in ${inStrip(now[0]!)}.${cover}`;
}

// ------------------------------------------------------------------ the drawing
const BX = 40, BY = -150;
const at = (hole: string): [number, number] => [BX + (columnOf(hole) - 1) * P, BY + ROWS[rowOf(hole)]!];
const pt = (hole: string) => at(hole).join(',');

const PLUS_AT = at(AT.plus), MINUS_AT = at(AT.minus);
/** The battery pack's middle, above the rails; its leads leave its foot. */
const PACK: [number, number] = [MINUS_AT[0], MINUS_AT[1] - 76];
const LEAD = { red: `${PACK[0] - 12},${PACK[1] + 50}`, black: `${PACK[0] + 12},${PACK[1] + 50}` };
const BEND = { red: `${PACK[0] - 12},${f(PACK[1] + 64.3)}`, black: `${PACK[0] + 12},${f(PACK[1] + 64.3)}` };
/** Where the LED's legs meet its body (fig-kit `SmallLed`). */
const LED_X = (at(AT.long)[0] + at(AT.short)[0]) / 2, LED_Y = at(AT.long)[1] + 15;

/** The current's way, a piece for each step after the whole. */
const WAY = [
  `M${LEAD.red} Q${BEND.red} ${pt(AT.plus)}`,
  `M${pt(AT.plus)} L${pt(AT.redTop)}`,
  `M${pt(AT.redTop)} L${pt(AT.redFoot)} L${pt(AT.res1)}`,
  `M${pt(AT.res1)} L${pt(AT.res2)} L${pt(AT.long)}`,
  `M${pt(AT.long)} L${LED_X - 4},${LED_Y} L${LED_X + 4},${LED_Y} L${pt(AT.short)} L${pt(AT.blackFoot)}`,
  `M${pt(AT.blackFoot)} L${pt(AT.blackTop)}`,
  `M${pt(AT.blackTop)} L${pt(AT.minus)} Q${BEND.black} ${LEAD.black}`,
];

/** The piece of metal under a strip's holes. */
function metal(strip: string[]) {
  const [x0, y0] = at(strip[0]!);
  const [x1, y1] = at(strip.at(-1)!);
  return { x: f(x0 - 5.5), y: f(y0 - 5.5), width: f(x1 - x0 + 11), height: f(y1 - y0 + 11), rx: 3 };
}

function BatteryPack({ lift }: { lift: string }) {
  return (
    <g>
      <g transform={`translate(${PACK[0]},${PACK[1]})`}>
        <rect x={-48} y={-50} width={96} height={100} rx={5} fill="#2d3136" stroke="#15181b" filter={`url(#${lift})`} />
        {[0, 1, 2, 3].map((i) => {
          const y = -43 + i * 22;
          return (
            <g key={i}>
              <rect x={-42} y={y} width={80} height={20} rx={10} fill="#e8b10f" />
              <rect x={-42} y={y} width={25.6} height={20} rx={10} fill="#1c1e21" />
              <rect x={38} y={y + 7} width={3} height={6} rx={1} fill="#c7ccd2" />
            </g>
          );
        })}
      </g>
      {/* on the pack and on the breadboard the colours are the parts' own, whatever the page's */}
      <text x={PACK[0]} y={PACK[1] + 3.5} fontSize={10} fontWeight={700} fill="#fff" stroke="#15171a" strokeWidth={2.4} paintOrder="stroke" textAnchor="middle">{num(VOLTS, 1)} V</text>
      <text x={PACK[0] - 12} y={PACK[1] + 47} fontSize={8} fontWeight={700} fill="#ff8a7a" textAnchor="middle">+</text>
      <text x={PACK[0] + 12} y={PACK[1] + 47} fontSize={8} fontWeight={700} fill="#cfd3d8" textAnchor="middle">−</text>
    </g>
  );
}

export function BreadboardCircuit() {
  const id = useDefId();
  const [stage, setStage] = useState(0);
  const [lifted, setLifted] = useState(false);
  const { name, strips: now, says } = STAGES[stage]!;
  /** The way so far: all of it for the whole circuit. */
  const upTo = stage === 0 ? WAY.length : stage;
  const res1 = at(AT.res1), res2 = at(AT.res2);
  const noteX = PACK[0] + 64, noteY = PACK[1] - 24;
  return (
    <>
      <svg className="scene lfig" style={{ maxWidth: 520 }} viewBox="-40 -300 380 330" role="img" aria-label={circuitLabel(stage, lifted)}>
        <defs>
          <RedGlow id={`${id}g`} />
          <filter id={`${id}l`} x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx={0} dy={2} stdDeviation={2} floodOpacity={0.28} /></filter>
          <marker id={`${id}a`} viewBox="0 0 10 10" refX={6} refY={5} markerUnits="userSpaceOnUse" markerWidth={11} markerHeight={11} orient="auto">
            <path className="lf-dot" d="M0,0 L10,5 L0,10 Z" />
          </marker>
        </defs>
        <Breadboard bx={BX} by={BY} cols={COLS} lift={`${id}l`} />
        {/* the cover lifted: every strip of metal, and its holes over it */}
        {lifted && STRIPS.map((strip) => (
          <rect key={strip[0]} data-strip={strip[0]} {...metal(strip)} fill="#c7ccd2" stroke="#8f969f" strokeWidth={1} opacity={0.92} />
        ))}
        {/* the strip the current is in, and the holes it joins */}
        {now.map((strip) => <rect key={strip[0]} className="lf-now" data-now={strip[0]} {...metal(strip)} />)}
        {lifted && (
          <g fill="#4a463e">
            {HOLES.map((hole) => {
              const [x, y] = at(hole);
              return <rect key={hole} x={f(x - 2.7)} y={f(y - 2.7)} width={5.4} height={5.4} rx={1.2} />;
            })}
          </g>
        )}
        {now.flat().map((hole) => {
          const [x, y] = at(hole);
          return <rect key={hole} className="lf-dot" data-lit={hole} x={f(x - 3.6)} y={f(y - 3.6)} width={7.2} height={7.2} rx={1.6} />;
        })}
        {/* the battery pack: its red lead in the + rail, its black lead in the − rail */}
        <Wire thin colour="red" d={`M${LEAD.red} Q${BEND.red} ${pt(AT.plus)}`} ends={[PLUS_AT]} />
        <Wire thin colour="black" d={`M${LEAD.black} Q${BEND.black} ${pt(AT.minus)}`} ends={[MINUS_AT]} />
        <BatteryPack lift={`${id}l`} />
        <Wire colour="red" d={`M${pt(AT.redTop)} L${pt(AT.redFoot)}`} ends={[at(AT.redTop), at(AT.redFoot)]} />
        {/* the resistor */}
        <line x1={res1[0]} y1={res1[1]} x2={res2[0]} y2={res2[1]} stroke="#a5abb2" strokeWidth={1.8} />
        <g transform={`translate(${(res1[0] + res2[0]) / 2},${res1[1]})`}>
          <rect x={-15} y={-5.5} width={30} height={11} rx={5} fill="#e3cb98" stroke="#bfa26e" strokeWidth={0.8} />
          {bands(OHMS).map((c, i) => <rect key={i} x={[-9.5, -4.5, 0.5, 8][i]} y={-5.3} width={2.6} height={10.6} fill={c} />)}
        </g>
        <SmallLed a={at(AT.long)} k={at(AT.short)} state="on" glow={`${id}g`} />
        <Wire colour="black" d={`M${pt(AT.blackFoot)} L${pt(AT.blackTop)}`} ends={[at(AT.blackFoot), at(AT.blackTop)]} />
        <text x={(res1[0] + res2[0]) / 2} y={res1[1] + 22} fontSize={10.5} fontWeight={700} fill="#1f2937" textAnchor="middle">{OHMS} Ω</text>
        <text x={at(AT.short)[0] + 40} y={at(AT.short)[1] + 20} fontSize={10.5} fontWeight={700} fill="#1f2937" textAnchor="start">LED</text>
        {/* the current's way so far */}
        <g className="lf-still">
          {WAY.slice(0, upTo).map((d, i) => (
            <path key={d} className="lf-flow" data-flow={i + 1} d={d} strokeWidth={2.6} strokeLinejoin="round"
              markerEnd={stage > 0 && i === upTo - 1 ? `url(#${id}a)` : undefined} />
          ))}
        </g>
        {/* where the current is now */}
        <Label x={noteX} y={noteY} size={15} weight={800}>{stage === 0 ? 'The whole circuit' : `Step ${stage} of ${LAST}`}</Label>
        <Label x={noteX} y={noteY + 19} size={12.5} weight={500} tone="muted">{stage === 0 ? 'the current, all the way round' : name}</Label>
        <Label x={noteX} y={noteY + 42} size={12.5} weight={700} tone="accent">
          {stage === 0 ? `${word(now.length)} strips of metal on the way` : `Strip of metal: ${stripName(now[0]!)}`}
        </Label>
      </svg>
      {/* lf-steps: room for the step's name beside the slider */}
      <div className="ctl lf-steps">
        <Slider label="Follow the current" value={stage} min={0} max={LAST} step={1} format={(i) => STAGES[i]!.name} onChange={setStage} />
      </div>
      <div className="ctl">
        <Switch label="Lift the cover" value={lifted} onChange={setLifted} />
      </div>
      <div className="says" role="status">
        <Icon name="info" size={14} />
        <span>{says}{lifted && ' With the cover lifted you see the strips: a short one under each half of a column, a long one under each rail.'}</span>
      </div>
    </>
  );
}
