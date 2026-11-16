import { useState, type ReactNode } from 'react';
import { BUZZER } from '@lib/circuit';
import { noteName } from '../../audio';
import { Icon, Segmented, Slider } from '../../ui';
import { Callout, f, Label, num } from '../fig-kit';
import '../figures.css';

/**
 * Learn's picture of the buzzer, cut open (M8): the thin metal disc with its crystal slice, bent; the waves it makes
 * in the air in front of the sound hole, closer together the higher the pitch; and the pushes over a hundredth of a
 * second. Active: its own tiny circuit pushes, at the simulator's one pitch. Passive: pushed from outside, at the
 * slider's. The picture is silent.
 */

type Kind = 'active' | 'passive';

/** The active one's note and the least volts it starts at; the least swing a passive one sounds at (src/lib/circuit). */
const ACTIVE_HZ = BUZZER.active.hz;
const ACTIVE_VOLTS = BUZZER.active.minVolts;
const PASSIVE_SWING = BUZZER.passive.minSwing;

/** The slider: from a low hum to a shrill beep; it starts at the note A. */
const PITCH = { min: 200, max: 4000, step: 10, start: 440 };

/** The strip of pushes shows this much time: a hundredth of a second. */
const STRIP_SECONDS = 0.01;

const KINDS: { value: Kind; label: string }[] = [{ value: 'active', label: 'Active' }, { value: 'passive', label: 'Passive' }];

const letter = (note: string) => note.replace(/\d+$/, '');

/** What is heard at a pitch: its note's letter, or the two notes it lies between. */
function heard(hz: number): { drawn: string; said: string } {
  const note = letter(noteName(hz));
  if (note) return { drawn: `the note ${note}`, said: `the note ${note}` };
  const below = Math.floor(12 * Math.log2(hz / 440));
  const near = (semis: number) => letter(noteName(440 * 2 ** (semis / 12)));
  const between = `between ${near(below)} and ${near(below + 1)}`;
  return { drawn: between, said: `a note ${between}` };
}

function buzzerSays(kind: Kind, hz: number): ReactNode {
  if (kind === 'active') {
    return <>Active: its own tiny circuit pushes the disc <b>{hz} times a second</b>. Give it steady volts, at least {num(ACTIVE_VOLTS, 1)} V, and it hums one note.</>;
  }
  return (
    <>
      Passive, pushed <b>{hz} times a second</b>: the disc bends and springs back {hz} times, and you hear {heard(hz).said}.
      {' '}{hz >= PITCH.max ? 'That is as fast as this slider goes.' : 'Push it faster and the note is higher.'}
    </>
  );
}

const buzzerLabel = (kind: Kind, hz: number) => (kind === 'active'
  ? `A buzzer cut open, active: its own tiny circuit pushes the disc ${hz} times a second, it hums one note`
  : `A buzzer cut open, passive: pushed from outside ${hz} times a second, the disc bends ${hz} times a second and you hear ${heard(hz).said}`);

// ------------------------------------------------------------------ the drawing
const CX = 230;                                       // the middle of the buzzer
const CASE = { left: 150, right: 310, top: 190, bottom: 290, wall: 8 };
const WAVES = { reach: 150, nearest: 14 };
const STRIP = { x: 480, w: 220, high: 170, low: 200 };

/** How far apart the waves are drawn: closer as the pitch rises (real waves close up faster still — from 1.7 m at the
 *  slider's lowest pitch to 9 cm at its highest — which would leave one arc or a blur). */
const waveGap = (hz: number) => 56 * (PITCH.min / hz) ** 0.6;

/** The pushes over the strip's time: up at each push, down half way to the next. */
function pushesPath(hz: number): string {
  const { x, w, high, low } = STRIP;
  const end = x + w;
  const period = w / (hz * STRIP_SECONDS);
  let d = `M${x},${low}`;
  for (let at = x; at < end - 0.05; at += period) {
    const half = Math.min(at + period / 2, end);
    d += ` V${high} H${f(half)}`;
    if (half >= end) break;
    d += ` V${low} H${f(Math.min(at + period, end))}`;
  }
  return d;
}

function BuzzerDrawing({ kind, hz }: { kind: Kind; hz: number }) {
  const active = kind === 'active';
  const { left, right, top, bottom, wall } = CASE;
  const plus = CX - 25, minus = CX + 25;              // the two legs
  const gap = waveGap(hz);
  const waves: number[] = [];
  for (let r = gap; r <= WAVES.reach; r += gap) if (r >= WAVES.nearest) waves.push(r);
  const note = heard(hz);
  return (
    <svg className="scene lfig" style={{ maxWidth: 680 }} viewBox="-60 20 780 372" role="img" aria-label={buzzerLabel(kind, hz)}>
      {/* the waves in the air, out of the sound hole */}
      {waves.map((r) => (
        <path
          key={f(r)} data-wave=""
          d={`M${f(CX - 0.866 * r)},${f(top - 0.5 * r)} A${f(r)} ${f(r)} 0 0 1 ${f(CX + 0.866 * r)},${f(top - 0.5 * r)}`}
          stroke="#4a90d9" strokeWidth={2.2} strokeLinecap="round" fill="none" opacity={f(1 - 0.65 * (r / WAVES.reach))}
        />
      ))}
      {/* the case, cut through: its wall, the room inside, the sound hole in its top */}
      <rect x={left} y={top} width={right - left} height={bottom - top} rx={9} fill="#2d3136" stroke="#15181b" />
      <rect x={left + wall} y={top + wall} width={right - left - 2 * wall} height={bottom - top - 2 * wall} rx={4} fill="#dfe3e8" />
      <rect x={CX - 12} y={top - 1} width={24} height={wall + 2} fill="#dfe3e8" />
      <Label x={left + 26} y={top - 7} anchor="middle" size={14} weight={800} tone="plus">+</Label>
      {/* the ledges that hold the disc by its rim */}
      <rect x={left + wall} y={238} width={9} height={5} fill="#2d3136" />
      <rect x={right - wall - 9} y={238} width={9} height={5} fill="#2d3136" />
      {/* the legs, and their thin wires up to the disc and to the crystal — through the tiny circuit, if it has one */}
      <path d={`M${plus},${bottom - wall} V${bottom + 70}`} stroke="#a5abb2" strokeWidth={4} />
      <path d={`M${minus},${bottom - wall} V${bottom + 48}`} stroke="#a5abb2" strokeWidth={4} />
      <path d={`M${plus},${bottom - wall} C${plus - 4},262 ${plus - 14},250 ${plus - 12},234`} stroke="#de3b3b" strokeWidth={1.6} fill="none" />
      <path d={`M${minus},${bottom - wall} C${minus + 4},258 ${minus + 6},240 ${minus - 2},224`} stroke="#3a3d42" strokeWidth={1.6} fill="none" />
      {active && (
        <g>
          <rect x={CX - 40} y={262} width={80} height={13} rx={2} fill="#2f7d4f" stroke="#1f5a37" />
          <rect x={CX - 12} y={254} width={24} height={9} rx={1.5} fill="#1c1e21" />
          <rect x={CX - 30} y={257} width={9} height={6} rx={1} fill="#c9a227" />
          <rect x={CX + 21} y={257} width={9} height={6} rx={1} fill="#8f969f" />
        </g>
      )}
      {/* the disc, bent up — and where it is when it springs the other way; the crystal slice on it */}
      <path d={`M${left + wall + 6},236 Q${CX},258 ${right - wall - 6},236`} stroke="#c9a227" strokeWidth={2.4} strokeDasharray="5 4" fill="none" opacity={0.55} />
      <path d={`M${left + wall + 6},236 Q${CX},214 ${right - wall - 6},236`} stroke="#c9a227" strokeWidth={4.4} strokeLinecap="round" fill="none" />
      <path d={`M${CX - 39.6},225 Q${CX},217 ${CX + 39.6},225`} stroke="#8f969f" strokeWidth={6} strokeLinecap="round" fill="none" />
      <path d={`M${CX - 39.6},225 Q${CX},217 ${CX + 39.6},225`} stroke="#f4f5f7" strokeWidth={4} strokeLinecap="round" fill="none" />
      <Label x={plus} y={bottom + 90} anchor="middle" size={18} weight={800} tone="plus">+</Label>
      <Label x={minus} y={bottom + 68} anchor="middle" size={18} weight={800}>−</Label>

      <Callout from={[CX - 8, top + 3]} to={[100, 150]} text="Sound hole" sub="the waves leave here" anchor="end" />
      <Callout from={[left + wall + 22, 231]} to={[100, 222]} text="Metal disc" sub="bends and springs back" anchor="end" />
      <Callout from={[plus, bottom + 52]} to={[100, bottom + 52]} text="Long leg (+)" sub="to the + side" anchor="end" />
      <Callout from={[CX + 30, 221]} to={[350, 200]} text="Crystal slice" sub="bends when pushed" />
      {active && <Callout from={[CX + 40, 268]} to={[350, 252]} text="Its own tiny circuit" sub="does the pushing" />}
      <Callout from={[minus, bottom + 34]} to={[350, bottom + 34]} text="Short leg (−)" sub="to the − side" />

      {/* the pitch, and what is heard */}
      <Label x={STRIP.x} y={62} size={24} weight={800} tone="accent">{hz} Hz</Label>
      <Label x={STRIP.x} y={84} size={14} weight={600} tone="muted">{active ? 'one note, always' : note.drawn}</Label>
      {/* the pushes over a hundredth of a second */}
      <Label x={STRIP.x} y={126} size={14} weight={700}>The pushes</Label>
      <Label x={STRIP.x} y={144} size={12.5} weight={500} tone="muted">
        {active ? 'from its own tiny circuit' : `pushed from outside, by ${num(PASSIVE_SWING, 1)} V or more`}
      </Label>
      <path data-pushes={hz * STRIP_SECONDS} d={pushesPath(hz)} stroke="#d98a1a" strokeWidth={2} strokeLinejoin="round" fill="none" />
      <path className="lf-lead" d={`M${STRIP.x},${STRIP.low + 12} v6 h${STRIP.w} v-6`} />
      <Label x={STRIP.x + STRIP.w / 2} y={STRIP.low + 36} anchor="middle" size={12.5} weight={500} tone="muted">one hundredth of a second</Label>
    </svg>
  );
}

export function BuzzerInside() {
  const [kind, setKind] = useState<Kind>('passive');
  const [pitch, setPitch] = useState(PITCH.start);
  const hz = kind === 'active' ? ACTIVE_HZ : pitch;
  return (
    <>
      <BuzzerDrawing kind={kind} hz={hz} />
      <div className="ctl">
        <Segmented label="Kind" options={KINDS} value={kind} onChange={setKind} />
        {kind === 'passive' && (
          <Slider label="Pitch" value={pitch} min={PITCH.min} max={PITCH.max} step={PITCH.step} format={(v) => `${v} Hz`} onChange={setPitch} />
        )}
      </div>
      <div className="says" role="status"><Icon name="info" size={14} /><span>{buzzerSays(kind, hz)}</span></div>
    </>
  );
}
