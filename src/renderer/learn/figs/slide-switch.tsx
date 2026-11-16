import { useRef, useState, type PointerEvent } from 'react';
import { MODELS, type Device } from '@lib/circuit';
import { Icon, Segmented } from '../../ui';
import { Callout, Label, RedGlow, SmallLed, useDefId } from '../fig-kit';
import '../figures.css';

/**
 * Learn's picture of the slide switch (M8): cut open — the knob, the small metal bridge riding under it, three legs
 * in a row. Slid left the bridge joins the middle leg to the left leg, slid right to the right leg; a small LED on
 * each outer leg shows which way out is live. Which legs are joined in which position is the simulator's model.
 */

// ------------------------------------------------------------------ the simulator's slide switch
type SwitchDevice = Extract<Device, { kind: 'switch' }>;
type Side = 'left' | 'right';

/** The simulator's position of the knob: 0 at leg 1's end, 1 at leg 3's. */
const POSITION: Record<Side, number> = { left: 0, right: 1 };
const OTHER: Record<Side, Side> = { left: 'right', right: 'left' };

const SWITCH = MODELS['slide-switch']!;
/** The switch's two ways through, each closed in one position. */
const WAYS = SWITCH.devices({ id: 'switch', leg: (name) => name, props: {} })
  .filter((d): d is SwitchDevice => d.kind === 'switch');
/** The leg that is always in: the one both ways start from (leg 2, the middle one). */
const COMMON = WAYS[0]?.a ?? '2';

/** The outer leg the common leg is joined to with the knob slid to `side`. */
function outerLeg(side: Side): string {
  const way = WAYS.find((d) => d.closedWhen === POSITION[side]);
  return way ? (way.a === COMMON ? way.b : way.a) : '';
}

// ------------------------------------------------------------------ the drawing
const METAL = '#a5abb2';
const CX = 200;
const LEG_GAP = 60;
/** Where each leg stands, in the model's order: 1, 2, 3 from the left. */
const legX = (leg: string) => CX + (SWITCH.legs.indexOf(leg) - (SWITCH.legs.length - 1) / 2) * LEG_GAP;
/** Which side of the picture a leg is on. */
const sideOf = (leg: string): Side => (legX(leg) < CX ? 'left' : 'right');

export function SwitchInside() {
  const id = useDefId();
  const [side, setSide] = useState<Side>('left');
  const svg = useRef<SVGSVGElement>(null);
  const grab = useRef<{ x: number; dragged: boolean } | null>(null);

  const outer = outerLeg(side);
  const live = [COMMON, outer];
  const lit = sideOf(outer);                          // the LED on the joined outer leg
  const at = (legX(COMMON) + legX(outer)) / 2;        // the bridge's middle, and the knob's above it
  const shift = `translate(${at - CX},0)`;

  // the knob in the drawing: a click slides it over, a drag takes it to the pointer's side
  const down = (e: PointerEvent<SVGGElement>) => {
    if (e.button > 0) return;
    grab.current = { x: e.clientX, dragged: false };
    if ('setPointerCapture' in e.currentTarget) e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<SVGGElement>) => {
    const held = grab.current;
    if (!held || (!held.dragged && Math.abs(e.clientX - held.x) < 4)) return;
    held.dragged = true;
    const m = svg.current?.getScreenCTM();
    if (!m) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    setSide(p.x < CX ? 'left' : 'right');
  };
  const click = () => {
    const dragged = grab.current?.dragged;
    grab.current = null;
    if (!dragged) setSide(OTHER[side]);               // a drag has already put it where it was let go
  };
  const cancel = () => { grab.current = null; };

  const says = `A slide switch cut open: slid ${side}, the metal bridge joins leg ${COMMON}, the middle leg, to leg ${outer}; `
    + `the ${lit} LED is lit, the ${OTHER[lit]} LED is dark`;
  const body = { x: CX - 100, y: 130, w: 200, h: 80 };
  const contact = 184;                                // the top of the legs' contacts, inside
  const foot = 250;                                   // the legs' ends
  return (
    <>
      <svg
        ref={svg} className="scene lfig" style={{ maxWidth: 560 }} viewBox="-60 36 560 324" role="img" aria-label={says}
        data-side={side} data-joined={[...live].sort().join('+')}
      >
        <defs><RedGlow id={`${id}g`} /></defs>
        {/* the case, cut open, with the slot the knob slides in */}
        <rect x={body.x} y={body.y} width={body.w} height={body.h} rx={6} fill="#2d3136" stroke="#15181b" strokeWidth={2} />
        <rect x={body.x + 10} y={body.y + 10} width={body.w - 20} height={body.h - 26} rx={3} fill="#5b626b" />
        <rect x={CX - 56} y={body.y - 2} width={112} height={14} fill="#5b626b" />
        {/* the three legs, each with its contact inside; the joined ones in the accent colour */}
        {SWITCH.legs.map((leg) => {
          const x = legX(leg);
          const on = live.includes(leg);
          return (
            <g key={leg} data-leg={leg} data-live={on}>
              <rect className={on ? 'lf-dot' : undefined} fill={METAL} x={x - 3.5} y={contact} width={7} height={foot - contact} rx={1.5} />
              <rect className={on ? 'lf-dot' : undefined} fill={METAL} x={x - 10} y={contact} width={20} height={7} rx={2} />
              <Label x={x + 9} y={foot - 8} size={14} weight={800} tone={on ? 'accent' : 'ink'}>{leg}</Label>
            </g>
          );
        })}
        {/* the bridge: one piece of metal, on two of the three contacts */}
        <g data-part="bridge" transform={shift}>
          <path d={`M${CX - 30},${contact - 2} V${contact - 16} H${CX + 30} V${contact - 2}`} stroke="#8a6d12" strokeWidth={9} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          <path d={`M${CX - 30},${contact - 2} V${contact - 16} H${CX + 30} V${contact - 2}`} stroke="#e3c25a" strokeWidth={6} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        </g>
        {/* the knob, its stem down to the bridge */}
        <g className="lf-knob" data-part="knob" transform={shift} onPointerDown={down} onPointerMove={move} onPointerCancel={cancel} onClick={click}>
          <rect x={CX - 8} y={body.y - 6} width={16} height={contact - 16 - body.y + 4} fill="#cfd3d8" stroke="#9ba2aa" />
          <rect x={CX - 26} y={84} width={52} height={44} rx={5} fill="#e9ebee" stroke="#9ba2aa" strokeWidth={2} />
          {[-12, 0, 12].map((dx) => <path key={dx} d={`M${CX + dx},92 V120`} stroke="#9ba2aa" strokeWidth={2.4} strokeLinecap="round" />)}
        </g>
        {/* the way in at the middle leg; a way out, with its LED, at each outer leg */}
        <path d={`M${legX(COMMON)},${foot} V298`} stroke={METAL} strokeWidth={2} fill="none" />
        <Label x={legX(COMMON)} y={318} anchor="middle" size={16} weight={800} tone="plus">+</Label>
        <Label x={legX(COMMON)} y={340} anchor="middle" size={12.5} weight={500} tone="muted">the middle leg: always in</Label>
        {SWITCH.legs.filter((leg) => leg !== COMMON).map((leg) => {
          const x = legX(leg);
          const out = sideOf(leg) === 'left' ? -1 : 1;
          const on = leg === outer;
          const wire = `M${x},${foot} V270 H${x + out * 90}`;
          const mid = x + out * 98;                    // the LED's middle; on the left it is drawn mirrored
          return (
            <g key={leg}>
              <path d={wire} stroke={METAL} strokeWidth={2} fill="none" />
              {on && <path className="lf-flow" d={wire} strokeWidth={2.6} />}
              <path d={`M${x + out * 106},270 H${x + out * 132}`} stroke={METAL} strokeWidth={2} fill="none" />
              <Label x={x + out * 142} y={275} anchor="middle" size={16} weight={800}>−</Label>
              <g data-led={leg} data-lit={on ? 'on' : 'off'} transform={out < 0 ? `translate(${2 * mid},0) scale(-1,1)` : undefined}>
                <SmallLed a={[mid - 8, 270]} k={[mid + 8, 270]} state={on ? 'on' : 'off'} glow={`${id}g`} />
              </g>
            </g>
          );
        })}
        <Callout from={[at + 20, 98]} to={[CX + 130, 62]} text="The knob" sub="slide it" />
        <Callout from={[at + 24, contact - 16]} to={[CX + 130, 112]} text="Metal bridge" sub="rides under the knob" />
        <Callout from={[CX + LEG_GAP + 4, 224]} to={[CX + 130, 162]} text="Three legs" sub="in a row: 1, 2, 3" />
      </svg>
      <div className="ctl">
        <Segmented<Side> label="Slide it" options={[{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }]} value={side} onChange={setSide} />
      </div>
      <div className="says" role="status">
        <Icon name="info" size={14} />
        <span>
          <b>Slid {side}:</b> the bridge joins the middle leg to the {lit} leg. The current goes out that way, so the {lit} LED is lit.
          {' '}The {OTHER[lit]} leg is left out.
        </span>
      </div>
    </>
  );
}
