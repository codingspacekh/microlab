import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { newProject } from './new-project';

/** M5.7 with the real app: killed while editing, the project is offered back on the next start (F-03); a project
 *  saved is in the recent list on the next start, and opens from there (F-05, screen 01). */
let app: ElectronApplication | undefined;
let home: string;
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

const launch = async () => {
  app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, MICROLAB_USER_DATA: home } });
  const win = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900));
  await win.waitForFunction(() => window.innerWidth === 1440);
  return win;
};

test.beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'microlab-e2e-')); });

test.afterEach(async () => {
  await app?.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy())).catch(() => {});
  await app?.close().catch(() => {});
  app = undefined;
  rmSync(home, { recursive: true, force: true });
});

test('F-03: the app is killed while editing; on restart the project is offered back, its changes in it', async () => {
  let win = await launch();
  await newProject(win, 'New micro:bit project');
  await win.getByRole('textbox', { name: 'main.py' }).click();
  await win.keyboard.press(`${MOD}+End`);
  await win.keyboard.insertText('\n# kept after a crash\n');
  // the copy is written a few seconds after the change
  await expect.poll(() => existsSync(join(home, 'recovery', 'project.mlab')), { timeout: 10_000 }).toBe(true);
  app!.process().kill('SIGKILL');
  await new Promise((r) => setTimeout(r, 300));

  win = await launch();
  const card = win.getByRole('alert');
  await expect(card).toContainText('Your changes to “Test project” were kept');
  await card.getByRole('button', { name: 'Get them back' }).click();
  await expect(win.getByRole('textbox', { name: 'main.py' })).toContainText('# kept after a crash');
  await expect(win.getByTitle('Not saved')).toBeVisible();
});

test('F-03: changes given up (Don\'t save) are not offered back', async () => {
  const win = await launch();
  await newProject(win, 'New micro:bit project');
  await win.getByRole('textbox', { name: 'main.py' }).click();
  await win.keyboard.insertText('# not wanted\n');
  await expect.poll(() => existsSync(join(home, 'recovery', 'project.mlab')), { timeout: 10_000 }).toBe(true);
  await app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
  await win.getByRole('button', { name: "Don't save" }).click().catch(() => {});
  await expect.poll(() => existsSync(join(home, 'recovery', 'project.mlab'))).toBe(false);
});

test('F-05: a project saved is in Recent projects on the next start, and opens from there', async () => {
  let win = await launch();
  // Rev 11: a new project is named, and saved where it was made, before it opens
  await newProject(win, 'New Pico W project', 'Lamp');
  const file = join(home, 'Documents', 'MicroLab', 'Lamp.mlab');
  await expect.poll(() => existsSync(file)).toBe(true);
  await app!.close();

  win = await launch();
  const row = win.getByRole('region', { name: 'Recent' }).getByRole('button', { name: /Lamp/ });
  await expect(row).toContainText('Pico W');
  await expect(row).toContainText(/Today \d\d:\d\d/);
  await row.click();
  await expect(win.getByRole('group', { name: 'Project' })).toContainText('Lamp');
});
