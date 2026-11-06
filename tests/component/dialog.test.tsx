import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from '../../src/renderer/ui';

/** M4.6 the kit's dialog (screen 08's look): a question the student must answer; the keyboard stays inside it. */
function setup() {
  const save = vi.fn();
  const discard = vi.fn();
  const cancel = vi.fn();
  render(
    <>
      <button type="button">before</button>
      <Dialog title="Save your changes?" onCancel={cancel}
        actions={[{ label: 'Save', primary: true, onClick: save }, { label: "Don't save", onClick: discard }, { label: 'Cancel', onClick: cancel }]}>
        Your changes to “Blink” will be lost if you don't save them.
      </Dialog>
    </>,
  );
  return { save, discard, cancel };
}

describe('M4.6 Dialog', () => {
  it('is a modal alert dialog, named by its title and described by its text', () => {
    setup();
    const d = screen.getByRole('alertdialog', { name: 'Save your changes?' });
    expect(d).toHaveAttribute('aria-modal', 'true');
    expect(d).toHaveAccessibleDescription(/will be lost/);
  });

  it('the main choice has the focus; each button does its own thing', () => {
    const s = setup();
    expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: "Don't save" }));
    expect(s.discard).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(s.save).toHaveBeenCalledOnce();
  });

  it('Esc cancels', () => {
    const s = setup();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Save' }), { key: 'Escape' });
    expect(s.cancel).toHaveBeenCalledOnce();
  });

  it('Tab and Shift+Tab go round its buttons, never out of it', () => {
    setup();
    const [save, discard, cancel] = ['Save', "Don't save", 'Cancel'].map((name) => screen.getByRole('button', { name }));
    fireEvent.keyDown(save!, { key: 'Tab', shiftKey: true });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(cancel!, { key: 'Tab' });
    expect(save).toHaveFocus();
    expect(discard).not.toHaveFocus();
  });

  it('when it goes, the focus goes back where it was', () => {
    const before = document.createElement('button');
    document.body.append(before);
    before.focus();
    const { unmount } = render(<Dialog title="Q" onCancel={() => {}} actions={[{ label: 'OK', onClick: () => {} }]}>text</Dialog>);
    expect(screen.getByRole('button', { name: 'OK' })).toHaveFocus();
    unmount();
    expect(before).toHaveFocus();
    before.remove();
  });
});
