import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';

/** M4.6 F-02, F-60 with real files: a project saved, a fresh start, the file opened again — as a teacher's starter
 *  project is; and the window doesn't close on unsaved changes without asking. */
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
  // unsaved changes would make the window ask before it closes (M4.6): end it without asking
  await app?.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy())).catch(() => {});
  await app?.close();
  rmSync(home, { recursive: true, force: true });
});

const centre = async (win: Page, selector: string) => {
  if (selector.includes('.pitem')) await win.locator(selector).first().scrollIntoViewIfNeeded();   // the panel scrolls
  const b = (await win.locator(selector).first().boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
const drag = async (win: Page, from: { x: number; y: number }, to: { x: number; y: number }) => {
  await win.mouse.move(from.x, from.y);
  await win.mouse.down();
  await win.mouse.move(to.x, to.y, { steps: 6 });
  await win.mouse.up();
};

/** The file choosers answer with this file, as if the student had picked it. */
async function choose(path: string) {
  await app.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: p })) as typeof dialog.showSaveDialog;
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as typeof dialog.showOpenDialog;
  }, path);
}

async function circuit(win: Page) {
  await win.getByRole('button', { name: 'Add a breadboard' }).click();   // M6.8: a new project is the board alone
  await win.getByRole('button', { name: 'Parts', exact: true }).click();
  const p = await centre(win, '[data-point="bb1.a5"]');
  const q = await centre(win, '[data-point="bb1.a8"]');
  await drag(win, await centre(win, '.parts .pitem:has-text("Resistor")'), { x: (p.x + q.x) / 2, y: p.y });
  await win.getByRole('complementary', { name: 'Inspector' }).getByRole('button', { name: '1k' }).click();
  const gp = await centre(win, '[data-point="board.GP15"]');
  const e5 = await centre(win, '[data-point="bb1.e5"]');
  await win.mouse.click(gp.x, gp.y);
  await win.mouse.click(gp.x, gp.y + 40);
  await win.mouse.click(e5.x, gp.y + 40);
  await win.mouse.click(e5.x, e5.y);
  await win.getByRole('textbox', { name: 'main.py' }).click();
  await win.keyboard.press(`${MOD}+A`);
  await win.keyboard.insertText('print("from the teacher")\n');
}

test('F-02 / F-60: save with ⌘S / Ctrl+S, start again, open the file: the same circuit and code', async () => {
  const win = await app.firstWindow();
  const file = join(home, 'Starter.mlab');
  await win.getByRole('button', { name: 'New Pico W project' }).click();
  await circuit(win);
  await expect(win.getByRole('group', { name: 'Project' }).getByTitle('Not saved')).toBeVisible();

  await choose(file);
  await win.keyboard.press(`${MOD}+S`);
  await expect(win.getByRole('group', { name: 'Project' })).toContainText('Starter');
  await expect(win.getByRole('status')).toContainText('Saved “Starter.mlab”');
  await expect(win.getByRole('group', { name: 'Project' }).getByTitle('Not saved')).toHaveCount(0);
  expect(existsSync(file)).toBe(true);
  await expect(win).toHaveTitle('Starter — MicroLab');

  // a fresh start (no question: nothing unsaved), then the file opened again
  await win.getByRole('button', { name: 'Project menu' }).click();
  await win.getByRole('menuitem', { name: 'New project…' }).click();
  await win.getByRole('button', { name: 'New ESP32 project' }).click();
  await win.getByRole('button', { name: 'Project menu' }).click();
  await win.getByRole('menuitem', { name: 'Open a project…' }).click();
  await expect(win.getByRole('group', { name: 'Project' })).toContainText('Starter');
  await expect(win.getByRole('group', { name: 'Project' })).toContainText('Raspberry Pi Pico W');
  await expect(win.locator('[data-part="r1"]')).toHaveAttribute('data-props', '{"ohms":1000}');
  await expect(win.locator('[data-wire="w1"]')).toHaveAttribute('data-ends', 'board.GP15 bb1.e5');
  expect((await win.locator('[data-wire="w1"]').getAttribute('data-via'))!.split(' ')).toHaveLength(2);
  await expect(win.getByRole('textbox', { name: 'main.py' })).toContainText('print("from the teacher")');

  // and it runs as it was saved
  await win.getByRole('button', { name: 'Run main.py' }).click();
  await expect(win.getByRole('log', { name: 'Console' })).toContainText('from the teacher', { timeout: 5000 });
});

test('closing the window with unsaved changes asks first; Don\'t save closes it', async () => {
  const win = await app.firstWindow();
  await win.getByRole('button', { name: 'New micro:bit project' }).click();
  await win.getByRole('textbox', { name: 'main.py' }).click();
  await win.keyboard.insertText('# a change\n');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
  const ask = win.getByRole('alertdialog', { name: 'Save your changes to “Untitled project”?' });
  await expect(ask).toBeVisible();
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  await ask.getByRole('button', { name: 'Cancel' }).click();
  await expect(ask).toHaveCount(0);

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
  const closed = app.evaluate(({ BrowserWindow }) => new Promise<number>((resolve) => {
    const w = BrowserWindow.getAllWindows()[0]!;
    w.once('closed', () => resolve(BrowserWindow.getAllWindows().length));
  }));
  // the click closes the window; hidden (MICROLAB_HIDDEN) it can close before Playwright's click returns
  await win.getByRole('button', { name: "Don't save" }).click().catch((e: Error) => {
    if (!/has been closed/.test(e.message)) throw e;
  });
  expect(await closed).toBe(0);
});
