import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { newProject } from './new-project';

/** M11.6: the main actions from the keyboard — F5 runs and Shift+F5 stops, on a board and in Python 3 alike; ⌘S / Ctrl+S
 *  saves; and Tab reaches every main button of the Start page and the workspace, each showing where the focus is. */
let app: ElectronApplication;
let home: string;
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

test.beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'microlab-e2e-'));
  app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, MICROLAB_USER_DATA: home } });
  const win = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900));
  await win.waitForFunction(() => window.innerWidth === 1440);
});
test.afterEach(async () => {
  await app?.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy())).catch(() => {});
  await app?.close();
  rmSync(home, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

async function code(win: Page, text: string) {
  await win.getByRole('textbox', { name: 'main.py' }).click();
  await win.keyboard.press(`${MOD}+A`);
  await win.keyboard.insertText(text);
}

/** Tab from the page's start until each name has had the focus; each, when it has it, shows a ring. In the code
 *  editor Tab indents (students need it): Escape first, then Tab leaves it (CodeMirror's way out, for 2 s). */
async function tabReaches(win: Page, names: string[]) {
  await win.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const left = new Set(names);
  const unringed: string[] = [];
  for (let i = 0; i < 120 && left.size; i++) {
    if (await win.evaluate(() => !!document.activeElement?.closest('.cm-content'))) await win.keyboard.press('Escape');
    await win.keyboard.press('Tab');
    const [name, ring] = await win.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const s = getComputedStyle(el);
      return [(el.getAttribute('aria-label') ?? el.textContent ?? '').trim(), (s.outlineStyle !== 'none' && s.outlineWidth !== '0px') || s.boxShadow !== 'none'] as const;
    });
    for (const n of left) {
      if (name === n || name.startsWith(n)) { left.delete(n); if (!ring) unringed.push(n); }
    }
  }
  expect([...left], 'not reached by Tab').toEqual([]);
  expect(unringed, 'no focus ring').toEqual([]);
}

test('a board project: F5 runs the file, Shift+F5 stops it; ⌘S / Ctrl+S saves', async () => {
  const win = await app.firstWindow();
  await newProject(win, 'New Pico W project');
  await code(win, 'import time\nprint("from F5")\nwhile True:\n    time.sleep(0.1)\n');
  await expect(win.getByRole('button', { name: /^Run main\.py/ })).toHaveAttribute('aria-keyshortcuts', 'F5');
  await win.keyboard.press('F5');
  await expect(win.getByRole('log', { name: 'Console' })).toContainText('from F5', { timeout: 5000 });
  await expect(win.getByRole('button', { name: 'Stop' })).toHaveAttribute('aria-keyshortcuts', 'Shift+F5');
  await win.keyboard.press('Shift+F5');
  await expect(win.getByRole('timer', { name: 'Running for' })).toHaveCount(0, { timeout: 3000 });
  await win.keyboard.press(`${MOD}+S`);
  await expect(win.getByRole('status')).toContainText('Saved');
});

test('a Python 3 project: F5 runs, Shift+F5 stops', async () => {
  test.skip(!existsSync(join('vendor', 'python')) && process.platform !== 'darwin', 'no Python');
  const win = await app.firstWindow();
  await newProject(win, 'New Python project');
  await code(win, 'import time\nprint("from F5", flush=True)\nwhile True:\n    time.sleep(0.1)\n');
  await win.keyboard.press('F5');
  await expect(win.locator('.pyshell')).toContainText('from F5', { timeout: 15_000 });
  await win.keyboard.press('Shift+F5');
  await expect(win.getByRole('timer', { name: 'Running for' })).toHaveCount(0, { timeout: 5000 });
});

test('Tab reaches every main button, each with a focus ring — the Start page and the workspace', async () => {
  const win = await app.firstWindow();
  await win.getByRole('button', { name: 'Open…' }).waitFor();
  await tabReaches(win, ['About MicroLab', 'Workspace', 'Open…', 'New Python project', 'New micro:bit project', 'New Pico W project', 'New ESP32 project', 'Bigger']);
  await newProject(win, 'New Pico W project');
  await tabReaches(win, ['Project menu', 'Run main.py', 'More ways to run', 'Board: No board', 'Parts', 'Zoom in', 'Fit', 'Meter', 'Text size and theme', 'Add a file or a library', 'Project files', 'Console', 'Plotter', 'Problems']);
});
