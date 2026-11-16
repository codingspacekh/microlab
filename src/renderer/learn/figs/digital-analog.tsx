import { useState, type ReactNode } from 'react';
import { POWER_SUPPLY } from '@lib/circuit';
import { Icon, Segmented, Slider } from '../../ui';
import { f, Label, num } from '../fig-kit';
import '../figures.css';

/**
 * Learn's picture of digital and analog (M8): one voltage, read three ways. Digital — only two answers, 0 below the
 * line and 1 from the line up, like a switch. Analog — any level, like a knob. And as a number: a staircase from 0 V
 * to the supply's volts, the voltage landing on one of its steps; with a few steps it is drawn step by step, with
 * hundreds it is drawn as the slope it looks like.
 */

/** The supply's lower choice: 3.3 V (src/lib/circuit). */
const SUPPLY = Math.min(...POWER_SUPPLY.choices);
/** The line between 0 and 1: the simulator reads a pin as high from half the supply up (src/sim/pins.ts, `VDD / 2`). */
const HIGH_FROM = SUPPLY / 2;

/** The slider: from 0 V to the supply. */
const VOLTS = { min: 0, max: SUPPLY, step: 0.05, start: 1.2 };

type Steps = '4' | '16' | '256' | '1024';
const STEPS: { value: Steps; label: string }[] = (['4', '16', '256', '1024'] as const).map((value) => ({ value, label: value }));
/** Up to this many steps the staircase is drawn step by step; more, and it is drawn as a slope. */
const DRAWN_STEPS = 16;

/** 0 or 1: high from the line up. */
const digital = (volts: number) => (volts >= HIGH_FROM ? 1 : 0);
/** The step a voltage lands on: 0 at 0 V, the top one (steps − 1) at the supply. */
const stepOf = (volts: number, steps: number) => Math.min(steps - 1, Math.floor((volts / SUPPLY) * steps + 1e-9));

/** Volts to two places; a half is rounded up as on paper (0.825 → 0.83 V), whatever the float holds. */
const v2 = (volts: number) => `${num(volts + 1e-9, 2)} V`;

/** Where the voltage is against the line. */
function against(volts: number): string {
  if (volts === HIGH_FROM) return 'it has just reached the line';
  return volts > HIGH_FROM ? 'it is above the line' : 'it is below the line';
}

/** A voltage a tenth of a volt away, to see whether the number can tell the two apart. */
function neighbour(volts: number): number {
  const up = Number((volts + 0.1).toFixed(2));
  return up <= SUPPLY ? up : Number((volts - 0.1).toFixed(2));
}

function says(volts: number, steps: number): ReactNode {
  const number = stepOf(volts, steps);
  const other = neighbour(volts);
  const apart = stepOf(other, steps) !== number;
  return (
    <>
      At {v2(volts)} a digital reading says <b>{digital(volts)}</b>: {against(volts)}.
      {' '}An analog reading with {steps} steps says <b>{number}</b> — {apart
        ? `it can tell ${v2(volts)} from ${v2(other)}.`
        : `it cannot tell ${v2(volts)} from ${v2(other)}: both land on the same step.`}
    </>
  );
}

function pictureLabel(volts: number, steps: number): string {
  const bit = digital(volts);
  const drawn = steps > DRAWN_STEPS ? 'so many that the staircase is drawn as a slope' : 'drawn step by step';
  return `A voltage of ${v2(volts)} out of ${v2(SUPPLY)}, read three ways. Digital: ${against(volts)} at ${v2(HIGH_FROM)}, so it reads ${bit}, ${bit ? 'high' : 'low'}. `
    + `Analog: the level is ${v2(volts)}. As a number with ${steps} steps, ${drawn}: ${stepOf(volts, steps)}, from 0 to ${steps - 1}.`;
}

// ------------------------------------------------------------------ the drawing
/** All three panels share one height: the supply at the top, 0 V at the bottom. */
const TOP = 90, BOTTOM = 270;
const yAt = (volts: number) => BOTTOM - ((BOTTOM - TOP) * volts) / SUPPLY;
const LEVEL = '#d98a1a';
const DIGITAL = { x: 20, axis: 62, right: 200 };
const ANALOG = { x: 345, bar: 378, w: 26 };
const NUMBER = { x: 500, left: 545, right: 775 };
const ANSWER_Y = 322;

/** The staircase, step by step: along a tread, up to the next. */
function stairsPath(steps: number): string {
  const { left, right } = NUMBER;
  let d = `M${left},${BOTTOM}`;
  for (let i = 1; i <= steps; i += 1) {
    d += ` H${f(left + ((right - left) * i) / steps)}`;
    if (i < steps) d += ` V${f(BOTTOM - ((BOTTOM - TOP) * i) / steps)}`;
  }
  return d;
}

function Drawing({ volts, steps }: { volts: number; steps: number }) {
  const bit = digital(volts);
  const number = stepOf(volts, steps);
  const y = yAt(volts);
  const line = yAt(HIGH_FROM);
  const slope = steps > DRAWN_STEPS;
  const { left, right } = NUMBER;
  const span = right - left;
  const xv = left + (span * volts) / SUPPLY;
  /** The height of the step it lands on. */
  const ny = BOTTOM - ((BOTTOM - TOP) * number) / steps;
  const digits = String(number).length;
  return (
    <svg
      className="scene lfig" style={{ maxWidth: 760 }} viewBox="0 0 800 344" role="img" aria-label={pictureLabel(volts, steps)}
      data-digital={bit} data-number={number}
    >
      {/* digital: the level against the line */}
      <Label x={DIGITAL.x} y={30} size={14} weight={700}>Digital: only two answers</Label>
      <Label x={DIGITAL.x} y={48} size={12.5} weight={500} tone="muted">like a switch: off or on</Label>
      <path className="lf-lead" d={`M${DIGITAL.axis},${TOP} V${BOTTOM} H${DIGITAL.right}`} />
      <Label x={DIGITAL.axis - 8} y={TOP + 4} anchor="end" size={12.5} weight={500} tone="muted">{v2(SUPPLY)}</Label>
      <Label x={DIGITAL.axis - 8} y={BOTTOM + 4} anchor="end" size={12.5} weight={500} tone="muted">0 V</Label>
      <path className="lf-flow" data-part="line" d={`M${DIGITAL.axis},${f(line)} H${DIGITAL.right}`} strokeWidth={1.6} />
      <Label x={DIGITAL.right + 10} y={line + 4} size={12.5} weight={500} tone="muted">the line: {v2(HIGH_FROM)}</Label>
      <Label x={DIGITAL.right + 10} y={(TOP + line) / 2 + 5} size={bit ? 16 : 13} weight={bit ? 800 : 500} tone={bit ? 'accent' : 'muted'}>1 (high)</Label>
      <Label x={DIGITAL.right + 10} y={(line + BOTTOM) / 2 + 5} size={bit ? 13 : 16} weight={bit ? 500 : 800} tone={bit ? 'muted' : 'accent'}>0 (low)</Label>
      <path data-part="level" d={`M${DIGITAL.axis},${f(y)} H${DIGITAL.right}`} stroke={LEVEL} strokeWidth={3} strokeLinecap="round" />
      <circle cx={(DIGITAL.axis + DIGITAL.right) / 2} cy={f(y)} r={5} fill={LEVEL} stroke="#fff" strokeWidth={1.2} />
      <Label x={DIGITAL.x} y={ANSWER_Y} size={26} weight={800} tone="accent">{bit}</Label>
      <Label x={DIGITAL.x + 26} y={ANSWER_Y - 2} size={14} weight={600}>{bit ? 'high — the switch is on' : 'low — the switch is off'}</Label>

      {/* analog: the level itself */}
      <Label x={ANALOG.x} y={30} size={14} weight={700}>Analog: any level</Label>
      <Label x={ANALOG.x} y={48} size={12.5} weight={500} tone="muted">like a knob: anywhere</Label>
      <rect className="lf-lead" x={ANALOG.bar} y={TOP} width={ANALOG.w} height={BOTTOM - TOP} rx={5} />
      <rect data-part="bar" data-share={num(volts / SUPPLY, 3)} x={ANALOG.bar} y={f(y)} width={ANALOG.w} height={f(BOTTOM - y)} rx={Math.min(5, f((BOTTOM - y) / 2))} fill={LEVEL} />
      <path d={`M${ANALOG.bar + ANALOG.w + 4},${f(y)} l11,-7 v14 Z`} fill={LEVEL} />
      <Label x={ANALOG.bar - 8} y={TOP + 4} anchor="end" size={12.5} weight={500} tone="muted">{v2(SUPPLY)}</Label>
      <Label x={ANALOG.bar - 8} y={BOTTOM + 4} anchor="end" size={12.5} weight={500} tone="muted">0 V</Label>
      <Label x={ANALOG.x} y={ANSWER_Y} size={26} weight={800} tone="accent">{v2(volts)}</Label>

      {/* as a number: the staircase, and the step the voltage lands on */}
      <Label x={NUMBER.x} y={30} size={14} weight={700}>As a number: {steps} steps</Label>
      <Label x={NUMBER.x} y={48} size={12.5} weight={500} tone="muted">
        {slope ? 'so many steps that it looks like a slope' : `each step is ${v2(SUPPLY / steps)} wide`}
      </Label>
      <path className="lf-lead" d={`M${left},${TOP} V${BOTTOM} H${right}`} />
      {slope
        ? <path data-stairs="slope" d={`M${left},${BOTTOM} L${right},${TOP}`} stroke={LEVEL} strokeWidth={2.4} strokeLinecap="round" fill="none" />
        : <path data-stairs="steps" data-treads={steps} d={stairsPath(steps)} stroke={LEVEL} strokeWidth={2.4} strokeLinejoin="round" fill="none" />}
      {!slope && (
        <rect
          className="lf-dot" data-part="tread" x={f(left + (span * number) / steps)} y={f(ny - 3)}
          width={f(span / steps)} height={6} rx={3}
        />
      )}
      <path className="lf-flow" d={`M${f(xv)},${BOTTOM} V${f(ny)}`} strokeWidth={1.4} />
      <circle className="lf-dot" data-part="landed" cx={f(xv)} cy={f(ny)} r={5} stroke="#fff" strokeWidth={1.2} />
      <Label x={left - 8} y={TOP + 4} anchor="end" size={12.5} weight={500} tone="muted">{steps - 1}</Label>
      <Label x={left - 8} y={BOTTOM + 4} anchor="end" size={12.5} weight={500} tone="muted">0</Label>
      <Label x={left} y={BOTTOM + 18} size={12.5} weight={500} tone="muted">0 V</Label>
      <Label x={right} y={BOTTOM + 18} anchor="end" size={12.5} weight={500} tone="muted">{v2(SUPPLY)}</Label>
      <Label x={NUMBER.x} y={ANSWER_Y} size={26} weight={800} tone="accent">{number}</Label>
      <Label x={NUMBER.x + 16 * digits + 10} y={ANSWER_Y - 2} size={14} weight={600}>from 0 to {steps - 1}</Label>
    </svg>
  );
}

export function DigitalAnalog() {
  const [volts, setVolts] = useState(VOLTS.start);
  const [steps, setSteps] = useState<Steps>('1024');
  const n = Number(steps);
  return (
    <>
      <Drawing volts={volts} steps={n} />
      <div className="ctl">
        <Slider label="The voltage" value={volts} min={VOLTS.min} max={VOLTS.max} step={VOLTS.step} format={v2} onChange={setVolts} />
      </div>
      <div className="ctl">
        <Segmented label="Steps" options={STEPS} value={steps} onChange={setSteps} />
      </div>
      <div className="says" role="status"><Icon name="info" size={14} /><span>{says(volts, n)}</span></div>
    </>
  );
}
