import { useState, type ReactNode } from 'react';
import { LED, RGB_DIES } from '@lib/circuit';
import { Icon, Slider } from '../../ui';
import { Callout, f, Label, num, useDefId } from '../fig-kit';
import '../figures.css';

/**
 * Learn's picture of the RGB LED (M8): a clear LED cut open — three tiny chips side by side in one cup, each with its
 * own leg and its own slider, and the longest leg shared by all three. Beside it, the colour the three mix to. The
 * sliders end at the simulator's rated current and the chips' volts are the simulator's (RGB_DIES).
 */

type Colour = 'red' | 'green' | 'blue';
type Mix = Record<Colour, number>;

const COLOURS: Colour[] = ['red', 'green', 'blue'];
/** Bright and lasting up to here: where each slider ends. */
const RATED_MA = Math.round(LED.ratedA * 1000);
/** Where the page starts: red and green together, in the middle of the best current. */
const START: Mix = { red: (3 * RATED_MA) / 4, green: (3 * RATED_MA) / 4, blue: 0 };
/** The push each chip needs, from the simulator's three dies. */
const VF = Object.fromEntries(RGB_DIES.map(([, colour, vf]) => [colour, vf])) as Record<Colour, number>;

/** A chip lit, the sliders' own colours. */
const LIT: Record<Colour, string> = { red: '#ff3b30', green: '#2fbf4f', blue: '#3478f6' };
const UNLIT = '#5d554c';

/** What the eye calls the chips that are lit together. */
const NAMES: Record<string, string> = {
  red: 'red', green: 'green', blue: 'blue',
  'red+green': 'yellow', 'green+blue': 'cyan', 'red+blue': 'magenta', 'red+green+blue': 'white',
};
/** A chip with less than this share of the strongest one's current only tints the mix. */
const EVEN = 0.6;

const cap = (text: string) => text[0]!.toUpperCase() + text.slice(1);
/** "red", "red and green", "red, green and blue". */
const list = (words: string[]) => (words.length < 3 ? words.join(' and ') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`);

/** Which chips are lit, which of them are strong, and the names of both sets. */
function seen(mix: Mix) {
  const lit = COLOURS.filter((c) => mix[c] > 0);
  const most = Math.max(...COLOURS.map((c) => mix[c]));
  const strong = lit.filter((c) => mix[c] >= EVEN * most);
  return { lit, even: strong.length === lit.length, name: NAMES[lit.join('+')] ?? 'dark', leans: NAMES[strong.join('+')] ?? 'dark' };
}

/** The three lights added together, as a screen adds them. */
const mixed = (mix: Mix, full = RATED_MA) => `rgb(${COLOURS.map((c) => Math.round((255 * mix[c]) / full)).join(',')})`;

function rgbSays(mix: Mix): ReactNode {
  const { lit, even, name, leans } = seen(mix);
  if (lit.length === 0) return <>No current in any chip: all three are dark. Slide a colour up to light its chip.</>;
  if (lit.length === 1) return <>Only the {name} chip is lit, at <b>{mix[lit[0]!]} mA</b>: you see <b>{name}</b>. Slide another colour up to mix them.</>;
  if (!even) return <>{cap(list(lit))}, but not the same of each: the mix leans towards <b>{leans}</b>. Make them the same and your eye sees {name}.</>;
  return <>{cap(list(lit))} together: your eye sees <b>{name}</b>{name === 'magenta' && ' — a strong pink'}. Each chip has its own leg; all three share the longest one.</>;
}

function rgbLabel(mix: Mix): string {
  const { lit, even, name, leans } = seen(mix);
  const chips = COLOURS.map((c) => `${c} chip ${mix[c]} mA`).join(', ');
  const looks = lit.length === 0 ? 'All three are dark.'
    : lit.length === 1 ? `Only the ${name} chip is lit: it looks ${name}.`
      : even ? `Together they look ${name}.` : `Together they make a mix that leans towards ${leans}.`;
  return `An RGB LED cut open, three chips in one case: ${chips}. ${looks}`;
}

/** A chip's colour from unlit to fully lit. */
function chipColour(colour: Colour, glow: number): string {
  const from = [1, 3, 5].map((i) => parseInt(UNLIT.slice(i, i + 2), 16));
  const to = [1, 3, 5].map((i) => parseInt(LIT[colour].slice(i, i + 2), 16));
  return `rgb(${from.map((v, i) => Math.round(v + (to[i]! - v) * glow)).join(',')})`;
}

/** A clear 5 mm RGB LED drawn big: the shared leg's big piece with the cup and its three chips, a thin post and a gold
 *  wire for each colour, four legs — red, the shared one (the longest), green, blue — and the mixed colour beside it. */
function RgbDrawing({ mix }: { mix: Mix }) {
  const id = useDefId();
  const cx = 200, top = 40, r = 92, base = 214;
  const legs = { red: cx - 72, shared: cx - 24, green: cx + 24, blue: cx + 72 };
  const k = legs.shared;
  /** The chips in the cup, left to right: red, blue, green — so no gold wire crosses another. */
  const chips: Record<Colour, number> = { red: k - 14, blue: k, green: k + 14 };
  const most = Math.max(...COLOURS.map((c) => mix[c]));
  const level = most / RATED_MA;
  const lit = most > 0;
  const { lit: which, even, name } = seen(mix);
  /** The mix at full strength: the dome's tint and its glow, which fade with the current instead. */
  const hue = lit ? mixed(mix, most) : '#dfe6ec';
  const metal = { fill: '#c7ccd2', stroke: '#8f969f' };
  return (
    <svg className="scene lfig" style={{ maxWidth: 580 }} viewBox="-120 0 640 372" role="img" aria-label={rgbLabel(mix)}>
      <defs>
        <radialGradient id={`${id}g`}>
          <stop offset="0" stopColor={hue} stopOpacity={0.85} />
          <stop offset=".45" stopColor={hue} stopOpacity={0.4} />
          <stop offset="1" stopColor={hue} stopOpacity={0} />
        </radialGradient>
      </defs>
      {lit && <circle cx={cx} cy={108} r={128} fill={`url(#${id}g)`} opacity={f(0.25 + 0.6 * level)} />}
      <path d={`M${cx - r},${base} V${top + r} A${r} ${r} 0 0 1 ${cx + r},${top + r} V${base} Z`} fill={hue} fillOpacity={lit ? f(0.16 + 0.3 * level) : 0.45} stroke="#9aa5b1" strokeWidth={2} />
      <rect x={cx - r - 10} y={base} width={2 * r + 20} height={12} rx={3} fill={hue} fillOpacity={lit ? f(0.25 + 0.3 * level) : 0.6} stroke="#9aa5b1" strokeWidth={2} />
      {/* a thin post with a small flag for each colour */}
      <path d={`M${legs.red - 5},${base + 12} V128 H${legs.red + 10} V138 H${legs.red + 5} V${base + 12} Z`} {...metal} />
      <path d={`M${legs.green + 5},${base + 12} V128 H${legs.green - 10} V138 H${legs.green - 5} V${base + 12} Z`} {...metal} />
      <path d={`M${legs.blue + 5},${base + 12} V128 H${legs.blue - 10} V138 H${legs.blue - 5} V${base + 12} Z`} {...metal} />
      {/* the shared leg's wide stem, with the cup on top */}
      <path d={`M${k - 8},${base + 12} V124 H${k - 30} L${k - 24},100 H${k + 24} L${k + 30},124 H${k + 8} V${base + 12} Z`} {...metal} />
      <path d={`M${k - 24},100 L${k - 17},116 H${k + 17} L${k + 24},100`} fill="#aeb4bb" stroke="#8f969f" />
      {/* a gold wire from each post to its chip */}
      <path d={`M${legs.red + 6},128 C${legs.red + 8},84 ${chips.red - 4},80 ${chips.red},105`} stroke="#d4a017" strokeWidth={1.6} fill="none" />
      <path d={`M${legs.green - 6},128 C${legs.green - 8},92 ${chips.green + 4},86 ${chips.green},105`} stroke="#d4a017" strokeWidth={1.6} fill="none" />
      <path d={`M${legs.blue - 6},128 C${legs.blue - 12},58 ${chips.blue + 6},56 ${chips.blue},105`} stroke="#d4a017" strokeWidth={1.6} fill="none" />
      {COLOURS.map((c) => {
        const glow = mix[c] / RATED_MA;
        return (
          <g key={c}>
            {glow > 0 && <circle cx={chips[c]} cy={109} r={f(7 + 9 * glow)} fill={LIT[c]} opacity={f(0.2 + 0.35 * glow)} />}
            <rect data-part={`chip-${c}`} data-lit={num(glow, 2)} x={chips[c] - 5} y={105} width={10} height={9} rx={1} fill={chipColour(c, glow)} stroke="#3a332d" />
          </g>
        );
      })}
      {/* legs: the two outer ones short, the shared one the longest */}
      <path d={`M${legs.red},${base + 12} V${base + 96}`} stroke="#a5abb2" strokeWidth={4} />
      <path d={`M${legs.shared},${base + 12} V${base + 140}`} stroke="#a5abb2" strokeWidth={4} />
      <path d={`M${legs.green},${base + 12} V${base + 116}`} stroke="#a5abb2" strokeWidth={4} />
      <path d={`M${legs.blue},${base + 12} V${base + 96}`} stroke="#a5abb2" strokeWidth={4} />
      <Callout from={[k + 20, 108]} to={[cx + 140, 58]} text="Three chips" sub="side by side in the cup" />
      <Callout from={[legs.red, base + 60]} to={[cx - 140, base + 60]} text="Red leg" sub={`red chip · about ${num(VF.red, 1)} V`} anchor="end" />
      <Callout from={[legs.shared, base + 132]} to={[cx - 140, base + 124]} text="Shared leg" sub="the longest · for all three" anchor="end" />
      <Callout from={[legs.blue, base + 60]} to={[cx + 140, base + 60]} text="Blue leg" sub={`blue chip · about ${num(VF.blue, 1)} V`} />
      <Callout from={[legs.green, base + 110]} to={[cx + 140, base + 120]} text="Green leg" sub={`green chip · about ${num(VF.green, 1)} V`} />
      {/* the colour the three mix to */}
      <Label x={-40} y={42} anchor="middle" size={13} tone="muted">Your eye sees</Label>
      <circle data-part="swatch" cx={-40} cy={92} r={34} fill={mixed(mix)} stroke="#9aa5b1" strokeWidth={2} />
      <Label x={-40} y={150} anchor="middle" size={16} weight={800}>{which.length > 1 && !even ? 'a mix' : name}</Label>
    </svg>
  );
}

const LEG: Record<Colour, string> = { red: 'Red', green: 'Green', blue: 'Blue' };

export function RgbInside() {
  const [mix, setMix] = useState<Mix>(START);
  return (
    <>
      <RgbDrawing mix={mix} />
      {COLOURS.map((c) => (
        <div className="ctl" key={c}>
          <Slider label={LEG[c]} colour={LIT[c]} value={mix[c]} min={0} max={RATED_MA} step={1} format={(v) => `${v} mA`} onChange={(v) => setMix((m) => ({ ...m, [c]: v }))} />
        </div>
      ))}
      <div className="says" role="status"><Icon name="info" size={14} /><span>{rgbSays(mix)}</span></div>
    </>
  );
}
