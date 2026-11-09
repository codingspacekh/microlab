import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';

/** M12 slice 2 (F-90–F-92, screens 31, 31b): the Python 3 screen in the real app — a real CPython (the bundled one,
 *  or in development the computer's python3) runs the file: input() answered, >>> after it, Ctrl+C, Save. */
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
  await app?.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy())).catch(() => {});
  await app?.close();
  rmSync(home, { recursive: true, force: true });
});

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

async function setCode(win: Page, name: string, code: string) {
  await win.getByRole('textbox', { name }).click();
  await win.keyboard.press(`${MOD}+A`);
  await win.keyboard.insertText(code);
}

test('a new Python file runs in real CPython: input() answered in the shell, then >>> in its names; Ctrl+C stops a loop', async () => {
  const win = await app.firstWindow();
  await win.getByRole('button', { name: 'New Python file' }).click();
  await setCode(win, 'untitled.py', ['secret = 7', 'name = input("Name? ")', 'print(f"Hello {name}!")', ''].join('\n'));
  await win.keyboard.press('F5');
  const shell = win.getByRole('log', { name: 'Shell' });
  const prompt = win.locator('.pyshell .prompt').getByRole('textbox');
  await expect(win.locator('.pyshell .prompt')).toContainText('Name?', { timeout: 10_000 });
  await prompt.fill('Sok');
  await prompt.press('Enter');
  await expect(shell).toContainText('Hello Sok!', { timeout: 5000 });
  await expect(shell).toContainText('untitled.py ended. Its names are still here');
  await expect(win.getByRole('status')).toContainText(/Python 3\.\d+\.\d+ \(MicroLab\)/);
  await prompt.fill('secret * 6');
  await prompt.press('Enter');
  await expect(shell).toContainText('42');
  // a loop at >>>, stopped with Ctrl+C: the names stay
  await prompt.fill('while True: pass');
  await prompt.press('Enter');
  await prompt.press('Enter');
  await win.waitForTimeout(300);
  await prompt.press('Control+c');
  await expect(shell).toContainText('KeyboardInterrupt', { timeout: 3000 });
  await prompt.fill('secret');
  await prompt.press('Enter');
  // the names stayed: secret is still 7; the next >>> is the prompt row's, below the shell
  await expect(shell).toContainText(/>>> secret\s*7/);
  await expect(win.locator('.pyshell .prompt')).toContainText('>>>');
});

test('Stop ends a program that runs on; Save writes the .py file where the student chose', async () => {
  const win = await app.firstWindow();
  const file = join(home, 'loop.py');
  await app.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: p })) as typeof dialog.showSaveDialog;
  }, file);
  await win.getByRole('button', { name: 'New Python file' }).click();
  await setCode(win, 'untitled.py', ['import time', 'n = 0', 'while True:', '    n += 1', '    print(n)', '    time.sleep(0.1)', ''].join('\n'));
  await win.keyboard.press(`${MOD}+s`);
  await expect(win.getByRole('group', { name: 'Python file' })).toContainText('loop.py');
  expect(readFileSync(file, 'utf8')).toContain('time.sleep(0.1)');
  await win.getByRole('button', { name: /Run loop\.py/ }).click();
  await expect(win.getByRole('log', { name: 'Shell' })).toContainText('3', { timeout: 10_000 });
  await win.getByRole('button', { name: 'Stop' }).click();
  await expect(win.getByRole('button', { name: /Run loop\.py/ })).toBeVisible({ timeout: 2000 });
  await expect(win.getByRole('log', { name: 'Shell' })).toContainText('Stopped.');
});

test('M12 slice 3 (screen 31c): a turtle program in real CPython — its window (hidden in tests) is said to be open; Stop ends it', async () => {
  const win = await app.firstWindow();
  await win.getByRole('button', { name: 'New Python file' }).click();
  await setCode(win, 'untitled.py', ['import turtle', 't = turtle.Turtle()', 't.speed(0)', 'for i in range(36):', '    t.forward(i * 3)', '    t.left(59)', 'print("drawn")', 'turtle.done()', ''].join('\n'));
  await win.keyboard.press('F5');
  const shell = win.getByRole('log', { name: 'Shell' });
  await expect(shell).toContainText('A window from untitled.py is open beside MicroLab.', { timeout: 15_000 });
  await expect(shell).toContainText('drawn', { timeout: 10_000 });
  await expect(win.getByRole('status')).toContainText('Running untitled.py');
  await win.getByRole('button', { name: 'Stop' }).click();
  await expect(win.getByRole('button', { name: /Run untitled\.py/ })).toBeVisible({ timeout: 2000 });
  await expect(shell).toContainText('Stopped.');
});

