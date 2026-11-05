import { describe, expect, it } from 'vitest';
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
