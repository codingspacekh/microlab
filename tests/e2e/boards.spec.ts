import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { newProject } from './new-project';

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
  rmSync(home, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

test('plugged in: the chip names the board and its MicroPython within 2 s, with a short message; unplugged: "No board" again', async () => {
  const win = await app.firstWindow();
  await newProject(win, 'New Pico W project');
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
  await newProject(win, 'New Pico W project');
  await expect(win.getByRole('button', { name: /^Board:/ })).toHaveAccessibleName('Board: Pico, BOOTSEL mode', { timeout: 2000 });
});

test('M10.2 a port another program holds: "used by Thonny"', async () => {
  const win = await app.firstWindow();
  await newProject(win, 'New Pico W project');
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
  await newProject(win, 'New Pico W project');
  const chip = win.getByRole('button', { name: /^Board:/ });
  await expect(chip).toHaveAccessibleName('Board: Pico, ready');
  await chip.click();
  await win.getByRole('dialog', { name: 'Board' }).getByRole('button', { name: 'Check the board' }).click();
  await expect(chip).toHaveAccessibleName('Board: Pico W, ready, MicroPython 1.29', { timeout: 2000 });
});

test('M10.3 F-50 Send to board: the files go, the board runs them; sent again, nothing changed is copied', async () => {
  const win = await app.firstWindow();
  await newProject(win, 'New Pico W project');
  plug('mac-pico-w');
  const chip = win.getByRole('button', { name: /^Board:/ });
  await expect(chip).toHaveAccessibleName('Board: Pico W, ready, MicroPython 1.29', { timeout: 2000 });
  const send = win.getByRole('button', { name: 'Send to board' });
  await send.click();
  const dialog = win.getByRole('dialog', { name: 'Send to a real board' });
  await expect(dialog.getByRole('radio', { name: 'Raspberry Pi Pico W' })).toHaveAttribute('aria-checked', 'true');
  await dialog.getByRole('button', { name: 'Send and run' }).click();
  await expect(win.locator('.toasts').getByText(/^Sent to the Pico W: main\.py \([\d.]+ KB\)\.$/)).toBeVisible({ timeout: 3000 });
  await expect(win.locator('.toasts').getByText('The Pico W restarted. On its own it always starts main.py — now it runs this project.')).toBeVisible();
  await win.getByRole('button', { name: 'Send to board' }).click();
  await win.getByRole('dialog', { name: 'Send to a real board' }).getByRole('button', { name: 'Send and run' }).click();
  await expect(win.locator('.toasts').getByText('Nothing to copy: main.py was already on the Pico W as it is.')).toBeVisible({ timeout: 3000 });
});

test('M10.4 F-51 the board\'s console: Send and run shows it; Stop gives >>>; typed; a file run there; let go', async () => {
  const win = await app.firstWindow();
  await newProject(win, 'New Pico W project');
  plug('mac-pico-w');
  const chip = win.getByRole('button', { name: /^Board:/ });
  await expect(chip).toHaveAccessibleName('Board: Pico W, ready, MicroPython 1.29', { timeout: 2000 });
  await win.getByRole('button', { name: 'Send to board' }).click();
  await win.getByRole('dialog', { name: 'Send to a real board' }).getByRole('button', { name: 'Send and run' }).click();
  const log = win.getByRole('log', { name: 'Console of the Pico W' });
  await expect(win.getByRole('tab', { name: /Pico W \(USB\)/ })).toHaveAttribute('aria-selected', 'true', { timeout: 3000 });
  await expect(log).toContainText('✓ Sent to the Pico W: main.py');
  await expect(log).toContainText('MPY: soft reboot');
  await expect(chip).toHaveAccessibleName('Board: Pico W, running main.py');
  await expect(win.getByText('Pico W (USB): running main.py')).toBeVisible();

  await win.getByRole('button', { name: 'Stop the board', exact: true }).click();
  await expect(log).toContainText('KeyboardInterrupt');
  const input = win.getByRole('textbox', { name: 'Python for the board' });
  await input.fill('6*7');
  await input.press('Enter');
  await expect(log).toContainText(/6\*7\s+42\s+>>>/);

  await win.getByRole('button', { name: 'More ways to send' }).click();
  await win.getByRole('menuitem', { name: /Run main.py on the board/ }).click();
  await expect(win.getByText('Pico W (USB): running main.py')).toBeVisible();
  await expect(log).toContainText('Running main.py from the editor on the board');
  await log.press('Control+c');
  await expect(input).toBeVisible();

  await win.getByRole('button', { name: 'Let go of the board' }).click();
  await expect(win.getByRole('button', { name: 'Open the console' })).toBeVisible();
});

test('M10.5 F-53 Board files: the board beside the project; a folder made and deleted; done', async () => {
  const win = await app.firstWindow();
  await newProject(win, 'New Pico W project');
  plug('mac-pico-w');
  await expect(win.getByRole('button', { name: /^Board:/ })).toHaveAccessibleName('Board: Pico W, ready, MicroPython 1.29', { timeout: 2000 });
  await win.getByRole('button', { name: 'Send to board' }).click();
  await win.getByRole('dialog', { name: 'Send to a real board' }).getByRole('button', { name: 'Send and run' }).click();
  await expect(win.locator('.toasts').getByText(/^Sent to the Pico W/)).toBeVisible({ timeout: 3000 });

  await win.getByRole('button', { name: 'More ways to send' }).click();
  await win.getByRole('menuitem', { name: /Board files/ }).click();
  const dialog = win.getByRole('dialog', { name: 'Board files' });
  const board = dialog.getByRole('tree', { name: 'On the Pico W' });
  await expect(board.getByRole('treeitem', { name: 'main.py, same' })).toBeVisible({ timeout: 3000 });
  await expect(dialog).toContainText('KB used of 848 KB');

  await dialog.getByRole('button', { name: 'New folder' }).click();
  await dialog.getByRole('textbox', { name: 'Folder name' }).fill('www');
  await dialog.getByRole('button', { name: 'Make it' }).click();
  await expect(board.getByRole('treeitem', { name: 'www, only on the board' })).toBeVisible();

  await board.getByRole('treeitem', { name: 'www, only on the board' }).click();
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await dialog.getByRole('group', { name: 'Delete www from the Pico W?' }).getByRole('button', { name: 'Delete' }).click();
  await expect(board.getByRole('treeitem', { name: /^www/ })).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toHaveCount(0);
});

test('M10.6 F-56 the connection helper: step by step; it follows the board as it is plugged in', async () => {
  const win = await app.firstWindow();
  await newProject(win, 'New Pico W project');
  await win.getByRole('button', { name: /^Board:/ }).click();
  await win.getByRole('dialog', { name: 'Board' }).getByRole('button', { name: /Help connecting/ }).click();
  const helper = win.getByRole('dialog', { name: 'Help connecting a board' });
  await expect(helper).toContainText('Is the Pico W plugged in at both ends?');
  await helper.getByRole('button', { name: /Yes, it's plugged in/ }).click();
  await helper.getByRole('button', { name: /No, nothing appeared/ }).click();
  await expect(helper).toContainText('The cable only carries power');
  await helper.getByRole('button', { name: "I've changed the cable" }).click();
  plug('mac-pico-w');
  // plugged in with the helper open: asked by itself, as any board plugged in
  await expect(helper).toContainText('The Pico W is connected: MicroPython 1.29.', { timeout: 4000 });
  // the report for the teacher: the app's own version and the real system
  await helper.getByRole('button', { name: 'Copy report for the teacher' }).click();
  await expect(helper.getByRole('status')).toContainText('Copied');
  const report = await app.evaluate(({ clipboard }) => clipboard.readText());
  const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;
  expect(report).toContain(`MicroLab ${version} · ${process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux'} `);
  expect(report).toContain('Boards on USB: Pico 2e8a:0005 on /dev/cu.usbmodem14201');
  await helper.getByRole('button', { name: 'Close' }).first().click();
  await expect(helper).toHaveCount(0);
});

test('M10.6 R5 an ESP32 whose USB chip has no driver (Windows\' device list, constructed): can\'t connect, which driver', async () => {
  const win = await app.firstWindow();
  await newProject(win, 'New ESP32 project');
  const f = JSON.parse(readFileSync('tests/fixtures/usb/win-esp32-no-driver-constructed.json', 'utf8')) as { pnp: string };
  writeFileSync(usb, JSON.stringify({ platform: 'win32', volumes: [], ports: [], pnp: f.pnp }));
  const chip = win.getByRole('button', { name: /^Board:/ });
  await expect(chip).toHaveAccessibleName("Board: Board found, can't connect", { timeout: 4000 });
  await chip.click();
  await expect(win.getByRole('dialog', { name: 'Board' })).toContainText('no driver for that chip');
  await win.getByRole('dialog', { name: 'Board' }).getByRole('button', { name: /Help connecting/ }).click();
  const helper = win.getByRole('dialog', { name: 'Help connecting a board' });
  await expect(helper).toContainText('This laptop has no driver for the CP210x chip');
  await expect(helper.getByRole('button', { name: 'Open the CP210x driver page' })).toBeVisible();
});

test('M10.7 F-52 installing MicroPython on a Pico W in BOOTSEL: the .uf2 copied to its drive; it comes back answering', async () => {
  const win = await app.firstWindow();
  // the fake RPI-RP2 drive: a folder beside the fake port list
  const drive = join(home, 'volumes', 'RPI-RP2');
  mkdirSync(drive, { recursive: true });
  plug('mac-pico-bootsel');
  await newProject(win, 'New Pico W project');
  const chip = win.getByRole('button', { name: /^Board:/ });
  await expect(chip).toHaveAccessibleName('Board: Pico, BOOTSEL mode', { timeout: 2000 });
  await chip.click();
  await win.getByRole('dialog', { name: 'Board' }).getByRole('button', { name: /Install MicroPython 1.29/ }).click();
  const dialog = win.getByRole('dialog', { name: 'Install MicroPython on the Pico W' });
  await dialog.getByRole('button', { name: 'Install' }).click();

  const uf2 = join(drive, 'RPI_PICO_W-20260824-v1.29.0.uf2');
  await expect.poll(() => existsSync(uf2) && statSync(uf2).size, { timeout: 5000 }).toBe(1811456);
  // the Pico takes it and restarts: the drive goes, the board comes back with MicroPython
  plug('mac-pico-w');
  await expect(dialog).toContainText('MicroPython 1.29.0 is on the Pico W.', { timeout: 6000 });
  await expect(chip).toHaveAccessibleName('Board: Pico W, ready, MicroPython 1.29');
  await dialog.getByRole('button', { name: 'Close' }).click();
});
