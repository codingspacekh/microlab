import { useState, type KeyboardEvent, type PointerEvent, type SVGProps } from 'react';
import { MODELS, type Device } from '@lib/circuit';
import { Icon } from '../../ui';
import { Callout, f, Label, RedGlow, SmallLed, useDefId } from '../fig-kit';
import '../figures.css';

/**
 * Learn's picture of the push button (M8): a 12 mm button cut open, from the side — the cap, the springy dome under
 * it, the two contacts, the four legs in two pairs — and from above. Held, the dome comes down on both contacts and
 * the loop closes; let go, it springs back. Which legs are joined, and when, is the simulator's model.
 */

// ------------------------------------------------------------------ the simulator's button
type SwitchDevice = Extract<Device, { kind: 'switch' }>;

const BUTTON = MODELS.button!;
/** The legs joined inside, always: 1a–1b and 2a–2b. */
const PAIRS: string[][] = (BUTTON.internal ?? []).map((pair) => [...pair]);
/** What pressing closes: a switch from a leg of one pair to a leg of the other. */
const PRESS = BUTTON.devices({ id: 'button', leg: (name) => name, props: {} })
  .find((d): d is SwitchDevice => d.kind === 'switch' && d.closedWhen === 'pressed');

/** The groups of legs that are one piece of metal now. */
function joinedLegs(pressed: boolean): string[][] {
  if (!pressed || !PRESS) return PAIRS;
  const bridged = PAIRS.filter((pair) => pair.includes(PRESS.a) || pair.includes(PRESS.b));
  return [bridged.flat(), ...PAIRS.filter((pair) => !bridged.includes(pair))];
}

/** "Legs 1a and 1b are always joined, and so are legs 2a and 2b". */
const PAIRS_SAY = PAIRS.map((pair, i) => `${i ? 'and so are legs' : 'Legs'} ${pair.join(' and ')}${i ? '' : ' are always joined'}`).join(', ');

function label(pressed: boolean): string {
  const now = pressed
    ? 'pressed, the dome touches both contacts, the loop is closed and the LED is lit'
    : 'not pressed, the dome is up, there is a gap between the two contacts and the LED is dark';
  return `A push button cut open: ${now}. ${PAIRS_SAY}; the two pairs join only while it is pressed`;
}

// ------------------------------------------------------------------ the drawing
const METAL = '#a5abb2';
const METAL_BACK = '#c7ccd2';
const GOLD = '#c9a227';

/** The side view: its middle, where the dome's feet rest, how far the cap travels. */
const SIDE = { cx: 170, feet: 188, travel: 17 };
/** The view from above: its middle, and each leg's corner (the part's own art: a-legs on one edge, b-legs opposite). */
const TOP = { cx: 525, cy: 150 };
const CORNER: Record<string, [number, number]> = { '1a': [-1, -1], '2a': [1, -1], '1b': [-1, 1], '2b': [1, 1] };
const corner = (leg: string): [number, number] => CORNER[leg] ?? [0, 0];

function SideView({ pressed, glow, arrow, hold }: { pressed: boolean; glow: string; arrow: string; hold: SVGProps<SVGGElement> }) {
  const { cx, feet } = SIDE;
  const d = pressed ? SIDE.travel : 0;
  const rise = pressed ? 10 : 44;                    // the dome's curve: nearly flat when pressed
  const domeAt = (dx: number) => {                   // the dome's height above a point dx from its middle
    const t = (dx + 62) / 124;
    return feet - 2 * t * (1 - t) * rise;
  };
  const [left, right] = [PAIRS[0] ?? [], PAIRS[1] ?? []];
  // each pair from the side: the b-leg in front, the a-leg behind it
  const sides = [
    { pair: left, pad: cx - 30, front: cx - 74, back: cx - 60, anchor: 'start' as const },
    { pair: right, pad: cx + 30, front: cx + 74, back: cx + 60, anchor: 'end' as const },
  ];
  return (
    <>
      {/* the loop outside: + to the first pair; the second pair to a small LED and on to − */}
      <path d={`M${cx - 74},290 V322 H${cx - 110}`} stroke={METAL} strokeWidth={2} fill="none" />
      <Label x={cx - 120} y={327} anchor="end" size={16} weight={800} tone="plus">+</Label>
      <path d={`M${cx + 74},290 V322 H${cx + 130}`} stroke={METAL} strokeWidth={2} fill="none" />
      <path d={`M${cx + 146},322 H${cx + 180}`} stroke={METAL} strokeWidth={2} fill="none" />
      <Label x={cx + 188} y={327} size={16} weight={800}>−</Label>
      <g data-led={pressed ? 'on' : 'off'}>
        <SmallLed a={[cx + 130, 322]} k={[cx + 146, 322]} state={pressed ? 'on' : 'off'} glow={glow} />
      </g>
      <g className="lf-knob" {...hold}>
        {/* the case, cut open: its floor, its walls, its lid with the hole the cap comes through */}
        <rect x={cx - 90} y={118} width={180} height={98} rx={5} fill="#3a3f46" fillOpacity={0.16} stroke="#2d3136" strokeWidth={2} />
        <rect x={cx - 90} y={feet + 2} width={180} height={26} rx={3} fill="#2d3136" />
        <rect x={cx - 90} y={114} width={52} height={9} rx={2} fill="#8f969f" />
        <rect x={cx + 38} y={114} width={52} height={9} rx={2} fill="#8f969f" />
        {/* each pair is one piece of metal: its contact, the strip through the floor, its two legs */}
        {sides.map(({ pair, pad, front, back, anchor }) => (
          <g key={pair.join('+')}>
            <path d={`M${back},${feet + 14} V276`} stroke={METAL_BACK} strokeWidth={5} fill="none" />
            <path d={`M${pad},${feet} V${feet + 14} H${front} V290`} stroke={METAL} strokeWidth={6} fill="none" strokeLinejoin="round" />
            <rect x={pad - 12} y={feet - 4} width={24} height={8} rx={2} fill={GOLD} stroke="#8a6d12" />
            <Label x={front + (anchor === 'start' ? 8 : -8)} y={296} anchor={anchor} size={13} weight={800}>{pair[1]}</Label>
            <Label x={back + (anchor === 'start' ? 8 : -8)} y={270} anchor={anchor} size={13} weight={800}>{pair[0]}</Label>
          </g>
        ))}
        {/* the dome: its rim rests on the floor, its middle hangs over the contacts until it is pressed */}
        <path d={`M${cx - 62},${feet} Q${cx},${feet - rise} ${cx + 62},${feet}`} stroke="#6f7780" strokeWidth={6} fill="none" strokeLinecap="round" />
        <path d={`M${cx - 62},${feet} Q${cx},${feet - rise} ${cx + 62},${feet}`} stroke="#dfe3e8" strokeWidth={3.4} fill="none" strokeLinecap="round" />
        {/* the cap and its stem */}
        <g transform={`translate(0,${d})`}>
          <rect x={cx - 22} y={96} width={44} height={69} rx={3} fill="#4a5059" stroke="#2d3136" />
          <rect x={cx - 42} y={66} width={84} height={34} rx={8} fill="#f2b705" stroke="#b8860b" strokeWidth={2} />
          <path d={`M${cx - 30},74 H${cx + 30}`} stroke="#fff" strokeWidth={3} strokeLinecap="round" opacity={0.55} />
        </g>
      </g>
      {/* the current's way: in at one pair, over the dome, out at the other, through the LED */}
      {pressed && (
        <path
          className="lf-flow"
          d={`M${cx - 106},314 H${cx - 84} V${feet + 6} H${cx - 40} V${feet - 12} H${cx + 40} V${feet + 6} H${cx + 84} V314 H${cx + 122}`}
          strokeWidth={2.4}
          strokeLinejoin="round"
          markerEnd={`url(#${arrow})`}
        />
      )}
      <Callout from={[cx + 34, 80 + d]} to={[cx + 112, 52]} text="The cap" sub="press here" />
      <Callout from={[cx + 44, f(domeAt(44)) - 2]} to={[cx + 112, 150]} text="Metal dome" sub="springy: it pops back up" />
      <Callout from={[cx - 30, feet - 2]} to={[cx - 112, 150]} text="Two contacts" sub={pressed ? 'the dome joins them' : 'a gap between them'} anchor="end" />
      <Callout from={[cx - 68, feet + 14]} to={[cx - 112, 232]} text="A pair of legs" sub="joined inside, always" anchor="end" />
    </>
  );
}

/** From above: the four legs at the corners, each pair joined by its strip, and the dome's place between the pairs. */
function TopView({ pressed }: { pressed: boolean }) {
  const { cx, cy } = TOP;
  const at = (leg: string): [number, number] => [cx + corner(leg)[0] * 34, cy + corner(leg)[1] * 66];
  const strips = PAIRS.map((pair) => ({ pair, from: at(pair[0] ?? ''), to: at(pair[1] ?? '') }));
  const [x1, x2] = [strips[0]?.from[0] ?? cx, strips[1]?.from[0] ?? cx];
  return (
    <>
      <Label x={cx} y={52} anchor="middle" size={14} weight={700}>From above</Label>
      {BUTTON.legs.map((leg) => {
        const [x, y] = at(leg);
        const up = corner(leg)[1] < 0;
        return (
          <g key={leg}>
            <rect x={x - 4} y={up ? y - 2 : y - 22} width={8} height={24} rx={1.5} fill={METAL} />
            <Label x={x} y={up ? y - 8 : y + 16} anchor="middle" size={13} weight={800}>{leg}</Label>
          </g>
        );
      })}
      <rect x={cx - 56} y={cy - 56} width={112} height={112} rx={8} fill="#2d3136" stroke="#15181b" strokeWidth={2} />
      <circle cx={cx} cy={cy} r={31} fill="#f2b705" fillOpacity={pressed ? 0.5 : 0.3} stroke="#b8860b" strokeWidth={2} />
      {/* always joined: each pair's strip, from leg to leg */}
      {strips.map(({ pair, from, to }) => (
        <rect key={pair.join('+')} data-always={pair.join('+')} className="lf-dot" x={from[0] - 3} y={Math.min(from[1], to[1]) + 20} width={6} height={Math.abs(to[1] - from[1]) - 40} rx={3} />
      ))}
      {/* joined only while pressed: pair to pair, through the dome */}
      <g data-when-pressed={pressed ? 'closed' : 'open'}>
        {pressed
          ? <rect className="lf-dot" x={x1} y={cy - 3} width={x2 - x1} height={6} rx={3} />
          : (
            <>
              <rect x={x1} y={cy - 3} width={20} height={6} rx={3} fill={METAL_BACK} />
              <rect x={x2 - 20} y={cy - 3} width={20} height={6} rx={3} fill={METAL_BACK} />
            </>
          )}
      </g>
      {PAIRS.map((pair, i) => (
        <Label key={pair.join('+')} x={cx} y={262 + i * 17} anchor="middle" size={12.5} weight={500} tone="muted">{pair.join(' and ')}: joined always</Label>
      ))}
      <Label x={cx} y={262 + PAIRS.length * 17 + 6} anchor="middle" size={13} weight={700} tone={pressed ? 'accent' : 'ink'}>
        {pressed ? 'Pressed: the pairs are joined' : 'Pair to pair: only while pressed'}
      </Label>
    </>
  );
}

const PRESS_KEYS = [' ', 'Enter'];

export function ButtonInside() {
  const id = useDefId();
  const [pressed, setPressed] = useState(false);
  const press = () => setPressed(true);
  const letGo = () => setPressed(false);
  const down = (e: PointerEvent) => { if (!(e.button > 0)) press(); };       // not the right or the middle button
  const keyDown = (e: KeyboardEvent) => { if (PRESS_KEYS.includes(e.key) && !e.repeat) press(); };
  const keyUp = (e: KeyboardEvent) => { if (PRESS_KEYS.includes(e.key)) letGo(); };
  return (
    <>
      <svg
        className="scene lfig" style={{ maxWidth: 680 }} viewBox="-120 20 760 365" role="img" aria-label={label(pressed)}
        data-pressed={pressed} data-joined={joinedLegs(pressed).map((legs) => legs.join('+')).join(' ')}
      >
        <defs>
          <RedGlow id={`${id}g`} />
          <marker id={`${id}a`} viewBox="0 0 10 10" refX={6} refY={5} markerWidth={5} markerHeight={5} orient="auto">
            <path className="lf-dot" d="M0,0 L10,5 L0,10 Z" />
          </marker>
        </defs>
        <SideView pressed={pressed} glow={`${id}g`} arrow={`${id}a`} hold={{ onPointerDown: down, onPointerUp: letGo, onPointerLeave: letGo, onPointerCancel: letGo }} />
        <TopView pressed={pressed} />
      </svg>
      <div className="ctl">
        <button
          type="button" className="btn" aria-pressed={pressed}
          onPointerDown={down} onPointerUp={letGo} onPointerLeave={letGo} onPointerCancel={letGo}
          onKeyDown={keyDown} onKeyUp={keyUp} onBlur={letGo}
        >
          Press the button
        </button>
      </div>
      <div className="says" role="status">
        <Icon name="info" size={14} />
        <span>
          {pressed
            ? <><b>Pressed:</b> the dome touches both contacts, the loop is closed and the current flows.</>
            : <><b>Let go:</b> the dome springs up. There is a gap, so no current flows. Press and hold to close it.</>}
        </span>
      </div>
    </>
  );
}
