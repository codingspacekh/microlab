import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { newProject } from './new-project';

/** The teacher's request (2026-11-09): younger students write code before they build circuits — the board's side (its
 *  rail and the circuit) folds away, the code takes the whole width; its button by the file tabs, or Ctrl+B / ⌘B, and
 *  remembered. A run brings it back (and so does the check before running), so the board is seen working; the
 *  choice to keep it folded stays for next time. */
let app: ElectronApplication;
let home: string;
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

async function launch(): Promise<Page> {
  app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, MICROLAB_USER_DATA: home } });
  const win = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900));
  await win.waitForFunction(() => window.innerWidth === 1440);
  return win;
}
async function restart(): Promise<Page> {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy()));
  await app.close();
  return launch();
}
const circuit = (win: Page) => win.getByRole('region', { name: 'Circuit' });
const codeWidth = async (win: Page) => (await win.getByRole('region', { name: 'Code' }).boundingBox())!.width;

test.beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'microlab-e2e-')); });
test.afterEach(async () => {
  await app?.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy())).catch(() => {});
  await app?.close();
  rmSync(home, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

test('folded away: the code takes the whole width; its button and Ctrl+B; remembered after a restart', async () => {
  let win = await launch();
  await newProject(win, 'New micro:bit project');
  const toggle = win.getByRole('button', { name: 'The board', exact: true });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  const narrow = await codeWidth(win);
  await toggle.click();
  await expect(circuit(win)).toHaveCount(0);
  await expect(win.getByRole('navigation', { name: 'Board and parts' })).toHaveCount(0);
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(await codeWidth(win)).toBeGreaterThan(1400);
  expect(await codeWidth(win)).toBeGreaterThan(narrow + 500);
  await win.keyboard.press(`${MOD}+B`);
  await expect(circuit(win)).toBeVisible();
  await win.keyboard.press(`${MOD}+B`);
  await expect(circuit(win)).toHaveCount(0);

  win = await restart();
  await newProject(win, 'New micro:bit project', 'Second');
  await expect(circuit(win)).toHaveCount(0);
  // P (the parts) asks to build: the board comes back with its parts open
  await win.getByRole('button', { name: 'The board', exact: true }).focus();
  await win.keyboard.press('p');
  await expect(circuit(win)).toBeVisible();
  await expect(win.getByRole('region', { name: 'Parts' })).toBeVisible();
});

test('folded away, a run brings the board back to be seen working — next time it is folded again', async () => {
  let win = await launch();
  await newProject(win, 'New micro:bit project');
  await win.getByRole('button', { name: 'The board', exact: true }).click();
  await expect(circuit(win)).toHaveCount(0);
  await win.keyboard.press('F5');   // the starter: a heart, again and again
  await expect(circuit(win)).toBeVisible();
  await expect(win.getByRole('timer', { name: 'Running for' })).toBeVisible();
  await win.keyboard.press('Shift+F5');
  await expect(win.getByRole('timer', { name: 'Running for' })).toHaveCount(0);
  await expect(circuit(win)).toBeVisible();   // still there after Stop: what it showed is seen

  win = await restart();
  await newProject(win, 'New micro:bit project', 'Second');
  await expect(circuit(win)).toHaveCount(0);   // the choice kept
});

test('folded away, the check before running brings the board back, with its card — never hidden behind the fold', async () => {
  const win = await launch();
  const file = join(home, 'Every part.mlab');
  copyFileSync('tests/fixtures/projects/saved-by/v0.12.0/pico-w.mlab', file);
  await app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as typeof dialog.showOpenDialog;
  }, file);
  await win.getByRole('button', { name: 'Open…' }).click();
  await expect(win.locator('[data-part]')).toHaveCount(58);
  await win.getByRole('button', { name: 'The board', exact: true }).click();
  await expect(circuit(win)).toHaveCount(0);
  await win.keyboard.press('F5');
  await expect(circuit(win)).toBeVisible();
  await expect(win.getByRole('dialog', { name: /Before it runs/ })).toBeVisible();
});
