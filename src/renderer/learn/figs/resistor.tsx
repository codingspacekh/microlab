import { useState, type ReactNode } from 'react';
import { BATTERIES, LED, LED_COLORS } from '@lib/circuit';
import { formatValue, stepE12 } from '@lib/units';
import { Icon, Slider } from '../../ui';
import { BAND, bands, f, Label, num, RedGlow, SmallLed, useDefId } from '../fig-kit';
import '../figures.css';

/**
 * Learn's picture of the resistor (M8): a battery, a resistor and an LED in a loop. Slide the resistance and the
 * current through it thins, the LED after it dims, and the stripes on its body change. Every number is the
 * simulator's (src/lib/circuit) or the E12 series' (src/lib/units).
 */

// ------------------------------------------------------------------ the simulator's numbers
/** The battery: a pack of four cells. */
const VOLTS = BATTERIES['4xAA']!.volts;
/** What is left of its volts after the red LED's pushes the current through the resistor. */
const PUSH = VOLTS - LED_COLORS.red!.vf;
/** The slider's ends: from a value that burns the LED to one that all but puts it out. */
const RANGE = { from: 47, to: 10_000 };
/** The common values between them (E12). */
const VALUES: number[] = [];
for (let v = RANGE.from; v <= RANGE.to; v = stepE12(v, 1)) VALUES.push(v);
/** Where the page starts: the resistor this LED needs — the next common value above (a bigger one is safe). */
const START = Math.max(0, VALUES.indexOf(stepE12(PUSH / LED.ratedA, 1)));

const ampsThrough = (ohms: number) => PUSH / ohms;
const mA = (amps: number) => num(amps * 1000, 1);
/** 220 → "220 Ω", 4700 → "4.7 kΩ". */
const ohmsText = (ohms: number) => formatValue(ohms).replace(/([kM]?)$/, ' $1Ω');

// ------------------------------------------------------------------ the stripes
/** The colours of the kit's bands, by digit (fig-kit `BAND`). */
const COLOUR = ['black', 'brown', 'red', 'orange', 'yellow', 'green', 'blue', 'violet', 'grey', 'white'];
const ZEROS = ['no zeros', 'one zero', 'two zeros', 'three zeros', 'four zeros', 'five zeros'];

/** The stripes in words, as the kit's `bands` works them out: two digits, how many zeros, and gold. */
function stripes(ohms: number) {
  const zeros = Math.floor(Math.log10(ohms) + 1e-9) - 1;
  const digits = Math.round(ohms / 10 ** zeros);
  const first = Math.floor(digits / 10), second = digits % 10;
  return {
    colours: [COLOUR[first]!, COLOUR[second]!, COLOUR[zeros] ?? 'gold', 'gold'],
    reads: `${first}, ${second}, ${ZEROS[zeros] ?? `${zeros} zeros`}`,
  };
}

// ------------------------------------------------------------------ what it says
type Level = 'dim' | 'bright' | 'over' | 'burnt';

const levelAt = (amps: number, burnt: boolean): Level =>
  burnt ? 'burnt' : amps < LED.ratedA / 2 ? 'dim' : amps <= LED.ratedA ? 'bright' : 'over';

function resistorSays(level: Level, ohms: number, amps: number): ReactNode {
  const r = ohmsText(ohms);
  const { colours, reads } = stripes(ohms);
  const its = <> The stripes: {colours.join(', ')}: {reads} — <b>{r}</b>.</>;
  switch (level) {
    case 'dim': return <>With <b>{r}</b> in the way only <b>{mA(amps)} mA</b> gets through, so the LED is dim.{its}</>;
    case 'bright': return <>Through <b>{r}</b>, <b>{mA(amps)} mA</b> flows: the LED shines bright — just right.{its}</>;
    case 'over': return <><b>{r}</b> is too small: <b>{mA(amps)} mA</b> rushes through, more than the LED&apos;s <b>{mA(LED.ratedA)} mA</b>. It glares — too much, it will not last.{its}</>;
    case 'burnt': return <>More than <b>{mA(LED.maxA)} mA</b> went through the LED: it burnt out, for good. No current flows now, whatever the resistance. Take a new LED to try again.{its}</>;
  }
}

function resistorLabel(level: Level, ohms: number, amps: number): string {
  const { colours } = stripes(ohms);
  const loop = `A battery, a resistor and an LED in a loop: the resistor is ${ohmsText(ohms)} — its stripes are ${colours.slice(0, -1).join(', ')} and ${colours.at(-1)} — `;
  switch (level) {
    case 'dim': return `${loop}so ${mA(amps)} mA flows and the LED is dim`;
    case 'bright': return `${loop}so ${mA(amps)} mA flows and the LED shines bright`;
    case 'over': return `${loop}so ${mA(amps)} mA flows, more than its ${mA(LED.ratedA)} mA: the LED glares — too much, it will not last`;
    case 'burnt': return `${loop}the LED has burnt out, no current flows`;
  }
}

// ------------------------------------------------------------------ the drawing
/** The loop's corners: the battery on the left, the resistor along the top, the LED on the right. */
const TOP = 60, BOTTOM = 250, LEFT = 70, FAR = 520;
const RES = { cx: 290, half: 62, lead: 28 };
const LED_AT = { x: 460, y: 118, scale: 1.6 };
const LEG = 8 * LED_AT.scale;

function LoopDrawing({ level, ohms, amps }: { level: Level; ohms: number; amps: number }) {
  const id = useDefId();
  const burnt = level === 'burnt';
  const over = level === 'over';
  /** How bright: full at the rated current. */
  const glow = burnt ? 0 : Math.min(1, amps / LED.ratedA);
  /** How thick the current is drawn: thickest at the most the LED can take. */
  const thick = f(1.2 + 4.8 * Math.min(1, amps / LED.maxA));
  const a = LED_AT.x - LEG, k = LED_AT.x + LEG;
  const r0 = RES.cx - RES.half - RES.lead, r1 = RES.cx + RES.half + RES.lead;
  const way = [
    `M${LEFT},110 V${TOP} H${r0}`,
    `M${r1},${TOP} H${f(a)} V${LED_AT.y}`,
    `M${f(k)},${LED_AT.y} V96 H${FAR} V${BOTTOM} H${LEFT} V210`,
  ];
  const arrows = [`M${LEFT},110 V${TOP} H${r0 + 14}`, `M${FAR},${BOTTOM} H${LEFT} V222`];
  return (
    <svg className="scene lfig" style={{ maxWidth: 620 }} viewBox="0 0 560 290" role="img" aria-label={resistorLabel(level, ohms, amps)}>
      <defs>
        <RedGlow id={`${id}g`} />
        <marker id={`${id}a`} viewBox="0 0 10 10" refX={6} refY={5} markerUnits="userSpaceOnUse" markerWidth={13} markerHeight={13} orient="auto">
          <path className={over ? 'lf-plus' : 'lf-dot'} d="M0,0 L10,5 L0,10 Z" />
        </marker>
      </defs>
      {/* the wires of the loop */}
      {way.map((d) => <path key={d} d={d} stroke="#a5abb2" strokeWidth={2.4} fill="none" strokeLinejoin="round" />)}
      {/* the current: thinner the more the resistor holds back; none through a burnt LED */}
      {!burnt && way.map((d) => <path key={d} className={over ? 'lf-flow over' : 'lf-flow'} d={d} strokeWidth={thick} />)}
      {!burnt && arrows.map((d) => <path key={d} d={d} stroke="none" fill="none" markerEnd={`url(#${id}a)`} />)}
      {/* the battery */}
      <rect x={LEFT - 6} y={102} width={12} height={8} rx={2} fill="#c7ccd2" stroke="#8f969f" />
      <rect x={LEFT - 34} y={110} width={68} height={100} rx={7} fill="#2d3136" stroke="#15181b" />
      <rect x={LEFT - 34} y={110} width={68} height={30} rx={7} fill="#e8b10f" />
      <text x={LEFT} y={131} fontSize={18} fontWeight={800} fill="#15171a" textAnchor="middle">+</text>
      <text x={LEFT} y={200} fontSize={18} fontWeight={800} fill="#cfd3d8" textAnchor="middle">−</text>
      <Label x={LEFT + 44} y={158} size={14} weight={700}>Battery</Label>
      <Label x={LEFT + 44} y={176} size={13} weight={600} tone="muted">{num(VOLTS, 1)} V</Label>
      {/* the resistor, drawn big: its legs, its body, its four stripes */}
      <path d={`M${r0},${TOP} H${r1}`} stroke="#a5abb2" strokeWidth={4} />
      <rect x={RES.cx - RES.half} y={TOP - 22} width={2 * RES.half} height={44} rx={20} fill="#e3cb98" stroke="#bfa26e" strokeWidth={1.4} />
      {bands(ohms).map((c, i) => (
        <rect key={i} x={RES.cx + [-42, -22, -2, 30][i]!} y={TOP - 21.3} width={11} height={42.6} fill={c} stroke={c === BAND[9] ? '#bfa26e' : 'none'} strokeWidth={0.6} />
      ))}
      <Label x={RES.cx} y={22} anchor="middle" size={17} weight={800} tone="accent">{ohmsText(ohms)}</Label>
      <Label x={RES.cx} y={104} anchor="middle" size={13} weight={500} tone="muted">the resistor holds the current back</Label>
      {/* the LED after it: its glow follows the current */}
      <g transform={`translate(${LED_AT.x},${LED_AT.y}) scale(${LED_AT.scale})`}>
        {glow > 0 && <circle cx={0} cy={22} r={f(14 + 20 * glow + (over ? 6 : 0))} fill={`url(#${id}g)`} opacity={f(0.25 + 0.75 * glow)} />}
        <SmallLed a={[-8, 0]} k={[8, 0]} state={burnt ? 'burnt' : level === 'dim' ? 'off' : 'on'} glow={`${id}g`} />
      </g>
      <Label x={LED_AT.x} y={202} anchor="middle" size={13} weight={700}>LED</Label>
      <Label x={RES.cx} y={BOTTOM - 12} anchor="middle" size={17} weight={800} tone={over ? 'plus' : 'accent'}>{burnt ? '0' : mA(amps)} mA</Label>
      <Label x={RES.cx} y={BOTTOM + 22} anchor="middle" size={13} weight={500} tone="muted">the same current all round the loop</Label>
    </svg>
  );
}

export function ResistorInside() {
  const [index, setIndex] = useState(START);
  const [burnt, setBurnt] = useState(false);
  const ohms = VALUES[index]!;
  const amps = burnt ? 0 : ampsThrough(ohms);
  const level = levelAt(amps, burnt);
  const slide = (to: number) => {
    setIndex(to);
    if (ampsThrough(VALUES[to]!) > LED.maxA) setBurnt(true);    // for good: sliding back does not mend it
  };
  const renew = () => {
    setBurnt(false);
    setIndex(START);
  };
  return (
    <>
      <LoopDrawing level={level} ohms={ohms} amps={amps} />
      <div className="ctl">
        <Slider label="Resistance" value={index} min={0} max={VALUES.length - 1} step={1} format={(i) => ohmsText(VALUES[i]!)} onChange={slide} />
        {burnt && <button type="button" className="btn" onClick={renew}>New LED</button>}
      </div>
      <div className="says" role="status"><Icon name="info" size={14} /><span>{resistorSays(level, ohms, amps)}</span></div>
    </>
  );
}
