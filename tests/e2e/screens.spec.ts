import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { newProject } from './new-project';

/** M11.6 (N-13, N-14): every screen a student reaches, at 1280 × 720 (MicroLab's smallest), 1440 × 900 and
 *  1920 × 1080 — the page never scrolls sideways; every dialog, menu, list and floating panel is inside the window;
 *  and no form control is the system's own (select, checkbox, radio, colour, range, number, date, time, file). Each
 *  screen's problems are collected, then all are shown at once. */
const SIZES = [[1280, 720], [1440, 900], [1920, 1080]] as const;
const NATIVE = 'select, input[type=checkbox], input[type=radio], input[type=color], input[type=range], input[type=number], input[type=date], input[type=time], input[type=file]';
const FLOATING = '[role=dialog], [role=alertdialog], [role=menu], [role=listbox], .float, .cm-tooltip';
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

async function problemsOn(win: Page): Promise<string[]> {
  return win.evaluate(([native, floating]) => {
    const out: string[] = [];
    const W = window.innerWidth;
    const H = window.innerHeight;
    const root = document.documentElement;
    if (root.scrollWidth > W + 1) out.push(`the page scrolls sideways (${root.scrollWidth} px wide in ${W})`);
    if (document.body.scrollWidth > W + 1) out.push(`the body is ${document.body.scrollWidth} px wide in ${W}`);
    const name = (e: Element) => `${e.getAttribute('role') ?? e.tagName.toLowerCase()} “${(e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 30)}”`;
    for (const e of document.querySelectorAll(native)) {
      if ((e as HTMLElement).offsetParent !== null || e.tagName === 'SELECT') out.push(`a system control: ${e.outerHTML.slice(0, 80)}`);
    }
    for (const e of document.querySelectorAll(floating)) {
      const r = e.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) {
        out.push(`${name(e)} reaches outside the window (${Math.round(r.left)},${Math.round(r.top)} → ${Math.round(r.right)},${Math.round(r.bottom)} in ${W} × ${H})`);
      }
    }
    return out;
  }, [NATIVE, FLOATING] as const);
}

for (const [width, height] of SIZES) {
  test.describe(`at ${width} × ${height}`, () => {
    let app: ElectronApplication;
    let win: Page;
    let home: string;
    const found: string[] = [];
    const look = async (screen: string) => {
      await win.waitForTimeout(250);   // a panel sliding out, a dialog appearing
      for (const p of await problemsOn(win)) found.push(`${screen}: ${p}`);
    };
    const away = async () => { for (let i = 0; i < 3; i++) await win.keyboard.press('Escape'); };

    test.beforeAll(async () => {
      home = mkdtempSync(join(tmpdir(), 'microlab-e2e-'));
      app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, MICROLAB_USER_DATA: home } });
      win = await app.firstWindow();
      await app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0]!.setContentSize(w!, h!), [width, height]);
      await win.waitForFunction(([w]) => window.innerWidth === w, [width]);
    });
    test.afterAll(async () => {
      await app?.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy())).catch(() => {});
      await app?.close();
      rmSync(home, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    });

    test('every screen fits the window, with only MicroLab\'s own controls', async () => {
      test.setTimeout(120_000);
      // the Start page, About and its licences, the app's size
      await win.getByRole('button', { name: 'Open…' }).waitFor();
      await look('Start page');
      await win.getByRole('button', { name: 'About MicroLab' }).click();
      await look('About');
      await win.getByRole('dialog').getByRole('button', { name: /Licences/ }).click();
      await look('About ▸ Licences');
      await away();
      await win.getByRole('tab', { name: 'Learn' }).click();
      await look('Learn');
      await win.getByRole('tab', { name: 'Python 3' }).click();
      await look('Python 3 (no project)');
      await win.getByRole('tab', { name: 'Workspace' }).click();

      // a new project's dialog
      await win.getByRole('button', { name: 'New Pico W project' }).click();
      await look('New project');
      await away();

      // the workspace, full: a project saved by v0.12.0 with every part (58), so the check before running speaks
      const file = join(home, 'Every part.mlab');
      copyFileSync('tests/fixtures/projects/saved-by/v0.12.0/pico-w.mlab', file);
      await app.evaluate(({ dialog }, p) => {
        dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as typeof dialog.showOpenDialog;
      }, file);
      await win.getByRole('button', { name: 'Open…' }).click();
      await expect(win.locator('[data-part]')).toHaveCount(58);
      await look('Workspace');
      await win.getByRole('button', { name: 'Project menu' }).click();
      await look('Project menu');
      await away();
      // the parts panel: folded to its rail in a project with parts (Parts), or the board alone's Add parts
      await win.getByRole('button', { name: 'Add parts' }).or(win.getByRole('button', { name: 'Parts', exact: true })).first().click();
      await look('Workspace, parts panel open');
      await away();
      await win.getByRole('button', { name: 'Fit' }).click();
      await win.locator('[data-part="lcd1"]').click();   // a part lying on its own (the 16×2 LCD)
      await look('Workspace, a part chosen (inspector)');
      await win.getByRole('button', { name: /^Board/ }).click();
      await look('Board');
      await away();
      await win.getByRole('button', { name: 'Project files' }).click();
      await look('Project files');
      await away();
      await win.getByRole('button', { name: 'Add a file or a library' }).click();
      await look('Add a file or a library');
      await win.getByRole('menuitem', { name: 'Add a library…' }).click();
      await look('Add a library');
      await away();
      await win.getByRole('button', { name: 'Text size and theme' }).click();
      await look('Text size and theme');
      await away();
      await win.getByRole('button', { name: 'Meter', exact: true }).click();
      await look('Meter');
      await win.getByRole('button', { name: 'Put the multimeter away' }).click();
      for (const tab of ['Plotter', 'Problems', 'Console']) {
        await win.getByRole('tab', { name: tab }).click();
        await look(`Workspace, ${tab}`);
      }
      await win.getByRole('button', { name: /^Run main\.py/ }).click();
      await expect(win.getByRole('dialog', { name: /Before it runs/ })).toBeVisible();
      await look('Before it runs');
      await win.getByRole('dialog', { name: /Before it runs/ }).getByRole('button', { name: 'Cancel' }).click();

      // the Python 3 screen (Don't save: the project opened was changed by nothing, but asks if it was)
      await win.getByRole('button', { name: 'Project menu' }).click();
      await win.getByRole('menuitem', { name: 'New project…' }).click();
      await win.getByRole('button', { name: "Don't save" }).click({ timeout: 2000 }).catch(() => {});
      await newProject(win, 'New Python project');
      await look('Python 3');
      await win.getByRole('button', { name: 'Python project menu' }).click();
      await look('Python project menu');
      await away();
      await win.getByRole('button', { name: 'Libraries' }).click();
      await look('Python ▸ Libraries');
      await away();
      await win.getByRole('button', { name: 'More for the file chosen' }).click();
      await look('Python ▸ a file\'s menu');
      await away();
      await win.getByRole('button', { name: 'New file' }).click();
      await look('Python ▸ New file');
      await away();
      await win.getByRole('button', { name: 'Shell on the right' }).click();
      await look('Python 3, shell on the right');
      await win.getByRole('textbox', { name: 'main.py' }).click();
      await win.keyboard.press(`${MOD}+A`);
      await win.keyboard.insertText('import turtle\nturtle.');
      await win.keyboard.press('Control+Space');
      await win.locator('.cm-tooltip-autocomplete').waitFor({ timeout: 10_000 }).catch(() => {});
      await look('Python 3, completions');

      expect(found, found.join('\n')).toEqual([]);
    });
  });
}
