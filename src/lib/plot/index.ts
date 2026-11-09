/**
 * The plotter (M9 slice 5, F-26, screen 07): numbers printed as print(a, b) drawn as live lines, as in Mu and
 * Thonny. A line of output is a sample when it is only numbers — one, several, a tuple or a list — each with an
 * optional name before it ("temp: 24.5", "x=3"); any other line is the console's alone.
 */
export interface Series {
  /** Its name, when the output gives one ("temp: 24.5"). */
  label?: string;
  /** [seconds since the run started, value]. */
  points: [number, number][];
}
export interface Plot {
  /** By position on the line: the first number is series 0. */
  series: Series[];
  /** How many numbers the last sample had. */
  width: number;
  /** The sample times (for the rate). */
  times: number[];
  /** What came after the last line ending: the start of a line still being printed. */
  partial: string;
}

const MAX_VALUES = 8;
/** The plot keeps this much (seconds). */
const KEEP_S = 600;
const KEEP_POINTS = 30_000;
const NUMBER = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?`;
const ITEM = new RegExp(String.raw`\s*(?:([A-Za-z_][A-Za-z0-9_ ]*?)\s*[:=]\s*)?(${NUMBER})\s*[,;]?`, 'y');

export function parsePlotLine(raw: string): { values: number[]; labels: (string | undefined)[] } | null {
  let line = raw.trim();
  const wrapped = /^[([](.*)[)\]]$/.exec(line);
  if (wrapped) line = wrapped[1]!.trim();
  if (!line) return null;
  const values: number[] = [];
  const labels: (string | undefined)[] = [];
  ITEM.lastIndex = 0;
  while (ITEM.lastIndex < line.length) {
    const at = ITEM.lastIndex;
    const m = ITEM.exec(line);
    if (!m || m.index !== at) return null;
    values.push(Number(m[2]));
    labels.push(m[1]?.trim() || undefined);
  }
  return values.length && values.length <= MAX_VALUES ? { values, labels } : null;
}

/** A print call's arguments at the top level: "a, f(1, 2), sep=','" → a · f(1, 2) · sep=','. */
function topLevel(args: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  for (let i = 0; i < args.length; i++) {
    const c = args[i]!;
    if (quote) { if (c === quote && args[i - 1] !== '\\') quote = ''; continue; }
    if (c === '"' || c === "'") quote = c;
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ',' && depth === 0) { out.push(args.slice(start, i).trim()); start = i + 1; }
  }
  out.push(args.slice(start).trim());
  return out.filter(Boolean);
}

/** Names for a sample with no names of its own: the one print in the code with that many values (its arguments, as
 *  written) and its line — screen 07's "d — printed by line 24". Null when no print, or more than one, fits. */
export function printNames(code: string, count: number): { names: string[]; line: number } | null {
  const fits: { names: string[]; line: number }[] = [];
  code.split('\n').forEach((text, i) => {
    const m = /^\s*print\((.*)\)\s*(?:#.*)?$/.exec(text);
    if (!m) return;
    const args = topLevel(m[1]!).filter((a) => !/^[A-Za-z_]\w*\s*=(?!=)/.test(a));   // sep=, end=
    if (args.some((a) => /^[rbfu]*["']/i.test(a))) return;   // text in it: the output names itself, or isn't a sample
    if (args.length === count) fits.push({ names: args, line: i + 1 });
  });
  return fits.length === 1 ? fits[0]! : null;
}

export function emptyPlot(): Plot {
  return { series: [], width: 0, times: [], partial: '' };
}

/** What the board printed, at `t` seconds into the run: each whole line that is numbers becomes a sample. The series'
 *  arrays grow in place (a fast loop prints thousands of lines); a new Plot is returned for the window to draw. */
export function addOutput(plot: Plot, text: string, t: number): Plot {
  const lines = (plot.partial + text).split('\n');
  const partial = lines.pop()!;
  let { width } = plot;
  const series = plot.series;
  const times = plot.times;
  for (const line of lines) {
    const s = parsePlotLine(line.replace(/\r$/, ''));
    if (!s) continue;
    s.values.forEach((v, i) => {
      const one = (series[i] ??= { points: [] });
      if (s.labels[i]) one.label = s.labels[i];
      one.points.push([t, v]);
    });
    width = s.values.length;
    times.push(t);
  }
  // the last 10 minutes
  const from = t - KEEP_S;
  for (const one of series) trim(one.points, (p) => p[0] < from);
  trim(times, (x) => x < from);
  return { series, width, times, partial };
}

function trim<T>(list: T[], old: (x: T) => boolean): void {
  let n = 0;
  while (n < list.length && (old(list[n]!) || list.length - n > KEEP_POINTS)) n++;
  if (n) list.splice(0, n);
}

/** Samples a second over the last 4 seconds, rounded ("5 a second"). */
export function rate(plot: Plot): number {
  const last = plot.times.at(-1);
  if (last === undefined) return 0;
  return Math.round(plot.times.filter((x) => x > last - 4).length / 4);
}
