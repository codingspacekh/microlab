import { useEffect, useRef, useState } from 'react';
import { SoundPlayer, voicesOf, webAudio, type AudioLike } from '../audio';
import type { MicrolabApi } from './api';
import type { RunState } from './useRun';

/**
 * The run's sound (M6.2, F-36): while a program runs, each sounding buzzer and the micro:bit's speaker is heard from
 * the laptop; the end of the run stops them. The status bar turns the sound off and on — a setting ('sound'), kept
 * for the next time, so a class can work quietly.
 */
export function useSound(api: MicrolabApi, state: RunState, audio: () => AudioLike | null = webAudio) {
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    let live = true;
    void api.settings.get('sound').then((v) => { if (live && v === false) setMuted(true); });
    return () => { live = false; };
  }, [api]);

  const player = useRef<SoundPlayer | null>(null);
  player.current ??= new SoundPlayer(audio);
  const voices = state.status === 'idle' ? [] : voicesOf(state.parts, Math.round(state.board.sound ?? 0));
  const key = JSON.stringify(voices);
  useEffect(() => { player.current!.set(JSON.parse(key) as typeof voices, muted); }, [key, muted]);
  useEffect(() => () => player.current?.close(), []);

  const toggle = () => {
    const next = !muted;
    setMuted(next);
    void api.settings.set('sound', !next);
  };
  return { muted, toggle };
}
