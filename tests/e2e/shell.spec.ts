import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';

/** M4.1 (N-13): the panels fill the window at every size; a divider moved stays where it was left. */
const launch = (home: string) => electron.launch({ args: ['out/main/index.js'], env: { ...process.env, MICROLAB_USER_DATA: home } });

async function resize(app: ElectronApplication, win: Page, width: number, height: number) {
  await app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0]!.setContentSize(w!, h!), [width, height]);
  await win.waitForFunction(([w]) => window.innerWidth === w, [width]);
}

/** The workspace needs a project (M4.2): start one on the Pico W, from the start screen. */
async function newProject(win: Page) {
  const button = win.getByRole('button', { name: 'New Pico W project' });
  const circuit = win.getByRole('region', { name: 'Circuit' });
  await button.or(circuit).first().waitFor();   // the window has drawn: the start screen, or a project already open
  if (await button.isVisible()) await button.click();
  await circuit.waitFor();
}

const widths = (win: Page) => win.evaluate(() => {
  const w = (name: string) => document.querySelector(`[aria-label="${name}"]`)?.getBoundingClientRect().width ?? 0;
  return { rail: w('Board and parts'), parts: w('Parts'), circuit: w('Circuit'), code: w('Code'), window: window.innerWidth, scroll: document.documentElement.scrollWidth };
});

test.describe('the window fills its width', () => {
  let app: ElectronApplication;
  let home: string;
  test.beforeAll(async () => { home = mkdtempSync(join(tmpdir(), 'microlab-e2e-')); app = await launch(home); });
  test.afterAll(async () => { await app?.close(); rmSync(home, { recursive: true, force: true }); });

  for (const [w, h] of [[1280, 720], [1440, 900], [1920, 1080]] as const) {
    test(`at ${w} × ${h}: no horizontal scroll, the panels share the whole width`, async () => {
      const win = await app.firstWindow();
      await resize(app, win, w, h);
      await newProject(win);
      // the layout settles first (the saved panel widths load, the window's new size is drawn): two frames alike
      let m = await widths(win);
      await expect.poll(async () => {
        const before = m;
        await win.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        m = await widths(win);
        return JSON.stringify(m) === JSON.stringify(before);
      }).toBe(true);
      expect(m.scroll).toBeLessThanOrEqual(m.window);
      // M6.8: the parts panel is folded to a rail; it slides out over the canvas
      expect(Math.abs(m.rail + m.circuit + m.code + 1 /* the code's divider */ - m.window)).toBeLessThanOrEqual(4);
      expect(m.code / m.window).toBeGreaterThan(0.25);
      expect(m.circuit).toBeGreaterThan(360);
      const parts = win.getByRole('button', { name: 'Parts', exact: true });
      if ((await parts.getAttribute('aria-expanded')) !== 'true') await parts.click();
      await expect.poll(async () => (await widths(win)).parts / m.window).toBeGreaterThan(0.12);
      await expect.poll(async () => (await widths(win)).circuit).toBe(m.circuit);   // over it, not squeezing it
      await parts.click();
    });
  }
});

test('a divider dragged to a new width is still there after a restart', async () => {
  const home = mkdtempSync(join(tmpdir(), 'microlab-e2e-'));
  try {
    let app = await launch(home);
    let win = await app.firstWindow();
    await resize(app, win, 1440, 900);
    await newProject(win);
    await win.getByRole('button', { name: 'Parts', exact: true }).click();
    const before = (await widths(win)).parts;
    const sep = win.getByRole('separator', { name: 'Parts panel width' });
    const box = (await sep.boundingBox())!;
    await win.mouse.move(box.x + box.width / 2, box.y + 200);
    await win.mouse.down();
    await win.mouse.move(box.x + box.width / 2 + 60, box.y + 200, { steps: 4 });
    await win.mouse.up();
    await expect.poll(async () => (await widths(win)).parts).toBeGreaterThan(before + 50);
    const moved = (await widths(win)).parts;
    await app.close();

    app = await launch(home);
    win = await app.firstWindow();
    await resize(app, win, 1440, 900);
    await newProject(win);
    await win.getByRole('button', { name: 'Parts', exact: true }).click();
    await expect.poll(async () => Math.round((await widths(win)).parts)).toBe(Math.round(moved));
    await app.close();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
