import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';

/** M4.1b (N-14): the kit on screen 12b, in the real window — Tab reaches every control, the keyboard works them. */
let app: ElectronApplication;
let win: Page;
let home: string;

test.beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'microlab-e2e-'));
  app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, MICROLAB_USER_DATA: home } });
  win = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900));
  await win.evaluate(() => { window.location.hash = '#controls'; });
  await win.getByRole('main', { name: 'Form controls' }).waitFor();
});
test.afterAll(async () => { await app?.close(); rmSync(home, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); });

test('there is no native select, colour, range or number input on the page', async () => {
  expect(await win.locator('select, input[type=color], input[type=range], input[type=number], input[type=date], input[type=time]').count()).toBe(0);
  await win.screenshot({ path: 'test-results/controls-1440.png' });
});

test('Tab reaches every kind of control, and never a disabled one', async () => {
  await win.getByRole('textbox', { name: 'Project name' }).focus();
  const seen = new Set<string>();
  const names: string[] = [];
  for (let i = 0; i < 60; i++) {
    const [role, name, disabled] = await win.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const role = el.getAttribute('role') ?? (el.tagName === 'TEXTAREA' ? 'textarea' : el.tagName.toLowerCase());
      const label = el.getAttribute('aria-label') ?? (el.getAttribute('aria-labelledby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
      return [role, label.trim(), el.getAttribute('aria-disabled') === 'true' || (el as HTMLInputElement).disabled === true] as const;
    });
    expect(disabled, `${role} ${name} is disabled but reached by Tab`).toBe(false);
    seen.add(role);
    names.push(`${role}:${name}`);
    await win.keyboard.press('Tab');
  }
  for (const role of ['input', 'textarea', 'radio', 'combobox', 'spinbutton', 'slider', 'checkbox', 'switch']) expect([...seen], names.join(', ')).toContain(role);
});

test('the dropdown works from the keyboard, and its list is drawn over the page', async () => {
  const box = win.getByRole('combobox', { name: 'LED colour' });
  await box.focus();
  await win.keyboard.press('Enter');
  const list = win.getByRole('listbox');
  await expect(list).toBeVisible();
  await win.keyboard.press('ArrowDown');
  await win.keyboard.press('ArrowDown');
  await win.keyboard.press('Enter');
  await expect(list).toBeHidden();
  await expect(box).toHaveText(/Green/);
  await expect(box).toBeFocused();
});

test('a slider moves with the arrows and with the mouse', async () => {
  const thumb = win.getByRole('slider', { name: 'Light' });
  await thumb.focus();
  await win.keyboard.press('ArrowRight');
  await expect(thumb).toHaveAttribute('aria-valuenow', '630');
  const track = await thumb.locator('..').boundingBox();
  await win.mouse.click(track!.x + track!.width * 0.25, track!.y + track!.height / 2);
  await expect(thumb).toHaveAttribute('aria-valuenow', '250');
});
