import { useEffect, useRef, useState } from 'react';
import type { BoardId } from '@lib/boards';
import { boardFits, modelOf, shortVersion, versionText } from '@lib/repl';
import { chipState, kindOf, type BoardCheck, type BoardKind, type ChipState, type Detection, type FoundBoard } from '@lib/usb';
import { BOARD_ART } from '../app/boards';
import { Icon, RadioGroup } from '../ui';
import './board.css';

/**
 * The board chip in the top bar (F-55, screens 13, 13b): always says whether a real board is there and whether it fits
 * the project; clicked, its card shows the board, its port, and — with two plugged in — which one to use. What USB
 * tells first; once the board is asked (M10.2), its own name and MicroPython, or why it can't be used.
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
  /** Asks the board (by id) what it is (M10.2). */
  onCheck: (id: string) => void;
}

/** The chip's colour, its words (face and spoken), from its state. */
function look(state: ChipState, project: BoardId, count: number): { tone: string; label: string; face: React.ReactNode } {
  if (state.kind === 'none') return { tone: 'none', label: 'No board', face: <>No board</> };
  if (state.kind === 'bootsel') {
    return { tone: 'warn', label: 'Pico, BOOTSEL mode', face: <><img src={KIND.pico.art} alt="" />Pico <span className="sub">· BOOTSEL mode</span></> };
  }
  if (state.kind === 'cant-open') {
    return { tone: 'bad', label: "Board found, can't connect", face: <><Icon name="warn" size={14} />Board found, can't connect</> };
  }
  const k = KIND[state.board.kind];
  const short = 'model' in state && state.model ? state.model.short : k.short;
  const several = count > 1 ? ` (${count} boards)` : '';
  const [tone, said, sub] = (() => {
    switch (state.kind) {
      case 'checking': return ['looking', 'checking…', 'checking…'];
      case 'sending': { const n = `sending ${Math.min(state.done + 1, state.total)} of ${state.total}`; return ['busy', n, n]; }
      case 'busy': { const by = `used by ${state.by ?? 'another program'}`; return ['warn', by, by]; }
      case 'no-micropython': return ['warn', 'no MicroPython', 'no MicroPython'];
      case 'wrong': return ['warn', `project is for ${WANT[project]}`, `project is for ${WANT[project]}`];
      default: {
        const v = state.uname ? shortVersion(state.uname) : undefined;
        return ['ok', v ? `ready, ${v}` : 'ready', v ?? (count > 1 ? `${count} boards` : 'on USB')];
      }
    }
  })();
  return { tone, label: `${short}, ${said}${several}`, face: <><img src={k.art} alt="" />{short} <span className="sub">· {sub}</span></> };
}

export function BoardChip({ detection, project, chosen, onChoose, onCheck }: BoardChipProps) {
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

  const { tone, label, face } = look(state, project, detection.boards.length);
  const checks = detection.checks ?? {};
  const again = 'board' in state ? () => onCheck(state.board.id) : undefined;

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
          {'board' in state && (
            <BoardCard state={state} want={WANT[project]} checked={state.board.id in checks} onCheck={again!} />
          )}
          {detection.boards.length > 1 && (
            <RadioGroup label="Use this board" value={'board' in state ? state.board.id : undefined} onChange={onChoose}
              options={detection.boards.map((b) => ({ value: b.id, label: `${boardShort(b, checks[b.id])} — ${b.port}` }))} />
          )}
          <p className="tiny muted note">MicroLab only talks to a board when it is plugged in, or when you send to it — the rest of the time Thonny and other programs can use it too.</p>
        </div>
      )}
    </div>
  );
}

/** "Pico W" once it answered, else what USB says ("Pico"). */
function boardShort(b: FoundBoard, check: BoardCheck | undefined): string {
  return check?.state === 'micropython' && check.uname ? modelOf(check.uname).short : KIND[b.kind].short;
}

type OnBoard = Extract<ChipState, { board: FoundBoard }>;

function BoardCard({ state, want, checked, onCheck }: { state: OnBoard; want: string; checked: boolean; onCheck: () => void }) {
  const { board } = state;
  const k = KIND[board.kind];
  const model = 'model' in state ? state.model : undefined;
  const uname = 'uname' in state ? state.uname : undefined;
  const pill = state.kind === 'ready' ? <span className="pill ok"><Icon name="check" size={12} /> matches this project</span>
    : state.kind === 'wrong' ? <span className="pill warn">this project is for a {want}</span>
    : state.kind === 'checking' ? <span className="pill">checking…</span>
    : state.kind === 'sending' ? <span className="pill">sending {Math.min(state.done + 1, state.total)} of {state.total}…</span>
    : <span className="pill warn">can't be used now</span>;
  const tryAgain = <button type="button" className="btn sm" onClick={onCheck}>Try again</button>;
  return (
    <>
      <div className="hd">
        <span className="pic"><img src={k.art} alt="" /></span>
        <div className="col">
          <b>{model?.name ?? k.name}</b>
          {pill}
        </div>
      </div>
      {state.kind === 'checking' && <p className="small">Asking the board for its MicroPython version… Its own program carries on afterwards.</p>}
      {state.kind === 'busy' && (
        <div className="say">
          <p className="small">Another program is using the board{state.by ? <> — <b>{state.by}</b></> : null}. Close {state.by ?? 'it'}, or press Stop/Disconnect in it.</p>
          {tryAgain}
        </div>
      )}
      {state.kind === 'no-micropython' && (
        <div className="say">
          <p className="small">The board didn't answer as MicroPython does. It may be running a MakeCode or Arduino program, or a program that doesn't stop when asked.</p>
          {tryAgain}
        </div>
      )}
      {state.kind === 'cant-open' && (
        <div className="say">
          <p className="small">MicroLab can see the board but can't talk to it: <span className="mono">{state.message}</span></p>
          {tryAgain}
        </div>
      )}
      <div className="kv">
        {uname && <><span>Firmware</span><span>{versionText(uname)}</span></>}
        <span>Port</span><span className="mono small">{board.port}</span>
        <span>Found by</span><span>{board.chip ? `its ${board.chip} USB chip` : board.kind === 'pico' ? 'MicroPython on USB' : 'its USB chip'} <span className="muted mono small">{board.usb}</span></span>
      </div>
      {!checked && (state.kind === 'ready' || state.kind === 'wrong') && (
        <div className="say">
          <p className="small">Ask the board which board it is and its MicroPython version — its program stops for a moment and starts again.</p>
          <button type="button" className="btn sm" onClick={onCheck}>Check the board</button>
        </div>
      )}
    </>
  );
}

/** The short message when a board is plugged in or out (screen 13b), for 5 s; it follows the board's answer. */
export function plugMessage(changes: { plugged: FoundBoard[]; unplugged: FoundBoard[] }, project: BoardId | undefined, checks: Detection['checks'] = {}): string | null {
  const p = changes.plugged[0];
  if (p) {
    const check = checks[p.id];
    const answered = check?.state === 'micropython' && check.uname ? check.uname : undefined;
    const fits = !project || (answered ? boardFits(modelOf(answered).model, project) : p.kind === kindOf(project));
    const fit = project ? (fits ? ' It matches this project.' : ` This project is for a ${WANT[project]}.`) : '';
    if (answered) return `${modelOf(answered).short} plugged in — MicroPython ${answered.release}.${fit}`;
    const k = KIND[p.kind];
    if (check?.state === 'checking') return `${k.short} plugged in — checking…`;
    if (check?.state === 'busy') return `${k.short} plugged in — used by ${check.by ?? 'another program'}.`;
    if (check?.state === 'no-micropython') return `${k.short} plugged in — it has no MicroPython.`;
    return `${k.short} plugged in.${fits ? '' : fit}`;
  }
  const u = changes.unplugged[0];
  return u ? `${KIND[u.kind].short} unplugged. The project is still here; plug it back in to send.` : null;
}
