import { describe, expect, it } from 'vitest';
import { RealClock, VirtualClock } from '../../../src/sim/clock';

describe('M2.2 VirtualClock', () => {
  it('starts at 0 and jumps ahead by exactly the sleep', () => {
    const c = new VirtualClock();
    expect(c.nowUs()).toBe(0);
    c.sleepUs(1_000_000);
    expect(c.nowUs()).toBe(1_000_000);
  });
  it('creeps forward on every poll, so busy-wait loops end', () => {
    const c = new VirtualClock({ creepUs: 50 });
    for (let i = 0; i < 20; i++) c.poll();
    expect(c.nowUs()).toBe(1000);
  });
  it('each reading by the program takes a little time; looking at it from outside doesn\'t', () => {
    const c = new VirtualClock({ readUs: 10 });
    expect([c.ticksUs(), c.ticksUs(), c.nowUs(), c.nowUs()]).toEqual([10, 20, 20, 20]);
  });
  it('a sleep can be cut short: it ends at the slice where the wake check says so', () => {
    const c = new VirtualClock({ sliceUs: 10_000 });
    let checks = 0;
    const woke = c.sleepUs(1_000_000, () => ++checks === 3);
    expect(woke).toBe(true);
    expect(c.nowUs()).toBe(30_000);
  });
  it('a sleep of 0 or less does nothing', () => {
    const c = new VirtualClock();
    expect(c.sleepUs(0)).toBe(false);
    expect(c.sleepUs(-5)).toBe(false);
    expect(c.nowUs()).toBe(0);
  });
});

describe('M2.2 RealClock', () => {
  it('reads wall time from its start, in µs', () => {
    let now = 1000;   // ms, as performance.now() gives
    const c = new RealClock({ now: () => now, wait: (ms) => { now += ms; } });
    now = 1002.5;
    expect(c.nowUs()).toBe(2500);
  });
  it('sleeps in slices of at most 10 ms, waking early when asked', () => {
    let now = 0;
    const waits: number[] = [];
    const c = new RealClock({ now: () => now, wait: (ms) => { waits.push(ms); now += ms; } });
    expect(c.sleepUs(25_000)).toBe(false);
    expect(waits).toEqual([10, 10, 5]);
    waits.length = 0;
    expect(c.sleepUs(1_000_000, () => waits.length === 2)).toBe(true);
    expect(waits).toEqual([10, 10]);
  });
  it('a short sleep (under 1 ms) spins on the clock instead of waiting', () => {
    let now = 0;
    const c = new RealClock({ now: () => (now += 0.1), wait: () => { throw new Error('should not wait'); } });
    c.sleepUs(500);
    expect(now).toBeGreaterThanOrEqual(0.5);
  });
  it('polling and reading do nothing to real time', () => {
    const now = 7;
    const c = new RealClock({ now: () => now, wait: () => {} });
    c.poll();
    expect([c.ticksUs(), c.nowUs()]).toEqual([0, 0]);
  });
  it('by default it really waits (Atomics.wait)', () => {
    const c = new RealClock();
    const t = performance.now();
    c.sleepUs(30_000);
    expect(performance.now() - t).toBeGreaterThanOrEqual(25);
  });
});
