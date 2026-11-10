import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { newProject } from './new-project';

/** The teacher's request (2026-11-09, issues/layout-2.png): a board project's console, under the code, is hidden and
 *  shown (its button, its ×, Ctrl+J / ⌘J — as Python 3's shell) and made taller or shorter by the edge above it; both
 *  are remembered. Hidden, it comes back when a program runs, so nothing it prints is missed. */
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
const consoleLog = (win: Page) => win.getByRole('log', { name: 'Console' });
const editorHeight = async (win: Page) => (await win.locator('.side .code-editor').boundingBox())!.height;
const consoleHeight = async (win: Page) => (await win.locator('.side .sideconsole').boundingBox())!.height;

test.beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'microlab-e2e-')); });
test.afterEach(async () => {
  await app?.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy())).catch(() => {});
  await app?.close();
  rmSync(home, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

test('hidden and shown: its button, its ×, Ctrl+J; the editor takes the room; a run brings it back', async () => {
  const win = await launch();
  await newProject(win, 'New Pico W project');
  const toggle = win.getByRole('button', { name: 'The console', exact: true });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(consoleLog(win)).toBeVisible();
  const before = await editorHeight(win);
  await toggle.click();
  await expect(consoleLog(win)).toHaveCount(0);
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(await editorHeight(win)).toBeGreaterThan(before + 100);
  await win.keyboard.press(`${MOD}+J`);
  await expect(consoleLog(win)).toBeVisible();
  await win.getByRole('button', { name: 'Hide the console' }).click();
  await expect(consoleLog(win)).toHaveCount(0);
  // a run while it is hidden: it comes back, with what the program prints
  await win.getByRole('textbox', { name: 'main.py' }).click();
  await win.keyboard.press(`${MOD}+A`);
  await win.keyboard.insertText('print("shown again")\n');
  await win.keyboard.press('F5');
  await expect(consoleLog(win)).toContainText('shown again', { timeout: 5000 });
});

test('the edge above it: dragged, or moved with the arrow keys — remembered after a restart, as is hidden', async () => {
  let win = await launch();
  await newProject(win, 'New Pico W project');
  const grip = win.getByRole('separator', { name: 'The console\'s size' });
  const start = await consoleHeight(win);
  const g = (await grip.boundingBox())!;
  await win.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await win.mouse.down();
  await win.mouse.move(g.x + g.width / 2, g.y - 150, { steps: 6 });
  await win.mouse.up();
  const dragged = await consoleHeight(win);
  expect(dragged).toBeGreaterThan(start + 120);
  await grip.focus();
  await win.keyboard.press('ArrowDown');
  expect(await consoleHeight(win)).toBeLessThan(dragged - 10);
  const kept = await consoleHeight(win);

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy()));
  await app.close();
  win = await launch();
  await newProject(win, 'New Pico W project', 'Second');
  expect(Math.abs(await consoleHeight(win) - kept)).toBeLessThan(4);
  await win.getByRole('button', { name: 'Hide the console' }).click();

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy()));
  await app.close();
  win = await launch();
  await newProject(win, 'New Pico W project', 'Third');
  await expect(consoleLog(win)).toHaveCount(0);
});
