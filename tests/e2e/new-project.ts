import { expect, type Page } from '@playwright/test';

/**
 * M12 Rev 11 (F-100, screen 31e): a new project asks its name and place first. As a student does it in the real
 * app: the card's button, a name typed, Create. The tests' Documents is their own (MICROLAB_USER_DATA/Documents).
 */
export async function newProject(win: Page, button: string | RegExp, name = 'Test project'): Promise<void> {
  await win.getByRole('button', { name: button }).click();
  const d = win.getByRole('dialog', { name: /^New .* project$/ });
  await expect(d.getByRole('textbox', { name: 'Location' })).not.toHaveValue('');
  // a name already there (a test that makes several projects): another, as a student would — "Test project 2"
  const taken = d.getByText(/There is already a project called/);
  for (let n = 1; n <= 5; n++) {
    await d.getByRole('textbox', { name: 'Project name' }).fill(n === 1 ? name : `${name} ${n}`);
    await d.getByRole('button', { name: 'Create project' }).click();
    await expect.poll(async () => (await d.count()) === 0 || (await taken.count()) > 0, { timeout: 10_000 }).toBe(true);
    if (await d.count() === 0) return;
  }
  throw new Error(`New project: no free name like “${name}”`);
}
