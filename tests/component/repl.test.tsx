import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EditorView } from '@codemirror/view';
import type { ProjectDoc } from '@lib/project';
import { App } from '../../src/renderer/app/App';
import type { StartRun } from '../../src/renderer/app/useRun';
import type { RunEvents } from '../../src/renderer/sim-client';
import { fakeApi } from './fake-api';
import { partsPanel, startBuilding } from './start-building';
import { legsCentre } from '@lib/editor';

/** M9 slice 1 (screens 05, 29c): an error explained beside MicroPython's message, its line marked and Go to line;
 *  input() answered in the console; the REPL after the program. The worker is a fake: the test says what it says. */
function fakeSim() {
  const runs: { doc: ProjectDoc; entry: string; events: RunEvents; stop: ReturnType<typeof vi.fn>; type: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }[] = [];
  const start: StartRun = (req, events) => {
    const r = { ...req, events, stop: vi.fn(), type: vi.fn(), close: vi.fn() };
    runs.push(r);
    return { stop: r.stop, setInput: vi.fn(), type: r.type, close: r.close };
  };
  const say = (f: (e: RunEvents) => void) => act(() => f(runs.at(-1)!.events));
  const end = (ended: string, extra: object = {}) => say((e) => e.onEnd({ output: '', trace: [], pwm: [], analog: [], display: [], sound: [], bus: [], parts: [], faults: [], radio: [], ended, ...extra } as never));
  return { start, runs, say, end };
}

const CODE = 'from machine import Pin\nimport time\n\nled = Pin(15, Pin.OUT)\npin.on()\n';

function setup() {
  const sim = fakeSim();
  render(<App api={fakeApi()} width={1440} startRun={sim.start} />);
  fireEvent.click(screen.getByRole('button', { name: 'New Pico W project' }));
  startBuilding();
  const editor = () => screen.getByRole('textbox', { name: 'main.py' });
  const log = () => screen.getByRole('log', { name: 'Console' });
  const run = (code = CODE) => {
    setCode(code);
    fireEvent.click(screen.getByRole('button', { name: 'Run main.py' }));
  };
  return { sim, log, run, editor };
}

/** Puts the code in main.py as the student would — through CodeMirror. */
function setCode(code: string) {
  const view = EditorView.findFromDOM(screen.getByRole('textbox', { name: 'main.py' }).closest('.cm-editor') as HTMLElement)!;
  act(() => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } }));
}

/** An LED dragged from the parts panel onto the breadboard: the circuit changes. */
function placeLed() {
  const svg = screen.getByRole('application', { name: 'Circuit canvas' });
  const [vx, vy] = svg.getAttribute('viewBox')!.split(' ').map(Number) as [number, number];
  const c = svg.querySelector('[data-point="bb1.a10"]')!;
  const [cx, cy] = legsCentre('led');
  const at = { clientX: Number(c.getAttribute('cx')) + cx - vx, clientY: Number(c.getAttribute('cy')) + cy - vy, button: 0 };
  fireEvent.mouseDown(within(partsPanel()).getByRole('button', { name: /^LED/ }), { clientX: 5, clientY: 5, button: 0 });
  fireEvent.mouseMove(svg, at);
  fireEvent.mouseUp(svg, at);
}

const prompt = () => screen.getByRole('textbox', { name: /Python for the simulated board|input\(\) reads it/ });

describe('M9 an error explained (screen 05)', () => {
  it('beside the traceback: what it means, Go to line 5 — and the line marked in the editor, a note on the canvas', () => {
    const s = setup();
    s.run();
    s.sim.say((e) => e.onOutput('Traceback (most recent call last):\n  File "main.py", line 5, in <module>\nNameError: name \'pin\' isn\'t defined\n'));
    s.sim.end('error', { error: { type: 'NameError', message: "name 'pin' isn't defined", file: 'main.py', line: 5 } });
    const why = within(s.log()).getByRole('note', { name: 'What the NameError means' });
    expect(why).toHaveTextContent("What this means: Python doesn't know the name pin on line 5. Names are case-sensitive — line 1 brings in Pin, with a capital P.");
    expect(why.querySelectorAll('code')).toHaveLength(2);
    // the line in the editor: highlighted, its code underlined
    const marked = document.querySelector('.cm-error-line');
    expect(marked).toHaveTextContent('pin.on()');
    expect(marked!.querySelector('.cm-error-code')).toHaveTextContent('pin.on()');
    // the canvas
    const note = document.querySelector('.cbanner.error')!;
    expect(note).toHaveTextContent('The program stopped: an error in main.py, line 5. The circuit is fine.');
    fireEvent.click(within(why).getByRole('button', { name: 'Go to line 5' }));
    expect(document.querySelector('.cm-activeLine')).toHaveTextContent('pin.on()');
    fireEvent.click(within(note as HTMLElement).getByRole('button', { name: 'Close the note' }));
    expect(document.querySelector('.cbanner.error')).toBeNull();
  });

  it('a fault in the run too: the note doesn\'t say the circuit is fine', () => {
    const s = setup();
    s.run();
    s.sim.end('error', { error: { type: 'ZeroDivisionError', message: 'divide by zero', file: 'main.py', line: 2 }, faults: [{ kind: 'floating', severity: 'warning', message: 'x' }] });
    expect(document.querySelector('.cbanner.error')).toHaveTextContent('an error in main.py, line 2.');
    expect(document.querySelector('.cbanner.error')).not.toHaveTextContent('The circuit is fine');
  });
});

describe('M9 typing to the simulated board (screen 29c)', () => {
  it('input(): its prompt is where to type; Enter sends the line; the echo shows as typed', () => {
    const s = setup();
    s.run('name = input("What\'s your name? ")\n');
    s.sim.say((e) => e.onOutput("What's your name? "));
    const row = prompt().closest('.prompt')!;
    expect(row).toHaveTextContent("What's your name?");
    expect(s.log()).not.toHaveTextContent("What's your name?");
    fireEvent.change(prompt(), { target: { value: 'Sok' } });
    fireEvent.keyDown(prompt(), { key: 'Enter' });
    expect(s.sim.runs[0]!.type).toHaveBeenCalledWith('Sok\n');
    s.sim.say((e) => e.onOutput('Sok\n', true));
    s.sim.say((e) => e.onOutput('Hello, Sok!\n'));
    expect(s.log().querySelector('.me')).toHaveTextContent("What's your name? Sok");
    expect(s.log()).toHaveTextContent("What's your name? Sok Hello, Sok!");
  });

  it('after the program: the note, >>> and a line for it; ↑ brings back what was typed; Ctrl+C is sent', () => {
    const s = setup();
    s.run();
    s.sim.end('done', { repl: true });
    expect(s.log()).toHaveTextContent('main.py ended. Its names are still here: type Python and press Enter.');
    s.sim.say((e) => e.onOutput('>>> '));
    expect(prompt().closest('.prompt')!.querySelector('b')).toHaveTextContent('>>>');
    fireEvent.change(prompt(), { target: { value: 'led.on()' } });
    fireEvent.keyDown(prompt(), { key: 'Enter' });
    expect(s.sim.runs[0]!.type).toHaveBeenCalledWith('led.on()\n');
    s.sim.say((e) => e.onOutput('led.on()\n', true));
    s.sim.say((e) => e.onOutput('>>> '));
    expect(s.log().querySelector('.me')).toHaveTextContent('>>> led.on()');
    fireEvent.keyDown(prompt(), { key: 'ArrowUp' });
    expect(prompt()).toHaveValue('led.on()');
    fireEvent.keyDown(prompt(), { key: 'ArrowDown' });
    expect(prompt()).toHaveValue('');
    fireEvent.keyDown(prompt(), { key: 'c', ctrlKey: true });
    expect(s.sim.runs[0]!.type).toHaveBeenCalledWith('\x03');
  });

  it('a block: after "for …:" the ... line starts indented', () => {
    const s = setup();
    s.run();
    s.sim.end('done', { repl: true });
    s.sim.say((e) => e.onOutput('>>> '));
    fireEvent.change(prompt(), { target: { value: 'for i in range(3):' } });
    fireEvent.keyDown(prompt(), { key: 'Enter' });
    s.sim.say((e) => e.onOutput('for i in range(3):\n', true));
    s.sim.say((e) => e.onOutput('... '));
    expect(prompt()).toHaveValue('    ');
    expect(prompt().closest('.prompt')!.querySelector('b')).toHaveTextContent('...');
  });

  it('Tab completes a name as the editor does: led. after main.py made led = Pin(…)', () => {
    const s = setup();
    s.run();
    s.sim.end('done', { repl: true });
    s.sim.say((e) => e.onOutput('>>> '));
    fireEvent.change(prompt(), { target: { value: 'led.tog' } });
    (prompt() as HTMLInputElement).setSelectionRange(7, 7);
    fireEvent.keyDown(prompt(), { key: 'Tab' });
    expect(prompt()).toHaveValue('led.toggle');
  });

  it('an error at the REPL is explained too (no line to go to: it was typed)', () => {
    const s = setup();
    s.run();
    s.sim.end('done', { repl: true });
    s.sim.say((e) => e.onOutput('>>> '));
    fireEvent.change(prompt(), { target: { value: 'Led.on()' } });
    fireEvent.keyDown(prompt(), { key: 'Enter' });
    s.sim.say((e) => e.onReplError?.({ type: 'NameError', message: "name 'Led' isn't defined", file: '<stdin>', line: 1 }));
    const why = within(s.log()).getByRole('note', { name: 'What the NameError means' });
    expect(why).toHaveTextContent('`led`'.replace(/`/g, ''));
    expect(within(why).queryByRole('button')).toBeNull();
  });

  it('Stop at the REPL switches the board off; Run starts afresh, ending the REPL', () => {
    const s = setup();
    s.run();
    s.sim.end('done', { repl: true });
    fireEvent.click(screen.getByRole('button', { name: 'Run main.py' }));
    expect(s.sim.runs[0]!.close).toHaveBeenCalled();
    expect(s.sim.runs).toHaveLength(2);
  });

  it('a changed circuit ends the REPL, saying so', () => {
    const s = setup();
    s.run();
    s.sim.end('done', { repl: true });
    placeLed();
    expect(s.sim.runs[0]!.close).toHaveBeenCalled();
    expect(s.log()).toHaveTextContent('The circuit changed, so the REPL has ended');
  });
});
