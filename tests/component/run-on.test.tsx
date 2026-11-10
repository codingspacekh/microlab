import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { newProject, type ProjectDoc } from '@lib/project';
import { parseUname, type ConsoleKind, type SendResult } from '@lib/repl';
import type { Detection, FoundBoard } from '@lib/usb';
import { App } from '../../src/renderer/app/App';
import type { StartRun } from '../../src/renderer/app/useRun';
import type { RunEvents } from '../../src/renderer/sim-client';
import { fakeApi } from './fake-api';

/**
 * M11.8 F-125 (Rev 18, screens 37–37c) — the classroom trial's request: Run runs on the simulator, the real board, or
 * both, chosen in Run's ⌄ menu and kept; on the board without Send to board — the changed files first, never main.py.
 */
const PICO: FoundBoard = { id: 'e661', kind: 'pico', port: '/dev/cu.usbmodem14201', usb: '2e8a:0005' };
const W = parseUname("(sysname='rp2', nodename='rp2', release='1.29.0', version='v1.29.0 on 2026-08-24', machine='Raspberry Pi Pico W with RP2040')")!;
const ready: Detection = { boards: [PICO], drives: [], checks: { e661: { state: 'micropython', uname: W } } };
const none: Detection = { boards: [], drives: [] };

/** A Pico W project with a helper beside main.py, so there is something to copy. */
function lights(): ProjectDoc {
  const doc = newProject('pico-w');
  return { ...doc, files: { ...doc.files, 'main.py': 'import lights\nlights.go()\n', 'lights.py': 'def go():\n    print("go")\n' } };
}

async function setup(o: { start?: Detection; runOn?: string; send?: SendResult; doc?: ProjectDoc } = {}) {
  const api = fakeApi({}, {}, { file: { open: vi.fn(async () => ({ ok: true as const, kind: 'mlab' as const, doc: o.doc ?? lights(), name: 'Lights', path: '/s/Lights.mlab' })) } });
  if (o.runOn) await api.settings.set('run.on', o.runOn);
  (api.settings.set as ReturnType<typeof vi.fn>).mockClear();
  let push: (now: Detection) => void = () => {};
  let out: (id: string, chunks: { text: string; kind: ConsoleKind }[]) => void = () => {};
  let ended: () => void = () => {};
  api.boards.get = vi.fn(async () => o.start ?? ready);
  api.boards.onChange = vi.fn((h) => { push = (now) => h(now, { plugged: [], unplugged: [] }); return () => {}; });
  api.boards.console.onOutput = vi.fn((h) => { out = h; return () => {}; });
  api.boards.send = vi.fn(async (): Promise<SendResult> => o.send ?? { ok: true, board: 'Pico W', sent: [{ path: 'lights.py', size: 2150 }], same: [], kept: [] });
  // a file run on the board holds until its program ends (or is stopped): the test ends it
  api.boards.console.do = vi.fn((_id: string, a: { do: string }) => (a.do === 'run' ? new Promise<void>((r) => { ended = r; }) : Promise.resolve()));
  const runs: { entry: string; stop: ReturnType<typeof vi.fn>; events: RunEvents }[] = [];
  const startRun: StartRun = (req, events) => { const r = { entry: req.entry, stop: vi.fn(), events }; runs.push(r); return { stop: r.stop, setInput: vi.fn() }; };
  render(<App api={api} width={1440} startRun={startRun} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open…' }));
  await screen.findByRole('group', { name: 'Project' });
  await waitFor(() => expect(api.boards.get).toHaveBeenCalled());
  return {
    api, runs,
    change: (now: Detection) => act(() => push(now)),
    print: (text: string) => act(() => out('e661', [{ text, kind: 'out' }])),
    end: () => act(async () => { ended(); }),
    /** The simulator's run ends, as its worker says when stopped. */
    endSim: () => act(() => runs.at(-1)!.events.onEnd({ output: '', trace: [], pwm: [], analog: [], display: [], sound: [], bus: [], parts: [], faults: [], ended: 'stopped' } as never)),
  };
}

const runButton = () => screen.getByRole('button', { name: /^Run main\.py/ });
const openMenu = () => { fireEvent.click(screen.getByRole('button', { name: 'More ways to run' })); return screen.getByRole('menu', { name: 'More ways to run' }); };
const radio = (name: RegExp) => screen.getByRole('menuitemradio', { name });

describe('M11.8 Run on: the menu (screen 37)', () => {
  it('Run\'s ⌄ menu starts with Run on — the simulator chosen until changed; the board named', async () => {
    await setup();
    await waitFor(() => { openMenu(); expect(radio(/The real board · Pico W/)).not.toHaveAttribute('aria-disabled'); });
    expect(within(screen.getByRole('menu')).getByText('Run on')).toBeInTheDocument();
    expect(radio(/The simulator/)).toHaveAttribute('aria-checked', 'true');
    expect(radio(/The real board · Pico W/)).toHaveAttribute('aria-checked', 'false');
    expect(radio(/Both at once/)).toHaveAccessibleName(/The same program on the screen and on the Pico W, to compare/);
    expect(screen.getByRole('menuitem', { name: /Run main\.py/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitemcheckbox', { name: /Check before running/ })).toBeInTheDocument();
    // the simulator alone: the button as before
    expect(runButton()).toHaveTextContent(/^Run main\.py$/);
  });

  it('with no board plugged in: the board choices are greyed, and say what to plug in', async () => {
    await setup({ start: none });
    openMenu();
    expect(radio(/^The real board/)).toHaveAttribute('aria-disabled', 'true');
    expect(radio(/^The real board/)).toHaveAccessibleName(/Plug in a Pico W to run on it/);
    expect(radio(/Both at once/)).toHaveAttribute('aria-disabled', 'true');
  });

  it('a choice is kept in the settings, and the button says where Run runs', async () => {
    const s = await setup();
    await waitFor(() => { openMenu(); expect(radio(/Both at once/)).not.toHaveAttribute('aria-disabled'); });
    fireEvent.click(radio(/Both at once/));
    expect(s.api.settings.set).toHaveBeenCalledWith('run.on', 'both');
    expect(runButton()).toHaveTextContent('Run main.py · sim + Pico W');
    openMenu();
    fireEvent.click(radio(/The real board/));
    expect(s.api.settings.set).toHaveBeenCalledWith('run.on', 'board');
    expect(runButton()).toHaveTextContent('Run main.py · Pico W');
  });

  it('the kept choice comes back when MicroLab starts', async () => {
    await setup({ runOn: 'board' });
    await waitFor(() => expect(runButton()).toHaveTextContent('Run main.py · Pico W'));
  });

  it('the board chosen but not plugged in: the simulator runs, and the button says so', async () => {
    const s = await setup({ runOn: 'board', start: none });
    await waitFor(() => expect(runButton()).toHaveTextContent('Run main.py · sim — no board'));
    fireEvent.click(runButton());
    expect(s.runs).toHaveLength(1);
    expect(s.api.boards.console.do).not.toHaveBeenCalled();
  });
});

describe('M11.8 Run on the real board (screen 37c)', () => {
  it('no Send to board: the changed files go first — never main.py, nothing restarted — then the file from the editor runs there', async () => {
    const s = await setup({ runOn: 'board' });
    await waitFor(() => expect(runButton()).toHaveTextContent('· Pico W'));
    fireEvent.click(runButton());
    await waitFor(() => expect(s.api.boards.console.do).toHaveBeenCalledWith('e661', { do: 'run', name: 'main.py', code: 'import lights\nlights.go()\n' }));
    expect(s.api.boards.console.open).toHaveBeenCalledWith('e661');
    const sent = (s.api.boards.send as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(sent[0]).toBe('e661');
    expect(Object.keys(sent[1] as object)).toEqual(['lights.py']);
    expect(sent[2]).toEqual({ run: false, keep: false });
    expect(s.runs).toHaveLength(0);     // the picture stays still
    const log = screen.getByRole('log', { name: 'Console of the Pico W' });
    expect(log).toHaveTextContent('✓ Copied to the Pico W: lights.py (2.1 KB). Its main.py was left as it was.');
    expect(log).toHaveTextContent("Running main.py from the editor on the board. Its own main.py, the one it starts by itself, is unchanged.");
  });

  it('while it runs: the top bar shows it running; F5 starts nothing more; Stop (Shift+F5) stops the board; its end ends it', async () => {
    const s = await setup({ runOn: 'board' });
    await waitFor(() => expect(runButton()).toHaveTextContent('· Pico W'));
    fireEvent.click(runButton());
    expect(await screen.findByRole('timer', { name: 'Running for' })).toHaveTextContent(/Running 00:0\d · Pico W/);
    fireEvent.keyDown(window, { key: 'F5' });
    await waitFor(() => expect(s.api.boards.console.do).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(window, { key: 'F5', shiftKey: true });
    expect(s.api.boards.console.do).toHaveBeenCalledWith('e661', { do: 'interrupt' });
    await s.end();
    expect(runButton()).toBeInTheDocument();
  });

  it('nothing changed: nothing copied, and it says so', async () => {
    const s = await setup({ runOn: 'board', send: { ok: true, board: 'Pico W', sent: [], same: ['lights.py'], kept: [] } });
    await waitFor(() => expect(runButton()).toHaveTextContent('· Pico W'));
    fireEvent.click(runButton());
    await waitFor(() => expect(s.api.boards.console.do).toHaveBeenCalled());
    expect(screen.getByRole('log', { name: 'Console of the Pico W' })).toHaveTextContent('✓ Nothing to copy: lights.py was already on the Pico W.');
  });

  it('only main.py in the project: nothing to copy, so nothing is sent', async () => {
    const s = await setup({ runOn: 'board', doc: newProject('pico-w') });
    await waitFor(() => expect(runButton()).toHaveTextContent('· Pico W'));
    fireEvent.click(runButton());
    await waitFor(() => expect(s.api.boards.console.do).toHaveBeenCalledWith('e661', expect.objectContaining({ do: 'run', name: 'main.py' })));
    expect(s.api.boards.send).not.toHaveBeenCalled();
  });

  it('the copy fails (the board unplugged): what went wrong is said, and nothing runs there', async () => {
    const s = await setup({ runOn: 'board', send: { ok: false, message: 'The board was unplugged while sending.' } });
    await waitFor(() => expect(runButton()).toHaveTextContent('· Pico W'));
    fireEvent.click(runButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('The board was unplugged while sending.');
    expect(s.api.boards.console.do).not.toHaveBeenCalled();
    expect(runButton()).toBeInTheDocument();
  });

  it('the check before running comes first, as for the simulator', async () => {
    const doc = lights();
    const s = await setup({ runOn: 'board', doc: { ...doc, files: { ...doc.files, 'main.py': 'from machine import Pin\nled = Pin(15, Pin.OUT)\nled.on()\n' } } });
    await waitFor(() => expect(runButton()).toHaveTextContent('· Pico W'));
    fireEvent.click(runButton());
    expect(await screen.findByRole('button', { name: /Run anyway/ })).toBeInTheDocument();
    expect(s.api.boards.console.do).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Run anyway/ }));
    await waitFor(() => expect(s.api.boards.console.do).toHaveBeenCalledWith('e661', expect.objectContaining({ do: 'run' })));
  });
});

describe('M11.8 Run on both at once (screen 37b)', () => {
  it('the simulator and the board start together; the console shows the two side by side', async () => {
    const s = await setup({ runOn: 'both' });
    await waitFor(() => expect(runButton()).toHaveTextContent('· sim + Pico W'));
    fireEvent.click(runButton());
    expect(s.runs).toHaveLength(1);
    await waitFor(() => expect(s.api.boards.console.do).toHaveBeenCalledWith('e661', expect.objectContaining({ do: 'run', name: 'main.py' })));
    expect(screen.getByRole('tab', { name: /Simulator \+ Pico W/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: /Pico W \(USB\)/ })).toBeNull();
    expect(screen.getByRole('log', { name: 'Console' })).toBeInTheDocument();
    s.print('go\n');
    expect(screen.getByRole('log', { name: 'Console of the Pico W' })).toHaveTextContent('go');
    expect(screen.getByText(/Running here and on the real Pico W\./)).toBeInTheDocument();
    expect(screen.getByRole('timer', { name: 'Running for' })).toHaveTextContent('· sim + Pico W');
  });

  it('Stop stops both', async () => {
    const s = await setup({ runOn: 'both' });
    await waitFor(() => expect(runButton()).toHaveTextContent('· sim + Pico W'));
    fireEvent.click(runButton());
    await waitFor(() => expect(s.api.boards.console.do).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(s.runs[0]!.stop).toHaveBeenCalled();
    expect(s.api.boards.console.do).toHaveBeenCalledWith('e661', { do: 'interrupt' });
  });

  it('back to the simulator alone: the console has its two tabs again', async () => {
    const s = await setup({ runOn: 'both' });
    await waitFor(() => expect(runButton()).toHaveTextContent('· sim + Pico W'));
    fireEvent.click(runButton());
    await screen.findByRole('tab', { name: /Simulator \+ Pico W/ });
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await s.end();
    s.endSim();
    openMenu();
    fireEvent.click(radio(/The simulator/));
    expect(screen.getByRole('tab', { name: /Pico W \(USB\)/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Simulator$/ })).toBeInTheDocument();
  });
});
