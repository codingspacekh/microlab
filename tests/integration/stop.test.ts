import { Worker } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';
import { RealClock } from '../../src/sim/clock';
import { Control } from '../../src/sim/control';
import { runProject } from '../../src/sim/run';
import { nodeLoader } from '../python/vm';

/**
 * M2 slice 8 (N-03): Stop, from another thread, while the program holds this one. A small worker thread sets the
 * Stop flag after `afterMs`, as the window does; the run must end within 0.5 s of it.
 */
function stopAfter(control: Control, afterMs: number): Promise<void> {
  const w = new Worker(
    `const { workerData } = require('node:worker_threads');
     const cells = new Int32Array(workerData.buffer);
     setTimeout(() => { Atomics.store(cells, 0, 1); Atomics.add(cells, 1, 1); Atomics.notify(cells, 1); process.exit(0); }, workerData.afterMs);`,
    { eval: true, workerData: { buffer: control.buffer, afterMs } },
  );
  return new Promise((resolve) => w.on('exit', () => resolve()));
}

/** Runs `main` (which first prints "go") and asks for Stop 200 ms after the program has started. */
async function runUntilStopped(main: string, afterMs = 200) {
  const control = new Control();
  let done: Promise<void> | undefined;
  let started = 0;
  const r = await runProject(await nodeLoader(), {
    board: 'pico-w',
    files: { 'main.py': `print("go")\n${main}` },
    clock: new RealClock({ wait: (ms) => control.wait(ms) }),
    control,
    onOutput: (text) => {
      if (!done && text.startsWith('go')) {
        started = performance.now();
        done = stopAfter(control, afterMs);   // its own thread: this one is busy running the program
      }
    },
  });
  const ms = performance.now() - started;
  await done;
  return { ...r, ms };
}

describe('M2.8 Stop ends the run in ≤ 0.5 s (N-03)', () => {
  it.each([
    ['while True: pass', 'while True:\n    pass\n'],
    ['a one-line loop', 'x = 0\nwhile True: x += 1\n'],
    ['a long sleep', 'import time\ntime.sleep(60)\n'],
    ['sleeps in a loop', 'import time\nwhile True:\n    time.sleep_ms(1)\n'],
    ['a busy loop calling the board', 'from machine import Pin\np = Pin(15, Pin.OUT)\nwhile True:\n    p.toggle()\n'],
  ])('%s', async (_, main) => {
    const r = await runUntilStopped(main);
    expect(r.ended).toBe('stopped');
    expect(r.ms).toBeLessThan(200 + 500);
    expect(r.output).toMatch(/^go\n[\s\S]*KeyboardInterrupt: \n$/);
  }, 10_000);
});

describe('M2.8 live inputs from the window', () => {
  it('an input slot set from another thread reaches the pin, and wakes a sleep', async () => {
    const control = new Control(['level:14']);
    control.setInput('level:14', 1);
    const w = new Worker(
      `const { workerData } = require('node:worker_threads');
       const cells = new Int32Array(workerData.buffer);
       const slots = new Float64Array(workerData.buffer, workerData.slotsAt);
       setTimeout(() => { slots[0] = 0; Atomics.add(cells, 1, 1); Atomics.notify(cells, 1); }, 150);
       setTimeout(() => process.exit(0), 300);`,
      { eval: true, workerData: { buffer: control.buffer, slotsAt: control.slotsOffset } },
    );
    const r = await runProject(await nodeLoader(), {
      board: 'pico-w',
      files: { 'main.py': 'from machine import Pin\nimport time\nb = Pin(14, Pin.IN, Pin.PULL_UP)\nb.irq(lambda p: print("pressed"), Pin.IRQ_FALLING)\nt = time.ticks_ms()\nwhile b.value() and time.ticks_diff(time.ticks_ms(), t) < 2000:\n    time.sleep_ms(500)\nprint(b.value())\n' },
      clock: new RealClock({ wait: (ms) => control.wait(ms) }),
      control,
    });
    await new Promise((resolve) => w.on('exit', resolve));
    expect(r.output).toBe('pressed\n0\n');
  }, 10_000);

  it('a button pressed in the window (a live part slot) runs its IRQ handler at once, in the middle of a long sleep', async () => {
    const { parseBoard } = await import('@lib/boards');
    const pico = parseBoard((await import('../../library/boards/pico-w/board.json')).default);
    const control = new Control(['pressed:btn1']);
    const w = new Worker(
      `const { workerData } = require('node:worker_threads');
       const cells = new Int32Array(workerData.buffer);
       const slots = new Float64Array(workerData.buffer, workerData.slotsAt);
       setTimeout(() => { slots[0] = 1; Atomics.add(cells, 1, 1); Atomics.notify(cells, 1); }, 150);
       setTimeout(() => process.exit(0), 300);`,
      { eval: true, workerData: { buffer: control.buffer, slotsAt: control.slotsOffset } },
    );
    const t = performance.now();
    const r = await runProject(await nodeLoader(), {
      board: 'pico-w',
      circuit: {
        board: { data: pico }, breadboards: [{ id: 'bb1', size: 'half' }],
        parts: [{ id: 'btn1', type: 'button', legs: { '1a': 'bb1.e10', '2a': 'bb1.e12', '1b': 'bb1.f10', '2b': 'bb1.f12' } }],
        wires: [{ id: 'w1', a: 'board.GP14', b: 'bb1.a10' }, { id: 'w2', a: 'board.GND', b: 'bb1.j12' }],
      },
      // the handler notes when it ran; the sleep itself carries on to its end, as on a board
      files: { 'main.py': 'from machine import Pin\nimport time\nhit = []\nt0 = time.ticks_ms()\nPin(14, Pin.IN, Pin.PULL_UP).irq(lambda p: hit.append(time.ticks_diff(time.ticks_ms(), t0)), Pin.IRQ_FALLING)\ntime.sleep(1)\nprint("pressed", hit[0] < 500)\n' },
      clock: new RealClock({ wait: (ms) => control.wait(ms) }),
      control,
    });
    await new Promise((resolve) => w.on('exit', resolve));
    expect(r.output).toBe('pressed True\n');
    expect(performance.now() - t).toBeLessThan(1000 + 2000);
  }, 15_000);
});

