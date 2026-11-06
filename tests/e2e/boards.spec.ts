import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

/** M10.1 F-55, N-12: a board plugged in is named within 2 s, with no setup. USB is stood in for by a port-list
 *  file recorded on the teacher's laptop (tests/fixtures/usb), rewritten to plug and unplug. */
let app: ElectronApplication;
let home: string;
let usb: string;
const plug = (fixture: string) => copyFileSync(`tests/fixtures/usb/${fixture}.json`, usb);
/** The same port list, its board answering as told (a FakeBoard in the main process: M10.2). */
const plugAnswering = (fixture: string, extra: { answers?: Record<string, string>; holder?: string }) =>
  writeFileSync(usb, JSON.stringify({ ...JSON.parse(readFileSync(`tests/fixtures/usb/${fixture}.json`, 'utf8')), ...extra }));

test.beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'microlab-e2e-'));
  usb = join(home, 'usb.json');
  plug('mac-no-board');
  app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, MICROLAB_USER_DATA: home, MICROLAB_FAKE_USB: usb } });
});

test.afterEach(async () => {
  await app?.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy())).catch(() => {});
  await app?.close();
  rmSync(home, { recursive: true, force: true });
});

test('plugged in: the chip names the board and its MicroPython within 2 s, with a short message; unplugged: "No board" again', async () => {
  const win = await app.firstWindow();
  await win.getByRole('button', { name: 'New Pico W project' }).click();
  const chip = win.getByRole('button', { name: /^Board:/ });
  await expect(chip).toHaveAccessibleName('Board: No board');

  plug('mac-pico-w');
  const t0 = Date.now();
  // asked as it is plugged in (M10.2): a Pico W, not just a Pico
  await expect(chip).toHaveAccessibleName('Board: Pico W, ready, MicroPython 1.29', { timeout: 2000 });
  expect(Date.now() - t0).toBeLessThan(2000);
  await expect(win.getByRole('status').filter({ hasText: 'Pico W plugged in — MicroPython 1.29.0. It matches this project.' })).toBeVisible();

  await chip.click();
  await expect(win.getByRole('dialog', { name: 'Board' })).toContainText('/dev/cu.usbmodem14201');
  await win.keyboard.press('Escape');

  plug('mac-microbit');
  await expect(chip).toHaveAccessibleName('Board: micro:bit, project is for Pico W', { timeout: 2000 });
  plug('mac-no-board');
  await expect(chip).toHaveAccessibleName('Board: No board', { timeout: 2000 });
});

test('a Pico in BOOTSEL mode is told apart', async () => {
  const win = await app.firstWindow();
  plug('mac-pico-bootsel');
  await win.getByRole('button', { name: 'New Pico W project' }).click();
  await expect(win.getByRole('button', { name: /^Board:/ })).toHaveAccessibleName('Board: Pico, BOOTSEL mode', { timeout: 2000 });
});

test('M10.2 a port another program holds: "used by Thonny"', async () => {
  const win = await app.firstWindow();
  await win.getByRole('button', { name: 'New Pico W project' }).click();
  const chip = win.getByRole('button', { name: /^Board:/ });
  await expect(chip).toHaveAccessibleName('Board: No board');
  plugAnswering('mac-pico-w', { answers: { '/dev/cu.usbmodem14201': 'busy' }, holder: 'Thonny' });
  await expect(chip).toHaveAccessibleName('Board: Pico, used by Thonny', { timeout: 2000 });
});

test('M10.2 R10 a board there before MicroLab started is not interrupted; its card asks it when told', async () => {
  await app.close();
  plug('mac-pico-w');
  app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, MICROLAB_USER_DATA: home, MICROLAB_FAKE_USB: usb } });
  const win = await app.firstWindow();
  await win.getByRole('button', { name: 'New Pico W project' }).click();
  const chip = win.getByRole('button', { name: /^Board:/ });
  await expect(chip).toHaveAccessibleName('Board: Pico, ready');
  await chip.click();
  await win.getByRole('dialog', { name: 'Board' }).getByRole('button', { name: 'Check the board' }).click();
  await expect(chip).toHaveAccessibleName('Board: Pico W, ready, MicroPython 1.29', { timeout: 2000 });
});
