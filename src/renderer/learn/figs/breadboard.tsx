import { useState, type ReactNode } from 'react';
import { COLUMNS, holes, RAILS, railHole, strips, type BreadboardSize } from '@lib/circuit';
import { Icon, Slider, Switch } from '../../ui';
import { Breadboard, Callout, f, P, ROWS, useDefId, Wire } from '../fig-kit';
import '../figures.css';

/**
 * Learn's picture of the breadboard (M8): push a wire into any hole and the holes joined to it light up; lift the
 * cover and every strip of metal shows. Which holes there are and which are joined is the simulator's
 * (src/lib/circuit/breadboard.ts) — the picture is the first columns of a half breadboard, rails and all.
 */

// ------------------------------------------------------------------ the simulator's breadboard
const SIZE: BreadboardSize = 'half';
/** As many columns as fit the page: a mini breadboard's width. */
const COLS = COLUMNS.mini;
const columnOf = (hole: string) => Number(/\d+$/.exec(hole)![0]);
const rowOf = (hole: string) => hole.replace(/\d+$/, '');
const shown = (hole: string) => columnOf(hole) <= COLS;
const isRail = (row: string) => (RAILS as readonly string[]).includes(row);

const HOLES = holes(SIZE).filter(shown);
const HOLE_SET = new Set(HOLES);
/** The strips of metal, each with the holes it joins (those of the picture's columns). */
const STRIPS = strips(SIZE).map((strip) => strip.filter(shown)).filter((strip) => strip.length > 0);
const SHORT = STRIPS.filter((strip) => !isRail(rowOf(strip[0]!)));
const LONG = STRIPS.filter((strip) => isRail(rowOf(strip[0]!)));
/** The rows from the top edge to the bottom one: the top rails, the letters, the bottom rails. */
const LETTERS = SHORT.filter((strip) => columnOf(strip[0]!) === 1).flat().map(rowOf);
const ROW_ORDER = [...RAILS.filter((r) => r.startsWith('T')), ...LETTERS, ...RAILS.filter((r) => r.startsWith('B'))];
/** A rail's holes come in groups of this many, then a space. */
const RAIL_GROUP = Array.from({ length: COLS }, (_, i) => i + 1).findIndex((c) => !railHole(c));

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const word = (n: number) => WORDS[n] ?? String(n);

/** "T+" → "top + rail"; and the sign of the rail beside it. */
const sign = (rail: string) => (rail.endsWith('+') ? '+' : '−');
const railName = (rail: string) => `${rail.startsWith('T') ? 'top' : 'bottom'} ${sign(rail)}`;
const otherSign = (rail: string) => (rail.endsWith('+') ? '−' : '+');
const rowText = (row: string) => (isRail(row) ? railName(row) : row);

/** "a5, b5, d5 and e5". */
const list = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names.join(''));

// ------------------------------------------------------------------ what it says
interface Chosen {
  row: string;
  col: number;
  /** The hole's name, if there is a hole there. */
  hole: string | undefined;
  /** The strip of metal under it. */
  strip: string[];
  /** The others of its strip. */
  others: string[];
  /** The other half of its column, across the gap. */
  across: string[];
}

function choose(row: string, col: number): Chosen {
  const name = `${row}${col}`;
  const hole = HOLE_SET.has(name) ? name : undefined;
  const strip = (hole && STRIPS.find((s) => s.includes(hole))) || [];
  const across = isRail(row) ? [] : SHORT.find((s) => s !== strip && columnOf(s[0]!) === col) ?? [];
  return { row, col, hole, strip, others: strip.filter((h) => h !== hole), across };
}

function boardSays({ row, col, hole, strip, others, across }: Chosen, lifted: boolean): ReactNode {
  const cover = lifted ? ' With the cover lifted you see every strip: the short ones under the columns, the long ones under the rails.' : '';
  if (!hole) {
    return <>There is no hole in column {col} of the {railName(row)} rail: a rail&apos;s holes come in groups of {word(RAIL_GROUP)}. The strip of metal runs on under the space — move one column along.{cover}</>;
  }
  if (isRail(row)) {
    return <><b>Hole {col} of the {railName(row)} rail</b> is joined to every other hole of that rail: one long strip of metal, all the way along. It is not joined to the {otherSign(row)} rail beside it, nor to the columns.{cover}</>;
  }
  return <><b>{hole}</b> is joined to {list(others)} — {word(strip.length)} holes, one piece of metal. The gap in the middle cuts it off from {across[0]}–{across.at(-1)}.{cover}</>;
}

function boardLabel({ row, col, hole, others }: Chosen, lifted: boolean): string {
  const cover = lifted
    ? ` The cover is lifted: ${SHORT.length} short strips of ${word(SHORT[0]!.length)} holes, cut in two by the gap in the middle, and ${LONG.length} long rails along the edges.`
    : ' The cover is on.';
  if (!hole) return `A breadboard: there is no hole in column ${col} of the ${railName(row)} rail.${cover}`;
  if (isRail(row)) return `A breadboard: a wire is pushed into hole ${col} of the ${railName(row)} rail; one long strip of metal joins it to every hole of that rail, all the way along.${cover}`;
  return `A breadboard: a wire is pushed into ${hole}; one strip of metal joins it to ${list(others)}.${cover}`;
}

// ------------------------------------------------------------------ the drawing
const BX = 24, BY = 0;
const at = (hole: string): [number, number] => [BX + (columnOf(hole) - 1) * P, BY + ROWS[rowOf(hole)]!];

/** The piece of metal under a strip's holes. */
function metal(strip: string[]) {
  const [x0, y0] = at(strip[0]!);
  const [x1, y1] = at(strip.at(-1)!);
  return { x: f(x0 - 5.5), y: f(y0 - 5.5), width: f(x1 - x0 + 11), height: f(y1 - y0 + 11), rx: 3 };
}

export function BreadboardInside() {
  const id = useDefId();
  const [row, setRow] = useState(ROW_ORDER.indexOf('c'));
  const [col, setCol] = useState(RAIL_GROUP);
  const [lifted, setLifted] = useState(false);
  const chosen = choose(ROW_ORDER[row]!, col);
  const push = (hole: string) => {
    setRow(ROW_ORDER.indexOf(rowOf(hole)));
    setCol(columnOf(hole));
  };
  const right = BX + (COLS - 1) * P;
  const wire = chosen.hole ? at(chosen.hole) : undefined;
  return (
    <>
      <svg className="scene lfig" style={{ maxWidth: 620 }} viewBox="-8 -8 500 314" role="img" aria-label={boardLabel(chosen, lifted)}>
        <defs>
          <filter id={`${id}l`} x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx={0} dy={2} stdDeviation={2} floodOpacity={0.28} /></filter>
        </defs>
        <Breadboard bx={BX} by={BY} cols={COLS} lift={`${id}l`} />
        {/* the cover lifted: every strip of metal, and its holes over it */}
        {lifted && STRIPS.map((strip) => (
          <rect key={strip[0]} data-strip={strip[0]} {...metal(strip)} fill="#c7ccd2" stroke="#8f969f" strokeWidth={1} opacity={0.92} />
        ))}
        {/* the strip under the wire, and the holes it joins */}
        {chosen.hole && <rect className="lf-now" {...metal(chosen.strip)} />}
        {lifted && (
          <g fill="#4a463e">
            {HOLES.map((hole) => {
              const [x, y] = at(hole);
              return <rect key={hole} x={f(x - 2.7)} y={f(y - 2.7)} width={5.4} height={5.4} rx={1.2} />;
            })}
          </g>
        )}
        {chosen.strip.map((hole) => {
          const [x, y] = at(hole);
          return <rect key={hole} className="lf-dot" data-lit={hole} x={f(x - 3.6)} y={f(y - 3.6)} width={7.2} height={7.2} rx={1.6} />;
        })}
        {wire && (
          <g className="lf-still" data-wire={chosen.hole}>
            <Wire thin colour="red" d={`M${wire[0]},${wire[1]} C${wire[0] + 3},${wire[1] - 14} ${wire[0] + 9},${wire[1] - 22} ${wire[0] + 20},${wire[1] - 27}`} ends={[wire]} />
          </g>
        )}
        <g className="lf-still">
          <Callout from={at(`T+${COLS}`)} to={[right + 46, 26]} text="A rail" sub="joined all the way along" />
          <Callout from={at(`c${COLS}`)} to={[right + 46, 86]} text="A strip" sub={`${word(SHORT[0]!.length)} holes, one piece`} />
          <Callout from={[right + 14, BY + 150]} to={[right + 46, 146]} text="The gap" sub="cuts a column in two" />
        </g>
        {/* every hole takes the wire */}
        {HOLES.map((hole) => {
          const [x, y] = at(hole);
          return <rect key={hole} data-hole={hole} x={x - P / 2} y={y - P / 2} width={P} height={P} fill="transparent" style={{ cursor: 'pointer' }} onClick={() => push(hole)} />;
        })}
      </svg>
      <div className="ctl">
        <Slider label="Row" value={row} min={0} max={ROW_ORDER.length - 1} step={1} format={(i) => rowText(ROW_ORDER[i]!)} onChange={setRow} />
      </div>
      <div className="ctl">
        <Slider label="Column" value={col} min={1} max={COLS} step={1} onChange={setCol} />
      </div>
      <div className="ctl">
        <Switch label="Lift the cover" value={lifted} onChange={setLifted} />
      </div>
      <div className="says" role="status"><Icon name="info" size={14} /><span>{boardSays(chosen, lifted)}</span></div>
    </>
  );
}
