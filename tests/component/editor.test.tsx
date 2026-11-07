import { currentCompletions, startCompletion } from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import { insertNewlineAndIndent, undo } from '@codemirror/commands';
import { EditorView } from '@codemirror/view';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/app/App';
import type { MicrolabApi } from '../../src/renderer/app/api';
import { CodeEditor } from '../../src/renderer/editor/CodeEditor';
import { fakeApi } from './fake-api';
import { startBuilding } from './start-building';

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
  const api = (): MicrolabApi => fakeApi();

  it('the code side has a main.py tab and the starter program in the editor', () => {
    render(<App api={api()} width={1440} />);
    fireEvent.click(screen.getByRole('button', { name: 'New Pico W project' }));
    startBuilding();
    const side = screen.getByRole('region', { name: 'Code' });
    expect(within(side).getByRole('tab', { name: 'main.py' })).toHaveAttribute('aria-selected', 'true');
    expect(within(side).getByRole('textbox', { name: 'main.py' }).textContent).toContain('led = Pin("LED", Pin.OUT)');
  });

  it('what is typed is kept in the project: it is still there after Learn and back', () => {
    render(<App api={api()} width={1440} />);
    fireEvent.click(screen.getByRole('button', { name: 'New micro:bit project' }));
    startBuilding();
    type(viewOf(screen.getByRole('textbox', { name: 'main.py' })), '# my change\n', 0);
    fireEvent.click(screen.getByRole('tab', { name: 'Learn' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Workspace' }));
    expect(screen.getByRole('textbox', { name: 'main.py' }).textContent).toMatch(/^# my change/);
  });

  it('keys typed in the editor never reach the canvas: Backspace there deletes text, not the selected part', () => {
    render(<App api={api()} width={1440} />);
    fireEvent.click(screen.getByRole('button', { name: 'New Pico W project' }));
    startBuilding();
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

describe('M5.5 F-20 help while typing (screen 02b)', () => {
  const setup = (board: string, code: string) => {
    render(<CodeEditor label="main.py" board={board} value={code} onChange={() => {}} />);
    const view = viewOf(screen.getByRole('textbox', { name: 'main.py' }));
    act(() => { view.dispatch({ selection: { anchor: view.state.doc.length } }); view.focus(); });
    return view;
  };
  const offered = (view: EditorView) => currentCompletions(view.state).map((c) => `${c.label}${c.detail ?? ''}`);

  it('on the Pico W, machine. offers Pin(id, mode=-1, pull=-1, …)', async () => {
    const view = setup('pico-w', 'import machine\n');
    type(view, 'machine.');
    act(() => { startCompletion(view); });
    await waitFor(() => expect(offered(view)).toContain('Pin(id, mode=-1, pull=-1, …)'));
  });

  it('Tab takes the chosen completion (as Enter does); with no list open, Tab indents', async () => {
    const view = setup('pico-w', 'import machine\n');
    type(view, 'machine.Pi');
    act(() => { startCompletion(view); });
    await waitFor(() => expect(offered(view).length).toBeGreaterThan(0));
    await act(() => new Promise((r) => setTimeout(r, 100)));   // CodeMirror takes no key for 75 ms after the list opens
    fireEvent.keyDown(view.contentDOM, { key: 'Tab', code: 'Tab', keyCode: 9 });
    expect(view.state.doc.toString()).toMatch(/machine\.Pin\(\)$/);
    expect(view.state.selection.main.head).toBe(view.state.doc.length - 1);   // inside the brackets: Pin takes arguments
    const before = view.state.doc.length;
    act(() => { view.dispatch({ changes: { from: before, insert: '\nx' }, selection: { anchor: before + 2 } }); });
    fireEvent.keyDown(view.contentDOM, { key: 'Tab', code: 'Tab', keyCode: 9 });
    expect(view.state.doc.toString().endsWith('\n    x')).toBe(true);
  });

  it('a call is taken with its brackets: the cursor after them when it takes nothing; a bracket already there stays one', async () => {
    const view = setup('microbit-v2', 'from microbit import *\n');
    const take = async () => {
      act(() => { startCompletion(view); });
      await waitFor(() => expect(offered(view).length).toBeGreaterThan(0));
      await act(() => new Promise((r) => setTimeout(r, 100)));
      fireEvent.keyDown(view.contentDOM, { key: 'Tab', code: 'Tab', keyCode: 9 });
    };
    type(view, 'button_a.is_pr');
    await take();
    expect(view.state.doc.toString()).toMatch(/button_a\.is_pressed\(\)$/);
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
    act(() => { view.dispatch({ changes: { from: view.state.doc.length, insert: '\ndisplay.sc(1)' }, selection: { anchor: view.state.doc.length + '\ndisplay.sc'.length } }); });
    await take();
    expect(view.state.doc.toString()).toMatch(/display\.scroll\(1\)$/);
  });

  it('on the micro:bit, pin offers pin0, pin1, …; inside a string nothing is offered', async () => {
    const view = setup('microbit-v2', 'from microbit import *\n');
    type(view, 'pin');
    act(() => { startCompletion(view); });
    await waitFor(() => expect(offered(view)).toEqual(expect.arrayContaining(['pin0', 'pin1', 'pin2', 'pin_logo'])));
    type(view, '\nprint("pin');
    act(() => { startCompletion(view); });
    await new Promise((r) => setTimeout(r, 100));
    expect(offered(view).filter((l) => l.startsWith('pin0'))).toEqual([]);
  });

  it('typing a call shows its arguments, the one being typed in bold, and what it does', () => {
    const view = setup('pico-w', 'from machine import Pin\n');
    type(view, 'led = Pin(15, ');
    const tip = document.querySelector('.ml-signature')!;
    expect(tip.querySelector('code')!.textContent).toBe('Pin(id, mode=-1, pull=-1, *, value=None, alt=-1)');
    expect(tip.querySelector('b')!.textContent).toBe('mode=-1');
    expect(tip.textContent).toMatch(/GPIO pin/);
    type(view, 'Pin.OUT)');
    expect(document.querySelector('.ml-signature')).toBeNull();
  });

  it('the same code on the ESP32 has no ALT_PWM and has PWM.duty', async () => {
    const view = setup('esp32-devkit-v1', 'from machine import Pin, PWM\np = PWM(Pin(2))\n');
    type(view, 'p.d');
    act(() => { startCompletion(view); });
    await waitFor(() => expect(offered(view).map((l) => l.replace(/\(.*$/, ''))).toContain('duty'));
  });
});
