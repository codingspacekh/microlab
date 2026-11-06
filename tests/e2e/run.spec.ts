import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';

/** M4 exit gate (E2E): build Blink by hand from a new project on each board, run it, the LED blinks; Stop ends it.
 *  And each board's starter program lights the board itself. The real simulation worker runs here. */
let app: ElectronApplication;
let home: string;

test.beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'microlab-e2e-'));
  app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, MICROLAB_USER_DATA: home } });
  const win = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900));
  await win.waitForFunction(() => window.innerWidth === 1440);
});

test.afterEach(async () => {
  await app?.close();
  rmSync(home, { recursive: true, force: true });
});

const centre = async (win: Page, selector: string) => {
  const b = (await win.locator(selector).first().boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
const drag = async (win: Page, from: { x: number; y: number }, to: { x: number; y: number }) => {
  await win.mouse.move(from.x, from.y);
  await win.mouse.down();
  await win.mouse.move(to.x, to.y, { steps: 6 });
  await win.mouse.up();
};
const between = async (win: Page, a: string, b: string) => {
  const p = await centre(win, `[data-point="${a}"]`);
  const q = await centre(win, `[data-point="${b}"]`);
  return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
};

/** The code, put in the editor as one paste (no auto-indent on the way). */
async function setCode(win: Page, code: string) {
  await win.getByRole('textbox', { name: 'main.py' }).click();
  await win.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await win.keyboard.insertText(code);
}

const BOARDS = [
  { button: 'New Pico W project', example: 'pico-w', pin: 'board.GP15' },
  { button: 'New micro:bit project', example: 'microbit-v2', pin: 'board.P0' },
  { button: 'New ESP32 project', example: 'esp32-devkit-v1', pin: 'board.D15' },
];

for (const b of BOARDS) {
  test(`Blink built by hand on ${b.example}: run it, the LED blinks; Stop ends it`, async () => {
    const win = await app.firstWindow();
    await win.getByRole('button', { name: b.button }).click();
    // the circuit of library/examples/blink: GP15 → 220 Ω (a5–a8) → LED (b8–b10) → GND
    await drag(win, await centre(win, '.parts .pitem:has-text("Resistor")'), await between(win, 'bb1.a5', 'bb1.a8'));
    await drag(win, await centre(win, '.parts .pitem:has-text("LED")'), await between(win, 'bb1.b8', 'bb1.b10'));
    await drag(win, await centre(win, `[data-point="${b.pin}"]`), await centre(win, '[data-point="bb1.e5"]'));
    await drag(win, await centre(win, '[data-point^="board.GND"]'), await centre(win, '[data-point="bb1.e10"]'));
    await expect(win.getByRole('status')).toContainText('2 parts · 2 wires');
    await setCode(win, readFileSync(`library/examples/blink/${b.example}/files/main.py`, 'utf8'));

    await win.getByRole('button', { name: 'Run' }).click();
    const led = win.locator('[data-part="led1"]');
    await expect(led).toHaveAttribute('data-lit', '1', { timeout: 5000 });
    await expect(led).toHaveAttribute('data-lit', '0', { timeout: 2000 });
    await expect(led).toHaveAttribute('data-lit', '1', { timeout: 2000 });
    await expect(win.getByRole('status')).toContainText('Running at real speed');

    await win.getByRole('button', { name: 'Stop' }).click();
    await expect(win.getByRole('button', { name: 'Run' })).toBeEnabled({ timeout: 1000 });   // N-03: ≤ 0.5 s, with room
    await expect(win.getByRole('log', { name: 'Console' })).toContainText('Stopped.');
  });
}

test('the starter programs light the board itself: the Pico W\'s LED, the micro:bit\'s heart, the ESP32\'s blue LED', async () => {
  const win = await app.firstWindow();
  for (const [button, sel] of [['New Pico W project', '[data-board-led]'], ['New micro:bit project', '[data-display="0909099999999990999000900"]'], ['New ESP32 project', '[data-board-led]']] as const) {
    const menu = win.getByRole('button', { name: 'Project menu' });
    if (await menu.isVisible()) {
      await menu.click();
      await win.getByRole('menuitem', { name: 'New project…' }).click();
    }
    await win.getByRole('button', { name: button }).click();
    await win.getByRole('button', { name: 'Run' }).click();
    await expect(win.locator(sel)).toHaveCount(1, { timeout: 5000 });
    await expect(win.locator(sel)).toHaveCount(0, { timeout: 2000 });   // it blinks: off again
  }
});

test('print() reaches the console; an error says where; the button can be pressed while running', async () => {
  const win = await app.firstWindow();
  await win.getByRole('button', { name: 'New Pico W project' }).click();
  await drag(win, await centre(win, '.parts .pitem:has-text("Push button")'), await between(win, 'bb1.e20', 'bb1.f22'));
  await drag(win, await centre(win, '[data-point="board.GP14"]'), await centre(win, '[data-point="bb1.d20"]'));
  await drag(win, await centre(win, '[data-point^="board.GND"]'), await centre(win, '[data-point="bb1.j22"]'));
  await setCode(win, 'from machine import Pin\nimport time\nb = Pin(14, Pin.IN, Pin.PULL_UP)\nprint("ready")\nwhile b.value() == 1:\n    time.sleep_ms(10)\nprint("pressed!")\nprint(nope)\n');
  await win.getByRole('button', { name: 'Run' }).click();
  const log = win.getByRole('log', { name: 'Console' });
  await expect(log).toContainText('ready', { timeout: 5000 });
  const btn = await centre(win, '[data-part="btn1"]');
  await win.mouse.move(btn.x, btn.y);
  await win.mouse.down();
  await expect(log).toContainText('pressed!', { timeout: 2000 });
  await win.mouse.up();
  await expect(log).toContainText("The program stopped with an error (main.py, line 8): NameError: name 'nope' isn't defined");
  await expect(win.getByRole('status')).toContainText('Stopped: an error on line 8');
});
