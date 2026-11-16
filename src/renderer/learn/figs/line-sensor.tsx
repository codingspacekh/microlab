import { useState, type ReactNode } from 'react';
import { POWER_SUPPLY, sensorDrive } from '@lib/circuit';
import { Icon, Segmented, Slider } from '../../ui';
import { Callout, f, Label, num } from '../fig-kit';
import '../figures.css';

/**
 * Learn's picture of the line sensor (M8), seen from the side: its little lamp and its eye looking down at a white
 * floor with a black line across it. Slide it across: over white the lamp's infrared bounces up into the eye and OUT
 * is low; over the black line, or held too high, little comes back and OUT is high. OUT's volts are the simulator's
 * (sensorDrive: position 0 white, 1 black), on 3.3 V.
 */

const SUPPLY = Math.min(...POWER_SUPPLY.choices);
/** Across the floor, 0–100; the black line from 40 to 60. */
const LINE = { from: 40, to: 60 };
type Height = 'near' | 'high';
const overBlack = (at: number) => at >= LINE.from && at <= LINE.to;
/** What the eye gets back: much light, or little. */
const muchBack = (at: number, height: Height) => height === 'near' && !overBlack(at);
const outVolts = (back: boolean) => sensorDrive('line-sensor', {}, { position: back ? 0 : 1 }, SUPPLY).volts;
const placeText = (at: number) => (overBlack(at) ? 'over the black line' : 'over white');

function lineSays(at: number, height: Height, v: string): ReactNode {
  if (height === 'high') {
    return <>Held too high: the light spreads out and almost none gets back to the eye — even over white it looks black. OUT is high: <b>{v} V</b>.</>;
  }
  if (overBlack(at)) return <>Over the black line the light is swallowed: little comes back to the eye. OUT is high: <b>{v} V</b>.</>;
  return <>Over white the light bounces back up into the eye. OUT is low — <b>{v} V</b> — and the little lamp on the board is on.</>;
}

// ------------------------------------------------------------------ the drawing
const FLOOR = { x: 20, w: 660, y: 300 };
/** The sensor travels the middle of the floor, so that its two names stay inside the picture. */
const TRAVEL = { x: 260, w: 240 };
const floorX = (at: number) => TRAVEL.x + (at / 100) * TRAVEL.w;
const HEIGHT_Y: Record<Height, number> = { near: 246, high: 120 };

export function LineInside() {
  const [at, setAt] = useState(20);
  const [height, setHeight] = useState<Height>('near');
  const back = muchBack(at, height);
  const volts = outVolts(back);
  const v = num(volts, 1);
  const x = floorX(at);
  const y = HEIGHT_Y[height];
  const lamp = x - 14, eye = x + 14;

  const says = `A line sensor, seen from the side, ${height === 'near' ? 'just above the floor' : 'held too high'}, ${placeText(at)}. `
    + `${back ? 'Much light comes back to the eye' : 'Little light comes back to the eye'}: OUT is ${back ? 'low' : 'high'}, ${v} V.`;
  return (
    <>
      <svg className="scene lfig" style={{ maxWidth: 720 }} viewBox="0 0 700 360" role="img" aria-label={says} data-back={back} data-out={volts}>
        {/* the floor and its black line */}
        <rect x={FLOOR.x} y={FLOOR.y} width={FLOOR.w} height={24} fill="#f4f5f7" stroke="#c9ccd1" />
        <rect data-part="line" x={f(floorX(LINE.from))} y={FLOOR.y} width={f(floorX(LINE.to) - floorX(LINE.from))} height={24} fill="#1c1e21" />
        <Label x={FLOOR.x + 10} y={FLOOR.y + 44} size={12.5} weight={500} tone="muted">a white floor</Label>
        <Label x={floorX(50)} y={FLOOR.y + 44} anchor="middle" size={12.5} weight={500} tone="muted">a black line</Label>
        {/* the board, its lamp and its eye looking down */}
        <rect x={f(x - 46)} y={y - 64} width={92} height={40} rx={4} fill="#2f6fd6" stroke="#1f4f9e" />
        <circle data-part="led" cx={f(x + 30)} cy={y - 50} r={5} fill={back ? '#ef3b2c' : '#5b2a26'} />
        <rect x={f(lamp - 8)} y={y - 24} width={16} height={22} rx={7} fill="#3b6fd8" opacity={0.85} />
        <rect x={f(eye - 8)} y={y - 24} width={16} height={22} rx={7} fill="#1c1e21" />
        {/* the infrared, drawn though it cannot be seen: down from the lamp, and what comes back */}
        <path data-part="ray" d={`M${f(lamp)},${y} L${f(x)},${FLOOR.y}`} stroke="#d94545" strokeWidth={2.4} strokeDasharray="6 4" fill="none" />
        {back
          ? <path data-part="bounce" d={`M${f(x)},${FLOOR.y} L${f(eye)},${y}`} stroke="#d94545" strokeWidth={2.4} strokeDasharray="6 4" fill="none" />
          : <circle data-part="swallowed" cx={f(x)} cy={FLOOR.y} r={5} fill="#d94545" opacity={0.35} />}
        <Callout from={[lamp - 8, y - 12]} to={[f(x - 90), y - 96]} text="The lamp" sub="infrared: you cannot see it" anchor="end" />
        <Callout from={[eye + 8, y - 12]} to={[f(x + 90), y - 96]} text="The eye" sub={back ? 'much light back' : 'little light back'} />
        {/* OUT */}
        <Label x={680} y={40} anchor="end" size={14} weight={700}>OUT</Label>
        <Label x={680} y={66} anchor="end" size={18} weight={800} tone={back ? 'ink' : 'accent'}>{v} V</Label>
        <Label x={680} y={86} anchor="end" size={12.5} weight={500} tone="muted">{back ? 'low' : 'high'}</Label>
      </svg>
      <div className="ctl lf-long">
        <Slider label="Across the floor" value={at} min={0} max={100} step={1} format={placeText} ticks={['white', 'black line', 'white']} onChange={setAt} />
      </div>
      <div className="ctl">
        <Segmented<Height> label="How high" value={height} onChange={setHeight}
          options={[{ value: 'near', label: 'Just above the floor' }, { value: 'high', label: 'Too high' }]} />
      </div>
      <div className="says" role="status"><Icon name="info" size={14} /><span>{lineSays(at, height, v)}</span></div>
    </>
  );
}

