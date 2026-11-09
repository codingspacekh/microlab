import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { newProject as blank, writeMlab } from '../../src/lib/project';
import { newProject } from './new-project';

/** The teacher's requests (2026-11-09, issues/layout-3.png): the Start page fits a short window — its cards' buttons
 *  stay in their cards, the recent projects scroll in their own list when there are more than fit; and a project is
 *  closed from its menu, back to the Start page (its changes asked about first). */
let app: ElectronApplication;
let home: string;
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

async function launch(width: number, height: number): Promise<Page> {
  app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, MICROLAB_USER_DATA: home } });
  const win = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0]!.setContentSize(w!, h!), [width, height]);
  await win.waitForFunction(([w]) => window.innerWidth === w, [width]);
  return win;
}

/** Eight recent projects (the most kept), real files, and a recovery copy: the Start page at its fullest. */
function fullest() {
  const docs = join(home, 'Documents', 'MicroLab');
  mkdirSync(docs, { recursive: true });
  const boards = ['microbit-v2', 'pico-w', 'esp32-devkit-v1'] as const;
  const recent = Array.from({ length: 8 }, (_, i) => {
    const path = join(docs, `Project ${i + 1}.mlab`);
    writeFileSync(path, writeMlab(blank(boards[i % 3]!)));
    return { path, name: `Project ${i + 1}`, board: boards[i % 3], at: Date.now() - i * 3_600_000 };
  });
  writeFileSync(join(home, 'settings.json'), JSON.stringify({ recent }));
  mkdirSync(join(home, 'recovery'), { recursive: true });
  writeFileSync(join(home, 'recovery', 'project.mlab'), writeMlab(blank('microbit-v2')));
  writeFileSync(join(home, 'recovery', 'about.json'), JSON.stringify({ name: 'Animation', at: Date.now() }));
}

test.beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'microlab-e2e-')); });
test.afterEach(async () => {
  await app?.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy())).catch(() => {});
  await app?.close();
  rmSync(home, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

for (const [w, h] of [[1280, 720], [1420, 918], [1920, 1080]] as const) {
  test(`the Start page at ${w} × ${h}, at its fullest: each card's button in its card, the recent list scrolling on its own`, async () => {
    fullest();
    const win = await launch(w, h);
    await expect(win.getByRole('alert')).toContainText('Your changes to “Animation” were kept');
    await expect(win.getByRole('region', { name: 'Recent' }).getByRole('listitem')).toHaveCount(8);
    const layout = await win.evaluate(() => {
      const box = (e: Element) => e.getBoundingClientRect();
      const cards = [...document.querySelectorAll('.bcard')].map((c) => ({ card: box(c), button: box(c.querySelector('.btn')!) }));
      const recent = document.querySelector('.recent-card')!;
      const list = recent.querySelector('ul')!;
      return {
        cards: cards.map(({ card, button }) => ({ inside: button.bottom <= card.bottom + 0.5 && button.top >= card.top - 0.5 })),
        cardsEnd: Math.max(...cards.map((c) => c.card.bottom)),
        recentTop: box(recent).top,
        list: { scrolls: getComputedStyle(list).overflowY, height: list.clientHeight, content: list.scrollHeight },
        rowHeight: list.querySelector('li')!.getBoundingClientRect().height,
      };
    });
    expect(layout.cards.every((c) => c.inside), 'a card\'s button spills out of it').toBe(true);
    expect(layout.cardsEnd, 'the cards run into the recent list').toBeLessThanOrEqual(layout.recentTop);
    // more than fit: the list scrolls in its card, and still shows two of them
    if (layout.list.content > layout.list.height + 1) expect(['auto', 'scroll']).toContain(layout.list.scrolls);
    expect(layout.list.height).toBeGreaterThanOrEqual(Math.min(layout.list.content, 2 * layout.rowHeight) - 1);
  });
}

test('Close project, from a board project\'s menu: its changes asked about, then the Start page', async () => {
  const win = await launch(1440, 900);
  await newProject(win, 'New Pico W project', 'To close');
  await win.getByRole('textbox', { name: 'main.py' }).click();
  await win.keyboard.press(`${MOD}+A`);
  await win.keyboard.insertText('print("changed")\n');
  await win.getByRole('button', { name: 'Project menu' }).click();
  await win.getByRole('menuitem', { name: 'Close project' }).click();
  await win.getByRole('button', { name: "Don't save" }).click();
  await expect(win.getByRole('button', { name: 'New Pico W project' })).toBeVisible();
  await expect(win.getByRole('region', { name: 'Recent' })).toContainText('To close');
  // a saved one closes at once
  await win.getByRole('region', { name: 'Recent' }).getByRole('button', { name: /To close/ }).click();
  await expect(win.getByRole('group', { name: 'Project' })).toContainText('To close');
  await win.getByRole('button', { name: 'Project menu' }).click();
  await win.getByRole('menuitem', { name: 'Close project' }).click();
  await expect(win.getByRole('button', { name: 'New Pico W project' })).toBeVisible();
});

test('Close project, from a Python project\'s menu: the Start page', async () => {
  const win = await launch(1440, 900);
  await newProject(win, 'New Python project', 'Py to close');
  await win.getByRole('button', { name: 'Python project menu' }).click();
  await win.getByRole('menuitem', { name: 'Close project' }).click();
  await expect(win.getByRole('button', { name: 'New Python project' })).toBeVisible();
  await expect(win.getByRole('region', { name: 'Recent' })).toContainText('Py to close');
});
