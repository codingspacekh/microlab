import { afterEach, describe, expect, it, vi } from 'vitest';
import { newProject } from '@lib/project';
import { addPart } from '@lib/editor';
import { inputSlots, startRun, type WorkerLike } from '../../../src/renderer/sim-client';
import type { StartMessage, WorkerMessage } from '../../../src/sim/worker-core';

/** M4.5 F-22: the window's side of a run — the worker started with the project, its messages passed on, Stop. */
class FakeWorker implements WorkerLike {
  sent: StartMessage[] = [];
  terminated = false;
  onmessage: ((e: MessageEvent<WorkerMessage>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  postMessage(m: StartMessage) { this.sent.push(m); }
  terminate() { this.terminated = true; }
  say(m: WorkerMessage) { this.onmessage?.({ data: m } as MessageEvent<WorkerMessage>); }
}

const events = () => ({ onOutput: vi.fn(), onParts: vi.fn(), onBoard: vi.fn(), onEnd: vi.fn() });
const doc = () => {
  const d = newProject('pico-w');
  d.project = addPart(addPart(d.project, 'button', { '1a': 'bb1.e20', '2a': 'bb1.e22', '1b': 'bb1.f20', '2b': 'bb1.f22' }).project,
    'potentiometer', { 1: 'bb1.a1', 2: 'bb1.a3', 3: 'bb1.a5' }).project;
  return d;
};

afterEach(() => vi.useRealTimers());

describe('M4.5 starting a run', () => {
  it('sends the board, the files, the circuit, the entry file and the input slots of the parts that take input', () => {
    const w = new FakeWorker();
    startRun({ doc: doc(), entry: 'main.py' }, events(), () => w);
    const m = w.sent[0]!;
    expect(m).toMatchObject({ type: 'start', board: 'pico-w', entry: 'main.py', inputs: ['pressed:btn1', 'position:pot1'] });
    expect(m.files['main.py']).toContain('Pin("LED"');
    expect(m.circuit!.parts.map((p) => p.id)).toEqual(['btn1', 'pot1']);
    expect(m.circuit!.board!.data.id).toBe('pico-w');
    expect(m.control).toBeInstanceOf(SharedArrayBuffer);
  });

  it('the input slots: a button is pressed or not, a knob has a position', () => {
    expect(inputSlots(doc().project)).toEqual(['pressed:btn1', 'position:pot1']);
  });

  it('passes on what the worker says, and ends the worker with the run', () => {
    const w = new FakeWorker();
    const e = events();
    startRun({ doc: doc(), entry: 'main.py' }, e, () => w);
    w.say({ type: 'output', text: 'hi\n' });
    w.say({ type: 'parts', states: { led1: { kind: 'led', amps: 0.01, brightness: 0.5 } } });
    w.say({ type: 'board', pins: { LED: 1 } });
    w.say({ type: 'end', result: { ended: 'done' } as never });
    expect(e.onOutput).toHaveBeenCalledWith('hi\n');
    expect(e.onParts).toHaveBeenCalledWith({ led1: { kind: 'led', amps: 0.01, brightness: 0.5 } });
    expect(e.onBoard).toHaveBeenCalledWith({ pins: { LED: 1 } });
    expect(e.onEnd).toHaveBeenCalledWith(expect.objectContaining({ ended: 'done' }));
    expect(w.terminated).toBe(true);
  });

  it('a button pressed while running: its slot is set in the shared buffer', () => {
    const w = new FakeWorker();
    const run = startRun({ doc: doc(), entry: 'main.py' }, events(), () => w);
    run.setInput('pressed:btn1', 1);
    const slots = new Float64Array(w.sent[0]!.control, 8, 2);
    expect(slots[0]).toBe(1);
    expect(Number.isNaN(slots[1])).toBe(true);   // the knob: nothing drives it yet
  });
});

describe('M4.5 Stop (N-03)', () => {
  it('Stop asks the program to stop through the shared buffer; its end is passed on once', () => {
    const w = new FakeWorker();
    const e = events();
    const run = startRun({ doc: doc(), entry: 'main.py' }, e, () => w);
    run.stop();
    expect(new Int32Array(w.sent[0]!.control, 0, 1)[0]).toBe(1);
    w.say({ type: 'end', result: { ended: 'stopped' } as never });
    run.stop();
    expect(e.onEnd).toHaveBeenCalledTimes(1);
  });

  it('a program that ignores Stop for 300 ms: the worker is ended and the run reported stopped', () => {
    vi.useFakeTimers();
    const w = new FakeWorker();
    const e = events();
    startRun({ doc: doc(), entry: 'main.py' }, e, () => w).stop();
    vi.advanceTimersByTime(299);
    expect(w.terminated).toBe(false);
    vi.advanceTimersByTime(2);
    expect(w.terminated).toBe(true);
    expect(e.onEnd).toHaveBeenCalledWith(expect.objectContaining({ ended: 'stopped', output: '' }));
  });

  it('a worker that fails to start: the run ends with its message', () => {
    const w = new FakeWorker();
    const e = events();
    startRun({ doc: doc(), entry: 'main.py' }, e, () => w);
    w.onerror?.({ message: 'no wasm' } as ErrorEvent);
    expect(e.onEnd).toHaveBeenCalledWith(expect.objectContaining({ ended: 'error', error: expect.objectContaining({ message: expect.stringContaining('no wasm') }) }));
  });
});
