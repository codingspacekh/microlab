import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { ConsoleState } from '@lib/repl';
import { Icon } from '../ui/Icon';
import { TextField } from '../ui';
import type { ConsoleChunk } from '../app/useRun';
import './console.css';

/**
 * The console (F-23, screen 03): what the board prints, the app's notes in grey, errors in red; it follows the end
 * while new text comes, unless the student has scrolled up to read. With a real board (F-51, screen 16) it has a
 * second tab, "Pico W (USB)": the board's own output, Stop (Ctrl+C), Restart, Let go, and its >>> to type at.
 */
export type BoardChunk = { kind: ConsoleChunk['kind'] | 'sent'; text: string };

export interface BoardConsoleView {
  /** "Pico W (USB)". */
  label: string;
  /** "Pico W": in sentences. */
  name: string;
  chunks: BoardChunk[];
  /** Its console is open (the port held); undefined when it isn't. */
  state?: ConsoleState;
  onType: (text: string) => void;
  onStop: () => void;
  onRestart: () => void;
  onOpen: () => void;
  onClose: () => void;
  onClear: () => void;
}

export interface ConsoleProps {
  chunks: ConsoleChunk[];
  running: boolean;
  entry: string;
  onClear: () => void;
  board?: BoardConsoleView;
  /** Which tab shows: the simulator's, or the board's. */
  tab?: 'sim' | 'board';
  onTab?: (tab: 'sim' | 'board') => void;
}

export function Console({ chunks, running, entry, onClear, board, tab = 'sim', onTab }: ConsoleProps) {
  const showBoard = !!board && tab === 'board';
  const shown: BoardChunk[] = showBoard ? board.chunks : chunks;
  const body = useRef<HTMLDivElement>(null);
  const atEnd = useRef(true);
  useLayoutEffect(() => {
    const el = body.current;
    if (el && atEnd.current) el.scrollTop = el.scrollHeight;
  }, [shown]);

  const live = board?.state && !board.state.prompt;
  const onKeyDown = (e: KeyboardEvent) => {
    // Ctrl+C in the board's console stops the board, as in a terminal (when no text is selected to copy)
    if (showBoard && board.state && e.ctrlKey && e.key === 'c' && !window.getSelection()?.toString()) {
      e.preventDefault();
      board.onStop();
    }
  };

  return (
    <div className="console" onKeyDown={onKeyDown}>
      <div className="chead">
        {board ? (
          <div role="tablist" aria-label="Consoles" className="ctabs">
            <button type="button" role="tab" aria-selected={!showBoard} className={`ctab${showBoard ? '' : ' on'}`} onClick={() => onTab?.('sim')}>
              <Icon name="term" size={14} /> Simulator
            </button>
            <button type="button" role="tab" aria-selected={showBoard} className={`ctab board${showBoard ? ' on' : ''}${board.state ? ' live' : ''}`} onClick={() => onTab?.('board')}>
              <span className="dot" /> {board.label}
            </button>
          </div>
        ) : (
          <span className="ctab on"><Icon name="term" size={14} /> Console</span>
        )}
        <span className="spacer" />
        {showBoard && board.state && (
          <>
            <button type="button" className="btn ghost sm" onClick={board.onRestart} aria-label="Restart the board" title="Restart the board: it runs main.py again, as when it is switched on">
              <Icon name="restart" size={14} /> Restart
            </button>
            <button type="button" className="btn ghost sm" onClick={board.onClose} aria-label="Let go of the board" title="Let go of the board: Thonny and other programs can use it">
              <Icon name="x" size={14} /> Let go
            </button>
          </>
        )}
        <button type="button" className="btn ghost sm" onClick={showBoard ? board.onClear : onClear} disabled={shown.length === 0}>Clear</button>
      </div>
      <div className="cbody" ref={body} role="log" aria-label={showBoard ? `Console of the ${board.name}` : 'Console'} aria-live="polite" tabIndex={showBoard ? 0 : undefined}
        onScroll={(e) => { const el = e.currentTarget; atEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24; }}>
        {shown.length === 0
          ? <span className="sys">{showBoard ? `What the ${board.name} prints appears here.` : 'Press Run to start the simulation. print() output and errors appear here.'}</span>
          : shown.map((c, i) => <span key={i} className={c.kind === 'out' ? undefined : c.kind}>{c.kind === 'sent' ? `✓ ${c.text}` : c.text}</span>)}
      </div>
      {showBoard ? <BoardPrompt board={board} live={!!live} /> : (
        <div className="prompt">
          {running
            ? <><b className="live"><Icon name="play" size={12} /></b><span>Running {entry} — Stop ends it at once</span></>
            : <><b>&gt;&gt;&gt;</b><span>The REPL comes later; press Run to run {entry}</span></>}
        </div>
      )}
    </div>
  );
}

/** The board's prompt line: what runs and how to stop it; its >>> to type at; or how to open it again. */
function BoardPrompt({ board, live }: { board: BoardConsoleView; live: boolean }) {
  const [line, setLine] = useState('');
  const [block, setBlock] = useState<string[]>([]);
  if (!board.state) {
    return (
      <div className="prompt">
        <span>The {board.name} is not connected to this console.</span>
        <button type="button" className="btn sm" onClick={board.onOpen}>Open the console</button>
      </div>
    );
  }
  if (live) {
    return (
      <div className="prompt">
        <b className="live"><Icon name="play" size={12} /></b>
        <span>{board.state.running ?? 'main.py'} runs on the board — Ctrl+C stops it and opens its REPL (&gt;&gt;&gt;)</span>
        <span className="spacer" />
        <button type="button" className="btn sm" onClick={board.onStop} aria-label="Stop the board's program" title="Stop the board's program (Ctrl+C)"><Icon name="stop" size={12} /> Stop</button>
      </div>
    );
  }
  // a line goes at Enter; a block (after a line ending in ":") waits for an empty line, then goes whole
  const enter = () => {
    if (block.length === 0 && !line.trimEnd().endsWith(':')) {
      if (line.trim()) board.onType(line);
      setLine('');
      return;
    }
    if (block.length && !line.trim()) {
      board.onType(block.join('\n'));
      setBlock([]);
      setLine('');
      return;
    }
    const indent = /^\s*/.exec(line)![0].length + (line.trimEnd().endsWith(':') ? 4 : 0);
    setBlock([...block, line]);
    setLine(' '.repeat(indent));
  };
  return (
    <div className="prompt board">
      {block.length > 0 && <div className="pending">{block.map((l, i) => <span key={i}>{`... ${l}`}</span>)}</div>}
      <div className="row">
        <b>{block.length ? '...' : '>>>'}</b>
        <TextField label="Python for the board" hideLabel mono value={line} onChange={setLine} onEnter={enter}
          placeholder={block.length ? 'An empty line runs the block' : 'Type Python for the board and press Enter'} />
      </div>
    </div>
  );
}
