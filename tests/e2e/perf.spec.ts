import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { writeMlab } from '../../src/lib/project';
import { fortyPartsLayout } from '../perf/forty-parts';
import { treeMemoryMB } from './memory';
import { newProject } from './new-project';

/** N-05 (M11.5): the speed budgets with the real app — it starts in ≤ 5 s; a 40-part circuit (the solver benchmark's:
 *  14 LEDs with their resistors, buttons, pots, light sensors, a servo — all wired, nothing wrong) runs at full speed
 *  in ≤ 500 MB; a Python 3 program with Jedi in ≤ 500 MB. Each measure is printed (PERF …) for the gate record; the
 *  slowest school computer is the real test. */
const START_MS = 5000;
const MEMORY_MB = 500;
const WRITES_PER_SECOND = 10_000;
const GROWTH_MB = 50;

let app: ElectronApplication;
let home: string;
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

test.beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'microlab-e2e-'));
  app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, MICROLAB_USER_DATA: home } });
});

test.afterEach(async () => {
  await app?.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy())).catch(() => {});
  await app?.close();
  rmSync(home, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

const memory = () => treeMemoryMB(app.process().pid!);

async function run(win: Page, code: string) {
  await win.getByRole('textbox', { name: 'main.py' }).click();
  await win.keyboard.press(`${MOD}+A`);
  await win.keyboard.insertText(code);
  await win.getByRole('button', { name: /^Run main\.py/ }).click();
  // the check before running (M9 slice 3) speaks of the loose parts: run anyway
  const anyway = win.getByRole('dialog', { name: 'Before it runs' }).getByRole('button', { name: 'Run anyway' });
  await anyway.click({ timeout: 3000 }).catch(() => {});
}

test('N-05: MicroLab starts in 5 s or less — from its process starting to the Start page ready to use', async () => {
  const win = await app.firstWindow();
  await win.getByRole('button', { name: 'Open…' }).waitFor();
  // the main process's own clock: 0 is when it started (Playwright's launching not counted)
  const ms = Math.round(await app.evaluate(() => performance.now()));
  console.log(`PERF start ${ms} ms`);
  expect(ms).toBeLessThanOrEqual(START_MS);
});

test('N-05: a 40-part circuit runs at full speed (≥ 10 000 pin writes a second) in 500 MB or less', async () => {
  test.setTimeout(60_000);
  // GP0's LED changes at every write: the circuit is solved again each time
  const file = join(home, 'Forty parts.mlab');
  const { breadboards, parts, wires } = fortyPartsLayout();
  writeFileSync(file, writeMlab({
    project: { format: 1, title: 'Forty parts', board: 'pico-w', breadboards, parts, wires },
    files: { 'main.py': '' },
  }));
  await app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as typeof dialog.showOpenDialog;
  }, file);
  const win = await app.firstWindow();
  await win.getByRole('button', { name: 'Open…' }).click();
  await expect(win.locator('[data-part]')).toHaveCount(40);

  await run(win, [
    'import time', 'from machine import Pin', 'p = Pin(0, Pin.OUT)', 'n = 0', 't = time.ticks_ms()',
    'while True:', '    p.toggle()', '    n += 1', '    if time.ticks_diff(time.ticks_ms(), t) >= 1000:',
    '        print("writes", n)', '        n = 0', '        t = time.ticks_ms()', '',
  ].join('\n'));
  const console_ = win.getByRole('log', { name: 'Console' });
  // the third second's count: the first may include the start
  await expect.poll(async () => ((await console_.textContent()) ?? '').match(/writes \d+/g)?.length ?? 0, { timeout: 15_000 }).toBeGreaterThanOrEqual(3);
  const counts = ((await console_.textContent()) ?? '').match(/writes (\d+)/g)!.map((s) => Number(s.split(' ')[1]));
  const { mb, processes } = memory();
  console.log(`PERF circuit ${counts.at(-1)} writes/s, ${mb} MB in ${processes} processes`);
  expect(counts.at(-1)).toBeGreaterThanOrEqual(WRITES_PER_SECOND);
  expect(mb).toBeLessThanOrEqual(MEMORY_MB);

  // and it doesn't grow on while it runs (every change was once kept: 40 000 a second, without end). Memory freed is
  // given back late on a computer with plenty (Windows' private memory on GitHub's 16 GB runner rose 120 MB, then
  // stayed): from its 10th second to its 17th it must stay level, and within the budget all the while
  const at = async (n: number) => {
    await expect.poll(async () => ((await console_.textContent()) ?? '').match(/writes \d+/g)?.length ?? 0, { timeout: 20_000 }).toBeGreaterThanOrEqual(n);
    const m = memory().mb;
    const each = await app.evaluate(({ app: a }) => a.getAppMetrics().map((p) => `${p.type} ${Math.round((p.memory.privateBytes ?? p.memory.workingSetSize) / 1024)}`).join(', '));
    console.log(`PERF circuit after ${n} s: ${m} MB (${each})`);
    return m;
  };
  const ten = await at(10);
  const seventeen = await at(17);
  expect(Math.max(ten, seventeen)).toBeLessThanOrEqual(MEMORY_MB);
  expect(seventeen - ten).toBeLessThanOrEqual(GROWTH_MB);
});

test('N-05: a Python 3 program running, with Jedi answering, in 500 MB or less', async () => {
  test.skip(!existsSync(join('vendor', 'python-tools', 'jedi')), 'Jedi not fetched: npm run fetch:python -- --tools');
  const win = await app.firstWindow();
  await newProject(win, 'New Python project');
  await win.getByRole('textbox', { name: 'main.py' }).click();
  await win.keyboard.press(`${MOD}+A`);
  await win.keyboard.insertText('import turtle\nturtle.fo');
  await win.keyboard.press('Control+Space');
  await expect(win.locator('.cm-tooltip-autocomplete').getByRole('option', { name: /forward/ })).toBeVisible({ timeout: 10_000 });
  await win.keyboard.press('Escape');
  await win.keyboard.press(`${MOD}+A`);
  await win.keyboard.insertText('import time\nn = 0\nwhile True:\n    n += 1\n    if n % 1000000 == 0:\n        print("still", n)\n');
  await win.keyboard.press('F5');
  await expect(win.locator('.pyshell')).toContainText('still', { timeout: 15_000 });
  const { mb, processes } = memory();
  console.log(`PERF python ${mb} MB in ${processes} processes`);
  expect(mb).toBeLessThanOrEqual(MEMORY_MB);
});
