import { describe, expect, it } from 'vitest';
import { parseBoard } from '@lib/boards';
import picoJson from '../../../library/boards/pico-w/board.json';
import { Control } from '../../../src/sim/control';
import { handleStart, type WorkerMessage } from '../../../src/sim/worker-core';
import { nodeLoader } from '../../python/vm';

describe('M2.8 the worker\'s run: output batched to ≤ 60 a second, then the end', () => {
  it('a burst of prints arrives in a few messages, all of it, then the result', async () => {
    const control = new Control();
    const posts: WorkerMessage[] = [];
    let t = 0;
    await handleStart(
      { type: 'start', board: 'pico-w', files: { 'main.py': 'for i in range(100):\n    print(i)\n' }, control: control.buffer, inputs: [] },
      (m) => posts.push(m),
      await nodeLoader(),
      () => (t += 0.1),   // 0.1 ms per line printed: 100 lines in 10 ms
    );
    const outputs = posts.filter((m) => m.type === 'output');
    expect(outputs.length).toBeLessThanOrEqual(3);
    expect(outputs.map((m) => (m as { text: string }).text).join('')).toBe(Array.from({ length: 100 }, (_, i) => `${i}\n`).join(''));
    expect(posts.at(-1)).toMatchObject({ type: 'end', result: { ended: 'done' } });
  });

  it('part states are batched too: a fast Blink sends the latest LED state, a few times, not every toggle', async () => {
    const control = new Control();
    const posts: WorkerMessage[] = [];
    let t = 0;
    await handleStart({
      type: 'start', board: 'pico-w', control: control.buffer, inputs: [],
      files: { 'main.py': 'from machine import Pin\nimport time\nled = Pin(15, Pin.OUT)\nfor i in range(200):\n    led.toggle()\n    time.sleep_ms(1)\nled.on()\nprint("end")\n' },
      circuit: {
        board: { data: parseBoard(picoJson) }, breadboards: [{ id: 'bb1', size: 'half' }],
        parts: [{ id: 'r1', type: 'resistor', props: { ohms: 220 }, legs: { a: 'bb1.a5', b: 'bb1.a7' } }, { id: 'led1', type: 'led', legs: { a: 'bb1.b7', k: 'bb1.b9' } }],
        wires: [{ id: 'w1', a: 'board.GP15', b: 'bb1.e5' }, { id: 'w2', a: 'board.GND', b: 'bb1.e9' }],
      },
    }, (m) => posts.push(m), await nodeLoader(), () => (t += 1));   // 1 ms a call: ~16 changes a frame
    const parts = posts.filter((m) => m.type === 'parts') as { states: Record<string, { brightness: number }> }[];
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.length).toBeLessThan(200 / 4);
    expect(parts.at(-1)!.states['led1']!.brightness).toBeGreaterThan(0.2);   // it ends lit
    expect(posts.at(-1)).toMatchObject({ type: 'end' });
  });

  it('M4.5: the entry file is run; pin levels and display frames are batched, the latest of each', async () => {
    const control = new Control();
    const posts: WorkerMessage[] = [];
    let t = 0;
    await handleStart({
      type: 'start', board: 'pico-w', control: control.buffer, inputs: [], entry: 'blink.py',
      files: { 'main.py': 'print("not me")\n', 'blink.py': 'from machine import Pin\nled = Pin("LED", Pin.OUT)\nfor i in range(101):\n    led.toggle()\nprint("done")\n' },
    }, (m) => posts.push(m), await nodeLoader(), () => (t += 1));
    expect(posts.filter((m) => m.type === 'output').map((m) => (m as { text: string }).text).join('')).toBe('done\n');
    const boards = posts.filter((m) => m.type === 'board') as { pins: Record<string, number> }[];
    expect(boards.length).toBeGreaterThan(1);
    expect(boards.length).toBeLessThan(101 / 4);
    expect(boards.at(-1)!.pins.LED).toBe(1);   // toggled 101 times: on
  });

  it('M4.5: the micro:bit\'s display frames reach the window', async () => {
    const control = new Control();
    const posts: WorkerMessage[] = [];
    await handleStart({
      type: 'start', board: 'microbit-v2', control: control.buffer, inputs: [],
      files: { 'main.py': 'from microbit import *\ndisplay.show(Image.HEART)\nsleep(50)\n' },
    }, (m) => posts.push(m), await nodeLoader());
    const frames = posts.filter((m) => m.type === 'board' && (m as { display?: string }).display) as { display: string }[];
    expect(frames.at(-1)!.display).toBe('0909099999999990999000900');
  });

  it('M6.2: the micro:bit speaker\'s pitch reaches the window, then its silence', async () => {
    const control = new Control();
    const posts: WorkerMessage[] = [];
    await handleStart({
      type: 'start', board: 'microbit-v2', control: control.buffer, inputs: [],
      files: { 'main.py': 'from microbit import *\nimport music\nmusic.pitch(440, 50)\nsleep(50)\n' },
    }, (m) => posts.push(m), await nodeLoader());
    const sounds = posts.flatMap((m) => (m.type === 'board' && m.sound !== undefined ? [m.sound] : []));
    expect(sounds.some((hz) => Math.abs(hz - 440) < 1)).toBe(true);   // 440.14: the nearest whole µs period
    expect(sounds.at(-1)).toBe(0);
  });

  it('Control: input slots by name; an unknown one is an error', () => {
    const c = new Control(['level:14', 'volts:26']);
    c.setInput('volts:26', 1.2);
    expect([c.input(0), c.input(1)]).toEqual([NaN, 1.2]);
    expect(() => c.setInput('level:99', 1)).toThrow(/no input slot "level:99"/);
    const shared = new Control(['level:14', 'volts:26'], c.buffer);
    expect(shared.input(1)).toBe(1.2);
    expect(c.stopRequested()).toBe(false);
    shared.stop();
    expect(c.stopRequested()).toBe(true);
  });
});

describe('M9 the worker\'s REPL: the program\'s end, then lines typed, until Stop', () => {
  it('posts the end of the program, the prompt, the echo of a line typed and an error\'s explanation; Stop ends it', async () => {
    const control = new Control();
    const posts: WorkerMessage[] = [];
    const done = handleStart({ type: 'start', board: 'pico-w', files: { 'main.py': 'x = 2\n' }, control: control.buffer, inputs: [], repl: true },
      (m) => {
        posts.push(m);
        if (m.type === 'ended') control.type('x * 21\n');
        if (m.type === 'output' && m.text.includes('42\n')) control.type('y\n');
        if (m.type === 'repl-error') control.stop();
      }, await nodeLoader());
    await done;
    expect(posts.find((m) => m.type === 'ended')).toMatchObject({ result: { ended: 'done', repl: true } });
    expect(posts.filter((m) => m.type === 'output' && m.echo).map((m) => (m as { text: string }).text)).toEqual(['x * 21\n', 'y\n']);
    expect(posts.find((m) => m.type === 'repl-error')).toMatchObject({ error: { type: 'NameError', file: '<stdin>', line: 1 } });
    expect(posts.at(-1)).toMatchObject({ type: 'end' });
  });
});

describe('M9 slice 2: the worker tells each fault as it is seen', () => {
  it('a red LED straight on GP15: the burnt LED and the pin, as faults, before the end', async () => {
    const control = new Control();
    const posts: WorkerMessage[] = [];
    let t = 0;
    await handleStart({
      type: 'start', board: 'pico-w', control: control.buffer, inputs: [],
      files: { 'main.py': 'from machine import Pin\nPin(15, Pin.OUT).on()\n' },
      circuit: {
        board: { data: parseBoard(picoJson) }, breadboards: [],
        parts: [{ id: 'led1', type: 'led', legs: { a: 'board.GP15', k: 'board.GND' } }], wires: [],
      },
    }, (m) => posts.push(m), await nodeLoader(), () => (t += 1));
    const faults = posts.filter((m): m is Extract<WorkerMessage, { type: 'fault' }> => m.type === 'fault').map((m) => `${m.fault.kind} ${m.fault.on}`);
    expect(faults).toEqual(['led-burnt led1', 'pin-over-current GP15']);
    expect(posts.findIndex((m) => m.type === 'fault')).toBeLessThan(posts.findIndex((m) => m.type === 'end'));
    expect(posts.at(-1)).toMatchObject({ type: 'end', result: { ended: 'fault' } });
  });
});

