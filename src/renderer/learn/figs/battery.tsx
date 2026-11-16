import { BATTERY_MAH } from '@lib/learn';
import { useState, type ReactNode } from 'react';
import { BATTERIES, LED } from '@lib/circuit';
import { Icon, Segmented, Slider } from '../../ui';
import { f, Label, num } from '../fig-kit';
import '../figures.css';

/**
 * Learn's picture of the battery pack, opened (M8): its cells in a row, + to −, each with its volts and the sum
 * running along the row to the pack's (the simulator's: src/lib/circuit); and how long it lasts feeding a current —
 * what a cell holds over the current, as a gauge and in words.
 */

/**
 * What a cell holds, which the simulator does not model (its batteries never run down): an alkaline AA cell about
 * 2000 mAh, a 9 V battery — six small cells — about 500 mAh. Cells in a row add their volts, not what they hold: the
 * same current runs through every one, so 2 × AA and 4 × AA both hold one cell's worth. The page's words use these.
 */
export const AA_CELL_MAH = BATTERY_MAH['2xAA']!;
export const NINE_VOLT_MAH = BATTERY_MAH['9V']!;

type PackKind = '2xAA' | '4xAA' | '9V';

/** The packs as the simulator names them: how many cells are in a row, and what the row holds. */
const PACKS: Record<PackKind, { label: string; cells: number; count: string; small: boolean; mAh: number }> = {
  '2xAA': { label: '2 × AA', cells: 2, count: 'two', small: false, mAh: AA_CELL_MAH },
  '4xAA': { label: '4 × AA', cells: 4, count: 'four', small: false, mAh: AA_CELL_MAH },
  '9V': { label: '9 V', cells: 6, count: 'six', small: true, mAh: NINE_VOLT_MAH },
};
const KINDS = Object.keys(PACKS) as PackKind[];
const OPTIONS = KINDS.map((value) => ({ value, label: PACKS[value].label }));

const voltsOf = (kind: PackKind) => BATTERIES[kind]!.volts;
/** The most volts of any pack: the running sum's bars are drawn against it. */
const MOST_VOLTS = Math.max(...KINDS.map(voltsOf));

/** One LED's best current, as its page has it: between half its rated current and all of it. */
const LED_MA = (LED.ratedA * 1000 * 3) / 4;

/** What it feeds: from less than an LED to a small motor. */
const FEEDS = { min: 5, max: 500, step: 5 };

/** The gauge runs from half the shortest life to the longest, each step along it as many times longer. */
const LONGEST_HOURS = Math.max(...KINDS.map((k) => PACKS[k].mAh)) / FEEDS.min;
const SHORTEST_HOURS = Math.min(...KINDS.map((k) => PACKS[k].mAh)) / FEEDS.max / 2;
const along = (hours: number) => Math.min(1, Math.max(0, Math.log(hours / SHORTEST_HOURS) / Math.log(LONGEST_HOURS / SHORTEST_HOURS)));
const MARKS = [{ hours: 1, label: '1 hour' }, { hours: 24, label: '1 day' }, { hours: 24 * 7, label: '1 week' }];

/** "about 130 hours": two figures are all a battery's life is known to. */
function about(hours: number): string {
  const h = Number(hours.toPrecision(2));
  return `about ${h} ${h === 1 ? 'hour' : 'hours'}`;
}

/** The current as something known: so many LEDs. */
function everyday(ma: number): string {
  const leds = Math.round(ma / LED_MA);
  if (ma === LED_MA) return 'one LED';
  if (leds < 1) return 'less than one LED takes';
  return leds === 1 ? 'about one LED' : `about ${leds} LEDs`;
}

function batterySays(kind: PackKind, ma: number): ReactNode {
  const { label, count, small, mAh } = PACKS[kind];
  const volts = <b>{num(voltsOf(kind), 1)} V</b>;
  const lasts = <>Feeding {ma} mA ({everyday(ma)}) it lasts <b>{about(mAh / ma)}</b></>;
  return small
    ? <>{label} battery: {count} small cells in one case push together — {volts}. {lasts}: small cells hold less.</>
    : <>{label}: {count} cells in a row push together — {volts}. {lasts}.</>;
}

function batteryLabel(kind: PackKind, ma: number): string {
  const { label, cells, small, mAh } = PACKS[kind];
  const each = num(voltsOf(kind) / cells, 2);
  return `${small ? `A ${label} battery opened: ${cells} small cells in one case` : `A ${label} battery pack opened: ${cells} cells in a row`}`
    + `, + to −, ${each} V each, add up to ${num(voltsOf(kind), 1)} V; feeding ${ma} mA it lasts ${about(mAh / ma)}`;
}

// ------------------------------------------------------------------ the drawing
const MID = 320;                                      // the middle of the picture
const ROW_Y = 96;                                     // the cells' middle line
const SUM = { base: 226, tall: 62 };                  // the running sum's bars: their foot, the tallest
const GAUGE = { x: 40, y: 290, w: 560, h: 16 };

function BatteryDrawing({ kind, ma }: { kind: PackKind; ma: number }) {
  const { cells, small, mAh } = PACKS[kind];
  const volts = voltsOf(kind);
  const each = volts / cells;
  // an AA cell, or one of the 9 V battery's small ones: its slot in the row, its body, its + cap
  const slot = small ? 66 : 112, body = small ? 56 : 100, tall = small ? 30 : 42, cap = 6;
  const x0 = MID - (cells * slot) / 2;
  const end = x0 + cells * slot;
  const top = ROW_Y - tall / 2;
  const hours = mAh / ma;
  return (
    <svg className="scene lfig" style={{ maxWidth: 640 }} viewBox="0 20 640 320" role="img" aria-label={batteryLabel(kind, ma)}>
      {/* the two leads: black from the − end, red from the + end */}
      <path d={`M${x0 - 12},${ROW_Y} h-34`} stroke="#15171a" strokeWidth={5} strokeLinecap="round" />
      <path d={`M${x0 - 12},${ROW_Y} h-34`} stroke="#3a3d42" strokeWidth={3} strokeLinecap="round" />
      <path d={`M${end + 10},${ROW_Y} h34`} stroke="#9e2626" strokeWidth={5} strokeLinecap="round" />
      <path d={`M${end + 10},${ROW_Y} h34`} stroke="#de3b3b" strokeWidth={3} strokeLinecap="round" />
      <Label x={x0 - 54} y={ROW_Y + 6} anchor="end" size={18} weight={800}>−</Label>
      <Label x={end + 52} y={ROW_Y + 6} size={18} weight={800} tone="plus">+</Label>
      {/* the holder, or the 9 V battery's one case, opened */}
      <rect x={x0 - 12} y={top - 10} width={end - x0 + 22} height={tall + 20} rx={small ? 4 : 7} fill={small ? '#4a4f57' : '#2d3136'} stroke="#15181b" />
      {Array.from({ length: cells }, (_, i) => {
        const x = x0 + i * slot;
        const sum = (i + 1) * each;
        const last = i === cells - 1;
        const bar = (sum / MOST_VOLTS) * SUM.tall;
        const mid = x + (body + cap) / 2;
        return (
          <g key={i}>
            {/* the cell: its − end to the left, its + cap to the right, touching the next one's − */}
            <rect data-cell="" x={x} y={top} width={body} height={tall} rx={tall / 2.6} fill="#e8b10f" />
            <rect x={x} y={top} width={f(body * 0.3)} height={tall} rx={tall / 2.6} fill="#1c1e21" />
            <rect x={x + body} y={f(ROW_Y - tall / 6)} width={cap} height={f(tall / 3)} rx={1.5} fill="#c7ccd2" />
            <Label x={mid} y={top - 20} anchor="middle" size={small ? 12.5 : 14} weight={700}>{num(each, 2)} V</Label>
            {/* the sum so far, after this cell */}
            <rect className="lf-dot" x={x} y={f(SUM.base - bar)} width={body + cap} height={f(bar)} rx={2} opacity={last ? 0.9 : 0.4} />
            <Label x={mid} y={SUM.base - bar - 7} anchor="middle" size={last ? 17 : 13} weight={last ? 800 : 600} tone={last ? 'accent' : 'ink'}>{num(sum, 2)} V</Label>
          </g>
        );
      })}
      <path className="lf-lead" d={`M${x0 - 12},${SUM.base} H${end + 10}`} />
      <Label x={x0 - 18} y={SUM.base + 1} anchor="end" size={13} tone="muted">0 V</Label>
      <Label x={MID} y={SUM.base + 20} anchor="middle" size={12.5} weight={500} tone="muted">each cell adds its push to the ones before it</Label>
      {/* how long it lasts */}
      <Label x={GAUGE.x} y={GAUGE.y - 10} size={15} weight={700}>Lasts {about(hours)}</Label>
      <Label x={GAUGE.x + GAUGE.w} y={GAUGE.y - 10} anchor="end" size={12.5} weight={500} tone="muted">feeding {ma} mA</Label>
      <rect x={GAUGE.x} y={GAUGE.y} width={GAUGE.w} height={GAUGE.h} rx={GAUGE.h / 2} fill="#8c8f94" opacity={0.3} />
      <rect className="lf-dot" data-lasts="" x={GAUGE.x} y={GAUGE.y} width={f(GAUGE.w * along(hours))} height={GAUGE.h} rx={GAUGE.h / 2} />
      {MARKS.map((m) => {
        const x = GAUGE.x + GAUGE.w * along(m.hours);
        return (
          <g key={m.label}>
            <path className="lf-lead" d={`M${f(x)},${GAUGE.y + GAUGE.h + 2} v6`} />
            <Label x={x} y={GAUGE.y + GAUGE.h + 22} anchor="middle" size={12} weight={500} tone="muted">{m.label}</Label>
          </g>
        );
      })}
    </svg>
  );
}

export function BatteryInside() {
  const [kind, setKind] = useState<PackKind>('4xAA');
  const [ma, setMa] = useState(LED_MA);
  return (
    <>
      <BatteryDrawing kind={kind} ma={ma} />
      <div className="ctl">
        <Segmented label="Pack" options={OPTIONS} value={kind} onChange={setKind} />
        <Slider label="What it feeds" value={ma} min={FEEDS.min} max={FEEDS.max} step={FEEDS.step} format={(v) => `${v} mA`} onChange={setMa} />
      </div>
      <div className="says" role="status"><Icon name="info" size={14} /><span>{batterySays(kind, ma)}</span></div>
    </>
  );
}
