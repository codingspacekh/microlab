/**
 * The window → worker channel while Python runs (architecture §2.2): the worker can't take messages then (a busy
 * loop or a sleep holds it), so everything going in is shared memory.
 *
 *   cells[0]  STOP — set by the window; the VM hook and every sleep look at it (N-03)
 *   cells[1]  WAKE — a counter the window bumps after Stop or an input change; sleeps wait on it (Atomics.wait)
 *   slots[i]  one input each, named when the run starts: 'level:14' (0 / 1), 'volts:26', 'touch:4' (0 / 1);
 *             NaN = nothing drives it
 */
const STOP = 0;
const WAKE = 1;
const SLOTS_AT = 8;   // after the two Int32 cells, 8-byte aligned for Float64

export class Control {
  readonly buffer: SharedArrayBuffer;
  readonly names: readonly string[];
  private readonly cells: Int32Array;
  private readonly slots: Float64Array;

  constructor(names: string[] = [], buffer?: SharedArrayBuffer) {
    this.names = names;
    this.buffer = buffer ?? new SharedArrayBuffer(SLOTS_AT + 8 * names.length);
    this.cells = new Int32Array(this.buffer, 0, 2);
    this.slots = new Float64Array(this.buffer, SLOTS_AT, names.length);
    if (!buffer) this.slots.fill(NaN);
  }

  /** Where the input slots start in the buffer (for the window's side). */
  get slotsOffset(): number {
    return SLOTS_AT;
  }

  stop(): void {
    Atomics.store(this.cells, STOP, 1);
    this.wake();
  }

  stopRequested(): boolean {
    return Atomics.load(this.cells, STOP) === 1;
  }

  wake(): void {
    Atomics.add(this.cells, WAKE, 1);
    Atomics.notify(this.cells, WAKE);
  }

  /** Blocks up to `ms`, or until the window bumps WAKE (Stop, an input changed). */
  wait(ms: number): void {
    Atomics.wait(this.cells, WAKE, Atomics.load(this.cells, WAKE), ms);
  }

  setInput(name: string, value: number): void {
    const i = this.names.indexOf(name);
    if (i < 0) throw new Error(`no input slot "${name}"`);
    this.slots[i] = value;
    this.wake();
  }

  input(i: number): number {
    return this.slots[i]!;
  }
}
