import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { newProject, writeMlab } from '../../src/lib/project';
import { newProject as newProjectFromStart } from './new-project';

/** M4.2 the Start screen (01): it fills the window (N-13); a new project from a board (F-01); open a .mlab (F-02). */
let app: ElectronApplication;
let home: string;

test.beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'microlab-e2e-'));
  app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, MICROLAB_USER_DATA: home } });
});

test.afterEach(async () => {
  // unsaved changes would make the window ask before it closes (M4.6): end it without asking
  await app?.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy())).catch(() => {});
  await app?.close();
  rmSync(home, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
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

test('at 1280, 1440 and 1920 wide the start screen fills the window: no horizontal scroll, no empty band (screen 31: four cards, no side column)', async () => {
  const win = await app.firstWindow();
  await win.getByRole('heading', { name: 'Start something new' }).waitFor();
  for (const [w, h] of [[1280, 720], [1440, 900], [1920, 1080]] as const) {
    await resize(win, w, h);
    const m = await win.evaluate(() => {
      const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
      const cards = [...document.querySelectorAll('.bcard')].map((c) => c.getBoundingClientRect());
      return { scroll: document.documentElement.scrollWidth, start: box('.start'), cards, main: box('.start-main') };
    });
    expect(m.scroll).toBeLessThanOrEqual(w);
    expect(m.start.width).toBe(w);
    // M12 (screen 31): no side column — the main column reaches the right edge; Python 3 and the three boards share it
    expect(m.main.right).toBeGreaterThan(w - 60);
    expect(m.cards).toHaveLength(4);
    expect(m.cards[3]!.right).toBeGreaterThan(m.main.right - 2);
    expect(Math.abs(m.cards[0]!.width - m.cards[3]!.width)).toBeLessThan(2);
  }
});

test('F-01 a new ESP32 project: the workspace, the board named in the top bar, the starter main.py', async () => {
  const win = await app.firstWindow();
  await newProjectFromStart(win, 'New ESP32 project');
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
  await win.getByRole('button', { name: 'Open…' }).click();
  await expect(win.getByRole('alert')).toContainText('“photo.mlab” isn\'t a MicroLab project');

  await chooseFile(good);
  await win.getByRole('button', { name: 'Open…' }).click();
  await expect(win.getByRole('group', { name: 'Project' })).toContainText('Heart');
  await expect(win.getByRole('group', { name: 'Project' })).toContainText('BBC micro:bit V2');
  await expect(win.getByRole('alert')).toHaveCount(0);

  // the project menu: back to the start screen, and cancelling the chooser there changes nothing
  await win.getByRole('button', { name: 'Project menu' }).click();
  await win.getByRole('menuitem', { name: 'New project…' }).click();
  await chooseFile(null);
  await win.getByRole('button', { name: 'Open…' }).click();
  await expect(win.getByRole('heading', { name: 'Start something new' })).toBeVisible();
});

test('the board pictures load from the app\'s own files', async () => {
  const win = await app.firstWindow();
  const imgs = win.locator('.bcard img');
  await expect(imgs).toHaveCount(3);
  await expect.poll(() => imgs.evaluateAll((els) => els.every((e) => (e as HTMLImageElement).complete && (e as HTMLImageElement).naturalWidth > 0))).toBe(true);
});

test('M11 slice 1 (Rev 13; screen 33): the app menu has About MicroLab and Check for Updates…; the logo opens About', async () => {
  const win = await app.firstWindow();
  const menu = await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.items.map((m) => ({ label: m.label, items: m.submenu?.items.map((i) => i.label) ?? [] })));
  const all = menu.flatMap((m) => m.items);
  expect(all).toContain('About MicroLab');
  expect(all).toContain('Check for Updates…');
  await win.getByRole('button', { name: 'About MicroLab' }).click();
  const about = win.getByRole('dialog', { name: 'About MicroLab' });
  await expect(about).toContainText('© 2026 CodingSpaceKH. All rights reserved.');
  await expect(about).toContainText(/Version \d+\.\d+\.\d+/);
  // the teacher (2026-11-09): one short line, no icon
  const site = about.getByRole('button', { name: 'To contribute visit codingspacekh.dev' });
  await expect(site).toBeVisible();
  await expect(site.locator('svg')).toHaveCount(0);
  expect((await site.boundingBox())!.height).toBeLessThan(40);
  await about.getByRole('button', { name: 'Close' }).click();
  await expect(about).toHaveCount(0);
  // the app menu's About, sent from the main process (the window is up)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.send('app:menu', 'about'));
  await expect(win.getByRole('dialog', { name: 'About MicroLab' })).toBeVisible();
});

test('M11 slice 3 (screen 34b): Check for Updates… from the app menu; not the installed app: it says updates work only there', async () => {
  const win = await app.firstWindow();
  await expect(win.getByRole('heading', { name: 'Start something new' })).toBeVisible();   // the window is up: menu actions reach it
  await app.evaluate(({ Menu }) => {
    const find = (items: Electron.MenuItem[]): Electron.MenuItem | undefined => {
      for (const i of items) { if (i.label === 'Check for Updates…') return i; const s = i.submenu && find(i.submenu.items); if (s) return s; }
      return undefined;
    };
    find(Menu.getApplicationMenu()!.items)!.click();
  });
  const d = win.getByRole('dialog', { name: 'Updates' });
  await expect(d).toContainText('Updates work only in the installed MicroLab');
  await expect(win.getByRole('region', { name: 'Updates' })).toHaveCount(0);   // no note: nothing to say
  await d.getByRole('button', { name: 'Close' }).click();
});

test('M11: the window\'s pages load whole under its security policy — no font, script or style refused', async () => {
  const win = await app.firstWindow();
  const refused: string[] = [];
  win.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|Loading the (font|script|stylesheet)/.test(m.text())) refused.push(m.text().slice(0, 160)); });
  await win.reload();
  await expect(win.getByRole('heading', { name: 'Start something new' })).toBeVisible();
  await win.evaluate(() => document.fonts.ready);
  await win.waitForTimeout(500);
  expect(refused).toEqual([]);
});
