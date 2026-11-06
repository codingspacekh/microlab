import { syntaxTree } from '@codemirror/language';
import { insertNewlineAndIndent, undo } from '@codemirror/commands';
import { EditorView } from '@codemirror/view';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/app/App';
import type { MicrolabApi } from '../../src/renderer/app/api';
import { CodeEditor } from '../../src/renderer/editor/CodeEditor';

/** M4.4 F-20 (basic): main.py in a CodeMirror editor with Python — as on screens 02 and 03. */
const viewOf = (el: HTMLElement) => EditorView.findFromDOM(el.closest('.cm-editor') as HTMLElement)!;
const type = (view: EditorView, text: string, at = view.state.doc.length) =>
  act(() => { view.dispatch({ changes: { from: at, insert: text }, selection: { anchor: at + text.length }, userEvent: 'input.type' }); });

describe('M4.4 the code editor', () => {
  it('shows the code, labelled, with line numbers, and Python is understood', () => {
    render(<CodeEditor label="main.py" value={'from machine import Pin\nled = Pin(15, Pin.OUT)\n'} onChange={() => {}} />);
    const box = screen.getByRole('textbox', { name: 'main.py' });
    expect(box.textContent).toContain('led = Pin(15, Pin.OUT)');
    const view = viewOf(box);
    expect(syntaxTree(view.state).topNode.name).toBe('Script');
    expect(document.querySelector('.cm-lineNumbers')).not.toBeNull();
  });

  it('every change is passed on as the whole text', () => {
    const onChange = vi.fn();
    render(<CodeEditor label="main.py" value={"x = 1\n"} onChange={onChange} />);
    type(viewOf(screen.getByRole('textbox', { name: 'main.py' })), 'print(x)\n');
    expect(onChange).toHaveBeenLastCalledWith('x = 1\nprint(x)\n');
  });

  it('a new line after a colon is indented four spaces (MicroPython style); undo takes back a change', () => {
    const onChange = vi.fn();
    render(<CodeEditor label="main.py" value="while True:" onChange={onChange} />);
    const view = viewOf(screen.getByRole('textbox', { name: 'main.py' }));
    act(() => { view.dispatch({ selection: { anchor: view.state.doc.length } }); insertNewlineAndIndent(view); });
    expect(view.state.doc.toString()).toBe('while True:\n    ');
    act(() => { undo(view); });
    expect(view.state.doc.toString()).toBe('while True:');
  });

  it('a new value from outside (another project opened) replaces the text, and is not echoed back', () => {
    const onChange = vi.fn();
    const { rerender } = render(<CodeEditor label="main.py" value={"a = 1\n"} onChange={onChange} />);
    rerender(<CodeEditor label="main.py" value={"b = 2\n"} onChange={onChange} />);
    expect(viewOf(screen.getByRole('textbox', { name: 'main.py' })).state.doc.toString()).toBe('b = 2\n');
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('M4.4 main.py in the workspace', () => {
  const api = (): MicrolabApi => {
    const stored: Record<string, unknown> = {};
    return {
      versions: { app: '0.4.0', electron: '0' },
      settings: { get: async (k) => stored[k], set: async (k, v) => { stored[k] = v; } },
      project: { open: vi.fn(async () => ({ ok: false as const, canceled: true as const })) },
    };
  };

  it('the code side has a main.py tab and the starter program in the editor', () => {
    render(<App api={api()} width={1440} />);
    fireEvent.click(screen.getByRole('button', { name: 'New Pico W project' }));
    const side = screen.getByRole('region', { name: 'Code' });
    expect(within(side).getByRole('tab', { name: 'main.py' })).toHaveAttribute('aria-selected', 'true');
    expect(within(side).getByRole('textbox', { name: 'main.py' }).textContent).toContain('led = Pin("LED", Pin.OUT)');
  });

  it('what is typed is kept in the project: it is still there after Learn and back', () => {
    render(<App api={api()} width={1440} />);
    fireEvent.click(screen.getByRole('button', { name: 'New micro:bit project' }));
    type(viewOf(screen.getByRole('textbox', { name: 'main.py' })), '# my change\n', 0);
    fireEvent.click(screen.getByRole('tab', { name: 'Learn' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Workspace' }));
    expect(screen.getByRole('textbox', { name: 'main.py' }).textContent).toMatch(/^# my change/);
  });

  it('keys typed in the editor never reach the canvas: Backspace there deletes text, not the selected part', () => {
    render(<App api={api()} width={1440} />);
    fireEvent.click(screen.getByRole('button', { name: 'New Pico W project' }));
    const panel = screen.getByRole('region', { name: 'Parts' });
    fireEvent.mouseDown(within(panel).getByRole('button', { name: /^Resistor/ }), { clientX: 5, clientY: 5, button: 0 });
    const svg = screen.getByRole('application', { name: 'Circuit canvas' });
    const hole = svg.querySelector('[data-point="bb1.a5"]')!;
    const [vx, vy] = svg.getAttribute('viewBox')!.split(' ').map(Number) as [number, number];
    const at = { clientX: Number(hole.getAttribute('cx')) + 24 - vx, clientY: Number(hole.getAttribute('cy')) - vy, button: 0 };
    fireEvent.mouseMove(svg, at);
    fireEvent.mouseUp(svg, at);
    expect(svg.querySelectorAll('[data-part]')).toHaveLength(1);   // placed, and selected
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'main.py' }), { key: 'Backspace' });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'main.py' }), { key: 'Delete' });
    expect(svg.querySelectorAll('[data-part]')).toHaveLength(1);
  });
});
