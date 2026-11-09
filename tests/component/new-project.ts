import { act, fireEvent, screen, within } from '@testing-library/react';

/**
 * M12 Rev 11 (F-100, screen 31e): a new project asks its name and place first. As a student does it: the card's
 * button, a name typed, Create — then the project is open (a board's workspace, or a Python project's screen).
 * It waits on promises only (the fake API's answers), never on time: it works with fake timers too.
 */
async function until<T>(get: () => T | null | undefined | false, what: string): Promise<T> {
  for (let i = 0; i < 50; i++) {
    const v = get();
    if (v) return v;
    await act(async () => { await Promise.resolve(); });
  }
  throw new Error(`New project: ${what} never came`);
}

export async function newProjectFromStart(button: string | RegExp, name = 'Test project'): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: button }));
  const dialog = await until(() => screen.queryByRole('dialog', { name: /^New .* project$/ }), 'the dialog');
  // the location comes from the main process: MicroLab's folder
  await until(() => (within(dialog).getByRole('textbox', { name: 'Location' }) as HTMLInputElement).value, 'the location');
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Project name' }), { target: { value: name } });
  await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Create project' })); });
  await until(() => !screen.queryByRole('dialog', { name: /^New .* project$/ }), 'the project');
}
