import { useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { BATTERIES, LED, LED_COLORS, MODELS, POWER_SUPPLY, WIPER_OHMS } from '@lib/circuit';
import { stepE12 } from '@lib/units';
import { Icon, Slider } from '../ui';
import { bands, Breadboard, Callout, f, kOhms, Label, num, P, RedGlow, ROWS, SmallLed, useDefId, Wire } from './fig-kit';
import { BatteryInside } from './figs/battery';
import { BreadboardInside } from './figs/breadboard';
import { BreadboardCircuit } from './figs/breadboard-circuit';
import { CircuitLoop } from './figs/circuit-loop';
import { DigitalAnalog } from './figs/digital-analog';
import { PwmDimming } from './figs/pwm';
import { SeriesParallel } from './figs/series-parallel';
import { WaterLoop } from './figs/water';
import { ButtonInside } from './figs/button';
import { BuzzerInside } from './figs/buzzer';
import { LdrInside } from './figs/ldr';
import { ResistorInside } from './figs/resistor';
import { RgbInside } from './figs/rgb-led';
import { SwitchInside } from './figs/slide-switch';
import './figures.css';

/**
 * Learn's pictures to play with (M8, screens 30b and 30c): how a part works inside, for students of 10–13. The
 * drawings are the prototype's (design/learnfigs.py), made live; every number is the simulator's (src/lib/circuit),
 * so the page and the simulator agree.
 */

// ------------------------------------------------------------------ the simulator's numbers
const mA = (amps: number) => Math.round(amps * 1000);
/** Bright and lasting for years up to here; more is too much. */
const RATED_MA = mA(LED.ratedA);
/** More than this and the chip burns out. */
const MAX_MA = mA(LED.maxA);
/** Below half its rated current an LED is dim: the best current is from here to the rated one. */
const DIM_MA = RATED_MA / 2;
/** The middle of the best current: where the page starts. */
const BEST_MA = (DIM_MA + RATED_MA) / 2;
/** The slider goes to twice the rated current, well past burning. */
const SLIDER_MA = 2 * RATED_MA;

/** The connection picture's battery pack, and the resistor it needs: what is left of its volts after the red LED's,
 *  over the rated current — then the next common value above (a bigger resistor is safe). */
const PACK_VOLTS = BATTERIES['4xAA']!.volts;
const RESISTOR_OHMS = stepE12((PACK_VOLTS - LED_COLORS.red!.vf) / LED.ratedA, 1);

/** The potentiometer as the simulator builds it: its whole track, from the part's model. */
const TRACK_OHMS = MODELS.potentiometer!.devices({ id: 'pot', leg: (name) => name, props: {} })
  .reduce((ohms, d) => (d.kind === 'pot' ? d.ohms : ohms), 0);
/** The volts across the track: the lower of the power supply's two choices. */
const TRACK_VOLTS = Math.min(...POWER_SUPPLY.choices);

/** The two parts of the track and leg 2's volts with the knob at `p` (0–1 from leg 1), as the solver works them out. */
function divider(p: number) {
  const low = p * TRACK_OHMS + WIPER_OHMS;
  const high = (1 - p) * TRACK_OHMS + WIPER_OHMS;
  return { low, high, volts: (TRACK_VOLTS * low) / (low + high) };
}

// ------------------------------------------------------------------ the LED, cut open
type LedLevel = 'none' | 'dim' | 'bright' | 'over' | 'burnt';

const ledLevel = (ma: number, burnt: boolean): LedLevel =>
  burnt ? 'burnt' : ma <= 0 ? 'none' : ma < DIM_MA ? 'dim' : ma <= RATED_MA ? 'bright' : 'over';

const HOW_IT_FLOWS = 'The current comes in at the long leg, crosses the tiny chip — that\'s where the light is made — and leaves by the short leg.';

function ledSays(level: LedLevel, ma: number): ReactNode {
  switch (level) {
    case 'none': return <>At <b>0 mA</b> no current flows, so the chip stays dark. Slide to the right to let some through.</>;
    case 'dim': return <>At <b>{ma} mA</b> it glows, but only dimly. {HOW_IT_FLOWS} Give it more and it gets brighter.</>;
    case 'bright': return <>At <b>{ma} mA</b> it shines bright. {HOW_IT_FLOWS} Slide past <b>{MAX_MA} mA</b> and the chip gets too hot: it burns out, for good.</>;
    case 'over': return <>At <b>{ma} mA</b> it is very bright, but that is more than its <b>{RATED_MA} mA</b>: too much — it will not last. Slide past <b>{MAX_MA} mA</b> and it burns out, for good.</>;
    case 'burnt': return <>More than <b>{MAX_MA} mA</b> went through it: the chip got too hot and burnt out, for good. No current can cross it now, so it stays dark. Take a new LED to try again.</>;
  }
}

function ledLabel(level: LedLevel, ma: number): string {
  switch (level) {
    case 'none': return 'An LED cut open: no current flows through it, it is dark';
    case 'dim': return `An LED cut open: ${ma} mA flows through it, it glows dimly`;
    case 'bright': return `An LED cut open: ${ma} mA flows through it, it shines bright`;
    case 'over': return `An LED cut open: ${ma} mA flows through it, more than its ${RATED_MA} mA — too much, it will not last`;
    case 'burnt': return `An LED cut open: more than ${MAX_MA} mA went through it, it has burnt out and is dark`;
  }
}

/** The chip's colour from dark (no current) to glowing (the best current and more). */
function chipColour(glow: number): string {
  const dark = [122, 47, 40];
  const lit = [255, 243, 176];
  return `rgb(${dark.map((c, i) => Math.round(c + (lit[i]! - c) * glow)).join(',')})`;
}

/** A 5 mm LED drawn big and see-through: the thin anode post and its gold wire across to the chip, the cathode's big
 *  piece with the cup the chip sits in, the long + leg and the short − leg, the flat edge on the − side. */
function LedDrawing({ level, ma }: { level: LedLevel; ma: number }) {
  const id = useDefId();
  const cx = 200, top = 40, base = 214;
  const ax = cx - 34, kx = cx + 22;                 // the anode's leg (left), the cathode's (right)
  const burnt = level === 'burnt';
  const lit = !burnt && ma > 0;
  const glow = lit ? Math.min(1, ma / BEST_MA) : 0;
  const over = level === 'over';
  const tint = burnt ? '#6b5a54' : glow >= 0.5 ? '#ff8a7a' : '#f6c9c3';
  const edge = burnt ? '#5a4640' : '#e0685a';
  const rays = [-160, -135, -110, -85, -60, -35];
  return (
    <svg className="scene lfig" style={{ maxWidth: 520 }} viewBox="-90 0 560 400" role="img" aria-label={ledLabel(level, ma)}>
      <defs>
        <RedGlow id={`${id}g`} />
        <marker id={`${id}a`} viewBox="0 0 10 10" refX={6} refY={5} markerWidth={7} markerHeight={7} orient="auto">
          <path className="lf-dot" d="M0,0 L10,5 L0,10 Z" />
        </marker>
      </defs>
      {lit && <circle cx={cx + 14} cy={100} r={over ? 104 : 92} fill={`url(#${id}g)`} opacity={f(0.7 * glow + (over ? 0.25 : 0))} />}
      <path d={`M${cx - 66},${base} V${top + 66} A66 66 0 0 1 ${cx + 66},${top + 66} V${base} Z`} fill={tint} fillOpacity={burnt ? 0.55 : 0.38} stroke={edge} strokeWidth={2} />
      <rect x={cx - 76} y={base} width={152} height={12} rx={3} fill={tint} fillOpacity={burnt ? 0.65 : 0.5} stroke={edge} strokeWidth={2} />
      <path d={`M${cx + 76},${base - 2} V${base + 14}`} stroke={burnt ? '#4b3b35' : '#b44a3e'} strokeWidth={6} />
      {/* anode post: a thin stem with a small flag at its top */}
      <path d={`M${ax - 5},${base + 12} V128 H${ax + 10} V138 H${ax + 5} V${base + 12} Z`} fill="#c7ccd2" stroke="#8f969f" />
      {/* cathode: a wide stem with the reflector cup on top */}
      <path d={`M${kx - 8},${base + 12} V124 H${kx - 26} L${kx - 20},100 H${kx + 26} L${kx + 32},124 H${kx + 8} V${base + 12} Z`} fill="#c7ccd2" stroke="#8f969f" />
      <path d={`M${kx - 20},100 L${kx - 12},116 H${kx + 18} L${kx + 26},100`} fill="#aeb4bb" stroke="#8f969f" />
      <rect x={kx - 6} y={104} width={12} height={9} rx={1} fill={burnt ? '#1d1512' : chipColour(glow)} stroke={burnt ? '#000' : '#5a1f1a'} />
      {burnt ? (
        <>
          {/* the gold wire melted through, the chip cracked, smoke */}
          <path d={`M${ax + 6},128 C${ax + 8},96 ${ax + 16},82 ${ax + 26},78`} stroke="#8a6d12" strokeWidth={1.6} fill="none" />
          <path d={`M${kx - 12},84 C${kx - 6},88 ${kx - 2},96 ${kx},104`} stroke="#8a6d12" strokeWidth={1.6} fill="none" />
          <path d={`M${kx - 5},105 l3,3 -2,2 4,3`} stroke="#8c8f94" strokeWidth={1.1} fill="none" />
          <circle cx={kx - 4} cy={84} r={9} fill="#8c8f94" opacity={0.5} />
          <circle cx={kx + 6} cy={64} r={12} fill="#8c8f94" opacity={0.38} />
          <circle cx={kx - 2} cy={38} r={15} fill="#8c8f94" opacity={0.25} />
        </>
      ) : <path d={`M${ax + 6},128 C${ax + 10},70 ${kx - 10},72 ${kx},104`} stroke="#d4a017" strokeWidth={1.6} fill="none" />}
      {lit && rays.map((deg) => {
        const r = (deg * Math.PI) / 180;
        const far = 22 + 12 * glow + (over ? 6 : 0);
        return <path key={deg} d={`M${f(kx + 16 * Math.cos(r))},${f(106 + 16 * Math.sin(r))} L${f(kx + far * Math.cos(r))},${f(106 + far * Math.sin(r))}`} stroke="#ffd166" strokeWidth={2.4} strokeLinecap="round" opacity={f(0.3 + 0.7 * glow)} />;
      })}
      {/* legs: the anode's long, the cathode's short */}
      <path d={`M${ax},${base + 12} V${base + 136}`} stroke="#a5abb2" strokeWidth={4} />
      <path d={`M${kx},${base + 12} V${base + 86}`} stroke="#a5abb2" strokeWidth={4} />
      <Label x={ax} y={base + 156} anchor="middle" size={18} weight={800} tone="plus">+</Label>
      <Label x={kx} y={base + 106} anchor="middle" size={18} weight={800}>−</Label>
      {/* the current's way: in at +, up the post, over the wire, through the chip, down the cup, out at − */}
      {lit && (
        <path
          className={over ? 'lf-flow over' : 'lf-flow'}
          d={`M${ax - 16},${base + 126} V124 C${ax - 12},52 ${kx + 4},56 ${kx + 44},108 V${base + 80}`}
          strokeWidth={f(1.4 + 1.0 * glow + (over ? 0.8 : 0))}
          markerEnd={`url(#${id}a)`}
        />
      )}
      <Callout from={[kx + 6, 108]} to={[cx + 124, 62]} text="The chip" sub="the light is made here" />
      <Callout from={[cx - 4, 78]} to={[cx + 124, 104]} text="Gold wire" sub="thinner than a hair" />
      <Callout from={[kx + 28, 120]} to={[cx + 124, 146]} text="The cup (−)" sub="holds the chip" />
      <Callout from={[cx + 76, base + 6]} to={[cx + 124, 196]} text="Flat edge" sub="on the − side" />
      <Callout from={[ax, base + 110]} to={[cx - 120, base + 110]} text="Long leg: anode (+)" sub="to the + side" anchor="end" />
      <Callout from={[kx, base + 70]} to={[cx - 120, base + 70]} text="Short leg: cathode (−)" sub="to the − side, GND" anchor="end" />
    </svg>
  );
}

/** The same LED at three currents, under the slider: none, just right, too much. The one that applies is marked. */
function LedStatesRow({ level }: { level: LedLevel }) {
  const id = useDefId();
  const states = [
    { state: 'off', label: '0 mA', sub: 'dark', now: level === 'none' },
    { state: 'on', label: `${BEST_MA} mA`, sub: 'bright — just right', now: level === 'bright' },
    { state: 'burnt', label: `over ${MAX_MA} mA`, sub: 'burnt out', now: level === 'burnt' },
  ] as const;
  const now = states.find((s) => s.now);
  const says = `The LED at three currents: dark at 0 mA, bright at ${BEST_MA} mA, burnt out over ${MAX_MA} mA.`
    + (now ? ` Now: ${now.sub}.` : ' Now: in between.');
  return (
    <svg className="scene lfig" style={{ maxWidth: 390 }} viewBox="0 -20 390 112" role="img" aria-label={says}>
      <defs><RedGlow id={`${id}g`} /></defs>
      {states.map((s, i) => {
        const x = 50 + i * 130;
        return (
          <g key={s.state}>
            {s.now && <rect className="lf-now" x={x - 62} y={-18} width={124} height={108} rx={9} />}
            <SmallLed a={[x - 8, 10]} k={[x + 8, 10]} state={s.state} glow={`${id}g`} />
            <Label x={x} y={70} anchor="middle" size={11.5} weight={700}>{s.label}</Label>
            <Label x={x} y={84} anchor="middle" size={10.5} weight={500} tone="muted">{s.sub}</Label>
          </g>
        );
      })}
    </svg>
  );
}

function LedInside() {
  const [ma, setMa] = useState(BEST_MA);
  const [burnt, setBurnt] = useState(false);
  const level = ledLevel(ma, burnt);
  const slide = (value: number) => {
    setMa(value);
    if (value > MAX_MA) setBurnt(true);             // for good: sliding back does not mend it
  };
  const renew = () => {
    setBurnt(false);
    setMa(BEST_MA);
  };
  return (
    <>
      <LedDrawing level={level} ma={ma} />
      <div className="ctl">
        <Slider label="Current through it" value={ma} min={0} max={SLIDER_MA} step={1} format={(v) => `${v} mA`} onChange={slide} />
        {burnt && <button type="button" className="btn" onClick={renew}>New LED</button>}
      </div>
      <div className="lf-row"><LedStatesRow level={level} /></div>
      <div className="says" role="status"><Icon name="info" size={14} /><span>{ledSays(level, ma)}</span></div>
    </>
  );
}

// ------------------------------------------------------------------ how to connect an LED
/** How to connect an LED, with no board: a pack of four cells on the top rails; + rail → a5, the resistor from b5 to
 *  b9, the LED's long leg in c9 and its short leg in c11; a11 → − rail. */
function LedConnect() {
  const id = useDefId();
  const bx = 40, by = -150;
  const xy = (col: number, row: string): [number, number] => [bx + (col - 1) * P, by + ROWS[row]!];
  const plus = xy(2, 'T+'), minus = xy(2, 'T-');
  const r1 = xy(5, 'b'), r2 = xy(9, 'b');
  const pack: [number, number] = [minus[0], minus[1] - 76];
  const ohms = `${RESISTOR_OHMS} Ω`;
  const says = `How to connect an LED: from the ${num(PACK_VOLTS, 1)} V battery pack's +, through a ${ohms} resistor, to the LED's long leg; `
    + 'its short leg goes back to the battery\'s −. The LED is lit.';
  return (
    <svg className="scene lfig" style={{ maxWidth: 470 }} viewBox="-40 -300 380 330" role="img" aria-label={says}>
      <defs>
        <RedGlow id={`${id}g`} />
        <filter id={`${id}l`} x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx={0} dy={2} stdDeviation={2} floodOpacity={0.28} /></filter>
      </defs>
      <Breadboard bx={bx} by={by} cols={17} lift={`${id}l`} />
      {/* the battery pack: its red lead in the + rail, its black lead in the − rail */}
      <Wire thin colour="red" d={`M${pack[0] - 12},${pack[1] + 50} Q${pack[0] - 12},${f(pack[1] + 64.3)} ${plus[0]},${plus[1]}`} ends={[plus]} />
      <Wire thin colour="black" d={`M${pack[0] + 12},${pack[1] + 50} Q${pack[0] + 12},${f(pack[1] + 64.3)} ${minus[0]},${minus[1]}`} ends={[minus]} />
      <g transform={`translate(${pack[0]},${pack[1]})`}>
        <rect x={-48} y={-50} width={96} height={100} rx={5} fill="#2d3136" stroke="#15181b" filter={`url(#${id}l)`} />
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
      <text x={pack[0]} y={pack[1] + 3.5} fontSize={10} fontWeight={700} fill="#fff" stroke="#15171a" strokeWidth={2.4} paintOrder="stroke" textAnchor="middle">{num(PACK_VOLTS, 1)} V</text>
      <text x={pack[0] - 12} y={pack[1] + 47} fontSize={8} fontWeight={700} fill="#ff8a7a" textAnchor="middle">+</text>
      <text x={pack[0] + 12} y={pack[1] + 47} fontSize={8} fontWeight={700} fill="#cfd3d8" textAnchor="middle">−</text>
      <Wire colour="red" d={`M${xy(5, 'T+').join(',')} L${xy(5, 'a').join(',')}`} ends={[xy(5, 'T+'), xy(5, 'a')]} />
      {/* the resistor */}
      <line x1={r1[0]} y1={r1[1]} x2={r2[0]} y2={r2[1]} stroke="#a5abb2" strokeWidth={1.8} />
      <g transform={`translate(${(r1[0] + r2[0]) / 2},${r1[1]})`}>
        <rect x={-15} y={-5.5} width={30} height={11} rx={5} fill="#e3cb98" stroke="#bfa26e" strokeWidth={0.8} />
        {bands(RESISTOR_OHMS).map((c, i) => <rect key={i} x={[-9.5, -4.5, 0.5, 8][i]} y={-5.3} width={2.6} height={10.6} fill={c} />)}
      </g>
      <SmallLed a={xy(9, 'c')} k={xy(11, 'c')} state="on" glow={`${id}g`} />
      <Wire colour="black" d={`M${xy(11, 'a').join(',')} L${xy(11, 'T-').join(',')}`} ends={[xy(11, 'a'), xy(11, 'T-')]} />
      <text x={xy(7, 'b')[0]} y={xy(7, 'b')[1] + 22} fontSize={10.5} fontWeight={700} fill="#1f2937" textAnchor="middle">{ohms}</text>
      <text x={xy(13, 'd')[0] + 8} y={xy(10, 'd')[1] + 4} fontSize={10.5} fontWeight={700} fill="#1f2937" textAnchor="start">LED</text>
    </svg>
  );
}

// ------------------------------------------------------------------ the potentiometer, its cover off
/** The knob turns from leg 1's end of the track (bottom left) round the top to leg 3's (bottom right). */
const TURN = { from: 150, to: 390 };
const KNOB = { cx: 150, cy: 140, r: 86 };

/** How far round the knob a point of the picture is, 0–1; past either end of the track, that end. */
function turnAt(x: number, y: number): number {
  const deg = (Math.atan2(y - KNOB.cy, x - KNOB.cx) * 180) / Math.PI;
  const along = (((deg - TURN.from) % 360) + 360) % 360;
  const sweep = TURN.to - TURN.from;
  return along <= sweep ? along / sweep : along < (sweep + 360) / 2 ? 1 : 0;
}

const SHARE: Record<number, [round: string, along: string, push: string]> = {
  25: ['A quarter of the way round', 'a quarter of the way along', 'a quarter of the push'],
  50: ['Half way round', 'half way along', 'half of the push'],
  75: ['Three quarters of the way round', 'three quarters of the way along', 'three quarters of the push'],
};

function potSays(percent: number, volts: string): ReactNode {
  const of = <><b>{volts} V</b> of {num(TRACK_VOLTS, 1)} V</>;
  if (percent <= 0) return <>Turned all the way back, the wiper sits at leg 1&apos;s end of the track. So leg 2 gets none of the push: {of}. Turn the knob and it gets more.</>;
  if (percent >= 100) return <>Turned all the way, the wiper sits at leg 3&apos;s end of the track. So leg 2 gets all of the push: {of}.</>;
  const [round, along, push] = SHARE[percent] ?? [`${percent} % of the way round`, `${percent} % of the way along`, `${percent} % of the push`];
  return <>{round}, the wiper touches the track {along}. So leg 2 gets {push}: {of}. Turn it all the way and leg 2 gets all of it.</>;
}

/** A potentiometer with its cover off: the carbon track in a horseshoe from leg 1 to leg 3, the wiper on the knob's
 *  shaft touching it, leg 2 from the wiper. Beside it, the track pulled straight: the volts across it, leg 2's where
 *  the wiper touches, and the resistance each side. */
function PotInside() {
  const [percent, setPercent] = useState(25);
  const svg = useRef<SVGSVGElement>(null);
  const turning = useRef(false);
  const at = percent / 100;
  const { low, high, volts } = divider(at);
  const v = num(volts, 2);

  const { cx, cy, r } = KNOB;
  const pt = (deg: number, rr = r): [number, number] => [cx + rr * Math.cos((deg * Math.PI) / 180), cy + rr * Math.sin((deg * Math.PI) / 180)];
  const [x0, y0] = pt(TURN.from);
  const [x1, y1] = pt(TURN.to);
  const [wx, wy] = pt(TURN.from + (TURN.to - TURN.from) * at);
  const arc = `M${f(x0)},${f(y0)} A${r} ${r} 0 1 1 ${f(x1)},${f(y1)}`;
  const sx = 330, sy = 168, sw = 250;
  const wxp = sx + sw * at;

  // dragging the knob: the wiper follows the pointer round (the slider does the same from the keyboard)
  const follow = (e: PointerEvent<SVGGElement>) => {
    const m = svg.current?.getScreenCTM();
    if (!m) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    setPercent(Math.round(turnAt(p.x, p.y) * 100));
  };
  const down = (e: PointerEvent<SVGGElement>) => {
    if (e.button !== 0) return;
    turning.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    follow(e);
  };
  const move = (e: PointerEvent<SVGGElement>) => { if (turning.current) follow(e); };
  const up = () => { turning.current = false; };

  const says = `A potentiometer with its cover off: the knob is turned ${percent} % of the way, leg 2 gets ${v} V of ${num(TRACK_VOLTS, 1)} V; `
    + `${kOhms(low)} between legs 1 and 2, ${kOhms(high)} between legs 2 and 3`;
  return (
    <>
      <svg ref={svg} className="scene lfig" style={{ maxWidth: 640 }} viewBox="-140 0 740 330" role="img" aria-label={says}>
        <g className="lf-knob" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <circle cx={cx} cy={cy} r={r + 26} fill="#2b5fa8" stroke="#1b3f73" strokeWidth={2} />
          <path d={arc} stroke="#2d2a26" strokeWidth={18} fill="none" strokeLinecap="round" />
          <path d={arc} stroke="#4a443d" strokeWidth={12} fill="none" strokeLinecap="round" strokeDasharray="2 3" />
          <circle cx={cx} cy={cy} r={30} fill="#e9ebee" stroke="#9ba2aa" strokeWidth={2} />
          <path d={`M${cx},${cy} L${f(wx)},${f(wy)}`} stroke="#c9a227" strokeWidth={7} strokeLinecap="round" />
          <circle cx={f(wx)} cy={f(wy)} r={7} fill="#e3c25a" stroke="#8a6d12" strokeWidth={1.5} />
          <circle cx={cx} cy={cy} r={6} fill="#8a6d12" />
        </g>
        {/* the three legs out of the bottom */}
        {([[cx - 40, '1'], [cx, '2'], [cx + 40, '3']] as const).map(([lx, n]) => (
          <g key={n}>
            <path d={`M${lx},${cy + r + 22} V${cy + r + 70}`} stroke="#a5abb2" strokeWidth={5} />
            <Label x={lx} y={cy + r + 88} anchor="middle" size={13} weight={800}>{n}</Label>
          </g>
        ))}
        <g className="lf-still">
          <path d={`M${f(x0)},${f(y0)} Q${cx - 60},${cy + r + 10} ${cx - 40},${cy + r + 22}`} stroke="#a5abb2" strokeWidth={3} fill="none" />
          <path d={`M${f(x1)},${f(y1)} Q${cx + 60},${cy + r + 10} ${cx + 40},${cy + r + 22}`} stroke="#a5abb2" strokeWidth={3} fill="none" />
          <path d={`M${cx},${cy} V${cy + r + 22}`} stroke="#c9a227" strokeWidth={3} strokeDasharray="4 3" />
        </g>
        <Callout from={pt(175, r + 4)} to={[18, 30]} text="The track" sub="carbon: it holds back" anchor="end" />
        <Callout from={[wx, wy]} to={[300, 30]} text="The wiper" sub="slides along it as you turn" />
        {/* the track pulled straight, with its volts */}
        <Label x={sx} y={sy - 76} size={14} weight={700}>The track, pulled straight</Label>
        <rect x={sx} y={sy - 9} width={sw} height={18} rx={9} fill="#4a443d" />
        <rect className="lf-dot" x={sx} y={sy - 9} width={f(sw * at)} height={18} rx={9} opacity={0.85} />
        <path d={`M${f(wxp)},${sy - 26} V${sy - 8}`} stroke="#8a6d12" strokeWidth={3} />
        <path d={`M${f(wxp - 7)},${sy - 30} h14 l-7,9 Z`} fill="#e3c25a" stroke="#8a6d12" />
        <Label x={sx} y={sy + 34} size={13} tone="muted">leg 1 · 0 V</Label>
        <Label x={sx + sw} y={sy + 34} anchor="end" size={13} tone="muted">leg 3 · {num(TRACK_VOLTS, 1)} V</Label>
        <Label x={wxp} y={sy - 36} anchor="middle" size={15} weight={800} tone="accent">leg 2: {v} V</Label>
        <Label x={sx} y={sy + 70} size={14} weight={700}>1 ↔ 2: {kOhms(low)}</Label>
        <Label x={sx + sw} y={sy + 70} anchor="end" size={14} weight={700}>2 ↔ 3: {kOhms(high)}</Label>
      </svg>
      <div className="ctl">
        <Slider label="Turn the knob" value={percent} min={0} max={100} step={1} format={(p) => `${p} %`} onChange={setPercent} />
      </div>
      <div className="says" role="status"><Icon name="info" size={14} /><span>{potSays(percent, v)}</span></div>
    </>
  );
}

/** Every picture of Learn's pages, by its name: the whole inside of the page's `.play` box. */
export const FIGURES: Record<string, () => React.JSX.Element> = {
  'led-inside': LedInside,
  'led-connect': LedConnect,
  'pot-inside': PotInside,
  // M8.2: the other basic parts, each in its own file
  'breadboard-inside': BreadboardInside,
  'resistor-inside': ResistorInside,
  'rgb-inside': RgbInside,
  'button-inside': ButtonInside,
  'switch-inside': SwitchInside,
  'ldr-inside': LdrInside,
  'buzzer-inside': BuzzerInside,
  'battery-inside': BatteryInside,
  // M8.3: the big ideas
  'water-loop': WaterLoop,
  'circuit-loop': CircuitLoop,
  'breadboard-circuit': BreadboardCircuit,
  'series-parallel': SeriesParallel,
  'digital-analog': DigitalAnalog,
  'pwm-dimming': PwmDimming,
};
