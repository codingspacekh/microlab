import { describe, expect, it } from 'vitest';
import type { Control } from '../../../src/sim/control';
import { Stdin } from '../../../src/sim/stdin';

/** M9: what is typed reaches the board in order. On a board, Ctrl+C acts as it arrives (mp_hal_set_interrupt_char);
 *  lines that arrive just before it while the REPL or input() waits are taken first. The worker may read Enter and
 *  Ctrl+C at once (found under load, slice 2): the line still runs, then stops. Each typed() call is one read. */
const typed = (...chunks: string[]) => ({ typed: () => chunks.shift() ?? '' }) as unknown as Control;

describe('Stdin: lines and Ctrl+C in the order typed', () => {
  it('the REPL waiting at ...: the block\'s empty line and Ctrl+C read at once — the line first, then the interrupt', () => {
    const s = new Stdin(typed('while True: pass\n', '', '\n\x03'));
    expect(s.line()).toBe('while True: pass');
    expect(s.line()).toBeUndefined();        // waiting at ...
    expect(s.interrupted()).toBe(false);     // its wait reads '\n\x03': the line goes first
    expect(s.line()).toBe('');
    s.idle();
    expect(s.interrupted()).toBe(true);      // the loop runs: now it is stopped
    expect(s.interrupted()).toBe(false);
  });

  it('the block\'s empty line and Ctrl+C taken together: the REPL\'s own work before the block runs is never interrupted', () => {
    const s = new Stdin(typed('while True: pass\n', '\n\x03'));
    expect(s.line()).toBe('while True: pass');
    expect(s.line()).toBe('');
    expect(s.interrupted()).toBe(false);     // its echo, the ... check: still the REPL's
    expect(s.interrupted()).toBe(false);
    s.idle();                                // the block runs
    expect(s.interrupted()).toBe(true);
  });

  it('Enter and Ctrl+C arriving while the REPL is between two reads (printing ...): still the line first, then the interrupt', () => {
    const s = new Stdin(typed('while True: pass\n', '\n', '\x03'));
    expect(s.line()).toBe('while True: pass');
    expect(s.interrupted()).toBe(false);     // the REPL prints ... : the empty line arrives
    expect(s.interrupted()).toBe(false);     // then Ctrl+C: behind the line, not an interrupt at the prompt
    expect(s.line()).toBe('');
    s.idle();                                // the block runs
    expect(s.interrupted()).toBe(true);
    expect(s.interrupted()).toBe(false);
  });

  it('input() answered: once the program goes on (idle), Ctrl+C acts at once again', () => {
    const s = new Stdin(typed('Sok\n', 'abc\n', '\x03'));
    expect(s.line()).toBe('Sok');
    s.idle();
    expect(s.interrupted()).toBe(false);     // a line typed that nothing reads
    expect(s.interrupted()).toBe(true);
    expect(s.line()).toBe('abc');
  });

  it('a program that reads nothing: Ctrl+C stops it at once, though lines typed before wait unread', () => {
    const s = new Stdin(typed('abc\n', '\x03'));
    expect(s.interrupted()).toBe(false);
    expect(s.interrupted()).toBe(true);
    expect(s.line()).toBe('abc');
  });

  it('Ctrl+C at input() before the line ends: an interrupt, and what was typed before it stays', () => {
    const s = new Stdin(typed('Sok', '\x03', 'ra\n'));
    expect(s.line()).toBeUndefined();
    expect(s.interrupted()).toBe(true);
    expect(s.line()).toBe('Sokra');
  });

  it('a line typed after Ctrl+C, read at once while waiting: the interrupt first, then the line', () => {
    const s = new Stdin(typed('', '\x03print(1)\n'));
    expect(s.line()).toBeUndefined();
    expect(s.line()).toBeUndefined();
    expect(s.interrupted()).toBe(true);
    expect(s.line()).toBe('print(1)');
  });

  it('two Ctrl+C: two interrupts', () => {
    const s = new Stdin(typed('\x03\x03'));
    expect(s.interrupted()).toBe(true);
    expect(s.interrupted()).toBe(true);
    expect(s.interrupted()).toBe(false);
  });
});
