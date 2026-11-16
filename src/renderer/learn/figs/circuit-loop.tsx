import { useState, type ReactNode } from 'react';
import { BATTERIES, LED, LED_COLORS } from '@lib/circuit';
import { stepE12 } from '@lib/units';
import { Icon, Switch } from '../../ui';
import { f, Label, num, RedGlow, SmallLed, useDefId, Wire } from '../fig-kit';
import '../figures.css';

/**
 * Learn's picture of the big idea (M8): a circuit is a loop — open it anywhere and everything stops. A battery, switch
 * A, a resistor, an LED, switch B and a wire that can be pulled out, one after the other all the way round. With every
 * one closed the current is drawn all round and the LED is lit; with any one open no current is drawn anywhere — not
 * even up to the gap. Every number is the simulator's (src/lib/circuit) or the E12 series' (src/lib/units).
 */

// ------------------------------------------------------------------ the simulator's numbers
/** The battery: a pack of two cells. */
const VOLTS = BATTERIES['2xAA']!.volts;
/** What is left of its volts after the red LED's pushes the current through the resistor. */
const PUSH = VOLTS - LED_COLORS.red!.vf;
/** The resistor: the next common value (E12) above the one for an LED's best current, three quarters of its rated. */
const OHMS = stepE12(PUSH / (LED.ratedA * 0.75), 1);
const AMPS = PUSH / OHMS;
const MA = num(AMPS * 1000, 1);

// ------------------------------------------------------------------ the three places the loop can be opened
type Break = 'a' | 'b' | 'wire';
const BREAKS: Break[] = ['a', 'b', 'wire'];
type Closed = Record<Break, boolean>;

/** Each one's control, and how it is said open — at the start of a sentence, inside one, and in the picture's name. */
const CONTROL: Record<Break, string> = { a: 'Switch A closed', b: 'Switch B closed', wire: 'The wire is in' };

/** "Switch A is open", "Switch A and switch B are open and the wire is pulled out". */
function openInWords(open: Break[]): string {
  const switches = open.filter((b) => b !== 'wire').map((b) => `switch ${b.toUpperCase()}`);
  const parts: string[] = [];
  if (switches.length) parts.push(`${switches.join(' and ')} ${switches.length > 1 ? 'are' : 'is'} open`);
  if (open.includes('wire')) parts.push('the wire is pulled out');
  const text = parts.join(' and ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function loopSays(open: Break[]): ReactNode {
  if (open.length === 0) return <>The loop is closed all the way round: the current flows — <b>{MA} mA</b> — and the LED is lit.</>;
  if (open.length === 1) return <><b>{openInWords(open)}.</b> There is a gap in the loop, so the current stops everywhere — not just after the gap. The LED is dark.</>;
  return <><b>{openInWords(open)}.</b> There are {open.length} gaps in the loop. One gap is enough to stop the current everywhere: close every gap to light the LED.</>;
}

function loopLabel(closed: Closed, open: Break[]): string {
  const loop = `A loop of wire: a battery of ${num(VOLTS, 1)} V, switch A ${closed.a ? 'closed' : 'open'}, a resistor of ${OHMS} Ω, an LED, `
    + `switch B ${closed.b ? 'closed' : 'open'}, and a wire ${closed.wire ? 'pushed in' : 'pulled out'}, back to the battery. `;
  if (open.length === 0) return `${loop}The loop is closed all the way round: ${MA} mA flows and the LED is lit.`;
  return `${loop}The loop has ${open.length === 1 ? 'a gap' : `${open.length} gaps`}: no current flows anywhere and the LED is dark.`;
}

// ------------------------------------------------------------------ the drawing
const METAL = '#a5abb2';
/** The loop's corners: the battery on the left, switch A and the resistor along the top, the LED on the right, switch B
 *  and the wire along the bottom. The current goes round clockwise, from the battery's + back to its −. */
const TOP = 70, BOTTOM = 260, LEFT = 70, FAR = 540;
const SW_A = { x: 170, y: TOP }, SW_B = { x: 410, y: BOTTOM };
const REACH = 24;                                     // from a switch's middle to each of its two contacts
const RES = { cx: 310, half: 40, lead: 18 };
const LED_AT = { x: 460, y: 128, scale: 1.6 };
const LEG = 8 * LED_AT.scale;
const POSTS = { from: 170, to: 260 };                 // the two holes the wire joins

/** A switch in the loop: two contacts and a lever — down across them, or lifted off the second one. */
function DrawnSwitch({ which, at, closed, onToggle }: { which: Break; at: { x: number; y: number }; closed: boolean; onToggle: () => void }) {
  const x0 = at.x - REACH, x1 = at.x + REACH;
  return (
    <g data-break={which} data-open={!closed} style={{ cursor: 'pointer' }} onClick={onToggle}>
      <rect x={x0 - 12} y={at.y - 38} width={2 * REACH + 24} height={52} fill="transparent" />
      <path
        d={`M${x0},${at.y} H${x1 + 2}`} stroke="#5b626b" strokeWidth={5} strokeLinecap="round"
        transform={closed ? undefined : `rotate(-32 ${x0} ${at.y})`}
      />
      <circle cx={x0} cy={at.y} r={5} fill="#e9ebee" stroke="#5b626b" strokeWidth={2} />
      <circle cx={x1} cy={at.y} r={5} fill="#e9ebee" stroke="#5b626b" strokeWidth={2} />
    </g>
  );
}

function LoopDrawing({ closed, open, toggle }: { closed: Closed; open: Break[]; toggle: (which: Break) => void }) {
  const id = useDefId();
  const flows = open.length === 0;
  const a = LED_AT.x - LEG, k = LED_AT.x + LEG;
  const r0 = RES.cx - RES.half - RES.lead, r1 = RES.cx + RES.half + RES.lead;
  /** The wires, in the order the current would take them; the switches and the pulled wire sit in the spaces between. */
  const wires = [
    `M${LEFT},120 V${TOP} H${SW_A.x - REACH}`,
    `M${SW_A.x + REACH},${TOP} H${r0}`,
    `M${r1},${TOP} H${f(a)} V${LED_AT.y}`,
    `M${f(k)},${LED_AT.y} V106 H${FAR} V${BOTTOM} H${SW_B.x + REACH}`,
    `M${SW_B.x - REACH},${BOTTOM} H${POSTS.to}`,
    `M${POSTS.from},${BOTTOM} H${LEFT} V220`,
  ];
  /** The current's way: all round, through the switches and the wire. */
  const way = [
    `M${LEFT},120 V${TOP} H${r0}`,
    `M${r1},${TOP} H${f(a)} V${LED_AT.y}`,
    `M${f(k)},${LED_AT.y} V106 H${FAR} V${BOTTOM} H${LEFT} V220`,
  ];
  const arrows = [`M${r1},${TOP} H${r1 + 34}`, `M${FAR},180 V200`, `M${SW_B.x - REACH - 10},${BOTTOM} H${SW_B.x - REACH - 40}`, `M${LEFT},${BOTTOM} V232`];
  return (
    <svg
      className="scene lfig" style={{ maxWidth: 660 }} viewBox="0 0 600 320" role="img" aria-label={loopLabel(closed, open)}
      data-loop={flows ? 'closed' : 'open'}
    >
      <defs>
        <RedGlow id={`${id}g`} />
        <marker id={`${id}a`} viewBox="0 0 10 10" refX={6} refY={5} markerUnits="userSpaceOnUse" markerWidth={13} markerHeight={13} orient="auto">
          <path className="lf-dot" d="M0,0 L10,5 L0,10 Z" />
        </marker>
      </defs>
      {wires.map((d) => <path key={d} d={d} stroke={METAL} strokeWidth={2.4} fill="none" strokeLinejoin="round" />)}
      {/* the battery */}
      <rect x={LEFT - 6} y={112} width={12} height={8} rx={2} fill="#c7ccd2" stroke="#8f969f" />
      <rect x={LEFT - 34} y={120} width={68} height={100} rx={7} fill="#2d3136" stroke="#15181b" />
      <rect x={LEFT - 34} y={120} width={68} height={30} rx={7} fill="#e8b10f" />
      <text x={LEFT} y={141} fontSize={18} fontWeight={800} fill="#15171a" textAnchor="middle">+</text>
      <text x={LEFT} y={210} fontSize={18} fontWeight={800} fill="#cfd3d8" textAnchor="middle">−</text>
      <Label x={LEFT + 44} y={166} size={14} weight={700}>Battery</Label>
      <Label x={LEFT + 44} y={184} size={13} weight={600} tone="muted">{num(VOLTS, 1)} V</Label>
      {/* the resistor */}
      <path d={`M${r0},${TOP} H${r1}`} stroke={METAL} strokeWidth={4} />
      <rect x={RES.cx - RES.half} y={TOP - 14} width={2 * RES.half} height={28} rx={13} fill="#e3cb98" stroke="#bfa26e" strokeWidth={1.4} />
      <Label x={RES.cx} y={TOP - 38} anchor="middle" size={14} weight={700}>Resistor</Label>
      <Label x={RES.cx} y={TOP - 22} anchor="middle" size={13} weight={600} tone="muted">{OHMS} Ω</Label>
      {/* the wire that can be pulled out: in its two holes, or one end lifted away */}
      <g data-break="wire" data-open={!closed.wire} style={{ cursor: 'pointer' }} onClick={() => toggle('wire')}>
        <rect x={POSTS.from - 12} y={BOTTOM - 46} width={POSTS.to - POSTS.from + 24} height={60} fill="transparent" />
        <circle cx={POSTS.from} cy={BOTTOM} r={5} fill="#e9ebee" stroke="#5b626b" strokeWidth={2} />
        <circle cx={POSTS.to} cy={BOTTOM} r={5} fill="#e9ebee" stroke="#5b626b" strokeWidth={2} />
        {closed.wire
          ? <Wire d={`M${POSTS.from},${BOTTOM} H${POSTS.to}`} ends={[[POSTS.from, BOTTOM], [POSTS.to, BOTTOM]]} colour="red" />
          : <Wire d={`M${POSTS.from},${BOTTOM} C${POSTS.from + 30},${BOTTOM} ${POSTS.from + 30},${BOTTOM - 36} ${POSTS.to - 28},${BOTTOM - 34}`} ends={[[POSTS.from, BOTTOM], [POSTS.to - 28, BOTTOM - 34]]} colour="red" />}
      </g>
      <DrawnSwitch which="a" at={SW_A} closed={closed.a} onToggle={() => toggle('a')} />
      <DrawnSwitch which="b" at={SW_B} closed={closed.b} onToggle={() => toggle('b')} />
      {/* the current: all the way round, or nowhere at all */}
      {flows && way.map((d) => <path key={d} className="lf-flow lf-still" d={d} strokeWidth={3.4} />)}
      {flows && arrows.map((d) => <path key={d} className="lf-still" d={d} stroke="none" fill="none" markerEnd={`url(#${id}a)`} />)}
      {/* the LED */}
      <g data-led={flows ? 'on' : 'off'} transform={`translate(${LED_AT.x},${LED_AT.y}) scale(${LED_AT.scale})`}>
        <SmallLed a={[-8, 0]} k={[8, 0]} state={flows ? 'on' : 'off'} glow={`${id}g`} />
      </g>
      <Label x={LED_AT.x} y={212} anchor="middle" size={14} weight={700}>LED</Label>
      <Label x={SW_A.x} y={TOP - 38} anchor="middle" size={14} weight={700}>Switch A</Label>
      <Label x={SW_A.x} y={TOP + 26} anchor="middle" size={13} weight={600} tone={closed.a ? 'muted' : 'plus'}>{closed.a ? 'closed' : 'open'}</Label>
      <Label x={SW_B.x} y={BOTTOM + 26} anchor="middle" size={14} weight={700}>Switch B</Label>
      <Label x={SW_B.x} y={BOTTOM + 43} anchor="middle" size={13} weight={600} tone={closed.b ? 'muted' : 'plus'}>{closed.b ? 'closed' : 'open'}</Label>
      <Label x={(POSTS.from + POSTS.to) / 2} y={BOTTOM + 26} anchor="middle" size={14} weight={700}>The wire</Label>
      <Label x={(POSTS.from + POSTS.to) / 2} y={BOTTOM + 43} anchor="middle" size={13} weight={600} tone={closed.wire ? 'muted' : 'plus'}>{closed.wire ? 'in' : 'pulled out'}</Label>
      <Label x={290} y={160} anchor="middle" size={22} weight={800} tone={flows ? 'accent' : 'ink'}>{flows ? MA : '0'} mA</Label>
      <Label x={290} y={182} anchor="middle" size={13} weight={500} tone="muted">{flows ? 'the same current all round the loop' : 'a gap: no current anywhere'}</Label>
    </svg>
  );
}

export function CircuitLoop() {
  const [closed, setClosed] = useState<Closed>({ a: true, b: true, wire: true });
  const open = BREAKS.filter((b) => !closed[b]);
  const set = (which: Break, to: boolean) => setClosed((now) => ({ ...now, [which]: to }));
  const toggle = (which: Break) => setClosed((now) => ({ ...now, [which]: !now[which] }));
  return (
    <>
      <LoopDrawing closed={closed} open={open} toggle={toggle} />
      {BREAKS.map((which) => (
        <div className="ctl" key={which}>
          <Switch label={CONTROL[which]} value={closed[which]} onChange={(to) => set(which, to)} />
        </div>
      ))}
      <div className="says" role="status"><Icon name="info" size={14} /><span>{loopSays(open)}</span></div>
    </>
  );
}
