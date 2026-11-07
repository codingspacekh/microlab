import { EditorView } from '@codemirror/view';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectDoc } from '@lib/project';
import { App } from '../../src/renderer/app/App';
import type { StartRun } from '../../src/renderer/app/useRun';
import type { RunEvents } from '../../src/renderer/sim-client';
import { fakeApi } from './fake-api';

/** M5.6 F-21 the project's files (tabs, the files panel, the micro:bit's flat list and space); F-22 / Q19 Run runs
 *  the open file. The simulation is a fake: the test sees which file each run starts. */
function setup(board = 'New Pico W project') {
  const runs: { doc: ProjectDoc; entry: string; events: RunEvents }[] = [];
  const start: StartRun = (req, events) => { runs.push({ ...req, events }); return { stop: vi.fn(), setInput: vi.fn() }; };
  const end = () => act(() => runs.at(-1)!.events.onEnd({ output: '', trace: [], pwm: [], analog: [], display: [], sound: [], bus: [], parts: [], faults: [], ended: 'done' } as never));
  render(<App api={fakeApi()} width={1440} startRun={start} />);
  fireEvent.click(screen.getByRole('button', { name: board }));
  const panel = () => screen.getByRole('complementary', { name: 'Project files' });
  const tabs = () => within(screen.getByRole('tablist', { name: 'Files' })).getAllByRole('tab').map((t) => t.getAttribute('title'));
  const editorFor = (name: string) => screen.queryByRole('textbox', { name });
  /** + New file, a name, Enter. */
  const newFile = (name: string) => {
    fireEvent.click(screen.getByRole('button', { name: 'Add a new file' }));
    const field = within(panel()).getByRole('textbox', { name: 'New file' });
    fireEvent.change(field, { target: { value: name } });
    fireEvent.keyDown(field, { key: 'Enter' });
  };
  return { runs, end, panel, tabs, editorFor, newFile };
}

describe('M5.6 F-21 the project\'s files', () => {
  it('+ makes a file, opens it in a tab and in the editor; a library goes in lib/', () => {
    const s = setup();
    s.newFile('led_test.py');
    expect(s.tabs()).toEqual(['main.py', 'led_test.py']);
    expect(s.editorFor('led_test.py')).not.toBeNull();
    s.newFile('lib/helper.py');
    expect(s.tabs()).toEqual(['main.py', 'led_test.py', 'lib/helper.py']);
    expect(within(screen.getByRole('tablist', { name: 'Files' })).getByRole('tab', { name: /helper\.py library/ })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Project files' })).toBeNull();   // + closes it once the file is made
    fireEvent.click(screen.getByRole('button', { name: 'Project files' }));
    expect(within(s.panel()).getByRole('treeitem', { name: 'lib' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('a name already used, or not allowed, is refused with the reason; nothing is made', () => {
    const s = setup();
    s.newFile('main.py');
    expect(within(s.panel()).getByText('There is already a file called main.py.')).toBeInTheDocument();
    expect(s.tabs()).toEqual(['main.py']);
  });

  it('on the micro:bit a folder is refused with a message: its files sit next to main.py', () => {
    const s = setup('New micro:bit project');
    s.newFile('lib/ssd1306.py');
    expect(within(s.panel()).getByText('The micro:bit has no folders: its files sit next to main.py. Call it ssd1306.py.')).toBeInTheDocument();
    expect(s.tabs()).toEqual(['main.py']);
    expect(within(s.panel()).getByText(/KB of about 20 KB/)).toBeInTheDocument();
  });

  it('a file renamed: its tab follows; deleted: its tab closes and main.py is shown', () => {
    const s = setup();
    s.newFile('a.py');
    fireEvent.click(screen.getByRole('button', { name: 'Project files' }));
    const tree = within(s.panel()).getByRole('tree');
    fireEvent.click(within(tree).getByRole('treeitem', { name: 'a.py' }));
    fireEvent.click(within(s.panel()).getByRole('button', { name: 'Rename' }));
    const field = within(s.panel()).getByRole('textbox', { name: 'Rename a.py' });
    fireEvent.change(field, { target: { value: 'b.py' } });
    fireEvent.click(within(s.panel()).getByRole('button', { name: 'Rename it' }));
    expect(s.tabs()).toEqual(['main.py', 'b.py']);
    expect(s.editorFor('b.py')).not.toBeNull();
    fireEvent.click(within(s.panel()).getByRole('button', { name: /Delete/ }));
    expect(within(s.panel()).getByRole('group', { name: 'Delete b.py' })).toHaveTextContent("Delete b.py? This can't be undone.");
    fireEvent.click(within(within(s.panel()).getByRole('group', { name: 'Delete b.py' })).getByRole('button', { name: 'Delete' }));
    expect(s.tabs()).toEqual(['main.py']);
    expect(s.editorFor('main.py')).not.toBeNull();
  });

  it('a tab closed shows the one before it; a file opened from the panel with Enter gets a tab again', () => {
    const s = setup();
    s.newFile('a.py');
    fireEvent.click(screen.getByRole('button', { name: 'Close a.py' }));
    expect(s.tabs()).toEqual(['main.py']);
    expect(s.editorFor('main.py')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Project files' }));
    fireEvent.keyDown(within(s.panel()).getByRole('treeitem', { name: 'a.py' }), { key: 'Enter' });
    expect(s.tabs()).toEqual(['main.py', 'a.py']);
  });

  it('the micro:bit nearly full: a warning above the code', () => {
    const s = setup('New micro:bit project');
    s.newFile('big.txt');
    const ed = s.editorFor('big.txt')!;
    // type a big text through the editor's own document
    const view = EditorView.findFromDOM(ed.closest('.cm-editor') as HTMLElement)!;
    act(() => { view.dispatch({ changes: { from: 0, insert: 'x'.repeat(18 * 1024) }, userEvent: 'input.type' }); });
    expect(screen.getAllByRole('alert').map((a) => a.textContent).join(' ')).toMatch(/nearly full/);
  });
});

describe('M5.6 F-22 (Q19) Run runs the open file, as Thonny does', () => {
  it('with led_test.py open, Run says Run led_test.py and starts it', () => {
    const s = setup();
    s.newFile('led_test.py');
    fireEvent.click(screen.getByRole('button', { name: 'Run led_test.py' }));
    expect(s.runs.at(-1)!.entry).toBe('led_test.py');
    expect(s.runs.at(-1)!.doc.files['led_test.py']).toBe('');
  });

  it('Run main.py from its menu starts main.py', () => {
    const s = setup();
    s.newFile('led_test.py');
    fireEvent.click(screen.getByRole('button', { name: 'More ways to run' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Run main\.py/ }));
    expect(s.runs.at(-1)!.entry).toBe('main.py');
  });

  it('with index.html open, Run runs the last Python file run — or main.py', () => {
    const s = setup();
    s.newFile('www/index.html');
    expect(screen.getByRole('button', { name: 'Run main.py' })).toBeInTheDocument();
    s.newFile('led_test.py');
    fireEvent.click(screen.getByRole('button', { name: 'Run led_test.py' }));
    s.end();
    fireEvent.click(screen.getByRole('tab', { name: /index\.html/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Run led_test.py' }));
    expect(s.runs.map((r) => r.entry)).toEqual(['led_test.py', 'led_test.py']);
  });
});
