import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { newProject, writeMlab } from '../../src/lib/project';

/** M4.2 the Start screen (01): it fills the window (N-13); a new project from a board (F-01); open a .mlab (F-02). */
let app: ElectronApplication;
let home: string;

test.beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'microlab-e2e-'));
  app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, MICROLAB_USER_DATA: home } });
});

test.afterEach(async () => {
  await app?.close();
  rmSync(home, { recursive: true, force: true });
});

async function resize(win: Page, width: number, height: number) {
  await app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0]!.setContentSize(w!, h!), [width, height]);
  await win.waitForFunction(([w]) => window.innerWidth === w, [width]);
}

/** The file chooser answers with this file (or is cancelled), as if the student had picked it. */
async function chooseFile(path: string | null) {
  await app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = (async () => ({ canceled: p === null, filePaths: p === null ? [] : [p] })) as typeof dialog.showOpenDialog;
  }, path);
}

test('at 1280, 1440 and 1920 wide the start screen fills the window: no horizontal scroll, no empty band', async () => {
  const win = await app.firstWindow();
  for (const [w, h] of [[1280, 720], [1440, 900], [1920, 1080]] as const) {
    await resize(win, w, h);
    const m = await win.evaluate(() => {
      const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
      const cards = [...document.querySelectorAll('.bcard')].map((c) => c.getBoundingClientRect());
      return { scroll: document.documentElement.scrollWidth, start: box('.start'), side: box('.start-side'), cards, main: box('.start-main') };
    });
    expect(m.scroll).toBeLessThanOrEqual(w);
    expect(m.start.width).toBe(w);
    expect(m.side.right).toBeGreaterThan(w - 60);                        // the side column reaches the right edge
    expect(m.cards).toHaveLength(3);
    expect(m.cards[2]!.right).toBeGreaterThan(m.main.right - 2);         // the boards share the main column
    expect(Math.abs(m.cards[0]!.width - m.cards[2]!.width)).toBeLessThan(2);
  }
});

test('F-01 a new ESP32 project: the workspace, the board named in the top bar, the starter main.py', async () => {
  const win = await app.firstWindow();
  await win.getByRole('button', { name: 'New ESP32 project' }).click();
  await expect(win.getByRole('region', { name: 'Circuit' })).toBeVisible();
  await expect(win.getByRole('group', { name: 'Project' })).toContainText('ESP32 DevKit V1 (30 pins)');
  await expect(win.getByRole('region', { name: 'Code' })).toContainText('Pin(2, Pin.OUT)');
});

test('F-02 open a .mlab: the chosen file opens, named as the file; a broken one says why', async () => {
  const good = join(home, 'Heart.mlab');
  const bad = join(home, 'photo.mlab');
  writeFileSync(good, writeMlab(newProject('microbit-v2')));
  writeFileSync(bad, 'not a project');
  const win = await app.firstWindow();

  await chooseFile(bad);
  await win.getByRole('button', { name: 'Open a project…' }).first().click();
  await expect(win.getByRole('alert')).toContainText('“photo.mlab” isn\'t a MicroLab project');

  await chooseFile(good);
  await win.getByRole('button', { name: 'Open a project…' }).first().click();
  await expect(win.getByRole('group', { name: 'Project' })).toContainText('Heart');
  await expect(win.getByRole('group', { name: 'Project' })).toContainText('BBC micro:bit V2');
  await expect(win.getByRole('alert')).toHaveCount(0);

  // the project menu: back to the start screen, and cancelling the chooser there changes nothing
  await win.getByRole('button', { name: 'Project menu' }).click();
  await win.getByRole('menuitem', { name: 'New project…' }).click();
  await chooseFile(null);
  await win.getByRole('button', { name: 'Open a project…' }).first().click();
  await expect(win.getByRole('heading', { name: 'Start a new project' })).toBeVisible();
});

test('the board pictures load from the app\'s own files', async () => {
  const win = await app.firstWindow();
  const imgs = win.locator('.bcard img');
  await expect(imgs).toHaveCount(3);
  await expect.poll(() => imgs.evaluateAll((els) => els.every((e) => (e as HTMLImageElement).complete && (e as HTMLImageElement).naturalWidth > 0))).toBe(true);
});
