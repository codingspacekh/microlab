import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { newProject } from './new-project';

/** M11.7 (N-04, N-08): MicroLab works with no internet, and sends nothing anywhere — every request that would leave
 *  the computer is refused and written down, from the moment the window opens, while a student does the day's work:
 *  a board project built from the Start page, its program run, an error explained; a Python 3 program run, its shell
 *  used. Nothing is refused because nothing is asked. (The two things that do go out, each at the student's or the
 *  teacher's asking, are not in a lesson: an installed MicroLab looking for an update, and a library installed from
 *  PyPI.) */
let app: ElectronApplication;
let home: string;
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

test.beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'microlab-e2e-')); });
test.afterEach(async () => {
  await app?.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy())).catch(() => {});
  await app?.close();
  rmSync(home, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

test('a lesson with no internet: everything works, and nothing tries to leave the computer', async () => {
  test.setTimeout(90_000);
  app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, MICROLAB_USER_DATA: home } });
  // every request the app makes, refused unless it stays inside it (its own files, data and blob URLs, devtools)
  await app.evaluate(({ session }) => {
    const g = globalThis as unknown as { leaving: string[] };
    g.leaving = [];
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (d, done) => {
      const inside = /^(app|file|data|blob|devtools|chrome-extension):/.test(d.url);
      if (!inside) g.leaving.push(d.url);
      done({ cancel: !inside });
    });
  });
  const win = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900));
  await win.reload();   // the Start page again, with the refusals in place from its first request
  await win.getByRole('button', { name: 'Open…' }).waitFor();

  // a board project: the starter program runs; an error is explained in plain words
  await newProject(win, 'New micro:bit project', 'Offline');
  const code = async (text: string) => {
    await win.getByRole('textbox', { name: 'main.py' }).click();
    await win.keyboard.press(`${MOD}+A`);
    await win.keyboard.insertText(text);
  };
  await code('from microbit import *\nprint("no internet needed")\nprint(1 / 0)\n');
  await win.keyboard.press('F5');
  const log = win.getByRole('log', { name: 'Console' });
  await expect(log).toContainText('no internet needed', { timeout: 10_000 });
  await expect(log).toContainText('ZeroDivisionError');

  // a Python 3 program and its shell
  await win.getByRole('button', { name: 'Project menu' }).click();
  await win.getByRole('menuitem', { name: 'Close project' }).click();
  await win.getByRole('button', { name: "Don't save" }).click({ timeout: 2000 }).catch(() => {});
  await newProject(win, 'New Python project', 'Offline Python');
  await code('name = "class"\nprint("hello", name)\n');
  await win.keyboard.press('F5');
  await expect(win.locator('.pyshell')).toContainText('hello class', { timeout: 15_000 });
  await win.locator('.pyshell .prompt').getByRole('textbox').fill('len(name)');
  await win.keyboard.press('Enter');
  await expect(win.locator('.pyshell')).toContainText('5', { timeout: 5000 });

  const leaving = await app.evaluate(() => (globalThis as unknown as { leaving: string[] }).leaving);
  expect(leaving, 'requests that would have left the computer').toEqual([]);
  // and had the window tried, its own security policy refuses it before it is a request (connect-src 'self')
  expect(await win.evaluate(() => fetch('https://example.com/').then(() => 'sent', () => 'refused'))).toBe('refused');
});
