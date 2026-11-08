/**
 * The window → worker channel while Python runs (architecture §2.2): the worker can't take messages then (a busy
 * loop or a sleep holds it), so everything going in is shared memory.
 *
 *   cells[0]  STOP — set by the window; the VM hook and every sleep look at it (N-03)
 *   cells[1]  WAKE — a counter the window bumps after Stop or an input change; sleeps wait on it (Atomics.wait)
 *   slots[i]  one input each, named when the run starts: 'level:14' (0 / 1), 'volts:26', 'touch:4' (0 / 1);
 *             NaN = nothing drives it
 *   then      the console's keys (M9, F-23, screen 29c): what the student types, as a board's serial console takes it —
 *             a ring of UTF-16 units with the count written (by the window) and the count read (by the worker);
 *             Ctrl+C (\x03) in it interrupts the program, as on a board
 */
const STOP = 0;
const WAKE = 1;
const SLOTS_AT = 8;   // after the two Int32 cells, 8-byte aligned for Float64
/** How many characters can wait unread; what is typed beyond that is lost, as a board's buffer loses it. */
export const STDIN_RING = 4096;
const WRITTEN = 0;
const READ = 1;

export class Control {
  readonly buffer: SharedArrayBuffer;
  readonly names: readonly string[];
  private readonly cells: Int32Array;
  private readonly slots: Float64Array;
  private readonly keys: Int32Array;
  private readonly ring: Uint16Array;

  constructor(names: string[] = [], buffer?: SharedArrayBuffer) {
    this.names = names;
    const keysAt = SLOTS_AT + 8 * names.length;
    this.buffer = buffer ?? new SharedArrayBuffer(keysAt + 8 + 2 * STDIN_RING);
    this.cells = new Int32Array(this.buffer, 0, 2);
    this.slots = new Float64Array(this.buffer, SLOTS_AT, names.length);
    this.keys = new Int32Array(this.buffer, keysAt, 2);
    this.ring = new Uint16Array(this.buffer, keysAt + 8, STDIN_RING);
    if (!buffer) this.slots.fill(NaN);
  }

  /** The window: what the student typed (a line ends with '\n'; '\x03' is Ctrl+C). False if it didn't all fit. */
  type(text: string): boolean {
    const written = Atomics.load(this.keys, WRITTEN);
    const room = STDIN_RING - (written - Atomics.load(this.keys, READ));
    const n = Math.min(room, text.length);
    for (let i = 0; i < n; i++) this.ring[(written + i) % STDIN_RING] = text.charCodeAt(i);
    Atomics.store(this.keys, WRITTEN, written + n);
    this.wake();
    return n === text.length;
  }

  /** The worker: everything typed since the last call ('' if nothing). */
  typed(): string {
    const written = Atomics.load(this.keys, WRITTEN);
    let read = Atomics.load(this.keys, READ);
    if (read === written) return '';
    let s = '';
    for (; read < written; read++) s += String.fromCharCode(this.ring[read % STDIN_RING]!);
    Atomics.store(this.keys, READ, read);
    return s;
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
