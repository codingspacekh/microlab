import { useEffect, useRef, useState } from 'react';
import { modelOf } from '@lib/repl';
import type { Detection, FoundBoard } from '@lib/usb';
import type { MicrolabApi } from '../app/api';
import type { BoardChunk } from '../console/Console';
import { KIND } from './BoardChip';

/**
 * The real board's console in the window (F-51, screen 16): what each board printed (kept while the project is open,
 * the oldest dropped past ~200 000 characters), which board the console tab shows, and its tab chosen when its
 * console opens. The talking is the main process's (src/main/board-check.ts).
 */
const LIMIT = 200_000;

export function boardShort(b: FoundBoard, d: Detection): string {
  const c = d.checks?.[b.id];
  return c && (c.state === 'micropython' || c.state === 'sending') && c.uname ? modelOf(c.uname).short : KIND[b.kind].short;
}

export function useBoardConsole(api: MicrolabApi, boards: Detection) {
  const [out, setOut] = useState<Record<string, BoardChunk[]>>({});
  const [shown, setShown] = useState<{ id: string; name: string } | null>(null);
  const [tab, setTab] = useState<'sim' | 'board'>('sim');
  const before = useRef<Record<string, unknown>>({});

  const add = (id: string, chunks: BoardChunk[]) => setOut((all) => {
    const list = [...(all[id] ?? [])];
    for (let c of chunks) {
      // the app's own notes start on a line of their own (after the board's ">>> ", say)
      if ((c.kind === 'sys' || c.kind === 'sent') && list.length && !list.at(-1)!.text.endsWith('\n')) c = { ...c, text: `\n${c.text}` };
      const last = list.at(-1);
      if (last && last.kind === c.kind && c.kind !== 'sent') list[list.length - 1] = { kind: c.kind, text: last.text + c.text };
      else list.push(c);
    }
    let size = list.reduce((n, c) => n + c.text.length, 0);
    while (size > LIMIT && list.length > 1) size -= list.shift()!.text.length;
    return { ...all, [id]: list };
  });

  useEffect(() => api.boards.console.onOutput((id, chunks) => add(id, chunks)), [api]);

  // a console that opens (Send and run, Run on the board, Open the console) is shown at once
  const consoles = boards.consoles ?? {};
  useEffect(() => {
    for (const id of Object.keys(consoles)) {
      if (before.current[id]) continue;
      const b = boards.boards.find((x) => x.id === id);
      if (b) { setShown({ id, name: boardShort(b, boards) }); setTab('board'); }
    }
    before.current = consoles;
  }, [consoles, boards]);

  const board = shown ? boards.boards.find((b) => b.id === shown.id) : undefined;
  const name = board ? boardShort(board, boards) : shown?.name ?? '';
  const state = shown ? consoles[shown.id] : undefined;

  return {
    /** The board the console tab shows (its id), and its name. */
    shown: shown ? { id: shown.id, name } : null,
    state,
    chunks: shown ? out[shown.id] ?? [] : [],
    tab,
    setTab,
    show: (id: string, name: string) => { setShown({ id, name }); setTab('board'); },
    note: (id: string, chunks: BoardChunk[]) => add(id, chunks),
    clear: () => { if (shown) setOut((all) => ({ ...all, [shown.id]: [] })); },
    /** Its board is still plugged in. */
    there: !!board,
  };
}
