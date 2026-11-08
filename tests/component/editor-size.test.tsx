import { render } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { describe, expect, it, vi } from 'vitest';
import { CodeEditor } from '../../src/renderer/editor/CodeEditor';

/** M7 (the teacher's report): a new text size is measured at once — the line numbers kept the old height until the
 *  editor was next focused. */
describe('M7 the code editor and its text size', () => {
  it('measures its lines again when the size changes, not only when it is focused', () => {
    const measure = vi.spyOn(EditorView.prototype, 'requestMeasure');
    const { rerender } = render(<CodeEditor label="main.py" value={'print(1)\nprint(2)\n'} onChange={() => {}} size={13} />);
    const before = measure.mock.calls.length;
    rerender(<CodeEditor label="main.py" value={'print(1)\nprint(2)\n'} onChange={() => {}} size={18} />);
    expect(measure.mock.calls.length).toBeGreaterThan(before);
    measure.mockRestore();
  });
});
