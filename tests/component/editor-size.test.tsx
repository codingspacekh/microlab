import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CodeEditor } from '../../src/renderer/editor/CodeEditor';

/** M7 (the teacher's report): a new text size is CodeMirror's own theme, so it measures its lines for it — set in
 *  CSS alone, the line numbers kept the old height until the editor was focused (a saved size, read as a project
 *  opens). tests/e2e/editor.spec.ts checks the numbers against the lines in the real window. */
describe('M7 the code editor and its text size', () => {
  it('a new size changes the editor\'s own theme (its style class), not only the page\'s CSS', () => {
    const code = 'print(1)\nprint(2)\n';
    const { container, rerender } = render(<CodeEditor label="main.py" value={code} onChange={() => {}} size={13} />);
    const before = container.querySelector('.cm-editor')!.className;
    rerender(<CodeEditor label="main.py" value={code} onChange={() => {}} size={20} />);
    const after = container.querySelector('.cm-editor')!.className;
    expect(after).not.toBe(before);
    rerender(<CodeEditor label="main.py" value={code} onChange={() => {}} size={13} />);
    expect(container.querySelector('.cm-editor')!.className).toBe(before);
  });
});
