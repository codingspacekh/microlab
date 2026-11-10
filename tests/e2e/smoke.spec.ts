import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

let app: ElectronApplication;
let home: string;

test.beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'microlab-e2e-'));
  app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, MICROLAB_USER_DATA: home } });
});

test.afterAll(async () => {
  // unsaved changes would make the window ask before it closes (M4.6): end it without asking
  await app?.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy())).catch(() => {});
  await app?.close();
  rmSync(home, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

test('the built app opens a window titled MicroLab, on the Start screen (M4.2)', async () => {
  const win = await app.firstWindow();
  await expect(win).toHaveTitle('MicroLab');
  await expect(win.getByRole('heading', { name: 'Start something new' })).toBeVisible();
});

test('the window is cross-origin isolated, so the simulation worker can share memory (architecture §2.2)', async () => {
  const win = await app.firstWindow();
  expect(await win.evaluate(() => self.crossOriginIsolated)).toBe(true);
  expect(await win.evaluate(() => typeof SharedArrayBuffer)).toBe('function');
});

test('the window is served from app://microlab, not from a file path', async () => {
  const win = await app.firstWindow();
  expect(win.url()).toMatch(/^app:\/\/microlab\//);
});
