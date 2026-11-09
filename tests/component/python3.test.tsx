import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/app/App';
import type { PyEvent } from '../../src/renderer/app/api';
import { fakeApi, type FakeApi } from './fake-api';

/** M12 slice 2 (F-90–F-92, screens 31, 31b): the Start page's Python 3 card, the Python 3 screen — .py tabs, Run
 *  (F5), the shell with input() and >>>, Stop, Save and Open. The session is a fake: the test says what it tells. */
function setup(api: FakeApi = fakeApi()) {
  render(<App api={api} width={1440} />);
  const say = (...events: PyEvent[]) => act(() => { for (const e of events) api.emitPy(e); });
  const shell = () => screen.getByRole('log', { name: 'Shell' });
  const editor = (name: string) => screen.getByRole('textbox', { name });
  const type = (name: string, code: string) => {
    const view = EditorView.findFromDOM(editor(name).closest('.cm-editor') as HTMLElement)!;
    act(() => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } }));
  };
  const prompt = () => within(shell().closest('.console') as HTMLElement).getByRole('textbox');
  return { api, say, shell, editor, type, prompt };
}

const newFile = () => fireEvent.click(screen.getByRole('button', { name: 'New Python file' }));

describe('M12 the Start page (screen 31)', () => {
  it('the Python 3 card is first in the row, before the micro:bit; no Learn card, no tip', () => {
    setup();
    const cards = screen.getAllByRole('button', { name: /^New (Python file|.* project)$/ }).map((b) => b.textContent!.trim());
    expect(cards).toEqual(['New Python file', 'New micro:bit project', 'New Pico W project', 'New ESP32 project']);
    expect(screen.getByRole('heading', { name: 'Start something new' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open Learn' })).toBeNull();
    expect(screen.queryByText('Tip')).toBeNull();
    expect(within(screen.getByRole('tablist', { name: 'Mode' })).getAllByRole('tab').map((t) => t.textContent!.trim())).toEqual(['Workspace', 'Python 3', 'Learn']);
  });

  it('a recent .py file is in Recent, marked Python 3; it opens in the Python 3 screen', async () => {
    const api = fakeApi({}, { recent: [{ path: '/Users/s/Documents/Python/guess.py', name: 'guess', board: 'python3', at: Date.now(), where: 'Documents/Python/guess.py', missing: false }] },
      { pyfile: { openPath: vi.fn(async (path: string) => ({ ok: true as const, path, name: 'guess', text: 'print("guess")\n' })) } });
    setup(api);
    const item = await screen.findByRole('button', { name: /guess\.py/ });
    expect(item).toHaveTextContent('Python 3');
    fireEvent.click(item);
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Python 3' })).toHaveAttribute('aria-selected', 'true'));
    expect(screen.getByRole('textbox', { name: 'guess.py' })).toHaveTextContent('print("guess")');
    expect(screen.getByRole('group', { name: 'Python file' })).toHaveTextContent('guess.py');
  });

  it('Open… takes a .py file as well as a project', async () => {
    const api = fakeApi({}, {}, { file: { open: vi.fn(async () => ({ kind: 'py' as const, ok: true as const, path: '/d/spiral.py', name: 'spiral', text: 'import turtle\n' })) } });
    setup(api);
    fireEvent.click(screen.getByRole('button', { name: 'Open…' }));
    expect(await screen.findByRole('textbox', { name: 'spiral.py' })).toHaveTextContent('import turtle');
  });
});

describe('M12 the Python 3 screen (screen 31b)', () => {
  it('New Python file: a tab untitled.py with print("Hello!"); Run untitled.py (F5) in the top bar', () => {
    const s = setup();
    newFile();
    expect(screen.getByRole('tab', { name: 'Python 3' })).toHaveAttribute('aria-selected', 'true');
    expect(s.editor('untitled.py')).toHaveTextContent('print("Hello!")');
    expect(screen.getByRole('button', { name: /Run untitled\.py/ })).toHaveTextContent('F5');
    expect(screen.getByRole('group', { name: 'Python file' })).toHaveTextContent('untitled.pynot saved yet');
    expect(s.shell()).toHaveTextContent('Press Run (F5) to run untitled.py.');
  });

  it('Run sends the editor\'s text; what it prints comes in the shell; at its end, >>> in its names', () => {
    const s = setup();
    newFile();
    s.type('untitled.py', 'x = 41\nprint("Hello!")\n');
    fireEvent.click(screen.getByRole('button', { name: /Run untitled\.py/ }));
    expect(s.api.python3.run).toHaveBeenCalledWith('x = 41\nprint("Hello!")\n', 'untitled.py');
    expect(screen.getByRole('status')).toHaveTextContent('Running untitled.py');
    s.say({ out: 'Hello!' }, { out: '\n' }, { ended: 'done' }, { prompt: '>>> ' });
    expect(s.shell()).toHaveTextContent('Running untitled.py in Documents/Python');
    expect(s.shell()).toHaveTextContent('Hello!');
    expect(s.shell()).toHaveTextContent('untitled.py ended. Its names are still here: type Python and press Enter.');
    fireEvent.change(s.prompt(), { target: { value: 'x + 1' } });
    fireEvent.keyDown(s.prompt(), { key: 'Enter' });
    expect(s.api.python3.line).toHaveBeenCalledWith('x + 1');
    s.say({ out: '42' }, { out: '\n' }, { prompt: '>>> ' });
    expect(s.shell()).toHaveTextContent('>>> x + 1 42');
  });

  it('input(): its prompt is the shell\'s last line; the answer goes to the program', () => {
    const s = setup();
    newFile();
    fireEvent.keyDown(window, { key: 'F5' });
    expect(s.api.python3.run).toHaveBeenCalledTimes(1);
    s.say({ out: 'Name? ' }, { input: true });
    expect(s.prompt().closest('.prompt')).toHaveTextContent('Name?');
    fireEvent.change(s.prompt(), { target: { value: 'Sok' } });
    fireEvent.keyDown(s.prompt(), { key: 'Enter' });
    expect(s.api.python3.line).toHaveBeenCalledWith('Sok');
  });

  it('Stop ends the program; an error says where, in the status bar', () => {
    const s = setup();
    newFile();
    fireEvent.click(screen.getByRole('button', { name: /Run untitled\.py/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(s.api.python3.stop).toHaveBeenCalled();
    s.say({ ended: 'stopped' }, { exit: null });
    expect(s.shell()).toHaveTextContent('Stopped.');
    expect(s.shell()).not.toHaveTextContent('Its names are still here');
    fireEvent.click(screen.getByRole('button', { name: /Run untitled\.py/ }));
    s.say({ err: 'Traceback (most recent call last):\n  File "untitled.py", line 1, in <module>\nNameError: name \'pritn\' is not defined\n' },
      { ended: 'error', error: { type: 'NameError', message: "name 'pritn' is not defined", file: 'untitled.py', line: 1 } }, { prompt: '>>> ' });
    expect(s.shell().querySelector('.err')).toHaveTextContent("NameError: name 'pritn' is not defined");
  });

  it('M12 slice 3 (screen 31c): a turtle or tkinter window opens beside MicroLab — the shell says so, once', () => {
    const s = setup();
    newFile();
    fireEvent.click(screen.getByRole('button', { name: /Run untitled\.py/ }));
    s.say({ window: true }, { window: true });
    expect(s.shell()).toHaveTextContent('A window from untitled.py is open beside MicroLab. Close it, or press Stop, to end the program.');
    expect(s.shell().textContent!.match(/A window from/g)).toHaveLength(1);
  });

  it('⌘S saves (asking where for a new file); an edit shows the dot; the file\'s name comes back from Save', async () => {
    const s = setup();
    newFile();
    s.type('untitled.py', 'print(1)\n');
    expect(screen.getByRole('tab', { name: /untitled\.py/ }).querySelector('.dirty')).not.toBeNull();
    fireEvent.keyDown(window, { key: 's', metaKey: true });
    await waitFor(() => expect(s.api.pyfile.save).toHaveBeenCalledWith('print(1)\n', { name: 'untitled' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: /untitled\.py/ }).querySelector('.dirty')).toBeNull());
    expect(screen.getByRole('group', { name: 'Python file' })).toHaveTextContent('Python · saved');
  });

  it('a second file in its own tab; closing one with changes asks first', async () => {
    const s = setup();
    newFile();
    fireEvent.click(screen.getByRole('button', { name: 'New Python file' }));   // the + in the tabs
    expect(s.editor('untitled 2.py')).toBeInTheDocument();
    s.type('untitled 2.py', 'changed\n');
    fireEvent.click(screen.getByRole('button', { name: 'Close untitled 2.py' }));
    expect(screen.getByRole('alertdialog', { name: /Save your changes to “untitled 2\.py”/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: "Don't save" }));
    expect(screen.queryByRole('tab', { name: /untitled 2\.py/ })).toBeNull();
    expect(s.editor('untitled.py')).toBeInTheDocument();
  });
});
