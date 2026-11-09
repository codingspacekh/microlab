import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { strToU8, zipSync } from 'fflate';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { newProject } from './new-project';

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
  await newProject(win, 'New Python project');
  await setCode(win, 'main.py', ['secret = 7', 'name = input("Name? ")', 'print(f"Hello {name}!")', ''].join('\n'));
  await win.keyboard.press('F5');
  const shell = win.getByRole('log', { name: 'Shell' });
  const prompt = win.locator('.pyshell .prompt').getByRole('textbox');
  await expect(win.locator('.pyshell .prompt')).toContainText('Name?', { timeout: 10_000 });
  await prompt.fill('Sok');
  await prompt.press('Enter');
  await expect(shell).toContainText('Hello Sok!', { timeout: 5000 });
  await expect(shell).toContainText('main.py ended. Its names are still here');
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

test('Stop ends a program that runs on; ⌘S saves main.py in its project\'s folder on disk', async () => {
  const win = await app.firstWindow();
  const file = join(home, 'Documents', 'MicroLab', 'Test project', 'main.py');
  await newProject(win, 'New Python project');
  expect(readFileSync(file, 'utf8')).toBe('print("Hello!")\n');   // made with the project
  await setCode(win, 'main.py', ['import time', 'n = 0', 'while True:', '    n += 1', '    print(n)', '    time.sleep(0.1)', ''].join('\n'));
  await win.keyboard.press(`${MOD}+s`);
  await expect(win.getByRole('group', { name: 'Python project' })).toContainText('Test project · main.py');
  await expect(win.getByRole('group', { name: 'Python project' })).not.toContainText('not saved');   // ("not saved" holds "saved" too)
  await expect.poll(() => readFileSync(file, 'utf8')).toContain('time.sleep(0.1)');
  await win.getByRole('button', { name: /Run main\.py/ }).click();
  await expect(win.getByRole('log', { name: 'Shell' })).toContainText('3', { timeout: 10_000 });
  await win.getByRole('button', { name: 'Stop' }).click();
  await expect(win.getByRole('button', { name: /Run main\.py/ })).toBeVisible({ timeout: 2000 });
  await expect(win.getByRole('log', { name: 'Shell' })).toContainText('Stopped.');
});

test('M12 slice 3 (screen 31c): a turtle program in real CPython — its window (hidden in tests) is said to be open; Stop ends it', async () => {
  const win = await app.firstWindow();
  await newProject(win, 'New Python project');
  await setCode(win, 'main.py', ['import turtle', 't = turtle.Turtle()', 't.speed(0)', 'for i in range(36):', '    t.forward(i * 3)', '    t.left(59)', 'print("drawn")', 'turtle.done()', ''].join('\n'));
  await win.keyboard.press('F5');
  const shell = win.getByRole('log', { name: 'Shell' });
  await expect(shell).toContainText('A window from main.py is open beside MicroLab.', { timeout: 15_000 });
  await expect(shell).toContainText('drawn', { timeout: 10_000 });
  await expect(win.getByRole('status')).toContainText('Running main.py');
  await win.getByRole('button', { name: 'Stop' }).click();
  await expect(win.getByRole('button', { name: /Run main\.py/ })).toBeVisible({ timeout: 2000 });
  await expect(shell).toContainText('Stopped.');
});

test('M12 slice 4 (screen 31d): a teacher\'s .whl file installs with real pip into MicroLab\'s folder; a program uses it; Remove', async () => {
  const win = await app.firstWindow();
  // greet 1.0, a pure-Python wheel, as a teacher might hand out (no internet needed)
  const info = 'greet-1.0.dist-info';
  const whl = join(home, 'greet-1.0-py3-none-any.whl');
  writeFileSync(whl, zipSync({
    'greet/__init__.py': strToU8('def hello(name):\n    return f"Hello {name} from greet"\n'),
    [`${info}/METADATA`]: strToU8('Metadata-Version: 2.1\nName: greet\nVersion: 1.0\nSummary: Says hello\n'),
    [`${info}/WHEEL`]: strToU8('Wheel-Version: 1.0\nGenerator: microlab-test\nRoot-Is-Purelib: true\nTag: py3-none-any\n'),
    [`${info}/RECORD`]: strToU8(`greet/__init__.py,,\n${info}/METADATA,,\n${info}/WHEEL,,\n${info}/RECORD,,\n`),
  }));
  await app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as typeof dialog.showOpenDialog;
  }, whl);
  await newProject(win, 'New Python project');
  await win.getByRole('button', { name: 'Libraries' }).click();
  const d = win.getByRole('dialog', { name: 'Libraries for Python 3' });
  await d.getByRole('button', { name: 'Install from a .whl file…' }).click();
  await expect(d.getByRole('log', { name: 'What pip says' })).toContainText('Successfully installed greet-1.0', { timeout: 30_000 });
  await expect(d.getByRole('list', { name: 'Installed in MicroLab' })).toContainText('greet1.0Says hello');
  await d.getByRole('button', { name: 'Done' }).click();
  await expect(win.getByRole('status')).toContainText('1 library installed');

  await setCode(win, 'main.py', 'import greet\nprint(greet.hello("Sok"))\n');
  await win.keyboard.press('F5');
  await expect(win.getByRole('log', { name: 'Shell' })).toContainText('Hello Sok from greet', { timeout: 10_000 });

  await win.getByRole('button', { name: 'Libraries' }).click();
  await d.getByRole('button', { name: 'Remove greet' }).click();
  await expect(d.getByText(/None yet/)).toBeVisible();
});


test('M12 slice 5 (F-94): a real CPython error explained in the shell, its line marked; Go to line; an error at >>> too', async () => {
  const win = await app.firstWindow();
  await newProject(win, 'New Python project');
  await setCode(win, 'main.py', ['guess = input("Guess: ")', 'if guess < 7:', '    print("higher")', ''].join('\n'));
  await win.keyboard.press('F5');
  const shell = win.getByRole('log', { name: 'Shell' });
  const prompt = win.locator('.pyshell .prompt').getByRole('textbox');
  await expect(win.locator('.pyshell .prompt')).toContainText('Guess:', { timeout: 10_000 });
  await prompt.fill('5');
  await prompt.press('Enter');
  await expect(shell).toContainText("TypeError: '<' not supported between instances of 'str' and 'int'", { timeout: 5000 });
  const card = shell.getByRole('note', { name: 'What the TypeError means' });
  await expect(card).toContainText('input() gives text, even when a number is typed: int(input(…)) makes it a whole number');
  await expect(win.locator('.cm-error-line')).toHaveText('if guess < 7:');
  await card.getByRole('button', { name: 'Go to line 2' }).click();
  await expect(win.locator('.cm-activeLine')).toHaveText('if guess < 7:');
  await prompt.fill('import turtle; turtle.forwad(10)');
  await prompt.press('Enter');
  await expect(shell.getByRole('note', { name: 'What the AttributeError means' })).toContainText('The turtle module has no forwad on line 1. Did you mean turtle.forward?', { timeout: 5000 });
});

test('M12 slice 5b (F-97, F-92): Jedi offers turtle\'s names as they are typed, with what each does; a call\'s arguments; Tab at >>>', async () => {
  test.skip(!existsSync(join('vendor', 'python-tools', 'jedi')), 'Jedi not fetched: npm run fetch:python -- --tools');
  const win = await app.firstWindow();
  await newProject(win, 'New Python project');
  await setCode(win, 'main.py', 'import turtle\nturtle.fo');
  await win.keyboard.press('Control+Space');
  const list = win.locator('.cm-tooltip-autocomplete');
  await expect(list.getByRole('option', { name: /forward/ })).toBeVisible({ timeout: 10_000 });   // the helper's first start
  await expect(win.locator('.cm-completionInfo')).toContainText('Move the turtle forward');
  await win.keyboard.press('Enter');
  await win.keyboard.type('10, ');
  await expect(win.getByRole('textbox', { name: 'main.py' })).toContainText('turtle.forward(10, )');
  await win.keyboard.press(`${MOD}+A`);
  await win.keyboard.insertText('import turtle\nturtle.goto(10, ');
  await expect(win.locator('.ml-signature b')).toHaveText(/^y/, { timeout: 5000 });
  await win.keyboard.press(`${MOD}+A`);
  await win.keyboard.insertText('secret = 7\n');
  await win.keyboard.press('F5');
  const prompt = win.locator('.pyshell .prompt').getByRole('textbox');
  await expect(win.locator('.pyshell .prompt')).toContainText('>>>', { timeout: 10_000 });
  await prompt.fill('secr');
  await prompt.press('Tab');
  await expect(prompt).toHaveValue('secret');
});

test('M12 slice 6a (Rev 11; screens 31b, 31f): brackets and quotes typed in pairs; the shell put on the right and dragged wider — remembered', async () => {
  const win = await app.firstWindow();
  await newProject(win, 'New Python project');
  const editor = win.getByRole('textbox', { name: 'main.py' });
  await editor.click();
  await win.keyboard.press(`${MOD}+A`);
  await win.keyboard.press('Backspace');
  await win.keyboard.type('print(');
  await expect(win.locator('.cm-line').first()).toHaveText('print()');
  await win.keyboard.type('"Hi');
  await expect(win.locator('.cm-line').first()).toHaveText('print("Hi")');
  await win.keyboard.type('")');
  await expect(win.locator('.cm-line').first()).toHaveText('print("Hi")');   // the closing ones stepped over
  // the shell: below, then on the right; its edge dragged with the mouse
  const main = win.locator('.pymain');
  await expect(main).toHaveClass(/below/);
  await win.getByRole('button', { name: 'Shell on the right' }).click();
  await expect(main).toHaveClass(/right/);
  const box = (await main.boundingBox())!;
  const shell = win.locator('.pyshell');
  const before = (await shell.boundingBox())!.width;
  expect(Math.abs(before - box.width * 0.4)).toBeLessThan(box.width * 0.03);
  const grip = (await win.getByRole('separator', { name: 'The shell\'s size' }).boundingBox())!;
  await win.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await win.mouse.down();
  await win.mouse.move(box.x + box.width * 0.4, grip.y + grip.height / 2, { steps: 6 });
  await win.mouse.up();
  const after = (await shell.boundingBox())!.width;
  expect(Math.abs(after - box.width * 0.6)).toBeLessThan(box.width * 0.03);
  // remembered: a new window has it on the right, as wide
  const saved = JSON.parse(readFileSync(join(home, 'settings.json'), 'utf8'));
  expect(saved.pyShell.place).toBe('right');
  expect(saved.pyShell.size).toBeCloseTo(0.6, 1);
});

test('M12 slice 6b (Rev 11; screens 31e, 31b): a Python project made on disk where the student chose; its tree; a new file; it opens again from Recent', async () => {
  const win = await app.firstWindow();
  const mine = join(home, 'Documents', 'MicroLab', 'Sokha');
  mkdirSync(mine, { recursive: true });
  await app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as typeof dialog.showOpenDialog;
  }, mine);
  await win.getByRole('button', { name: 'New Python project' }).click();
  const d = win.getByRole('dialog', { name: 'New Python project' });
  await expect(d.getByRole('textbox', { name: 'Location' })).toHaveValue('Documents/MicroLab');
  await d.getByRole('button', { name: 'Choose…' }).click();
  await expect(d.getByRole('textbox', { name: 'Location' })).toHaveValue('Documents/MicroLab/Sokha');
  await d.getByRole('textbox', { name: 'Project name' }).fill('guessing_game');
  await expect(d.getByRole('status')).toContainText('Documents/MicroLab/Sokha/guessing_game');
  await d.getByRole('button', { name: 'Create project' }).click();
  const root = join(mine, 'guessing_game');
  await expect(win.getByRole('textbox', { name: 'main.py' })).toContainText('print("Hello!")');
  expect(existsSync(join(root, 'main.py'))).toBe(true);
  const tree = win.getByRole('tree', { name: 'The files of guessing_game' });
  await expect(tree.getByRole('treeitem', { name: 'main.py' })).toBeVisible();
  // a new file from the tree: on disk at once, open in its tab
  await win.getByRole('button', { name: 'New file' }).click();
  await win.getByRole('textbox', { name: 'New file\'s name' }).fill('helpers');
  await win.keyboard.press('Enter');
  await expect(win.getByRole('textbox', { name: 'helpers.py' })).toBeVisible();
  expect(existsSync(join(root, 'helpers.py'))).toBe(true);
  // a file made by another program shows in the tree by itself (the folder is watched)
  writeFileSync(join(root, 'scores.txt'), '3\n');
  await expect(tree.getByRole('treeitem', { name: 'scores.txt' })).toBeVisible({ timeout: 5000 });
  await tree.getByRole('treeitem', { name: 'scores.txt' }).dblclick();
  await expect(win.getByRole('textbox', { name: 'scores.txt' })).toContainText('3');
  // Recent has the project; it opens again from there
  await win.getByRole('tab', { name: 'Workspace' }).click();
  const recent = win.getByRole('region', { name: 'Recent' });
  await expect(recent.getByRole('button', { name: /guessing_game/ })).toContainText('Python 3');
});

test('M12 slice 6b: a new board project is saved as its .mlab file where it was asked, before it opens', async () => {
  const win = await app.firstWindow();
  await newProject(win, 'New Pico W project', 'Traffic lights');
  await expect(win.getByRole('group', { name: 'Project' })).toContainText('Traffic lights');
  expect(existsSync(join(home, 'Documents', 'MicroLab', 'Traffic lights.mlab'))).toBe(true);
});

test('M12 slice 7 (Rev 12; screens 31b, 31g, 31h): panels hidden and shown; the code font; the theme on the whole screen; the app\'s size', async () => {
  const win = await app.firstWindow();
  await newProject(win, 'New Python project');
  // the tree and the shell, with the keyboard
  await win.getByRole('textbox', { name: 'main.py' }).click();
  await win.keyboard.press(`${MOD}+b`);
  await expect(win.getByRole('complementary', { name: 'Project' })).toHaveCount(0);
  await win.keyboard.press(`${MOD}+j`);
  await expect(win.getByRole('log', { name: 'Shell' })).toHaveCount(0);
  await win.getByRole('button', { name: 'Show the project\'s files' }).click();
  await win.getByRole('button', { name: 'The shell' }).click();
  await expect(win.getByRole('log', { name: 'Shell' })).toBeVisible();
  // Aa: a code font from the list; the Dark theme colours the shell too
  await win.getByRole('button', { name: 'Text size and theme' }).click();
  const pop = win.getByRole('dialog', { name: 'Text size and theme' });
  await pop.getByRole('combobox', { name: 'Code font' }).click();
  await win.getByRole('option', { name: 'Fira Code' }).click();
  await expect.poll(() => win.locator('.cm-scroller').evaluate((e) => getComputedStyle(e).fontFamily)).toMatch(/^"Fira Code Variable"/);
  await expect.poll(() => win.evaluate(() => document.fonts.check('13px "Fira Code Variable"'))).toBe(true);   // shipped, not missing
  await pop.getByRole('radio', { name: 'Dark' }).click();
  await expect.poll(() => win.locator('.pyshell .console').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(27, 32, 42)');
  await win.keyboard.press('Escape');
  // the app's size
  const size = win.getByRole('group', { name: 'The app\'s size' });
  await expect(size).toContainText('100 %');
  await size.getByRole('button', { name: 'Bigger' }).click();
  await expect(size).toContainText('110 %');
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.getZoomFactor())).toBeCloseTo(1.1, 2);
  await size.getByRole('button', { name: /The app's size/ }).click();
  await win.getByRole('menuitem', { name: /Back to 100 %/ }).click();
  await expect(size).toContainText('100 %');
});
