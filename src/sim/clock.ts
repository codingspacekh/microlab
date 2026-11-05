/**
 * Time for the simulated board (architecture §2.3, F-39). `time.sleep*` and `ticks_*` read a Clock, never the
 * laptop's clock directly. The app runs on the RealClock (wall time); tests run on the VirtualClock, which jumps
 * ahead on a sleep and creeps forward on every VM poll, so ten simulated seconds take milliseconds and a
 * busy-wait loop on ticks_ms still ends.
 */
export interface Clock {
  /** Microseconds since the run started. */
  nowUs(): number;
  /** The program reading the time (ticks_us, ticks_ms): on the VirtualClock each reading takes a little time, as
   *  the call does on a board, so `while ticks_diff(ticks_ms(), t0) < 1000` ends after a sensible number of turns. */
  ticksUs(): number;
  /** Sleeps `us`. `wake` is asked between slices (Stop, an input changed); true from it ends the sleep early,
   *  and sleepUs returns true. */
  sleepUs(us: number, wake?: () => boolean): boolean;
  /** Called from the VM hook (every 64 backward jumps or returns). */
  poll(): void;
}

/** How long one slice of a sleep is: Stop and input changes are seen within this (N-03). */
const SLICE_MS = 10;

export interface RealClockOptions {
  /** Milliseconds, as performance.now() gives. */
  now?: () => number;
  /** Blocks for up to `ms` (Atomics.wait; the worker passes one that also wakes on its control buffer). */
  wait?: (ms: number) => void;
}

const cell = (): Int32Array => new Int32Array(new SharedArrayBuffer(4));

export class RealClock implements Clock {
  private readonly now: () => number;
  private readonly wait: (ms: number) => void;
  private readonly start: number;

  constructor(options: RealClockOptions = {}) {
    this.now = options.now ?? (() => performance.now());
    if (options.wait) {
      this.wait = options.wait;
    } else {
      const c = cell();
      this.wait = (ms) => { Atomics.wait(c, 0, 0, ms); };
    }
    this.start = this.now();
  }

  nowUs(): number {
    return Math.floor((this.now() - this.start) * 1000);
  }

  ticksUs(): number {
    return this.nowUs();
  }

  sleepUs(us: number, wake?: () => boolean): boolean {
    if (us <= 0) return false;
    const end = this.now() + us / 1000;
    for (;;) {
      const left = end - this.now();
      if (left <= 0) return false;
      if (left < 1) {   // under a millisecond: Atomics.wait isn't that fine, so spin
        while (this.now() < end) { /* spin */ }
        return false;
      }
      this.wait(Math.min(SLICE_MS, left));
      if (wake?.()) return true;
    }
  }

  poll(): void {}
}

export interface VirtualClockOptions {
  /** How far each VM poll moves time: about the time 64 loop turns take on a board. */
  creepUs?: number;
  /** The slice a sleep is cut into when it can be woken. */
  sliceUs?: number;
  /** What one reading of the time costs: about a loop turn with a ticks_ms() call on a Pico (~10 µs). */
  readUs?: number;
}

export class VirtualClock implements Clock {
  private t = 0;
  private readonly creepUs: number;
  private readonly sliceUs: number;
  private readonly readUs: number;

  constructor(options: VirtualClockOptions = {}) {
    this.creepUs = options.creepUs ?? 10;
    this.sliceUs = options.sliceUs ?? SLICE_MS * 1000;
    this.readUs = options.readUs ?? 10;
  }

  nowUs(): number {
    return this.t;
  }

  ticksUs(): number {
    this.t += this.readUs;
    return this.t;
  }

  sleepUs(us: number, wake?: () => boolean): boolean {
    if (us <= 0) return false;
    if (!wake) {
      this.t += us;
      return false;
    }
    const end = this.t + us;
    while (this.t < end) {
      this.t = Math.min(end, this.t + this.sliceUs);
      if (wake()) return true;
    }
    return false;
  }

  poll(): void {
    this.t += this.creepUs;
  }
}
