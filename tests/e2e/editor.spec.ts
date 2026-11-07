import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

/** M4.4 F-20 with the real keyboard: main.py is edited in place; Python indents; the editor fills the code side. */
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

test('typing in main.py: a new line after a colon is indented, the text is kept', async () => {
  const win = await app.firstWindow();
  await win.getByRole('button', { name: 'New ESP32 project' }).click();
  const editor = win.getByRole('textbox', { name: 'main.py' });
  await editor.click();
  await win.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End');
  await win.keyboard.type('\nif led.value():');
  await win.keyboard.press('Enter');
  await win.keyboard.type('print("on")');
  const lines = await win.locator('.cm-line').allTextContents();
  expect(lines.slice(-2)).toEqual(['if led.value():', '    print("on")']);
  // Delete in the editor deletes text, never a part of the circuit
  await win.keyboard.press('Backspace');
  expect((await win.locator('.cm-line').allTextContents()).at(-1)).toBe('    print("on"');
});

test('the editor and the console below it fill the code side', async () => {
  const win = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1280, 720));
  await win.waitForFunction(() => window.innerWidth === 1280);
  await win.getByRole('button', { name: 'New Pico W project' }).click();
  const side = (await win.getByRole('region', { name: 'Code' }).boundingBox())!;
  const tabs = (await win.getByRole('tablist', { name: 'Files' }).boundingBox())!;
  const ed = (await win.locator('.cm-editor').boundingBox())!;
  const con = (await win.locator('.console').boundingBox())!;
  expect(Math.abs(ed.width - side.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(ed.y - (tabs.y + tabs.height))).toBeLessThanOrEqual(2);
  expect(Math.abs(con.y - (ed.y + ed.height))).toBeLessThanOrEqual(2);
  expect(Math.abs(con.y + con.height - (side.y + side.height))).toBeLessThanOrEqual(2);
  expect(ed.height).toBeGreaterThan(con.height);   // the code gets the most room
});

test('M5.5 typing on the Pico W: machine. offers Pin with its arguments, Enter takes it, ( shows what it needs', async () => {
  const win = await app.firstWindow();
  await win.getByRole('button', { name: 'New Pico W project' }).click();
  const editor = win.getByRole('textbox', { name: 'main.py' });
  await editor.click();
  await win.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End');
  await win.keyboard.type('\nimport machine\nbutton = machine.Pi');
  const list = win.locator('.cm-tooltip-autocomplete');
  await expect(list).toBeVisible();
  await expect(list.locator('li[aria-selected]')).toContainText('Pin(id, mode=-1, pull=-1, …)');
  await expect(win.locator('.cm-completionInfo')).toContainText('GPIO pin');
  // CodeMirror ignores Enter for 75 ms after the list changes, so a key already on its way never picks by accident
  await win.waitForTimeout(150);
  await win.keyboard.press('Enter');
  await win.keyboard.type('(14, ');
  await expect(win.locator('.ml-signature b')).toHaveText('mode=-1');
  await win.keyboard.type('machine.Pin.IN, machine.Pin.PULL_U');
  await expect(list.locator('li[aria-selected]')).toContainText('PULL_UP');
  await expect(win.locator('.ml-signature')).toHaveCount(0);   // the list's explanation is not covered
  await win.waitForTimeout(150);
  await win.keyboard.press('Enter');
  await expect(win.locator('.ml-signature b')).toHaveText('pull=-1');
  await win.keyboard.type(')');
  await expect(editor).toContainText('button = machine.Pin(14, machine.Pin.IN, machine.Pin.PULL_UP)');
  await expect(win.locator('.ml-signature')).toHaveCount(0);
});
