import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { legsCentre } from '@lib/editor';
import type { ProjectDoc } from '@lib/project';
import { App } from '../../src/renderer/app/App';
import type { MicrolabApi } from '../../src/renderer/app/api';
import type { StartRun } from '../../src/renderer/app/useRun';
import type { AudioLike } from '../../src/renderer/audio';
import type { RunEvents } from '../../src/renderer/sim-client';
import { fakeApi } from './fake-api';
import { startBuilding } from './start-building';

/** M6.2 (F-33, F-36; screen 06): the active and the passive buzzer in the parts panel and the inspector; while running
 *  a buzzer that sounds shows its sound waves and its note, and is heard (Web Audio, a fake here) with the micro:bit's
 *  speaker; the status bar turns the sound on or off (a setting). */
function fakeSim() {
  const runs: { doc: ProjectDoc; events: RunEvents }[] = [];
  const start: StartRun = (req, events) => {
    runs.push({ ...req, events });
    return { stop: vi.fn(), setInput: vi.fn() };
  };
  const say = (f: (e: RunEvents) => void) => act(() => f(runs.at(-1)!.events));
  const end = () => say((e) => e.onEnd({ output: '', trace: [], pwm: [], analog: [], display: [], sound: [], bus: [], parts: [], faults: [], ended: 'stopped' } as never));
  return { start, runs, say, end };
}

function fakeAudio() {
  const oscillators: { type: string; frequency: { value: number }; stopped: boolean }[] = [];
  const param = (value = 0) => ({ value, setValueAtTime(v: number) { this.value = v; } });
  const ctx = {
    currentTime: 0, destination: {},
    createOscillator: () => {
      const o = { type: 'sine', frequency: param(), stopped: false, connect() {}, start() {}, stop() { o.stopped = true; } };
      oscillators.push(o);
      return o;
    },
    createGain: () => ({ gain: param(1), connect() {} }),
    close: async () => {},
  };
  const playing = () => oscillators.filter((o) => !o.stopped).map((o) => Math.round(o.frequency.value));
  const types = () => oscillators.filter((o) => !o.stopped).map((o) => o.type);
  return { make: () => ctx as unknown as AudioLike, playing, types };
}

function setup(board = 'New Pico W project', api: MicrolabApi = fakeApi()) {
  const sim = fakeSim();
  const audio = fakeAudio();
  render(<App api={api} width={1440} startRun={sim.start} audio={audio.make} />);
  fireEvent.click(screen.getByRole('button', { name: board }));
  startBuilding();
  const svg = screen.getByRole('application', { name: 'Circuit canvas' });
  const [vx, vy] = svg.getAttribute('viewBox')!.split(' ').map(Number) as [number, number];
  const client = (x: number, y: number) => ({ clientX: x - vx, clientY: y - vy, button: 0 });
  const place = (hole: string) => {
    const c = svg.querySelector(`[data-point="${hole}"]`)!;
    const [cx, cy] = legsCentre('buzzer');
    const at = client(Number(c.getAttribute('cx')) + cx, Number(c.getAttribute('cy')) + cy);
    fireEvent.mouseDown(within(screen.getByRole('region', { name: 'Parts' })).getByRole('button', { name: /^Buzzer/ }), { clientX: 5, clientY: 5, button: 0 });
    fireEvent.mouseMove(svg, at);
    fireEvent.mouseUp(svg, at);
  };
  const part = (id: string) => svg.querySelector(`[data-part="${id}"]`)!;
  const run = () => fireEvent.click(screen.getByRole('button', { name: 'Run main.py' }));
  return { sim, audio, svg, place, part, run, api };
}

describe('M6.2 the buzzer in the editor', () => {
  it('from the panel its legs go three holes apart, + then −; the inspector chooses active or passive', () => {
    const s = setup();
    s.place('bb1.a10');
    expect(s.part('bz1')).toHaveAttribute('data-legs', 'bb1.a10 bb1.a13');
    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    const kind = within(inspector).getByRole('radiogroup', { name: 'Buzzer kind' });
    expect(within(kind).getByRole('radio', { name: /Active/ })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(within(kind).getByRole('radio', { name: /Passive/ }));
    expect(JSON.parse(s.part('bz1').getAttribute('data-props')!)).toMatchObject({ kind: 'passive' });
    expect(within(inspector).getByText(/plays the note of the PWM/)).toBeInTheDocument();
    expect(within(inspector).getByText('a10', { exact: false })).toBeInTheDocument();
  });
});

describe('M6.2 while running: seen and heard', () => {
  it('a sounding buzzer shows its waves and its note on hover, and is heard; silent, it stops', () => {
    const s = setup();
    s.place('bb1.a10');
    s.run();
    expect(s.part('bz1')).toHaveAttribute('data-hz', '0');
    s.sim.say((e) => e.onParts({ bz1: { kind: 'buzzer', hz: 440, volume: 1 } }));
    expect(s.part('bz1')).toHaveAttribute('data-hz', '440');
    expect(s.part('bz1').querySelector('.waves')).not.toBeNull();
    expect(s.audio.playing()).toEqual([440]);
    fireEvent.mouseEnter(s.part('bz1'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('BZ1 · 440 Hz · A4');
    s.sim.say((e) => e.onParts({ bz1: { kind: 'buzzer', hz: 0, volume: 0 } }));
    expect(s.part('bz1').querySelector('.waves')).toBeNull();
    expect(s.audio.playing()).toEqual([]);
    expect(screen.getByRole('tooltip')).toHaveTextContent('BZ1 · silent');
  });

  it('the status bar turns the sound off and on, and the setting is kept', async () => {
    const api = fakeApi();
    const s = setup('New Pico W project', api);
    s.place('bb1.a10');
    s.run();
    s.sim.say((e) => e.onParts({ bz1: { kind: 'buzzer', hz: 2300, volume: 1 } }));
    fireEvent.click(screen.getByRole('button', { name: /Sound on/ }));
    expect(s.audio.playing()).toEqual([]);
    expect(screen.getByRole('button', { name: /Sound off/ })).toHaveAttribute('aria-pressed', 'false');
    await waitFor(async () => expect(await api.settings.get('sound')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: /Sound off/ }));
    expect(s.audio.playing()).toEqual([2300]);
  });

  it('a muted setting is remembered for the next time', async () => {
    const api = fakeApi();
    await api.settings.set('sound', false);
    const s = setup('New Pico W project', api);
    s.place('bb1.a10');
    s.run();
    await screen.findByRole('button', { name: /Sound off/ });
    s.sim.say((e) => e.onParts({ bz1: { kind: 'buzzer', hz: 2300, volume: 1 } }));
    expect(s.audio.playing()).toEqual([]);
  });

  it('the micro:bit\'s speaker is heard, with no buzzer at all; the end of the run stops every sound', () => {
    const s = setup('New micro:bit project');
    s.run();
    expect(screen.getByRole('button', { name: /Sound on/ })).toBeInTheDocument();
    s.sim.say((e) => e.onBoard({ pins: {}, sound: 523.25 }));
    expect(s.audio.playing()).toEqual([523]);
    s.sim.end();
    expect(s.audio.playing()).toEqual([]);
  });

  it('M7 slice 4: the speaker plays its sound effect\'s waveform; at volume 0 it is not heard; a later note is square again', () => {
    const s = setup('New micro:bit project');
    s.run();
    s.sim.say((e) => e.onBoard({ pins: {}, sound: 600, tone: { volume: 0.5, wave: 'triangle' } }));
    expect(s.audio.playing()).toEqual([600]);
    expect(s.audio.types()).toEqual(['triangle']);
    s.sim.say((e) => e.onBoard({ pins: {}, sound: 600, tone: { volume: 0, wave: 'triangle' } }));
    expect(s.audio.playing()).toEqual([]);
    s.sim.say((e) => e.onBoard({ pins: {}, sound: 440 }));
    expect(s.audio.types()).toEqual(['square']);
  });

  it('nothing to hear (a Pico W with no buzzer): no sound button', () => {
    const s = setup();
    s.run();
    expect(screen.queryByRole('button', { name: /Sound (on|off)/ })).toBeNull();
  });
});
