import type { Control } from './control';

/**
 * The board's serial console as the program reads it (M9, F-23, screen 29c): what the student types in the console
 * (through the Control buffer), or a test's script of [µs, text]. input() takes a line from it; at the REPL each
 * line runs. Ctrl+C (\x03) never reaches the text: it interrupts the program, as a board's USB console does
 * (mp_hal_set_interrupt_char); what was typed before it stays.
 */
export class Stdin {
  private text = '';
  private interrupts = 0;
  private readonly script: [number, string][];

  constructor(private readonly control: Control | undefined, script: [number, string][] = [], private readonly now: () => number = () => 0) {
    this.script = [...script].sort((a, b) => a[0] - b[0]);
  }

  private pull(): void {
    let got = this.control?.typed() ?? '';
    while (this.script.length && this.script[0]![0] <= this.now()) got += this.script.shift()![1];
    for (const c of got) {
      if (c === '\x03') this.interrupts++;
      else this.text += c;
    }
  }

  /** A whole line typed (without its line ending), or undefined while there isn't one yet. */
  line(): string | undefined {
    this.pull();
    const m = /\r\n|\r|\n/.exec(this.text);
    if (!m) return undefined;
    const line = this.text.slice(0, m.index);
    this.text = this.text.slice(m.index + m[0].length);
    return line;
  }

  /** True once for each Ctrl+C typed. */
  interrupted(): boolean {
    this.pull();
    if (!this.interrupts) return false;
    this.interrupts--;
    return true;
  }

}
