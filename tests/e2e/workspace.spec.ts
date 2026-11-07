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
  // unsaved changes would make the window ask before it closes (M4.6): end it without asking
  await app?.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy())).catch(() => {});
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

  // M5.4 (screen 02b): the resistor's inspector says what its legs are joined to
  const r1 = await centre(win, '[data-part="r1"] rect >> nth=0');
  await win.mouse.click(r1.x, r1.y);
  await expect(win.getByRole('complementary', { name: 'Inspector' })).toContainText('JoinsGP15 ↔ nothing');

  // the M5 gate (as in Tinkercad): the resistor dragged two holes right takes the wire's end in its strip with it
  const a7 = await centre(win, '[data-point="bb1.a7"]');
  await win.mouse.move(r1.x, r1.y);
  await win.mouse.down();
  await win.mouse.move(r1.x + (a7.x - a5.x) + 2, r1.y - 2, { steps: 8 });
  await win.mouse.up();
  await expect(win.locator('[data-part="r1"]')).toHaveAttribute('data-legs', 'bb1.a7 bb1.a10');
  await expect(win.locator('[data-wire="w1"]')).toHaveAttribute('data-ends', 'board.GP15 bb1.e7');
  await expect(win.getByRole('complementary', { name: 'Inspector' })).toContainText('JoinsGP15 ↔ nothing');
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
  await win.locator('.parts .pitem:has-text("red, 5 mm")').click();
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

test('M5.1 with the real keyboard and mouse: R turns, shift-click, ⌘D / Ctrl+D copies, ⌘Z / Ctrl+Z undoes, redo', async () => {
  const win = await app.firstWindow();
  await resize(win, 1440, 900);
  await win.getByRole('button', { name: 'New Pico W project' }).click();
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  const legs = (id: string) => win.locator(`[data-part="${id}"]`);

  const a5 = await centre(win, '[data-point="bb1.a5"]');
  const a8 = await centre(win, '[data-point="bb1.a8"]');
  const item = await centre(win, '.parts .pitem:has-text("Resistor")');
  await win.mouse.move(item.x, item.y);
  await win.mouse.down();
  await win.mouse.move((a5.x + a8.x) / 2 + 3, a5.y - 2, { steps: 8 });
  await win.mouse.up();
  await expect(legs('r1')).toHaveAttribute('data-legs', 'bb1.a5 bb1.a8');

  await win.keyboard.press('r');
  await expect(legs('r1')).toHaveAttribute('data-legs', 'bb1.a6 bb1.d6');
  await win.keyboard.press(`${mod}+d`);
  await expect(win.locator('[data-part]')).toHaveCount(2);
  await expect(legs('r2')).toHaveAttribute('aria-selected', 'true');

  // shift-click the first: both selected, both deleted, both back
  const r1 = await centre(win, '[data-part="r1"] rect >> nth=0');
  await win.keyboard.down('Shift');
  await win.mouse.click(r1.x, r1.y);
  await win.keyboard.up('Shift');
  await expect(win.locator('svg.scene [aria-selected="true"]')).toHaveCount(2);
  await win.keyboard.press('Delete');
  await expect(win.locator('[data-part]')).toHaveCount(0);
  await win.keyboard.press(`${mod}+z`);
  await expect(win.locator('[data-part]')).toHaveCount(2);
  await win.keyboard.press(`${mod}+z`);
  await win.keyboard.press(`${mod}+z`);
  await expect(legs('r1')).toHaveAttribute('data-legs', 'bb1.a5 bb1.a8');
  await win.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+y');
  await expect(legs('r1')).toHaveAttribute('data-legs', 'bb1.a6 bb1.d6');

  // ⌘Z in the code editor undoes typing, never the circuit
  await win.getByRole('textbox', { name: 'main.py' }).click();
  await win.keyboard.insertText('# x');
  await win.keyboard.press(`${mod}+z`);
  await expect(legs('r1')).toHaveAttribute('data-legs', 'bb1.a6 bb1.d6');
  await expect(win.getByRole('textbox', { name: 'main.py' })).not.toContainText('# x');
});

test('M5.2 with the real mouse: hover lights a strip, the wheel zooms at the pointer, Shift+wheel and a middle drag pan, Fit', async () => {
  const win = await app.firstWindow();
  await resize(win, 1440, 900);
  await win.getByRole('button', { name: 'New Pico W project' }).click();
  const zoom = win.getByRole('button', { name: 'Zoom to 100 %' });
  const pct = async () => Number((await zoom.textContent())!.replace('%', ''));
  const fitted = await pct();
  expect(fitted).toBeGreaterThan(50);
  expect(fitted).toBeLessThan(200);

  const c5 = await centre(win, '[data-point="bb1.c5"]');
  await win.mouse.move(c5.x, c5.y);
  await expect(win.locator('[data-lit-strip]')).toHaveAttribute('data-lit-strip', 'bb1.a5 bb1.e5');
  await expect(win.locator('[data-lit-point]')).toHaveCount(5);

  // the wheel zooms in at c5 (the M5 gate: as in Tinkercad): c5 stays under the pointer
  await win.mouse.wheel(0, -300);
  await expect.poll(pct).toBeGreaterThan(fitted * 1.3);
  const c5z = await centre(win, '[data-point="bb1.c5"]');
  expect(Math.abs(c5z.x - c5.x)).toBeLessThan(3);
  expect(Math.abs(c5z.y - c5.y)).toBeLessThan(3);

  // Shift + wheel pans; a middle-button drag pans
  await win.keyboard.down('Shift');
  await win.mouse.wheel(0, 100);
  await win.keyboard.up('Shift');
  await expect.poll(async () => (await centre(win, '[data-point="bb1.c5"]')).y).toBeLessThan(c5z.y - 50);
  const before = await centre(win, '[data-point="bb1.c5"]');
  await win.mouse.move(before.x + 200, before.y);
  await win.mouse.down({ button: 'middle' });
  await win.mouse.move(before.x + 260, before.y + 40, { steps: 5 });
  await win.mouse.up({ button: 'middle' });
  const after = await centre(win, '[data-point="bb1.c5"]');
  expect(after.x - before.x).toBeCloseTo(60, 0);
  expect(after.y - before.y).toBeCloseTo(40, 0);

  await win.getByRole('button', { name: 'Fit' }).click();
  await expect.poll(pct).toBe(fitted);
  await zoom.click();
  await expect.poll(pct).toBe(100);
});

test('M5.3 with the real mouse: GP15\'s card, a hole\'s card, a bend dragged and double-clicked away', async () => {
  const win = await app.firstWindow();
  await resize(win, 1440, 900);
  await win.getByRole('button', { name: 'New Pico W project' }).click();
  const gp15 = await centre(win, '[data-point="board.GP15"]');
  await win.mouse.move(gp15.x, gp15.y);
  await expect(win.getByRole('tooltip')).toContainText('GP15 · pin 20');
  await expect(win.getByRole('tooltip')).toContainText('PWM7B');

  // a wire with one bend: click the pin, click below the board, click a5
  const a5 = await centre(win, '[data-point="bb1.a5"]');
  await win.mouse.click(gp15.x, gp15.y);
  await win.mouse.click(gp15.x, gp15.y + 60);
  await win.mouse.move(a5.x, a5.y, { steps: 4 });
  await expect(win.getByRole('tooltip').last()).toContainText('Column 5, rows a–e');
  await win.mouse.click(a5.x, a5.y);
  const wire = win.locator('[data-wire="w1"]');
  const before = (await wire.getAttribute('data-via'))!;
  expect(before.split(' ')).toHaveLength(1);

  const h = await centre(win, '[data-bend="0"]');
  await win.mouse.move(h.x, h.y);
  await win.mouse.down();
  await win.mouse.move(h.x + 80, h.y, { steps: 6 });
  await win.mouse.up();
  await expect(wire).not.toHaveAttribute('data-via', before);
  const h2 = await centre(win, '[data-bend="0"]');
  expect(h2.x - h.x).toBeGreaterThan(60);
  await win.mouse.dblclick(h2.x, h2.y);
  await expect(wire).toHaveAttribute('data-via', '');
});
