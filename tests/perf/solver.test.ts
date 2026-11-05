import { describe, expect, it } from 'vitest';
import { analyse, solve, toNetlist } from '@lib/circuit';
import { fortyParts } from './fixtures';

/**
 * Q14: a 40-part circuit solves in ≤ 1 ms, so the engine can solve at every pin change. If this fails, the plan
 * is to replace solve() alone with Rust → WebAssembly against the same tests (architecture §2.5).
 * Not run with coverage (instrumentation slows it): `npm run perf`, also part of `npm run check`.
 */
const BUDGET_MS = 1;

function median(f: () => void, runs = 200): number {
  for (let i = 0; i < 20; i++) f();   // warm up the JIT
  const t: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    f();
    t.push(performance.now() - t0);
  }
  return t.sort((a, b) => a - b)[Math.floor(runs / 2)]!;
}

describe('Q14 solver speed', () => {
  const { spec, state } = fortyParts();
  const { netlist } = toNetlist(spec);

  it('the circuit has 40 parts and is fault-free', () => {
    expect(spec.parts).toHaveLength(40);
    const a = analyse(spec, state);
    expect(a.connectivity.problems).toEqual([]);
    expect(a.faults).toEqual([]);
    expect(a.solution.converged).toBe(true);
  });

  it(`solving after a pin change (from the last answer) takes ≤ ${BUDGET_MS} ms`, () => {
    const first = solve(netlist, state);
    let flip = 0;
    const ms = median(() => {
      flip ^= 1;
      solve(netlist, { pins: { ...state.pins, GP0: { mode: 'out', value: flip as 0 | 1 } } }, first);
    });
    console.log(`warm solve: ${ms.toFixed(3)} ms`);
    expect(ms).toBeLessThanOrEqual(BUDGET_MS);
  });

  it(`solving from nothing (the first step of a run) takes ≤ ${BUDGET_MS} ms`, () => {
    const ms = median(() => solve(netlist, state));
    console.log(`cold solve: ${ms.toFixed(3)} ms`);
    expect(ms).toBeLessThanOrEqual(BUDGET_MS);
  });
});
