import { useEffect, useRef, useState } from 'react';
import type { BoardId } from '@lib/boards';
import { chipState, type BoardKind, type Detection, type FoundBoard } from '@lib/usb';
import { BOARD_ART } from '../app/boards';
import { Icon, RadioGroup } from '../ui';
import './board.css';

/**
 * The board chip in the top bar (F-55, screens 13, 13b): always says whether a real board is there and whether it fits
 * the project; clicked, its card shows the board, its port, and — with two plugged in — which one to use. M10.1 shows
 * what USB can tell; the board's MicroPython version, "checking", "used by another program" come with asking it.
 */
export const KIND: Record<BoardKind, { short: string; name: string; art: string }> = {
  pico: { short: 'Pico', name: 'Raspberry Pi Pico', art: BOARD_ART['pico-w'] },
  microbit: { short: 'micro:bit', name: 'BBC micro:bit', art: BOARD_ART['microbit-v2'] },
  esp32: { short: 'ESP32', name: 'ESP32 board', art: BOARD_ART['esp32-devkit-v1'] },
};

/** How the project's board is called in a sentence. */
export const WANT: Record<BoardId, string> = {
  'pico-w': 'Pico W', 'microbit-v2': 'micro:bit', 'esp32-devkit-v1': 'ESP32', 'esp32-devkit-v1-ext': 'ESP32',
};

export interface BoardChipProps {
  detection: Detection;
  project: BoardId;
  chosen?: string;
  onChoose: (id: string) => void;
}

export function BoardChip({ detection, project, chosen, onChoose }: BoardChipProps) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const state = chipState(detection, project, chosen);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, [open]);

  const several = detection.boards.length > 1 ? ` (${detection.boards.length} boards)` : '';
  let tone: string;
  let label: string;
  let face: React.ReactNode;
  if (state.kind === 'none') {
    tone = 'none';
    label = 'No board';
    face = <>No board</>;
  } else if (state.kind === 'bootsel') {
    tone = 'warn';
    label = 'Pico, BOOTSEL mode';
    face = <><img src={KIND.pico.art} alt="" />Pico <span className="sub">· BOOTSEL mode</span></>;
  } else {
    const k = KIND[state.board.kind];
    const ready = state.kind === 'ready';
    tone = ready ? 'ok' : 'warn';
    label = `${k.short}, ${ready ? 'ready' : `project is for ${WANT[project]}`}${several}`;
    face = <><img src={k.art} alt="" />{k.short} <span className="sub">· {ready ? (several ? `${detection.boards.length} boards` : 'on USB') : `project is for ${WANT[project]}`}</span></>;
  }

  return (
    <div className="chipwrap" ref={wrap}>
      <button ref={button} type="button" className={`boardchip ${tone}${open ? ' on' : ''}`} aria-label={`Board: ${label}`}
        aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="dot" />{face}<Icon name="chevd" size={14} />
      </button>
      {open && (
        <div className="float chipcard" role="dialog" aria-label="Board"
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); button.current?.focus(); } }}>
          {state.kind === 'none' && (
            <p className="small">Plug a micro:bit, Pico W or ESP32 in with a USB cable that carries data. It is found by itself — there is no port to choose.</p>
          )}
          {state.kind === 'bootsel' && (
            <p className="small">The Pico is in BOOTSEL mode: it shows a drive called <span className="mono">{state.volume}</span> and runs no program. Unplug it and plug it back in without holding the button to start it as it was.</p>
          )}
          {(state.kind === 'ready' || state.kind === 'wrong') && (
            <BoardCard board={state.board} fits={state.kind === 'ready'} want={WANT[project]} />
          )}
          {detection.boards.length > 1 && (
            <RadioGroup label="Use this board" value={state.kind === 'ready' || state.kind === 'wrong' ? state.board.id : undefined} onChange={onChoose}
              options={detection.boards.map((b) => ({ value: b.id, label: `${KIND[b.kind].short} — ${b.port}` }))} />
          )}
          <p className="tiny muted note">MicroLab only talks to a board when you send to it — the rest of the time Thonny and other programs can use it too.</p>
        </div>
      )}
    </div>
  );
}

function BoardCard({ board, fits, want }: { board: FoundBoard; fits: boolean; want: string }) {
  const k = KIND[board.kind];
  return (
    <>
      <div className="hd">
        <span className="pic"><img src={k.art} alt="" /></span>
        <div className="col">
          <b>{k.name}</b>
          {fits ? <span className="pill ok"><Icon name="check" size={12} /> matches this project</span>
            : <span className="pill warn">this project is for a {want}</span>}
        </div>
      </div>
      <div className="kv">
        <span>Port</span><span className="mono small">{board.port}</span>
        <span>Found by</span><span>{board.chip ? `its ${board.chip} USB chip` : board.kind === 'pico' ? 'MicroPython on USB' : 'its USB chip'} <span className="muted mono small">{board.usb}</span></span>
      </div>
    </>
  );
}

/** The short message when a board is plugged in or out (screen 13b), for 5 s. */
export function plugMessage(changes: { plugged: FoundBoard[]; unplugged: FoundBoard[] }, project: BoardId | undefined): string | null {
  const p = changes.plugged[0];
  if (p) {
    const k = KIND[p.kind];
    const fits = !project || (p.kind === 'pico' ? project === 'pico-w' : p.kind === 'microbit' ? project === 'microbit-v2' : project.startsWith('esp32'));
    return `${k.short} plugged in.${fits ? '' : ` This project is for a ${WANT[project!]}.`}`;
  }
  const u = changes.unplugged[0];
  return u ? `${KIND[u.kind].short} unplugged. The project is still here; plug it back in to send.` : null;
}
