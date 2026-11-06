/**
 * Component values as people write them (M4.1b): the E12 series the stepper walks, and "4.7k" / "4k7" / "1 MΩ".
 */

/** The twelve standard values of each decade (IEC 60063). */
export const E12 = [1, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2] as const;

const round = (v: number) => Number(v.toPrecision(6));

/** The next E12 value above (dir 1) or below (dir −1) `value`, across decades. */
export function stepE12(value: number, dir: 1 | -1): number {
  if (!(value > 0)) return 1;
  const decade = Math.floor(Math.log10(value) + 1e-9);
  const candidates: number[] = [];
  for (let d = decade - 1; d <= decade + 1; d++) for (const m of E12) candidates.push(round(m * 10 ** d));
  const eps = value * 1e-6;
  if (dir > 0) return candidates.find((c) => c > value + eps) ?? round(10 ** (decade + 2));
  return [...candidates].reverse().find((c) => c < value - eps) ?? round(8.2 * 10 ** (decade - 2));
}

const PREFIX: Record<string, number> = { '': 1, m: 1e-3, k: 1e3, K: 1e3, M: 1e6 };

/** "220", "4.7k", "4k7", "10 k", "2.2 MΩ" → the number; undefined if it isn't one. A trailing unit (Ω, V, A, F) is allowed. */
export function parseValue(text: string): number | undefined {
  const t = text.trim().replace(/\s+/g, '').replace(/(Ω|ohms?|[VAF])$/i, '');
  let m = /^(\d+(?:\.\d+)?|\.\d+)([mkKM]?)$/.exec(t);
  if (m) return round(Number(m[1]) * PREFIX[m[2]!]!);
  m = /^(\d+)([kKM])(\d+)$/.exec(t);   // 4k7
  if (m) return round(Number(`${m[1]}.${m[3]}`) * PREFIX[m[2]!]!);
  return undefined;
}

/** 4700 → "4.7k", 1e6 → "1M", 220 → "220". */
export function formatValue(value: number): string {
  const abs = Math.abs(value);
  const [div, suffix] = abs >= 1e6 ? [1e6, 'M'] : abs >= 1e3 ? [1e3, 'k'] : [1, ''];
  return `${Number((value / div).toPrecision(4))}${suffix}`;
}
