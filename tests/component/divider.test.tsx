import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Divider } from '../../src/renderer/ui/Divider';

describe('M4.1 Divider (N-13): drag or arrow keys to resize a panel, kept within its limits', () => {
  const setup = (value = 300, edge: 'left' | 'right' = 'left') => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(<Divider label="Parts panel width" value={value} min={220} max={400} edge={edge} onChange={onChange} onCommit={onCommit} />);
    return { sep: screen.getByRole('separator', { name: 'Parts panel width' }), onChange, onCommit };
  };

  it('is a focusable vertical separator with its value and limits', () => {
    const { sep } = setup();
    expect(sep).toHaveAttribute('aria-orientation', 'vertical');
    expect(sep).toHaveAttribute('aria-valuenow', '300');
    expect(sep).toHaveAttribute('aria-valuemin', '220');
    expect(sep).toHaveAttribute('aria-valuemax', '400');
    expect(sep).toHaveAttribute('tabindex', '0');
  });

  it('dragging changes the width by how far the mouse moved; letting go commits it', () => {
    const { sep, onChange, onCommit } = setup();
    fireEvent.mouseDown(sep, { clientX: 500, button: 0 });
    fireEvent.mouseMove(window, { clientX: 540 });
    expect(onChange).toHaveBeenLastCalledWith(340);
    fireEvent.mouseMove(window, { clientX: 900 });
    expect(onChange).toHaveBeenLastCalledWith(400);   // its max
    fireEvent.mouseUp(window, { clientX: 900 });
    expect(onCommit).toHaveBeenCalledWith(400);
    fireEvent.mouseMove(window, { clientX: 100 });
    expect(onChange).toHaveBeenCalledTimes(2);          // nothing after letting go
  });

  it('a divider at a panel\'s left edge grows it when dragged left', () => {
    const { sep, onChange } = setup(300, 'right');
    fireEvent.mouseDown(sep, { clientX: 500, button: 0 });
    fireEvent.mouseMove(window, { clientX: 460 });
    expect(onChange).toHaveBeenLastCalledWith(340);
  });

  it('arrow keys move it 16 px (Shift: 64), Home and End go to the limits; each commits', () => {
    const { sep, onCommit } = setup();
    fireEvent.keyDown(sep, { key: 'ArrowRight' });
    expect(onCommit).toHaveBeenLastCalledWith(316);
    fireEvent.keyDown(sep, { key: 'ArrowLeft', shiftKey: true });
    expect(onCommit).toHaveBeenLastCalledWith(236);
    fireEvent.keyDown(sep, { key: 'Home' });
    expect(onCommit).toHaveBeenLastCalledWith(220);
    fireEvent.keyDown(sep, { key: 'End' });
    expect(onCommit).toHaveBeenLastCalledWith(400);
  });
});
