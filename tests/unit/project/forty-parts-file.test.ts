import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readMlab, writeMlab } from '@lib/project';
import { fortyPartsLayout } from '../../perf/forty-parts';

/** M11.7 (N-05, the classroom trial): the speed budgets' 40-part circuit as a project file, to open on the slowest
 *  school computer and watch Task Manager — the same circuit the solver benchmark and tests/e2e/perf.spec.ts use.
 *  Made by this test when it is missing (commit it); after that it must stay that circuit. */
const FILE = 'tests/fixtures/projects/forty-parts.mlab';
const MAIN = [
  '# N-05: 40 parts at full speed. Run, then look at MicroLab in Task Manager (Activity Monitor on a Mac):',
  '# under 500 MB. The console says how many pin writes a second the circuit takes — 10 000 or more.',
  'import time', 'from machine import Pin', 'p = Pin(0, Pin.OUT)', 'n = 0', 't = time.ticks_ms()',
  'while True:', '    p.toggle()', '    n += 1', '    if time.ticks_diff(time.ticks_ms(), t) >= 1000:',
  '        print("writes", n)', '        n = 0', '        t = time.ticks_ms()', '',
].join('\n');

describe('M11.7 the 40-part circuit as a project, for the trial', () => {
  it('is the benchmark\'s circuit, with a program that says its speed', () => {
    const { breadboards, parts, wires } = fortyPartsLayout();
    const project = { format: 1 as const, title: 'Forty parts', board: 'pico-w', breadboards, parts, wires };
    if (!existsSync(FILE)) writeFileSync(FILE, writeMlab({ project, files: { 'main.py': MAIN } }));
    const doc = readMlab(readFileSync(FILE));
    expect(doc.project).toMatchObject(project);
    expect(doc.project.parts).toHaveLength(40);
    expect(doc.files['main.py']).toBe(MAIN);
  });
});
