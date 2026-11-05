import { describe, expect, it } from 'vitest';
import { RealClock, VirtualClock, type Clock } from '../../src/sim/clock';
import { runProject, type ProjectFiles } from '../../src/sim/run';
import { nodeLoader } from './vm';

/** M2 slice 2: `time` reads the run's Clock (F-39); tests use the VirtualClock (architecture §2.3). */
const run = async <C extends Clock = VirtualClock>(main: string, clock: C = new VirtualClock() as unknown as C) => {
  const files: ProjectFiles = { 'main.py': main };
  const r = await runProject(await nodeLoader(), { files, clock });
  return { ...r, clock };
};

describe('M2.2 time on the VirtualClock', () => {
  it('time.sleep(1) moves the clock by 1000 ms', async () => {
    const { clock, output } = await run('import time\ntime.sleep(1)\nprint("ok")\n');
    expect(output).toBe('ok\n');
    expect(clock.nowUs()).toBeGreaterThanOrEqual(1_000_000);
    expect(clock.nowUs()).toBeLessThan(1_010_000);   // plus a little creep, never another sleep's worth
  });

  it('sleep takes seconds (float too), sleep_ms and sleep_us their units; ticks_* read them back', async () => {
    const { output } = await run([
      'import time',
      't = time.ticks_ms()',
      'time.sleep(0.25)',
      'print(time.ticks_diff(time.ticks_ms(), t))',
      't = time.ticks_ms()',
      'time.sleep_ms(120)',
      'print(time.ticks_diff(time.ticks_ms(), t))',
      'u = time.ticks_us()',
      'time.sleep_us(1500)',
      'print(time.ticks_diff(time.ticks_us(), u) >= 1500, time.ticks_diff(time.ticks_us(), u) < 1700)',
    ].join('\n'));
    expect(output).toBe('250\n120\nTrue True\n');
  });

  it('a negative sleep_ms does nothing (as on the boards)', async () => {
    const { output, clock } = await run('import time\ntime.sleep_ms(-5)\nprint("ok")\n');
    expect(output).toBe('ok\n');
    expect(clock.nowUs()).toBeLessThan(1000);
  });

  it('a busy-wait loop on ticks_ms ends, without taking real time', async () => {
    // 50 µs a reading: ~20 000 turns for one simulated second (a Pico makes ~100 000; fewer keeps the test quick
    // when every test file runs at once)
    const t = performance.now();
    const { output, clock } = await run('import time\nt0 = time.ticks_ms()\nn = 0\nwhile time.ticks_diff(time.ticks_ms(), t0) < 1000:\n    n += 1\nprint("done", n > 0)\n', new VirtualClock({ readUs: 50 }));
    expect(output).toBe('done True\n');
    expect(clock.nowUs()).toBeGreaterThanOrEqual(1_000_000);
    expect(performance.now() - t).toBeLessThan(3000);
  });

  it('ten simulated seconds of Blink take a moment', async () => {
    const t = performance.now();
    const { clock, output } = await run('import time\nfor i in range(10):\n    time.sleep(0.5)\n    time.sleep(0.5)\nprint("blinked")\n');
    expect(output).toBe('blinked\n');
    expect(clock.nowUs()).toBeGreaterThanOrEqual(10_000_000);
    expect(performance.now() - t).toBeLessThan(1000);
  });

  it('ticks wrap at 2**30 like the boards; ticks_add refuses a step ticks_diff can\'t measure back', async () => {
    const { output } = await run([
      'import time',
      'print(time.ticks_add(0, -1), time.ticks_diff(time.ticks_add(0, -1), 0), time.ticks_diff(5, time.ticks_add(5, 2**29 - 1)))',
      'time.ticks_add(0, 2**29)',
    ].join('\n'));
    expect(output).toBe(`${2 ** 30 - 1} -1 ${-(2 ** 29 - 1)}\nTraceback (most recent call last):\n  File "main.py", line 3, in <module>\nOverflowError: ticks interval overflow\n`);
  });

  it('utime is the same module, and print(time) reads as the board\'s', async () => {
    const { output } = await run('import time, utime\nprint(time is utime, time)\n');
    expect(output).toBe("True <module 'time'>\n");
  });

  it('ticks_cpu counts too (µs here)', async () => {
    const { output } = await run('import time\nc = time.ticks_cpu()\ntime.sleep_ms(2)\nprint(time.ticks_diff(time.ticks_cpu(), c) >= 2000)\n');
    expect(output).toBe('True\n');
  });
});

describe('M2.2 the line being run while the program sleeps (screen 03)', () => {
  it('is the student\'s sleep line, not the sim\'s own time module', async () => {
    const at: string[] = [];
    await runProject(await nodeLoader(), {
      files: {
        'main.py': 'import time\nfrom lib_blink import pause\nfor i in range(2):\n    time.sleep(0.5)\n    pause()\n',
        'lib/lib_blink.py': 'import time\ndef pause():\n    time.sleep_ms(500)\n',
      },
      clock: new VirtualClock(),
      onSleep: (w) => at.push(w ? `${w.file}:${w.line}` : '?'),
    });
    expect(at).toEqual(['main.py:4', 'lib/lib_blink.py:3', 'main.py:4', 'lib/lib_blink.py:3']);
  });
});

describe('M2.2 time on the RealClock (the app)', () => {
  it('time.sleep(0.05) takes about 50 ms of wall time', async () => {
    const t = performance.now();
    const { output } = await run('import time\ntime.sleep(0.05)\nprint("ok")\n', new RealClock());
    const ms = performance.now() - t;
    expect(output).toBe('ok\n');
    expect(ms).toBeGreaterThanOrEqual(45);
  });
});
