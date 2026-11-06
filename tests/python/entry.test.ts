import { describe, expect, it } from 'vitest';
import { VirtualClock } from '../../src/sim/clock';
import { runProject, type RunOptions } from '../../src/sim/run';
import { nodeLoader } from './vm';

/** M4.5 (requirements Rev 7, Q19): Run runs the open file, as Thonny does — boot.py first on the Pico W and ESP32
 *  (the micro:bit has none), then the file as __main__, the other files there to import. */
const run = async (o: Partial<RunOptions> & Pick<RunOptions, 'files'>) => runProject(await nodeLoader(), { clock: new VirtualClock(), ...o });

const files = {
  'boot.py': 'print("boot")\n',
  'main.py': 'print("main")\n',
  'helper.py': 'def twice(x):\n    return 2 * x\nif __name__ == "__main__":\n    print("helper on its own")\n',
  'led_test.py': 'import helper\nprint("test", __name__, helper.twice(21))\n',
};

describe('M4.5 Q19 the entry file', () => {
  it('without one, the board starts as when switched on: boot.py, then main.py', async () => {
    expect((await run({ board: 'pico-w', files })).output).toBe('boot\nmain\n');
  });

  it.each(['pico-w', 'esp32-devkit-v1'] as const)('on %s: boot.py, then the open file as __main__ — not main.py; it imports another file', async (board) => {
    const r = await run({ board, files, entry: 'led_test.py' });
    expect(r.output).toBe('boot\ntest __main__ 42\n');
  });

  it('an imported file\'s own test code (under if __name__ == "__main__") doesn\'t run; run on its own, it does', async () => {
    expect((await run({ board: 'pico-w', files, entry: 'helper.py' })).output).toBe('boot\nhelper on its own\n');
  });

  it('the micro:bit has no boot.py: it is never run there', async () => {
    expect((await run({ board: 'microbit-v2', files })).output).toBe('main\n');
    expect((await run({ board: 'microbit-v2', files, entry: 'led_test.py' })).output).toBe('test __main__ 42\n');
  });

  it('an error names the open file and its line', async () => {
    const r = await run({ board: 'pico-w', files: { 'oops.py': 'x = 1\nprint(y)\n' }, entry: 'oops.py' });
    expect(r.error).toMatchObject({ type: 'NameError', file: 'oops.py', line: 2 });
  });
});

describe('M4.5 what the window is told while running', () => {
  it('every pin level change, the Pico W\'s own LED included', async () => {
    const seen: string[] = [];
    await run({ board: 'pico-w', files: { 'main.py': 'from machine import Pin\nled = Pin("LED", Pin.OUT)\nled.on()\nled.off()\nPin(15, Pin.OUT).on()\n' },
      onPin: (pin, level) => seen.push(`${pin}=${level}`) });
    expect(seen).toEqual(['LED=1', 'LED=0', '15=1']);
  });

  it('every frame of the micro:bit\'s display', async () => {
    const frames: string[] = [];
    await run({ board: 'microbit-v2', files: { 'main.py': 'from microbit import *\ndisplay.show(Image.HEART)\nsleep(100)\ndisplay.clear()\n' },
      onDisplay: (pixels) => frames.push(pixels), maxUs: 1e6 });
    expect(frames[0]).toBe('0909099999999990999000900');
    expect(frames.at(-1)).toBe('0'.repeat(25));
  });
});
