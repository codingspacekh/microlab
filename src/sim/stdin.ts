import type { Control } from './control';

/**
 * The board's serial console as the program reads it (M9, F-23, screen 29c): what the student types in the console
 * (through the Control buffer), or a test's script of [µs, text]. input() takes a line from it; at the REPL each
 * line runs. Ctrl+C (\x03) never reaches the text: it interrupts the program, as a board's USB console does
 * (mp_hal_set_interrupt_char); what was typed before it stays.
 */
export class Stdin {
  /** What is typed and not yet taken; a Ctrl+C (\x03) that came while a reader waited stays in its place. */
  private text = '';
  /** Ctrl+C typed while nothing was reading: an interrupt at once. */
  private interrupts = 0;
  /** input() or the REPL is reading: from its first wait until the program it read for goes on (idle) — so what
   *  arrives while the REPL is between two lines (printing ...) keeps its place too. */
  private waiting = false;
  /** A reader has just taken a line and not yet run what it read for, nor read again: a Ctrl+C held behind that line
   *  waits for it to run (the REPL's own work in between — its echo, the ... check — is never interrupted). */
  private holding = false;
  private readonly script: [number, string][];

  constructor(private readonly control: Control | undefined, script: [number, string][] = [], private readonly now: () => number = () => 0) {
    this.script = [...script].sort((a, b) => a[0] - b[0]);
  }

  /** What has arrived. On a board Ctrl+C acts as it arrives — but lines arriving with it while a reader waits were
   *  taken first (the REPL ran the block, then Ctrl+C stops it): those keep it behind them. */
  private pull(): void {
    let got = this.control?.typed() ?? '';
    while (this.script.length && this.script[0]![0] <= this.now()) got += this.script.shift()![1];
    if (this.waiting) {
      this.text += got;
      return;
    }
    for (const c of got) {
      if (c === '\x03') this.interrupts++;
      else this.text += c;
    }
  }

  /** A whole line typed (without its line ending), or undefined while there isn't one yet — or while a Ctrl+C typed
   *  before its end is still to be taken. */
  line(): string | undefined {
    this.pull();   // what arrives before a reader's first read acts as it arrives
    const m = /\r\n|\r|\n/.exec(this.text);
    const c = this.text.indexOf('\x03');
    this.waiting = true;
    this.holding = false;
    if (!m || (c >= 0 && c < m.index) || this.interrupts) return undefined;
    this.holding = true;
    const line = this.text.slice(0, m.index);
    this.text = this.text.slice(m.index + m[0].length);
    return line;
  }

  /** The program goes on after input() or the REPL's line: Ctrl+C typed from now acts as it arrives. */
  idle(): void {
    this.waiting = false;
    this.holding = false;
  }

  /** True once for each Ctrl+C typed, as it arrives — or, if it came while a reader waited, once the lines before it
   *  are taken; what was typed before it on its line stays. */
  interrupted(): boolean {
    this.pull();
    if (this.holding) return false;
    if (this.interrupts) {
      this.interrupts--;
      return true;
    }
    const c = this.text.indexOf('\x03');
    if (c < 0 || /\r|\n/.test(this.text.slice(0, c))) return false;
    this.text = this.text.slice(0, c) + this.text.slice(c + 1);
    return true;
  }
}
