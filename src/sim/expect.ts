import { z } from 'zod';
import type { PartChange, PartView } from './circuit';
import type { RunResult } from './run';

/**
 * expect.json (architecture §2.7, MILESTONES §1.5): what a run of an example must show. The acceptance suite runs
 * every example on its board with the VirtualClock and checks it (M3.6); M10 runs the same files on real boards.
 *
 *   seconds   how long the run lasts (then it is stopped, quietly)
 *   inputs    [{ at: s, part, pressed | position | lux | celsius | humidity | cm }]
 *   parts     { id: { blinks: Hz } | { lit: [[from, to], …], dark: […] } | { brightness: [[at, min, max], …] }
 *                   | { sounds: [[from, to, Hz], …], silent: [[from, to], …] } }   (a buzzer, M6.2)
 *   console   { includes: ['line', …] }
 *   ended     'stopped' (a program that loops for ever) or 'done'
 *   faults    [] — no damage faults is the default
 */
const span = z.tuple([z.number(), z.number()]);

export const expectSchema = z.object({
  seconds: z.number().positive(),
  inputs: z.array(z.object({
    at: z.number().min(0), part: z.string(), pressed: z.boolean().optional(), position: z.number().optional(), lux: z.number().optional(), celsius: z.number().optional(),
    humidity: z.number().optional(), cm: z.number().optional(), tiltx: z.number().optional(), tilty: z.number().optional(),
    x: z.number().optional(), y: z.number().optional(), steps: z.number().optional(), rpm: z.number().optional(),
  })).optional(),
  parts: z.record(z.string(), z.object({
    blinks: z.number().positive().optional(),
    lit: z.array(span).optional(),
    dark: z.array(span).optional(),
    brightness: z.array(z.tuple([z.number(), z.number(), z.number()])).optional(),
    sounds: z.array(z.tuple([z.number(), z.number(), z.number().positive()])).optional(),
    silent: z.array(span).optional(),
  })).optional(),
  console: z.object({ includes: z.array(z.string()) }).optional(),
  ended: z.enum(['done', 'stopped', 'error', 'fault']).optional(),
  faults: z.array(z.string()).optional(),
});

export type Expectation = z.infer<typeof expectSchema>;

/** expect.json's inputs as the sim takes them. */
export function inputsOf(e: Expectation): PartChange[] {
  return (e.inputs ?? []).map(({ at, ...rest }) => ({ atUs: Math.round(at * 1e6), ...rest }));
}

/** A note is right within 2 % (a third of a semitone). */
const PITCH = 0.02;

/** An LED is lit from 1 % of its rated current (brightness 0.01). */
const LIT = 0.01;

/** Everything the run got wrong, in words; [] when it shows what it should. */
export function check(result: RunResult, e: Expectation): string[] {
  const out: string[] = [];
  const ended = e.ended ?? 'done';
  if (result.ended !== ended) out.push(`the run ended ${result.ended}${result.fault ? ` (${result.fault.message})` : result.error ? ` (${result.error.type}: ${result.error.message})` : ''}, not ${ended}`);
  const damage = result.faults.filter((f) => f.severity === 'damage').map((f) => `${f.kind} ${f.on}`);
  const wanted = e.faults ?? [];
  for (const d of damage) if (!wanted.includes(d)) out.push(`a fault: ${d}`);
  for (const line of e.console?.includes ?? []) if (!result.output.includes(line)) out.push(`the console has no "${line}"`);

  for (const [id, want] of Object.entries(e.parts ?? {})) {
    const trace = result.parts.filter(([, pid]) => pid === id).map(([t, , v]) => [t / 1e6, v] as [number, PartView]);
    if (!trace.length) {
      out.push(`${id}: no state at all (is it in the circuit?)`);
      continue;
    }
    const at = (s: number): PartView | undefined => {
      let v: PartView | undefined;
      for (const [t, view] of trace) if (t <= s) v = view;
      return v;
    };
    const lit = (s: number) => { const v = at(s); return v?.kind === 'led' && v.brightness >= LIT; };
    for (const [from, to] of want.lit ?? []) {
      for (let s = from; s <= to; s += 0.05) if (!lit(s)) { out.push(`${id}: dark at ${s.toFixed(2)} s, should be lit ${from}–${to} s`); break; }
    }
    for (const [from, to] of want.dark ?? []) {
      for (let s = from; s <= to; s += 0.05) if (lit(s)) { out.push(`${id}: lit at ${s.toFixed(2)} s, should be dark ${from}–${to} s`); break; }
    }
    for (const [s, min, max] of want.brightness ?? []) {
      const v = at(s);
      const b = v?.kind === 'led' ? v.brightness : NaN;
      if (!(b >= min && b <= max)) out.push(`${id}: brightness ${Number.isNaN(b) ? 'none' : b.toFixed(3)} at ${s} s, should be ${min}–${max}`);
    }
    if (want.blinks !== undefined) out.push(...blinks(id, trace, want.blinks, e.seconds));
    const hz = (s: number) => { const v = at(s); return v?.kind === 'buzzer' && v.volume > 0 ? v.hz : 0; };
    for (const [from, to, note] of want.sounds ?? []) {
      for (let s = from; s <= to + 1e-9; s += 0.05) {
        const h = hz(s);
        if (Math.abs(h - note) > note * PITCH) { out.push(`${id}: ${h ? `${h} Hz` : 'silent'} at ${s.toFixed(2)} s, should be ${note} Hz ${from}–${to} s`); break; }
      }
    }
    for (const [from, to] of want.silent ?? []) {
      for (let s = from; s <= to + 1e-9; s += 0.05) {
        const h = hz(s);
        if (h) { out.push(`${id}: ${h} Hz at ${s.toFixed(2)} s, should be silent ${from}–${to} s`); break; }
      }
    }
  }
  return out;
}

/** Lit for half a period, dark for half, through the whole run (±20 ms on each change). */
function blinks(id: string, trace: [number, PartView][], hz: number, seconds: number): string[] {
  const changes: [number, boolean][] = [];
  for (const [t, v] of trace) {
    const on = v.kind === 'led' && v.brightness >= LIT;
    if (changes.length && changes.at(-1)![1] === on) continue;
    // a state that lasted under 1 ms (the dark of the first solve, as the board starts) is not a blink
    if (changes.length && t - changes.at(-1)![0] < 0.001) changes.pop();
    if (!changes.length || changes.at(-1)![1] !== on) changes.push([t, on]);
  }
  const half = 0.5 / hz;
  const expected = Math.floor(seconds / half);
  const out: string[] = [];
  const starts = changes.filter(([t]) => t < seconds);
  if (starts.length < expected) out.push(`${id}: changes ${starts.length} times in ${seconds} s, should change ${expected} times (${hz} Hz)`);
  for (let i = 1; i < starts.length; i++) {
    const d = starts[i]![0] - starts[i - 1]![0];
    if (Math.abs(d - half) > 0.02) { out.push(`${id}: ${starts[i - 1]![1] ? 'lit' : 'dark'} for ${d.toFixed(3)} s, should be ${half} s`); break; }
  }
  return out;
}
