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

describe('M12 slice 4: Libraries (screen 31d)', () => {
  const openLibraries = async () => {
    newFile();
    fireEvent.click(screen.getByRole('button', { name: 'Libraries' }));
    return screen.findByRole('dialog', { name: 'Libraries for Python 3' });
  };

  it('installed in MicroLab\'s folder, counted in the status bar; none yet: where they would go', async () => {
    setup(fakeApi({}, {}, { installed: [{ name: 'art', version: '6.5', summary: 'ASCII Art Library For Python' }] }));
    newFile();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 library installed'));
    fireEvent.click(screen.getByRole('button', { name: 'Libraries' }));
    const d = await screen.findByRole('dialog', { name: 'Libraries for Python 3' });
    expect(await within(d).findByRole('list', { name: 'Installed in MicroLab' })).toHaveTextContent('art6.5ASCII Art Library For Python');
  });

  it('a library looked up by its name — Connected to PyPI — installed, with what pip says; then Installed, and listed', async () => {
    const s = setup();
    const d = await openLibraries();
    expect(within(d).getByText(/None yet/)).toBeInTheDocument();
    fireEvent.change(within(d).getByRole('textbox', { name: "A library's name on PyPI" }), { target: { value: 'requests' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Look up on PyPI' }));
    const found = await within(d).findByRole('group', { name: 'requests on PyPI' });
    expect(found).toHaveTextContent('requests2.32.5Python HTTP for Humans.');
    expect(within(d).getByText(/Connected to PyPI/)).toBeInTheDocument();
    fireEvent.click(within(found).getByRole('button', { name: /Install/ }));
    await waitFor(() => expect(s.api.python3.libs.install).toHaveBeenCalledWith('requests'));
    expect(await within(d).findByRole('log', { name: 'What pip says' })).toHaveTextContent('Successfully installed requests-2.32.5');
    await waitFor(() => expect(within(found).getByRole('button', { name: /Installed/ })).toBeDisabled());
    expect(within(d).getByRole('list', { name: 'Installed in MicroLab' })).toHaveTextContent('requests');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 library installed'));
  });

  it('often used in class: a click looks it up', async () => {
    const s = setup();
    const d = await openLibraries();
    fireEvent.click(within(d).getByRole('button', { name: 'pygame' }));
    await waitFor(() => expect(s.api.python3.libs.lookUp).toHaveBeenCalledWith('pygame'));
  });

  it('no internet: said plainly; not on PyPI: said; Remove takes one away', async () => {
    const api = fakeApi({}, {}, {
      installed: [{ name: 'numpy', version: '2.3.4', summary: 'Fundamental package for array computing in Python' }],
      libs: { lookUp: vi.fn(async (n: string) => (n === 'numpy'
        ? { ok: false as const, offline: true as const, message: "PyPI can't be reached: this computer seems to have no internet. A .whl file from your teacher installs without it." }
        : { ok: false as const, message: `There is no library called “${n}” on PyPI. Check its spelling.` })) },
    });
    setup(api);
    const d = await openLibraries();
    fireEvent.click(within(d).getByRole('button', { name: 'numpy' }));
    expect(await within(d).findByRole('alert')).toHaveTextContent("PyPI can't be reached");
    expect(d.querySelector('.net')).toHaveTextContent('No internet');
    fireEvent.click(within(d).getByRole('button', { name: 'Remove numpy' }));
    await waitFor(() => expect(api.python3.libs.remove).toHaveBeenCalledWith('numpy'));
    expect(await within(d).findByText(/None yet/)).toBeInTheDocument();
  });
});

describe('M12 slice 5 (F-94, F-96): what an error means; the Plotter', () => {
  it('an error explained after CPython\'s traceback (screen 05\'s way); Go to line puts the editor on it, marked', () => {
    const s = setup();
    newFile();
    s.type('untitled.py', 'age = 12\nprint("Age: " + age)\n');
    fireEvent.click(screen.getByRole('button', { name: /Run untitled\.py/ }));
    s.say({ err: 'Traceback (most recent call last):\n  File "untitled.py", line 2, in <module>\nTypeError: can only concatenate str (not "int") to str\n' },
      { ended: 'error', error: { type: 'TypeError', message: 'can only concatenate str (not "int") to str', file: 'untitled.py', line: 2 } }, { prompt: '>>> ' });
    const card = within(s.shell()).getByRole('note', { name: 'What the TypeError means' });
    expect(card).toHaveTextContent("What this means: + on line 2 can't join text (a str) and a whole number (an int). Make the number text with str(…)");
    expect(s.shell().textContent!.indexOf('What this means')).toBeGreaterThan(s.shell().textContent!.indexOf('TypeError: can only'));
    expect(s.shell().textContent!.indexOf('Its names are still here')).toBeGreaterThan(s.shell().textContent!.indexOf('What this means'));
    expect(document.querySelector('.cm-error-line')).toHaveTextContent('print("Age: " + age)');
    fireEvent.click(within(card).getByRole('button', { name: 'Go to line 2' }));
    expect(EditorView.findFromDOM(s.editor('untitled.py').closest('.cm-editor') as HTMLElement)!.state.selection.main.head).toBe(9);
  });

  it('an error at >>> is explained with the line typed; no card for an error it doesn\'t know', () => {
    const s = setup();
    newFile();
    s.type('untitled.py', 'secret = 7\n');
    fireEvent.click(screen.getByRole('button', { name: /Run untitled\.py/ }));
    s.say({ ended: 'done' }, { prompt: '>>> ' });
    fireEvent.change(s.prompt(), { target: { value: 'print(secrt)' } });
    fireEvent.keyDown(s.prompt(), { key: 'Enter' });
    s.say({ err: "NameError: name 'secrt' is not defined. Did you mean: 'secret'?\n" },
      { replError: { type: 'NameError', message: "name 'secrt' is not defined. Did you mean: 'secret'?", file: '<stdin>', line: 1 } }, { prompt: '>>> ' });
    const card = within(s.shell()).getByRole('note', { name: 'What the NameError means' });
    expect(card).toHaveTextContent('Did you mean secret (made on line 1)?');
    expect(within(card).queryByRole('button')).toBeNull();
    s.say({ replError: { type: 'MyError', message: 'boom', file: '<stdin>', line: 1 } });
    expect(within(s.shell()).getAllByRole('note')).toHaveLength(1);
  });

  it('the Plotter draws the numbers the program prints, each line named from its print()', () => {
    const s = setup();
    newFile();
    s.type('untitled.py', 'import random\nfor i in range(3):\n    t = random.random()\n    print(i, t)\n');
    fireEvent.click(screen.getByRole('button', { name: /Run untitled\.py/ }));
    s.say({ out: '0 0.5\n1 0.25\n' }, { out: '2 0.75\n' });
    fireEvent.click(screen.getByRole('tab', { name: /Plotter/ }));
    const p = screen.getByRole('region', { name: 'Plotter' });
    expect([...p.querySelectorAll('.legend .key')].map((k) => k.textContent)).toEqual(['i', 't']);
    expect(p.querySelector('polyline[data-series="1"]')!.getAttribute('points')!.split(' ')).toHaveLength(3);
  });
});
