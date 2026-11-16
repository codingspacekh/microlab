import { useState, type ReactNode } from 'react';
import { LED } from '@lib/circuit';
import { Icon, Slider } from '../../ui';
import { Callout, f, Label, num } from '../fig-kit';
import '../figures.css';

/**
 * Learn's picture of the big idea (M8, design 30d): voltage, current and resistance as water going round a loop of
 * pipe. A pump pushes (the voltage), a narrow place holds back (the resistance), and the water flows round (the
 * current): the flow is the push over the holding back — Ohm's law. Under it, small, the same loop as a circuit. What
 * an LED can take is the simulator's (src/lib/circuit).
 */

// ------------------------------------------------------------------ the numbers
/** The sliders, as approved: the push in volts, the narrowing in ohms. */
const PUSH = { min: 1, max: 9, step: 0.5, start: 3 };
const NARROW = { min: 50, max: 1000, step: 10, start: 150 };
/** The most that can flow: the most push through the widest pipe. */
const MOST_AMPS = PUSH.max / NARROW.min;

const voltsText = (volts: number) => `${num(volts, 1)} V`;
const ohmsText = (ohms: number) => `${ohms} Ω`;
const mA = (amps: number) => num(amps * 1000, 1);
const two = (v: number) => Number(v.toFixed(2));

// ------------------------------------------------------------------ what it says
function waterSays(amps: number): ReactNode {
  const flow = <>Flow (current): <b>{mA(amps)} mA</b>.</>;
  const same = <>The flow is the same all the way round the loop — what goes in comes back.</>;
  return amps > LED.maxA
    ? <>{flow} That is more than an LED can take: {mA(LED.maxA)} mA at most. Push less or narrow the pipe and less flows. {same}</>
    : <>{flow} Push harder and more flows. Narrow the pipe and less flows. {same}</>;
}

const waterLabel = (volts: number, ohms: number, amps: number) =>
  `Water going round a loop of pipe: the pump pushes with ${voltsText(volts)}, the narrow place holds back with ${ohmsText(ohms)}, `
  + `so ${mA(amps)} mA flows, the same all the way round. `
  + `Under it the same loop as a circuit: a battery of ${voltsText(volts)} and a resistor of ${ohmsText(ohms)}.`;

// ------------------------------------------------------------------ the drawing
const WALL = '#9cc3ef', WATER = '#5c9ce6', DARK = '#3a3d42';
/** The loop of pipe, from after the narrow place round — clockwise — to before it. */
const PIPE = 'M300,30 H420 a40,40 0 0 1 40,40 V140 a40,40 0 0 1 -40,40 H80 a40,40 0 0 1 -40,-40 V70 a40,40 0 0 1 40,-40 H200';
/** Where the water's arrows are, and which way each points: clockwise, as the pump pushes. */
const ARROWS: [number, number, number][] = [[130, 30, 0], [375, 30, 0], [460, 105, 90], [360, 180, 180], [140, 180, 180]];
const PUMP = { x: 40, y: 105, r: 30 };
/** The pump's push, drawn as an arrow beside it: its foot, and how long it is for each volt. */
const ARROW = { x: 96, foot: 162, least: 16, perVolt: 10 };
/** The circuit under it. */
const CY = 320, DROP = 60;

/** How wide the narrow place is left: the widest pipe at the least ohms, a slit at the most; each doubling narrows it as much. */
const gapAt = (ohms: number) => two(12 - 10 * (Math.log(ohms / NARROW.min) / Math.log(NARROW.max / NARROW.min)));
/** How thick the flow is drawn: thickest at the most that can flow. */
const thickAt = (amps: number) => two(1.5 + 7 * Math.sqrt(amps / MOST_AMPS));

function WaterDrawing({ volts, ohms, amps }: { volts: number; ohms: number; amps: number }) {
  const gap = gapAt(ohms);
  const thick = thickAt(amps);
  const push = ARROW.least + ARROW.perVolt * volts;
  const top = ARROW.foot - push;
  const half = gap / 2;
  const blade = 8 + 1.4 * volts;                      // the pump's arrow grows with its push
  return (
    <svg
      className="scene lfig" style={{ maxWidth: 620 }} viewBox="-20 -30 580 425" role="img" aria-label={waterLabel(volts, ohms, amps)}
      data-push={f(push)} data-gap={gap} data-flow={thick}
    >
      {/* the loop of pipe: its wall, the water in it */}
      <path d={PIPE} stroke={WALL} strokeWidth={22} fill="none" />
      <path d={PIPE} stroke={WATER} strokeWidth={14} fill="none" />
      {/* the narrow place: the wall closes in, the more ohms the more */}
      <g data-part="narrow">
        <path d={`M200,19 L230,${f(26 - half)} H270 L300,19 V41 L270,${f(34 + half)} H230 L200,41 Z`} fill={WALL} />
        <path d={`M200,23 L230,${f(30 - half)} H270 L300,23 V37 L270,${f(30 + half)} H230 L200,37 Z`} fill={WATER} />
      </g>
      {/* the flow: thicker the more goes round, the same all the way */}
      <path data-part="flow" d={PIPE} stroke="#fff" strokeWidth={thick} strokeDasharray="10 9" fill="none" opacity={0.9} />
      {ARROWS.map(([x, y, turn]) => (
        <path key={`${x},${y}`} d="M-7,-6 L7,0 L-7,6 Z" fill="#fff" stroke={WATER} strokeWidth={1} transform={`translate(${x},${y}) rotate(${turn})`} />
      ))}
      {/* the pump, pushing the water up and round */}
      <g data-part="pump">
        <circle cx={PUMP.x} cy={PUMP.y} r={PUMP.r} fill="#f4f5f7" stroke={DARK} strokeWidth={3} />
        <path d={`M${f(PUMP.x - blade * 0.85)},${f(PUMP.y + blade * 0.6)} L${PUMP.x},${f(PUMP.y - blade * 0.8)} L${f(PUMP.x + blade * 0.85)},${f(PUMP.y + blade * 0.6)} Z`} fill={DARK} />
      </g>
      {/* its push, as an arrow: taller the more volts */}
      <path
        className="lf-dot" data-part="push"
        d={`M${ARROW.x - 4},${ARROW.foot} V${f(top + 12)} H${ARROW.x - 10} L${ARROW.x},${f(top)} L${ARROW.x + 10},${f(top + 12)} H${ARROW.x + 4} V${ARROW.foot} Z`}
      />
      <Label x={ARROW.x + 16} y={ARROW.foot - 2} size={16} weight={800} tone="accent">{voltsText(volts)}</Label>
      <Label x={250} y={64} anchor="middle" size={16} weight={800} tone="accent">{ohmsText(ohms)}</Label>
      <Label x={270} y={116} anchor="middle" size={24} weight={800} tone="accent">{mA(amps)} mA</Label>
      <Label x={270} y={140} anchor="middle" size={13} weight={500} tone="muted">{num(volts, 1)} V ÷ {ohms} Ω</Label>
      <Callout from={[PUMP.x, PUMP.y - PUMP.r]} to={[40, -10]} text="The pump: voltage" sub="how hard it pushes · volts, V" />
      <Callout from={[250, 18]} to={[330, -10]} text="The narrow pipe: resistance" sub="how much it holds back · ohms, Ω" />
      <Callout from={[250, 191]} to={[196, 222]} text="The flow: current" sub="how much goes round · amps, A" />
      {/* the same loop as a circuit */}
      <Label x={250} y={CY - 34} anchor="middle" size={14} weight={700}>The same loop as a circuit</Label>
      <path d={`M80,${CY} H210 M290,${CY} H420 V${CY + DROP} H80 V${CY}`} stroke="#a5abb2" strokeWidth={2.5} fill="none" strokeLinejoin="round" />
      <path data-part="flow" className="lf-flow" d={`M80,${CY + 12} V${CY} H210`} strokeWidth={thick} />
      <path data-part="flow" className="lf-flow" d={`M290,${CY} H420 V${CY + DROP} H80 V${CY + 48}`} strokeWidth={thick} />
      <rect x={210} y={CY - 10} width={80} height={20} rx={9} fill="#e3cb98" stroke="#bfa26e" strokeWidth={1.4} />
      <Label x={250} y={CY + 27} anchor="middle" size={12.5} weight={500} tone="muted">resistor</Label>
      <Label x={250} y={CY + 45} anchor="middle" size={14} weight={800} tone="accent">{ohmsText(ohms)}</Label>
      <rect x={75} y={CY + 6} width={10} height={6} rx={1.5} fill="#c7ccd2" stroke="#8f969f" />
      <rect x={64} y={CY + 12} width={32} height={36} rx={4} fill="#2d3136" stroke="#15181b" />
      <rect x={64} y={CY + 12} width={32} height={12} rx={4} fill="#e8b10f" />
      <Label x={56} y={CY + 24} anchor="end" size={15} weight={800} tone="plus">+</Label>
      <Label x={56} y={CY + 48} anchor="end" size={15} weight={800}>−</Label>
      <Label x={106} y={CY + 27} size={12.5} weight={500} tone="muted">battery</Label>
      <Label x={106} y={CY + 45} size={14} weight={800} tone="accent">{voltsText(volts)}</Label>
      <Label x={408} y={CY + 35} anchor="end" size={14} weight={800} tone="accent">{mA(amps)} mA</Label>
    </svg>
  );
}

export function WaterLoop() {
  const [volts, setVolts] = useState(PUSH.start);
  const [ohms, setOhms] = useState(NARROW.start);
  const amps = volts / ohms;
  return (
    <>
      <WaterDrawing volts={volts} ohms={ohms} amps={amps} />
      <div className="ctl">
        <Slider label="Push (voltage)" value={volts} min={PUSH.min} max={PUSH.max} step={PUSH.step} format={voltsText} onChange={setVolts} />
      </div>
      <div className="ctl">
        <Slider label="Narrowing (resistance)" value={ohms} min={NARROW.min} max={NARROW.max} step={NARROW.step} format={ohmsText} onChange={setOhms} />
      </div>
      <div className="says" role="status"><Icon name="info" size={14} /><span>{waterSays(amps)}</span></div>
    </>
  );
}
