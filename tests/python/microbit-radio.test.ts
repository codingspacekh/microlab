import { describe, expect, it } from 'vitest';
import { VirtualClock } from '../../src/sim/clock';
import { Control } from '../../src/sim/control';
import { runProject, type RunResult } from '../../src/sim/run';
import { nodeLoader } from './vm';

/** M7 (the teacher's requests): the micro:bit's radio (modradio.c's calls and errors) — what it sends goes to the
 *  window, what another micro:bit sends waits in its queue — and the accelerometer's postures and moments from the
 *  micro:bit card: face down, freefall, 3g. */
const SLOTS = ['board:accelx', 'board:accely', 'board:accelz', 'radio:seq', 'radio:len', ...Array.from({ length: 32 }, (_, i) => `radio:${i}`)];
const run = async (lines: string[], opts: { radioIn?: [number, string][]; control?: Control } = {}): Promise<RunResult> =>
  runProject(await nodeLoader(), { board: 'microbit-v2', files: { 'main.py': `${lines.join('\n')}\n` }, clock: new VirtualClock(), maxUs: 2e6, ...opts });
const out = (r: RunResult) => r.output.split('\n').filter((l) => l && !l.startsWith('MicroPython'));
const hex = (s: string) => [...new TextEncoder().encode(s)].map((b) => b.toString(16).padStart(2, '0')).join('');

describe('M7 the micro:bit\'s radio', () => {
  it('off when the program starts: sending says so, as the micro:bit does', async () => {
    const r = await run(['import radio', "radio.send('hi')"]);
    expect(r.error).toMatchObject({ type: 'ValueError', message: 'radio is not enabled' });
  });

  it('send() a string: its 3-byte header and the text, to the window; send_bytes() as they are', async () => {
    const r = await run(['import radio', 'radio.on()', 'radio.config(group=23)', "radio.send('hello')", "radio.send_bytes(b'\\x05AB')"]);
    expect(r.error).toBeUndefined();
    expect(r.radio.map(([, h]) => h)).toEqual([`010001${hex('hello')}`, '054142']);
    expect(r.bus.some(([, e]) => e === 'radio channel=7 group=23 send 01 00 01 68 65 6c 6c 6f')).toBe(true);
  });

  it('a message from another micro:bit waits: receive() gives it, then None; receive_full() its rssi and time', async () => {
    const r = await run(['import radio', 'from microbit import sleep', 'radio.on()', 'print(radio.receive())', 'sleep(200)',
      'print(radio.receive())', 'print(radio.receive())', 'sleep(200)', 'm, rssi, t = radio.receive_full()', 'print(m, rssi, t > 0)'],
    { radioIn: [[100_000, 'hello'], [300_000, 'again']] });
    expect(out(r)).toEqual(['None', 'hello', 'None', "b'\\x01\\x00\\x01again' -45 True"]);
  });

  it('a queue of 3 (config(queue=…)); with the radio off nothing waits; a setting out of range is an error', async () => {
    const r = await run(['import radio', 'from microbit import sleep', 'radio.on()', 'sleep(100)', 'print([radio.receive() for _ in range(4)])',
      'radio.off()', 'sleep(100)', 'radio.on()', 'print(radio.receive())', 'radio.config(group=300)'],
    { radioIn: [[10_000, 'a'], [20_000, 'b'], [30_000, 'c'], [40_000, 'd'], [150_000, 'lost']] });
    expect(out(r).slice(0, 2)).toEqual(["['a', 'b', 'c', None]", 'None']);
    expect(r.error).toMatchObject({ type: 'ValueError', message: "value out of range for argument 'group'" });
  });

  it('the window\'s message (the micro:bit card\'s Send): its bytes in the radio slots — lost if the radio is off then', async () => {
    const control = new Control(SLOTS);
    const send = (text: string, n: number) => {
      [...new TextEncoder().encode(text)].forEach((b, i) => control.setInput(`radio:${i}`, b));
      control.setInput('radio:len', text.length);
      control.setInput('radio:seq', n);
    };
    send('early', 1);   // before the program turns its radio on
    let sleeps = 0;
    const r = await runProject(await nodeLoader(), {
      board: 'microbit-v2', clock: new VirtualClock(), maxUs: 2e6, control, onSleep: () => { if (++sleeps === 1) send('ping', 2); },
      files: { 'main.py': ['import radio', 'from microbit import sleep', 'radio.on()', 'sleep(10)', 'print(radio.receive())', 'print(radio.receive())', ''].join('\n') },
    });
    expect(out(r)).toEqual(['ping', 'None']);
  });
});

describe('M7 the accelerometer\'s postures and moments (the micro:bit card)', () => {
  it.each([[[0, 0, 1024], 'face down'], [[0, 0, 0], 'freefall'], [[0, 0, -3500], '3g'], [[0, 0, -9000], '8g'], [[-1024, 0, 0], 'left'], [[0, 1024, 0], 'up']] as const)(
    '%j is %s', async (v, gesture) => {
      const control = new Control(SLOTS);
      control.setInput('board:accelx', v[0]);
      control.setInput('board:accely', v[1]);
      control.setInput('board:accelz', v[2]);
      const r = await run(['from microbit import *', 'print(accelerometer.current_gesture())', 'print(accelerometer.get_z())'], { control });
      expect(out(r)).toEqual([gesture, String(v[2])]);
    });
});
