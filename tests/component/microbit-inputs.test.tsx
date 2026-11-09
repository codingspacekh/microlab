import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectDoc } from '@lib/project';
import { App } from '../../src/renderer/app/App';
import type { StartRun } from '../../src/renderer/app/useRun';
import type { RunEvents } from '../../src/renderer/sim-client';
import { fakeApi } from './fake-api';
import { newProjectFromStart } from './new-project';

/** M6.6 (F-35, screen 06): the micro:bit inputs card while a micro:bit program runs — A, B, A+B and the logo held,
 *  the tilt dragged on its pad, a shake, the light, the temperature and the sound. */
async function setup(board = 'New micro:bit project') {
  const runs: { doc: ProjectDoc; events: RunEvents; setInput: ReturnType<typeof vi.fn> }[] = [];
  const start: StartRun = (req, events) => {
    const r = { ...req, events, setInput: vi.fn() };
    runs.push(r);
    return { stop: vi.fn(), setInput: r.setInput };
  };
  render(<App api={fakeApi()} width={1440} startRun={start} audio={() => null} />);
  await newProjectFromStart(board);
  fireEvent.click(screen.getByRole('button', { name: 'Run main.py' }));
  return { input: () => runs[0]!.setInput, events: () => runs[0]!.events };
}

describe('M6.6 the micro:bit inputs card (screen 06)', () => {
  it('only on a micro:bit, only while running', async () => {
    await setup('New Pico W project');
    expect(screen.queryByRole('group', { name: 'micro:bit inputs' })).toBeNull();
  });

  it('A, B and the logo are held to press; A+B presses both', async () => {
    const s = await setup();
    const card = screen.getByRole('group', { name: 'micro:bit inputs' });
    fireEvent.mouseDown(within(card).getByRole('button', { name: 'A' }));
    expect(s.input()).toHaveBeenLastCalledWith('pressed:board.A', 1);
    fireEvent.mouseUp(window);
    expect(s.input()).toHaveBeenLastCalledWith('pressed:board.A', 0);
    fireEvent.mouseDown(within(card).getByRole('button', { name: 'A+B' }));
    expect(s.input()).toHaveBeenCalledWith('pressed:board.A', 1);
    expect(s.input()).toHaveBeenLastCalledWith('pressed:board.B', 1);
    fireEvent.mouseUp(window);
    fireEvent.mouseDown(within(card).getByRole('button', { name: 'Logo' }));
    expect(s.input()).toHaveBeenLastCalledWith('touch:LOGO', 1);
    fireEvent.mouseUp(window);
    expect(s.input()).toHaveBeenLastCalledWith('touch:LOGO', 0);
  });

  it('the tilt pad: the dot dragged to the right edge is x 1024; arrows tilt it; Shake shakes it', async () => {
    const s = await setup();
    const card = screen.getByRole('group', { name: 'micro:bit inputs' });
    const pad = within(card).getByRole('slider', { name: 'Tilt' });
    // jsdom has no layout: the pad's corner is the screen's (0, 0), its size the 62 px it is drawn
    fireEvent.mouseDown(pad, { clientX: 31, clientY: 31, button: 0 });
    fireEvent.mouseMove(window, { clientX: 62, clientY: 31 });
    expect(s.input()).toHaveBeenCalledWith('board:accelx', 1024);
    fireEvent.mouseUp(window);
    fireEvent.keyDown(pad, { key: 'ArrowDown' });
    expect(s.input()).toHaveBeenLastCalledWith('board:accely', 64);
    expect(card).toHaveTextContent('x 1024 · y 64');
    fireEvent.click(within(card).getByRole('button', { name: 'Shake' }));
    expect(s.input()).toHaveBeenLastCalledWith('board:shake', 1);
    fireEvent.click(within(card).getByRole('button', { name: 'Shake' }));
    expect(s.input()).toHaveBeenLastCalledWith('board:shake', 2);
  });

  it('the light level, the temperature and the sound level, from where the sim starts them', async () => {
    const s = await setup();
    const card = screen.getByRole('group', { name: 'micro:bit inputs' });
    const light = within(card).getByRole('slider', { name: 'Light level' });
    expect(light).toHaveAttribute('aria-valuetext', '128');
    fireEvent.keyDown(light, { key: 'End' });
    expect(s.input()).toHaveBeenLastCalledWith('board:light', 255);
    const temp = within(card).getByRole('slider', { name: 'Temperature' });
    expect(temp).toHaveAttribute('aria-valuetext', '25 °C');
    fireEvent.keyDown(temp, { key: 'ArrowDown' });
    expect(s.input()).toHaveBeenLastCalledWith('board:celsius', 24);
    const sound = within(card).getByRole('slider', { name: 'Sound level' });
    expect(sound).toHaveAttribute('aria-valuetext', '0');
    fireEvent.keyDown(sound, { key: 'PageUp' });
    expect(s.input()).toHaveBeenLastCalledWith('board:sound', 10);
  });
});

describe('M7 the micro:bit card\'s gestures and radio (the teacher\'s requests)', () => {
  it('the gestures in a dropdown: a posture stays (Face down: z +1024); a moment lasts a second (Freefall, then back)', async () => {
    vi.useFakeTimers();
    try {
      const s = await setup();
      const card = within(screen.getByRole('group', { name: 'micro:bit inputs' }));
      const choose = (name: string) => {
        fireEvent.click(card.getByRole('combobox', { name: 'Gesture' }));
        fireEvent.click(screen.getByRole('option', { name: new RegExp(`^${name}`) }));
      };
      expect(screen.getByRole('combobox', { name: 'Gesture' })).toHaveTextContent('Face up');
      choose('Face down');
      expect(s.input()).toHaveBeenLastCalledWith('board:accelz', 1024);
      choose('Freefall');
      expect(s.input()).toHaveBeenLastCalledWith('board:accelz', 0);
      act(() => { vi.advanceTimersByTime(1000); });
      expect(s.input()).toHaveBeenLastCalledWith('board:accelz', 1024);
      expect(screen.getByRole('combobox', { name: 'Gesture' })).toHaveTextContent('Face down');
      fireEvent.click(card.getByRole('combobox', { name: 'Gesture' }));
      expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(
        ['Face upstays', 'Face downstays', 'Upstays', 'Downstays', 'Leftstays', 'Rightstays', 'Freefall1 s', '3g1 s', '6g1 s', '8g1 s']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('the radio: what the program sent, a string in quotes, bytes as bytes; a message sent in as another micro:bit', async () => {
    const s = await setup();
    const radio = within(screen.getByRole('group', { name: 'Radio' }));
    expect(radio.getByRole('list', { name: 'Radio messages sent' })).toHaveTextContent('nothing yet');
    act(() => s.events().onBoard({ pins: {}, radio: ['01000168656c6c6f', '0541'] }));
    expect(radio.getAllByRole('listitem').map((l) => l.textContent)).toEqual(['"hello"', "b'\\x05A'"]);
    fireEvent.change(radio.getByRole('textbox', { name: 'A message from another micro:bit' }), { target: { value: 'hi' } });
    fireEvent.click(radio.getByRole('button', { name: 'Send' }));
    expect(s.input()).toHaveBeenCalledWith('radio:0', 104);
    expect(s.input()).toHaveBeenCalledWith('radio:1', 105);
    expect(s.input()).toHaveBeenCalledWith('radio:len', 2);
    expect(s.input()).toHaveBeenLastCalledWith('radio:seq', 1);
  });
});
