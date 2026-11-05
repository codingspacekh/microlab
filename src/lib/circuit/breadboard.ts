/**
 * Breadboards as in the approved drawing (design/svgparts.py, F-12): columns 1…n, rows a–e and f–j split by the
 * channel, and four power rails T-, T+ (top) and B+, B- (bottom) running the whole length, with holes in groups
 * of five and a gap. Half: 30 columns; full: 63.
 */
export type BreadboardSize = 'half' | 'full';

export const COLUMNS: Record<BreadboardSize, number> = { half: 30, full: 63 };
export const RAILS = ['T-', 'T+', 'B+', 'B-'] as const;
const TOP = 'abcde';
const BOTTOM = 'fghij';

/** Rails have a hole in five columns out of six. */
export const railHole = (col: number): boolean => (col - 1) % 6 !== 5;

/** Every hole's name: a1 … j30, T-1, T+1 … (rail gaps left out). */
export function holes(size: BreadboardSize): string[] {
  const out: string[] = [];
  for (let c = 1; c <= COLUMNS[size]; c++) {
    for (const r of TOP + BOTTOM) out.push(`${r}${c}`);
  }
  for (const rail of RAILS) {
    for (let c = 1; c <= COLUMNS[size]; c++) if (railHole(c)) out.push(`${rail}${c}`);
  }
  return out;
}

/** The groups of holes joined inside the breadboard: a–e and f–j of each column, and each rail. */
export function strips(size: BreadboardSize): string[][] {
  const out: string[][] = [];
  for (let c = 1; c <= COLUMNS[size]; c++) {
    out.push([...TOP].map((r) => `${r}${c}`), [...BOTTOM].map((r) => `${r}${c}`));
  }
  for (const rail of RAILS) {
    const strip: string[] = [];
    for (let c = 1; c <= COLUMNS[size]; c++) if (railHole(c)) strip.push(`${rail}${c}`);
    out.push(strip);
  }
  return out;
}
