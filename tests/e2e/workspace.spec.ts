import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';

/** M4.3 with the real mouse: a part dragged from the panel snaps to holes; a wire from a pin to a hole; the circuit
 *  fits the canvas at the smallest window (N-13). */
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

const centre = async (win: Page, selector: string) => {
  const b = (await win.locator(selector).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

test('build part of Blink with the mouse: a resistor dragged onto a5–a8, a wire from GP15 to e5', async () => {
  const win = await app.firstWindow();
  await resize(win, 1440, 900);
  await win.getByRole('button', { name: 'New Pico W project' }).click();

  const a5 = await centre(win, '[data-point="bb1.a5"]');
  const a8 = await centre(win, '[data-point="bb1.a8"]');
  const item = await centre(win, '.parts .pitem:has-text("Resistor")');
  await win.mouse.move(item.x, item.y);
  await win.mouse.down();
  await win.mouse.move((a5.x + a8.x) / 2 + 3, a5.y - 2, { steps: 8 });
  await expect(win.locator('[data-ghost="ok"]')).toHaveCount(1);
  await win.mouse.up();
  await expect(win.locator('[data-part="r1"]')).toHaveAttribute('data-legs', 'bb1.a5 bb1.a8');

  const gp15 = await centre(win, '[data-point="board.GP15"]');
  const e5 = await centre(win, '[data-point="bb1.e5"]');
  await win.mouse.move(gp15.x, gp15.y);
  await win.mouse.down();
  await win.mouse.move(e5.x + 2, e5.y + 2, { steps: 8 });
  await win.mouse.up();
  await expect(win.locator('[data-wire="w1"]')).toHaveAttribute('data-ends', 'board.GP15 bb1.e5');
  await expect(win.getByRole('status')).toContainText('1 part · 1 wire');
});

test('at 1280 × 720 the micro:bit and its breadboard fit in the canvas', async () => {
  const win = await app.firstWindow();
  await resize(win, 1280, 720);
  await win.getByRole('button', { name: 'New micro:bit project' }).click();
  const canvas = (await win.getByRole('region', { name: 'Circuit' }).boundingBox())!;
  for (const name of ['BBC micro:bit V2', 'Breadboard bb1 (half)']) {
    const b = (await win.getByRole('img', { name }).boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(canvas.x - 1);
    expect(b.y).toBeGreaterThanOrEqual(canvas.y - 1);
    expect(b.x + b.width).toBeLessThanOrEqual(canvas.x + canvas.width + 1);
    expect(b.y + b.height).toBeLessThanOrEqual(canvas.y + canvas.height + 1);
  }
});

test('M4.3b with the real mouse: a part clicked then placed, a wire with two bends, a value from the inspector', async () => {
  const win = await app.firstWindow();
  await resize(win, 1440, 900);
  await win.getByRole('button', { name: 'New Pico W project' }).click();

  // click the LED in the panel, then click on the breadboard
  await win.locator('.parts .pitem:has-text("LED")').click();
  const c10 = await centre(win, '[data-point="bb1.c10"]');
  const c12 = await centre(win, '[data-point="bb1.c12"]');
  await win.mouse.move((c10.x + c12.x) / 2, c10.y, { steps: 4 });
  await win.mouse.click((c10.x + c12.x) / 2, c10.y);
  await expect(win.locator('[data-part="led1"]')).toHaveAttribute('data-legs', 'bb1.c10 bb1.c12');

  // its colour from the inspector
  await win.getByRole('complementary', { name: 'Inspector' }).getByRole('radio', { name: 'Blue' }).click();
  await expect(win.locator('[data-part="led1"]')).toHaveAttribute('data-props', '{"color":"blue"}');

  // a wire from GP15: click, two bends, click on a5
  const gp15 = await centre(win, '[data-point="board.GP15"]');
  const a5 = await centre(win, '[data-point="bb1.a5"]');
  await win.mouse.click(gp15.x, gp15.y);
  await win.mouse.click(gp15.x, gp15.y + 40);
  await win.mouse.click(a5.x, gp15.y + 40);
  await win.mouse.click(a5.x, a5.y);
  await expect(win.locator('[data-wire="w1"]')).toHaveAttribute('data-ends', 'board.GP15 bb1.a5');
  expect((await win.locator('[data-wire="w1"]').getAttribute('data-via'))!.split(' ')).toHaveLength(2);

  // Delete removes the selected wire
  await win.keyboard.press('Delete');
  await expect(win.locator('[data-wire]')).toHaveCount(0);
});
