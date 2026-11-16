/**
 * The editor's indentation guides (1.0.1 — the class after v1.0: "indentation preview, like python.microbit.org"):
 * for every line, the columns at which a block it is in was opened — a line is drawn down each — and which of them
 * is the block the cursor is in. Read from the indentation alone, as Python reads it: a line is in a block while it
 * is indented further than the line that opened it. Pure: the lines and the cursor's line in, the guides out.
 */
export interface LineGuides {
  /** The columns (0, 4, 8 …) of the lines that opened the blocks this line is in, outermost first. */
  cols: number[];
  /** The one of them that is the cursor's block. */
  active?: number;
}

/** How far a line is indented, in columns (a tab goes to the next multiple of `tab`); null: nothing but spaces. */
function indentOf(line: string, tab: number): number | null {
  let col = 0;
  for (const ch of line) {
    if (ch === ' ') col++;
    else if (ch === '\t') col += tab - (col % tab);
    else return col;
  }
  return null;
}

/** `cursor`: the cursor's line, from 0 (none: -1). */
export function indentGuides(lines: readonly string[], cursor: number, tab = 4): LineGuides[] {
  const indents = lines.map((l) => indentOf(l, tab));
  // the next line with code on it, for each line: an empty line is as deep as what follows it
  const next: (number | null)[] = new Array<number | null>(lines.length).fill(null);
  let coming: number | null = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    next[i] = coming;
    if (indents[i] !== null) coming = indents[i]!;
  }
  const out: LineGuides[] = [];
  const stack: number[] = [];
  for (const [i, line] of lines.entries()) {
    const c = indents[i]!;
    if (c === null) {
      // spaces only (the line being typed): as deep as its spaces; empty: as what comes next
      const deep = line.length ? indentOf(`${line}x`, tab)! : next[i] ?? 0;
      out.push({ cols: stack.filter((x) => x < deep) });
      continue;
    }
    while (stack.length && stack.at(-1)! >= c) stack.pop();
    out.push({ cols: [...stack] });
    stack.push(c);
  }
  const here = out[cursor];
  if (!here) return out;
  // the cursor's block: the one its line opens, else the innermost it is in
  const own = indents[cursor];
  const opens = own !== null && own !== undefined && next[cursor] !== null && next[cursor]! > own;
  const col = opens ? own : here.cols.at(-1);
  if (col === undefined) return out;
  const has = (i: number) => !!out[i] && out[i]!.cols.includes(col);
  let from = opens ? cursor + 1 : cursor;
  let to = from;
  if (!opens) while (has(from - 1)) from--;
  while (has(to + 1)) to++;
  for (let i = from; i <= to; i++) if (has(i)) out[i]!.active = col;
  return out;
}
