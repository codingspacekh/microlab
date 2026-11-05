import { describe, expect, it } from 'vitest';
import { VirtualClock } from '../../src/sim/clock';
import type { InputChange, TraceEntry } from '../../src/sim/pins';
import { runProject } from '../../src/sim/run';
import { nodeLoader } from './vm';

/**
 * M2 slice 3: the _ream bridge and machine.Pin, on the Pico W (behaviour copied from MicroPython's
 * ports/rp2/machine_pin.c, v1.29.0). Inputs are scripted levels over time; outputs are a pin trace.
 */
const run = async (main: string, inputs: InputChange[] = []) =>
  runProject(await nodeLoader(), { board: 'pico-w', files: { 'main.py': main }, clock: new VirtualClock(), inputs });

/** [ms, pin, level], times rounded to the millisecond (the VirtualClock creeps a few µs per line). */
const ms = (trace: TraceEntry[]) => trace.map(([t, pin, v]) => [Math.round(t / 1000), pin, v]);

describe('M2.3 Pin outputs and the pin trace', () => {
  it('Blink: the trace has each change of level, at its time', async () => {
    const r = await run('from machine import Pin\nimport time\nled = Pin(15, Pin.OUT)\nfor i in range(2):\n    led.on()\n    time.sleep(0.5)\n    led.off()\n    time.sleep(0.5)\n');
    expect(r.error).toBeUndefined();
    expect(ms(r.trace)).toEqual([[0, '15', 1], [500, '15', 0], [1000, '15', 1], [1500, '15', 0]]);
  });

  it('value(), value(x), on/off, high/low, toggle and calling the pin', async () => {
    const r = await run([
      'from machine import Pin',
      'p = Pin(15, Pin.OUT)',
      'print(p.value())',
      'p.value(1); print(p.value(), p())',
      'p.low(); print(p.value())',
      'p.high(); p.toggle(); print(p.value())',
      'p(5); print(p.value())',
      'p.off(); p.toggle(); print(p.value())',
    ].join('\n'));
    expect(r.output).toBe('0\n1 1\n0\n0\n1\n1\n');
  });

  it('setting the same level again is not a change in the trace', async () => {
    const r = await run('from machine import Pin\np = Pin(15, Pin.OUT)\np.on()\np.on()\np.value(True)\n');
    expect(ms(r.trace)).toEqual([[0, '15', 1]]);
  });

  it('value= is set before the pin becomes an output (no glitch), and value(x) on an input waits for OUT', async () => {
    const r = await run('from machine import Pin\nPin(15, Pin.OUT, value=1)\nq = Pin(16, Pin.IN)\nq.value(1)\nprint(q.value())\nq.init(Pin.OUT)\nprint(q.value())\n');
    expect(r.output).toBe('0\n1\n');
    expect(ms(r.trace)).toEqual([[0, '15', 1], [0, '16', 1]]);
  });
});

describe('M2.3 Pin inputs, pulls and scripted levels', () => {
  it('a pull-up reads 1, a pull-down 0; init() without pull removes it (None means no pull)', async () => {
    const r = await run('from machine import Pin\nprint(Pin(14, Pin.IN, Pin.PULL_UP).value(), Pin(13, Pin.IN, Pin.PULL_DOWN).value())\np = Pin(14)\np.init(Pin.IN)\nprint(p)\n');
    expect(r.output).toBe('1 0\nPin(GPIO14, mode=IN)\n');
  });

  it('reads a level that changes over time (a button pressed at 300 ms)', async () => {
    const r = await run(
      'from machine import Pin\nimport time\nb = Pin(14, Pin.IN, Pin.PULL_UP)\nt0 = time.ticks_ms()\nwhile b.value() == 1:\n    pass\nprint("pressed after", time.ticks_diff(time.ticks_ms(), t0) // 100 * 100, "ms")\n',
      [{ atUs: 300_000, pin: '14', level: 0 }],
    );
    expect(r.output).toBe('pressed after 300 ms\n');
  });

  it('open drain: 0 pulls low, 1 lets go (the pull or the outside decides)', async () => {
    const r = await run('from machine import Pin\np = Pin(15, Pin.OPEN_DRAIN, Pin.PULL_UP, value=0)\nprint(p.value())\np.value(1)\nprint(p.value(), p)\n');
    expect(r.output).toBe('0\n1 Pin(GPIO15, mode=OPEN_DRAIN, pull=PULL_UP)\n');
  });
});

describe('M2.3 which pins exist, and how they print (rp2)', () => {
  it('the bridge is not reachable from the program', async () => {
    expect((await run('import _ream\n')).error).toMatchObject({ type: 'ImportError', message: "no module named '_ream'" });
  });

  it('one object per pin, by number, board name or CPU name', async () => {
    const r = await run('from machine import Pin\nprint(Pin(15) is Pin(15), Pin("GP15") is Pin(15), Pin("GPIO15") is Pin(15))\n');
    expect(r.output).toBe('True True True\n');
  });

  it('a pin that isn\'t there: the board\'s errors', async () => {
    expect((await run('from machine import Pin\nPin(30)\n')).error).toEqual({ type: 'ValueError', message: 'invalid pin', file: 'main.py', line: 2 });
    expect((await run('from machine import Pin\nPin("GP23")\n')).error).toMatchObject({ type: 'ValueError', message: 'unknown named pin "GP23"' });
    expect((await run('from machine import Pin\nPin(15, "out")\n')).error).toMatchObject({ type: 'TypeError', message: "can't convert str to int" });
  });

  it('repr shows the CPU name, mode and pull; the constants have the rp2 values', async () => {
    const r = await run('from machine import Pin\nprint(Pin(15, Pin.OUT), Pin(14, Pin.IN, Pin.PULL_DOWN))\nprint(Pin.IN, Pin.OUT, Pin.OPEN_DRAIN, Pin.ALT, Pin.PULL_UP, Pin.PULL_DOWN, Pin.IRQ_RISING, Pin.IRQ_FALLING)\n');
    expect(r.output).toBe('Pin(GPIO15, mode=OUT) Pin(GPIO14, mode=IN, pull=PULL_DOWN)\n0 1 2 3 1 2 8 4\n');
  });

  it('after reset a pin is unconfigured, with the RP2040\'s pad pull-down on', async () => {
    const r = await run('from machine import Pin\np = Pin(15)\nprint(p, p.value())\n');
    expect(r.output).toBe('Pin(GPIO15, mode=ALT, pull=PULL_DOWN, alt=31) 0\n');
  });
});

describe('M2.3 Pin.irq: handlers run as soft IRQs (micropython.schedule)', () => {
  const button = (trigger: string) => [
    'from machine import Pin',
    'import time',
    'presses = 0',
    'def pressed(pin):',
    '    global presses',
    '    presses += 1',
    '    print("irq", pin, presses)',
    'b = Pin(14, Pin.IN, Pin.PULL_UP)',
    `b.irq(pressed, ${trigger})`,
  ];
  const press = (at: number): InputChange[] => [{ atUs: at, pin: '14', level: 0 }, { atUs: at + 100_000, pin: '14', level: 1 }];

  it('during time.sleep: the handler runs and the sleep carries on to its end', async () => {
    const r = await run([...button('Pin.IRQ_FALLING'), 't0 = time.ticks_ms()', 'time.sleep(1)', 'print("slept", time.ticks_diff(time.ticks_ms(), t0) // 10 * 10)'].join('\n'), press(300_000));
    expect(r.output).toBe('irq Pin(GPIO14, mode=IN, pull=PULL_UP) 1\nslept 1000\n');
  });

  it('during a busy loop (the VM hook delivers it)', async () => {
    const r = await run([...button('Pin.IRQ_FALLING'), 'while presses < 2:', '    pass', 'print("done")'].join('\n'), [...press(100_000), ...press(400_000)]);
    expect(r.output).toBe('irq Pin(GPIO14, mode=IN, pull=PULL_UP) 1\nirq Pin(GPIO14, mode=IN, pull=PULL_UP) 2\ndone\n');
  });

  it('only on the edges asked for: rising, falling, or both (the default)', async () => {
    const rising = await run([...button('Pin.IRQ_RISING'), 'time.sleep(1)'].join('\n'), press(300_000));
    expect(rising.output).toBe('irq Pin(GPIO14, mode=IN, pull=PULL_UP) 1\n');
    const both = await run([...button('').slice(0, -1), 'b.irq(pressed)', 'time.sleep(1)'].join('\n'), press(300_000));
    expect(both.output.split('\n').filter(Boolean)).toHaveLength(2);
  });

  it('irq(None) turns it off', async () => {
    const r = await run([...button('Pin.IRQ_FALLING'), 'b.irq(None)', 'time.sleep(1)', 'print("quiet")'].join('\n'), press(300_000));
    expect(r.output).toBe('quiet\n');
  });

  it('an error in a handler is printed, and the program carries on (the core runs scheduled handlers protected)', async () => {
    const r = await run(['from machine import Pin', 'import time', 'def bad(pin):', '    1 / 0', 'Pin(14, Pin.IN, Pin.PULL_UP).irq(bad, Pin.IRQ_FALLING)', 'time.sleep(1)', 'print("carried on")'].join('\n'), press(300_000));
    expect(r.output).toBe('Traceback (most recent call last):\n  File "main.py", line 4, in bad\nZeroDivisionError: divide by zero\ncarried on\n');
    expect(r.ended).toBe('done');
  });
});
