import { describe, expect, it } from 'vitest';
import { addOutput, emptyPlot, parsePlotLine, printNames, rate } from '@lib/plot';

/** M9 slice 5 (F-26, screen 07): numbers printed as print(a, b) are drawn as live lines, as in Mu and Thonny. */
describe('parsePlotLine: a line of output with numbers', () => {
  it('one number, several, a tuple, a list', () => {
    expect(parsePlotLine('34.48276')).toEqual({ values: [34.48276], labels: [undefined] });
    expect(parsePlotLine('1 -2.5 3e-3')).toEqual({ values: [1, -2.5, 0.003], labels: [undefined, undefined, undefined] });
    expect(parsePlotLine('(12, 340)')!.values).toEqual([12, 340]);
    expect(parsePlotLine('[0.1, 0.2, 0.3]')!.values).toEqual([0.1, 0.2, 0.3]);
  });
  it('named: "temp: 24.5 humidity: 40", "x=3, y=4", "Temp: 24.5"', () => {
    expect(parsePlotLine('temp: 24.5 humidity: 40')).toEqual({ values: [24.5, 40], labels: ['temp', 'humidity'] });
    expect(parsePlotLine('x=3, y=4')).toEqual({ values: [3, 4], labels: ['x', 'y'] });
    expect(parsePlotLine('Light level: 512')).toEqual({ values: [512], labels: ['Light level'] });
  });
  it('words that aren\'t names, or no number: not plotted', () => {
    for (const line of ['Hello 3 times', 'Button pressed: stopping traffic', '', 'done', 'inf', 'GP15 on', '12 cm away']) {
      expect(parsePlotLine(line)).toBeNull();
    }
  });
  it('at most 8 numbers on a line', () => {
    expect(parsePlotLine('1 2 3 4 5 6 7 8')!.values).toHaveLength(8);
    expect(parsePlotLine('1 2 3 4 5 6 7 8 9')).toBeNull();
  });
});

describe('printNames: what the code printed, for lines with no names', () => {
  const code = ['while True:', '    d = distance_cm()', '    print("Distance")', '    print(d)', '    print(x, y + 1)', ''].join('\n');
  it('the one print with that many values names them, with its line', () => {
    expect(printNames(code, 1)).toEqual({ names: ['d'], line: 4 });
    expect(printNames(code, 2)).toEqual({ names: ['x', 'y + 1'], line: 5 });
  });
  it('two prints of one value each: no names to give', () => {
    expect(printNames('print(a)\nprint(b)\n', 1)).toBeNull();
  });
  it('keyword arguments and string parts don\'t count; a comment after is fine', () => {
    expect(printNames('print(t, h, sep=",")  # both\n', 2)).toEqual({ names: ['t', 'h'], line: 1 });
    expect(printNames('print(f(1, 2), d[0])\n', 2)).toEqual({ names: ['f(1, 2)', 'd[0]'], line: 1 });
  });
});

describe('the plot: output as it comes, each line a sample at its time', () => {
  it('lines split across chunks are joined; text lines between are skipped; series by position', () => {
    let p = emptyPlot();
    p = addOutput(p, '1 10\n2 ', 0.1);
    p = addOutput(p, '20\nHello\n3 30\n', 0.2);
    expect(p.series.map((s) => s.points)).toEqual([[[0.1, 1], [0.2, 2], [0.2, 3]], [[0.1, 10], [0.2, 20], [0.2, 30]]]);
    expect(p.width).toBe(2);
  });
  it('names from the output stay with their series', () => {
    const p = addOutput(emptyPlot(), 'temp: 24.5 humidity: 40\n', 1);
    expect(p.series.map((s) => s.label)).toEqual(['temp', 'humidity']);
  });
  it('about 5 a second', () => {
    let p = emptyPlot();
    for (let i = 0; i <= 20; i++) p = addOutput(p, `${i}\n`, i * 0.2);
    expect(rate(p)).toBe(5);
  });
  it('keeps the last 10 minutes', () => {
    let p = emptyPlot();
    p = addOutput(p, '1\n', 0);
    p = addOutput(p, '2\n', 700);
    expect(p.series[0]!.points).toEqual([[700, 2]]);
  });
});
