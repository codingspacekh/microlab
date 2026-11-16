import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { newProject } from './new-project';

/** M8 slice 8.1 in the real app (screens 30, 30b, 30c; F-40, F-44): Learn's pages are drawn from library/learn, a
 *  picture is played with by the real mouse, a glossary word opens beside itself, and a part on the workspace leads
 *  to its page and back. */
let app: ElectronApplication;
let win: Page;
let home: string;

test.beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'microlab-e2e-'));
  app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, MICROLAB_USER_DATA: home } });
  win = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900));
  await win.waitForFunction(() => window.innerWidth === 1440);
});

test.afterEach(async () => {
  await app?.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy())).catch(() => {});
  await app?.close();
  rmSync(home, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

test('Learn\'s home leads to the LED: its two columns side by side, its numbers, its picture slid to burning', async () => {
  await win.getByRole('tab', { name: 'Learn' }).click();
  const home = win.getByRole('main', { name: 'Learn home' });
  await expect(home.getByRole('heading', { name: 'How electronics works' })).toBeVisible();
  await home.getByRole('region', { name: 'Basics' }).getByRole('button', { name: /^LED/ }).click();

  const page = win.getByRole('main', { name: 'LED' });
  await expect(page.getByRole('region', { name: 'Its numbers' })).toContainText('Most it can take30 mA');
  // side by side at this width (screen 30b): the numbers start right of the picture, near the top
  const look = (await page.getByRole('region', { name: 'Look inside' }).boundingBox())!;
  const numbers = (await page.getByRole('region', { name: 'Its numbers' }).boundingBox())!;
  expect(numbers.x).toBeGreaterThan(look.x + look.width);
  expect(numbers.y).toBeLessThan(look.y);

  // the real mouse on the slider's track: its far end is twice the rated current — the chip burns
  await expect(page.getByRole('img', { name: /15 mA flows through it, it shines bright/ })).toBeVisible();
  const track = (await page.getByRole('region', { name: 'Look inside' }).locator('.slider .track').boundingBox())!;
  await win.mouse.click(track.x + track.width - 2, track.y + track.height / 2);
  await expect(page.getByRole('img', { name: /it has burnt out and is dark/ })).toBeVisible();
  await page.getByRole('button', { name: 'New LED' }).click();
  await expect(page.getByRole('img', { name: /15 mA flows through it/ })).toBeVisible();
});

test('a glossary word opens its lines under itself, inside the page', async () => {
  await win.getByRole('tab', { name: 'Learn' }).click();
  await win.getByRole('navigation', { name: 'Learn' }).getByRole('button', { name: 'LED' }).click();
  const word = win.getByRole('main', { name: 'LED' }).getByRole('button', { name: 'current' });
  await word.click();
  const note = win.getByRole('note', { name: 'current: what it means' });
  await expect(note).toContainText('How much electricity flows past a point each second.');
  const w = (await word.boundingBox())!;
  const n = (await note.boundingBox())!;
  expect(n.y).toBeGreaterThanOrEqual(w.y + w.height);
  expect(n.y).toBeLessThan(w.y + w.height + 30);
  expect(n.x + n.width).toBeLessThanOrEqual(1440);
  await win.keyboard.press('Escape');
  await expect(note).toHaveCount(0);
});

test('the potentiometer\'s knob is turned by dragging it: the wiper follows the mouse, leg 2\'s volts with it', async () => {
  await win.getByRole('tab', { name: 'Learn' }).click();
  await win.getByRole('navigation', { name: 'Learn' }).getByRole('button', { name: 'Potentiometer' }).click();
  const look = win.getByRole('main', { name: 'Potentiometer' }).getByRole('region', { name: 'Look inside' });
  await expect(look.getByRole('img', { name: /leg 2 gets 0.83 V of 3.3 V/ })).toBeVisible();
  // from the knob's left side round to straight above its middle: half way
  const knob = (await look.locator('.lf-knob').boundingBox())!;
  const cx = knob.x + knob.width / 2;
  const cy = knob.y + knob.height / 2;
  await win.mouse.move(cx - knob.width * 0.35, cy);
  await win.mouse.down();
  await win.mouse.move(cx - knob.width * 0.2, cy - knob.height * 0.3, { steps: 4 });
  await win.mouse.move(cx, cy - knob.height * 0.38, { steps: 4 });
  await win.mouse.up();
  await expect(look.getByRole('slider', { name: 'Turn the knob' })).toHaveAttribute('aria-valuenow', '50');
  await expect(look.getByRole('img', { name: /leg 2 gets 1.65 V of 3.3 V/ })).toBeVisible();
});

test('from the workspace to a part\'s page and back: the parts panel, and a right-click on the part', async () => {
  await newProject(win, 'New Pico W project');
  await win.getByRole('button', { name: 'Parts', exact: true }).click();
  const panel = win.getByRole('region', { name: 'Parts' });
  await panel.getByRole('button', { name: /^Half breadboard/ }).press('Enter');
  // the way in shows as the mouse comes over the part's row
  const row = panel.locator('.prow', { has: win.getByRole('button', { name: /^LED/ }) });
  await row.hover();
  await row.getByRole('button', { name: 'Learn about the LED' }).click();
  await expect(win.getByRole('main', { name: 'LED' })).toBeVisible();
  await win.getByRole('button', { name: 'Back to my project' }).click();
  await expect(win.getByRole('application', { name: 'Circuit canvas' })).toBeVisible();

  // an LED put on the breadboard with the keyboard, then right-clicked
  if (!(await panel.isVisible())) await win.getByRole('button', { name: 'Parts', exact: true }).click();
  await panel.getByRole('button', { name: /^LED/ }).press('Enter');
  await win.keyboard.press('Enter');
  const led = win.locator('[data-part="led1"]');
  await expect(led).toHaveCount(1);
  await led.click({ button: 'right' });
  const menu = win.getByRole('menu', { name: 'LED' });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Learn about this' }).click();
  await expect(win.getByRole('main', { name: 'LED' })).toBeVisible();
});
