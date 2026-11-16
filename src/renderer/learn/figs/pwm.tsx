import { useState, type ReactNode } from 'react';
import { POWER_SUPPLY } from '@lib/circuit';
import { Icon, Segmented, Slider } from '../../ui';
import { f, Label, num, RedGlow, useDefId } from '../fig-kit';
import '../figures.css';

/**
 * Learn's picture of PWM (M8): a voltage switched fully on and fully off, over and over. The slider sets how much of
 * each blink is on; the wave shows it over four blinks, with the dashed line at what it adds up to — the average the
 * simulator's circuit sees (on-share × the supply, src/lib/circuit/solve.ts). Slow, you would see the LED blink; fast,
 * the eye cannot follow and sees a steady, dimmer light. Nothing moves: the drawing follows the controls.
 */

/** The supply's lower choice: 3.3 V (src/lib/circuit). */
const SUPPLY = Math.min(...POWER_SUPPLY.choices);

/** The slider: how much of each blink is on, in percent. */
const ON = { min: 0, max: 100, step: 1, start: 50 };

type Speed = 'slow' | 'fast';
/** Blinks a second. */
const BLINKS: Record<Speed, number> = { slow: 2, fast: 1000 };
const SPEEDS: { value: Speed; label: string }[] = [
  { value: 'slow', label: `Slow (${BLINKS.slow} a second)` },
  { value: 'fast', label: `Fast (${BLINKS.fast} a second)` },
];

/** Volts to two places; a half is rounded up as on paper (0.825 → 0.83 V), whatever the float holds. */
const v2 = (volts: number) => `${num(volts + 1e-9, 2)} V`;
/** What the on and off add up to: the on-share of the supply. */
const average = (percent: number) => (percent / 100) * SUPPLY;

/** How much light it gives out, in words: half the light, a quarter of the light — else the percent. (To the eye it
 *  looks a little brighter than that: the eye is not a light meter.) */
function share(percent: number): string {
  if (percent === 50) return 'half the light';
  return `${{ 25: 'a quarter', 75: 'three quarters' }[percent] ?? `${percent} %`} of the light`;
}

/** What the LED does: off, on, blinking (slow) or steadily dimmer (fast). */
type Look = 'off' | 'on' | 'blinks' | 'dimmer';
function look(percent: number, speed: Speed): Look {
  if (percent <= 0) return 'off';
  if (percent >= 100) return 'on';
  return speed === 'slow' ? 'blinks' : 'dimmer';
}

const NAME = 'This is called PWM — pulse-width modulation: changing how wide each pulse is.';

function says(percent: number, speed: Speed): ReactNode {
  const blinks = BLINKS[speed];
  const adds = `It adds up to ${v2(average(percent))} of ${v2(SUPPLY)}.`;
  switch (look(percent, speed)) {
    case 'off':
      return <>On for <b>0 %</b> of the time: there are no pulses, so the LED is off. It adds up to 0 V. {NAME}</>;
    case 'on':
      return <>On for <b>100 %</b> of the time: it never switches off, so the LED is simply on, at the full {v2(SUPPLY)}. {NAME}</>;
    case 'blinks':
      return (
        <>
          On for <b>{percent} %</b> of each blink, {blinks} blinks a second: slow enough to see, so the LED blinks on and off.
          {' '}Make it fast and it looks steady. {adds} {NAME}
        </>
      );
    default:
      return (
        <>
          On for <b>{percent} %</b> of each blink, {blinks} blinks a second: too fast to see, so the LED looks steady and gives out <b>{share(percent)}</b>.
          {' '}{adds} {NAME}
        </>
      );
  }
}

function pictureLabel(percent: number, speed: Speed): string {
  const start = `A voltage switched on and off ${BLINKS[speed]} times a second, between 0 V and ${v2(SUPPLY)}, on for ${percent} % of each blink: it adds up to ${v2(average(percent))}.`;
  const led = {
    off: 'It is never on: the LED is off.',
    on: 'It is never off: the LED is simply on.',
    blinks: 'Slow enough to see: the LED blinks on and off.',
    dimmer: `Too fast to see: the LED looks steady and gives out ${share(percent)}.`,
  }[look(percent, speed)];
  return `${start} ${led}`;
}

// ------------------------------------------------------------------ the drawing
/** The wave and the strip show this many blinks. */
const SHOWN = 4;
const WAVE = { x: 70, w: 420, high: 84, low: 164 };
const STRIP = { top: 258, h: 34 };
const LAMP = { cx: 640, cy: 150, r: 26 };
const PULSE = '#d98a1a';
const PERIOD = WAVE.w / SHOWN;

/** The voltage over the blinks shown: up for the on-part of each, down for the rest. */
function wavePath(percent: number): string {
  const { x, w, high, low } = WAVE;
  if (percent <= 0) return `M${x},${low} H${x + w}`;
  if (percent >= 100) return `M${x},${high} H${x + w}`;
  let d = `M${x},${low}`;
  for (let i = 0; i < SHOWN; i += 1) {
    const at = x + i * PERIOD;
    d += ` V${high} H${f(at + (PERIOD * percent) / 100)} V${low} H${f(at + PERIOD)}`;
  }
  return d;
}

/** How long one blink lasts, in words. */
const blinkLasts = (speed: Speed) => (speed === 'slow' ? 'one blink: half a second' : 'one blink: a thousandth of a second');

function Drawing({ percent, speed }: { percent: number; speed: Speed }) {
  const id = useDefId();
  const now = look(percent, speed);
  const { x, w, high, low } = WAVE;
  const avg = average(percent);
  const avgY = low - ((low - high) * percent) / 100;
  const onW = (PERIOD * percent) / 100;
  /** How bright the LED is drawn: its share when it looks steady; fully on in the on-part of a slow blink. */
  const bright = now === 'off' ? 0 : now === 'dimmer' ? percent / 100 : 1;
  const { cx, cy, r } = LAMP;
  const lampSays = {
    off: ['off', 'it is never switched on'],
    on: ['simply on', 'it is never switched off'],
    blinks: ['you see it blink', 'on, off, on, off'],
    dimmer: [share(percent), 'a steady, dimmer light'],
  }[now];
  return (
    <svg
      className="scene lfig" style={{ maxWidth: 740 }} viewBox="0 0 780 340" role="img" aria-label={pictureLabel(percent, speed)}
      data-look={now}
    >
      <defs><RedGlow id={`${id}g`} /></defs>
      {/* the voltage over four blinks, and what it adds up to */}
      <Label x={20} y={30} size={14} weight={700}>The voltage: fully on, fully off</Label>
      <Label x={20} y={48} size={12.5} weight={500} tone="muted">{BLINKS[speed]} blinks a second · on for {percent} % of each</Label>
      <path className="lf-lead" d={`M${x},${high - 12} V${low} H${x + w}`} />
      <Label x={x - 8} y={high + 4} anchor="end" size={12.5} weight={500} tone="muted">{v2(SUPPLY)}</Label>
      <Label x={x - 8} y={low + 4} anchor="end" size={12.5} weight={500} tone="muted">0 V</Label>
      <path data-part="wave" data-on={percent} d={wavePath(percent)} stroke={PULSE} strokeWidth={2.4} strokeLinejoin="round" fill="none" />
      <path className="lf-flow" data-part="average" data-volts={num(avg + 1e-9, 2)} d={`M${x},${f(avgY)} H${x + w + 14}`} strokeWidth={1.6} />
      <Label x={x + w + 20} y={avgY + 4} size={12.5} weight={700} tone="accent">{v2(avg)}</Label>
      <Label x={x + w} y={high - 20} anchor="end" size={12.5} weight={600} tone="accent">what it adds up to: {v2(avg)}</Label>
      <path className="lf-lead" d={`M${x},${low + 10} v6 h${PERIOD} v-6`} />
      <Label x={x + PERIOD / 2} y={low + 32} anchor="middle" size={12.5} weight={500} tone="muted">{blinkLasts(speed)}</Label>

      {/* the same pattern, slowed right down: blocks of on and off */}
      <Label x={20} y={STRIP.top - 12} size={14} weight={700}>Slowed right down</Label>
      {Array.from({ length: SHOWN }, (_, i) => {
        const at = x + i * PERIOD;
        return (
          <g key={i}>
            {percent > 0 && <rect data-block="on" x={f(at)} y={STRIP.top} width={f(onW)} height={STRIP.h} rx={3} fill={PULSE} />}
            {percent < 100 && <rect className="lf-lead" data-block="off" x={f(at + onW)} y={STRIP.top} width={f(PERIOD - onW)} height={STRIP.h} rx={3} />}
            {onW >= 24 && <Label x={at + onW / 2} y={STRIP.top + STRIP.h + 16} anchor="middle" size={12.5} weight={700}>on</Label>}
            {PERIOD - onW >= 24 && <Label x={at + onW + (PERIOD - onW) / 2} y={STRIP.top + STRIP.h + 16} anchor="middle" size={12.5} weight={500} tone="muted">off</Label>}
          </g>
        );
      })}
      <Label x={x} y={STRIP.top + STRIP.h + 36} size={12.5} weight={500} tone="muted">
        {percent <= 0 ? 'always off' : percent >= 100 ? 'always on' : 'on, off, on, off — the on-part is the pulse'}
      </Label>

      {/* the LED: as bright as the eye sees it */}
      <Label x={cx} y={30} anchor="middle" size={14} weight={700}>The LED</Label>
      <path d={`M${cx - 9},${cy + r - 4} V${cy + r + 62}`} stroke="#a5abb2" strokeWidth={4} />
      <path d={`M${cx + 9},${cy + r - 4} V${cy + r + 46}`} stroke="#a5abb2" strokeWidth={4} />
      {bright > 0 && <circle cx={cx} cy={cy} r={82} fill={`url(#${id}g)`} opacity={f(bright)} />}
      <circle cx={cx} cy={cy} r={r} fill="#f2b0aa" stroke="rgba(0,0,0,.18)" />
      <circle data-part="lamp" data-bright={num(bright, 2)} cx={cx} cy={cy} r={r} fill="#ef3b2c" opacity={num(bright, 2)} />
      <ellipse cx={cx - 9} cy={cy - 10} rx={7} ry={5} fill="#fff" opacity={0.55 + 0.3 * bright} />
      <Label x={cx} y={cy + r + 86} anchor="middle" size={15} weight={800} tone="accent">{lampSays[0]}</Label>
      <Label x={cx} y={cy + r + 104} anchor="middle" size={12.5} weight={500} tone="muted">{lampSays[1]}</Label>
    </svg>
  );
}

export function PwmDimming() {
  const [percent, setPercent] = useState(ON.start);
  const [speed, setSpeed] = useState<Speed>('fast');
  return (
    <>
      <Drawing percent={percent} speed={speed} />
      <div className="ctl">
        <Slider label="On for" value={percent} min={ON.min} max={ON.max} step={ON.step} format={(v) => `${v} %`} onChange={setPercent} />
      </div>
      <div className="ctl">
        <Segmented label="Speed" options={SPEEDS} value={speed} onChange={setSpeed} />
      </div>
      <div className="says" role="status"><Icon name="info" size={14} /><span>{says(percent, speed)}</span></div>
    </>
  );
}
