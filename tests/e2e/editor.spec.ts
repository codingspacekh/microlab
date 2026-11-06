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

test('the editor fills the code side, below its file tab', async () => {
  const win = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1280, 720));
  await win.waitForFunction(() => window.innerWidth === 1280);
  await win.getByRole('button', { name: 'New Pico W project' }).click();
  const side = (await win.getByRole('region', { name: 'Code' }).boundingBox())!;
  const ed = (await win.locator('.cm-editor').boundingBox())!;
  expect(Math.abs(ed.width - side.width)).toBeLessThanOrEqual(2);
  expect(ed.y + ed.height).toBeGreaterThan(side.y + side.height - 2);
  expect(ed.height).toBeGreaterThan(side.height - 60);
});
