import { describe, expect, it } from 'vitest';
import { Motion, posture } from '../../../src/sim/motion';

describe('M2.6c posture: CODAL\'s gesture rules', () => {
  it.each([
    [[0, 0, -1024], 'face up'], [[0, 0, 1024], 'face down'],
    [[-1024, 0, 0], 'left'], [[1024, 0, 0], 'right'], [[0, 1024, 0], 'up'], [[0, -1024, 0], 'down'],
    [[0, 0, 0], 'freefall'], [[0, 0, 2500], '2g'], [[0, 0, 4000], '3g'], [[0, 0, 7000], '6g'], [[0, 0, 9000], '8g'],
    [[500, 500, -500], ''],
  ] as const)('%j is "%s"', (v, g) => {
    expect(posture([...v] as [number, number, number])).toBe(g);
  });

  it('x is tested before y (tilted both ways: left)', () => {
    expect(posture([-900, 900, 0])).toBe('left');
  });
});

describe('M2.6c Motion over time', () => {
  it('reports the first posture, then each change; a shake lasts 500 ms, then the posture comes back', () => {
    let t = 0;
    const m = new Motion([{ atUs: 100, gesture: 'shake' }, { atUs: 200, vector: [0, 1024, 0] }], () => t);
    expect(m.takeEvents()).toEqual(['face up']);
    t = 100;
    expect(m.gesture()).toBe('shake');
    t = 200;
    expect(m.values()).toEqual([0, 1024, 0]);
    expect(m.gesture()).toBe('shake');   // still shaking
    t = 600_100;
    expect(m.gesture()).toBe('up');
    expect(m.takeEvents()).toEqual(['shake', 'up']);
    expect(m.takeEvents()).toEqual([]);
  });
});
