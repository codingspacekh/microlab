import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { FaultCard } from '@lib/circuit';
import type { Explanation } from '@lib/errors';
import type { ConsoleState } from '@lib/repl';
import { Icon } from '../ui/Icon';
import { TextField } from '../ui';
import type { ConsoleChunk } from '../app/useRun';
import { ProblemsList } from '../workspace/faults';
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

export type ConsoleTab = 'sim' | 'board' | 'problems';

export interface ConsoleProps {
  chunks: ConsoleChunk[];
  running: boolean;
  entry: string;
  onClear: () => void;
  board?: BoardConsoleView;
  /** Which tab shows: the simulator's, the board's, or Problems (M9). */
  tab?: ConsoleTab;
  onTab?: (tab: ConsoleTab) => void;
  /** Problems (M9 slice 2, F-24): the circuit's faults in the last run, each with Show; Clear empties them. */
  problems?: { cards: FaultCard[]; onShow: (card: FaultCard) => void; onReplace?: (led: string) => void; onClear: () => void };
  /** The program has ended and its REPL waits (M9, F-23, screen 29c). */
  repl?: boolean;
  /** A line typed — input()'s answer, a line for the REPL — or '\x03' for Ctrl+C (M9). */
  onType?: (text: string) => void;
  /** Ctrl+D on an empty line at the REPL: a soft reset — the program runs again. */
  onSoftReset?: () => void;
  /** "Go to line 5": the editor shows the error's line (M9, screen 05). */
  onGoTo?: (file: string, line: number) => void;
  /** Tab: the names the line could go on with, as the editor offers them. */
  complete?: (line: string, pos: number) => { from: number; options: string[] } | null;
}

export function Console({ chunks, running, entry, onClear, board, tab = 'sim', onTab, repl, onType, onSoftReset, onGoTo, complete, problems }: ConsoleProps) {
  const showBoard = !!board && tab === 'board';
  const showProblems = !!problems && tab === 'problems';
  const count = problems?.cards.length ?? 0;
  const damaged = !!problems?.cards.some((c) => c.severity === 'damage');
  // while the board takes typing (M9), what it printed last without a newline — >>>, input()'s prompt — is where to type
  const typing = !showBoard && !!onType && (running || !!repl);
  const lastChunk = chunks.at(-1);
  const cut = typing && lastChunk?.kind === 'out' && !lastChunk.text.endsWith('\n') ? lastChunk.text.lastIndexOf('\n') + 1 : -1;
  const prompt = cut >= 0 ? lastChunk!.text.slice(cut) : '';
  const simChunks = cut >= 0 ? [...chunks.slice(0, -1), ...(cut ? [{ ...lastChunk!, text: lastChunk!.text.slice(0, cut) }] : [])] : chunks;
  const shown: BoardChunk[] = showBoard ? board.chunks : simChunks;
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
        {board || problems ? (
          <div role="tablist" aria-label="Consoles" className="ctabs">
            <button type="button" role="tab" aria-selected={!showBoard && !showProblems} className={`ctab${showBoard || showProblems ? '' : ' on'}`} onClick={() => onTab?.('sim')}>
              <Icon name="term" size={14} /> {board ? 'Simulator' : 'Console'}
            </button>
            {board && (
              <button type="button" role="tab" aria-selected={showBoard} className={`ctab board${showBoard ? ' on' : ''}${board.state ? ' live' : ''}`} onClick={() => onTab?.('board')}>
                <span className="dot" /> {board.label}
              </button>
            )}
            {problems && (
              <button type="button" role="tab" aria-selected={showProblems} className={`ctab${showProblems ? ' on' : ''}`} onClick={() => onTab?.('problems')}>
                <Icon name="warn" size={14} /> Problems{count > 0 && <span className={damaged ? 'count bad' : 'count'} aria-label={`, ${count}`}>{count}</span>}
              </button>
            )}
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
        {showProblems
          ? <button type="button" className="btn ghost sm" onClick={problems.onClear} disabled={count === 0}>Clear</button>
          : <button type="button" className="btn ghost sm" onClick={showBoard ? board.onClear : onClear} disabled={shown.length === 0}>Clear</button>}
      </div>
      {showProblems ? (
        <div className="cbody problems-body" role="region" aria-label="Problems in the circuit">
          <ProblemsList cards={problems.cards} onShow={problems.onShow} onReplace={problems.onReplace} />
        </div>
      ) : (<>
      <div className="cbody" ref={body} role="log" aria-label={showBoard ? `Console of the ${board.name}` : 'Console'} aria-live="polite" tabIndex={showBoard ? 0 : undefined}
        onScroll={(e) => { const el = e.currentTarget; atEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24; }}>
        {shown.length === 0
          ? <span className="sys">{showBoard ? `What the ${board.name} prints appears here.` : 'Press Run to start the simulation. print() output and errors appear here.'}</span>
          : shown.map((c, i) => (c.kind === 'why' && 'why' in c && c.why
            ? <Why key={i} why={c.why as Explanation} onGoTo={onGoTo} />
            : <span key={i} className={c.kind === 'out' ? undefined : c.kind}>{c.kind === 'sent' ? `✓ ${c.text}` : c.text}</span>))}
      </div>
      {showBoard ? <BoardPrompt board={board} live={!!live} />
        : typing ? <SimPrompt prompt={prompt} atRepl={!!repl} running={running} entry={entry} onType={onType!} onSoftReset={repl ? onSoftReset : undefined} complete={complete} />
        : (
          <div className="prompt">
            {running
              ? <><b className="live"><Icon name="play" size={12} /></b><span>Running {entry} — Stop ends it at once</span></>
              : <><b>&gt;&gt;&gt;</b><span>Press Run to run {entry}; when it ends, its REPL is here</span></>}
          </div>
        )}
      </>)}
    </div>
  );
}

/** What an error means (screen 05): beside MicroPython's message, for students; Go to line puts the editor there. */
function Why({ why, onGoTo }: { why: Explanation; onGoTo?: (file: string, line: number) => void }) {
  return (
    <div className="explain" role="note" aria-label={`What the ${why.type} means`}>
      <b>What this means:</b> {rich(why.text)}
      {why.file && why.line && onGoTo && (
        <div className="row">
          <button type="button" className="btn sm primary" onClick={() => onGoTo(why.file!, why.line!)}>Go to line {why.line}</button>
        </div>
      )}
    </div>
  );
}

/** `code` and **bold** in an explanation. */
export function rich(text: string): ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/).map((part, i) => (part.startsWith('`') && part.length > 1 ? <code key={i}>{part.slice(1, -1)}</code>
    : part.startsWith('**') && part.length > 3 ? <b key={i}>{part.slice(2, -2)}</b> : part));
}

/**
 * Where to type to the simulated board (M9, screen 29c): after input()'s prompt, or >>> / ... at the REPL. Enter
 * sends the line; ↑ and ↓ go through what was typed; Tab completes a name; Ctrl+C interrupts; Ctrl+D on an empty
 * line at the REPL runs the program again. After a line ending in ":", the next ... line starts indented.
 */
function SimPrompt({ prompt, atRepl, running, entry, onType, onSoftReset, complete }: {
  prompt: string; atRepl: boolean; running: boolean; entry: string; onType: (text: string) => void; onSoftReset?: () => void;
  complete?: ConsoleProps['complete'];
}) {
  const [line, setLine] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [at, setAt] = useState<number | null>(null);
  const [hint, setHint] = useState('');
  const indent = useRef('');
  const repl = prompt === '>>> ' || prompt === '... ';
  // a block's next line starts where the last one did (4 more after a ":"), as MicroPython's auto-indent does
  useEffect(() => {
    if (prompt === '... ') setLine((l) => l || indent.current);
    if (prompt === '>>> ') indent.current = '';
  }, [prompt]);

  const send = () => {
    onType(line);
    if (line.trim()) setHistory((h) => (h.at(-1) === line ? h : [...h, line].slice(-100)));
    const lead = /^\s*/.exec(line)![0];
    indent.current = line.trimEnd().endsWith(':') ? `${lead}    ` : line.trim() && prompt === '... ' ? lead : '';
    setLine('');
    setAt(null);
    setHint('');
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const input = e.target as HTMLInputElement;
    if (e.ctrlKey && e.key === 'c' && input.selectionStart === input.selectionEnd) {
      e.preventDefault();
      onType('\x03');
      setLine('');
      indent.current = '';
    } else if (e.ctrlKey && e.key === 'd' && !line && onSoftReset) {
      e.preventDefault();
      onSoftReset();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (!history.length) return;
      e.preventDefault();
      const next = e.key === 'ArrowUp' ? Math.max(0, (at ?? history.length) - 1) : (at ?? history.length) + 1;
      if (next >= history.length) { setAt(null); setLine(''); } else { setAt(next); setLine(history[next]!); }
    } else if (e.key === 'Tab' && complete && !e.shiftKey) {
      const pos = input.selectionStart ?? line.length;
      if (!line.slice(0, pos).trim()) { e.preventDefault(); setLine(`${line.slice(0, pos)}    ${line.slice(pos)}`); return; }
      e.preventDefault();
      const r = complete(line, pos);
      if (!r || !r.options.length) return;
      const typedPart = line.slice(r.from, pos);
      const common = r.options.reduce((a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return a.slice(0, i); });
      if (common.length > typedPart.length) setLine(line.slice(0, r.from) + common + line.slice(pos));
      setHint(r.options.length > 1 ? r.options.slice(0, 12).join('  ') + (r.options.length > 12 ? '  …' : '') : '');
    }
  };
  // named for where the session is — the program, or its REPL — not for what is printed now (a line that runs prints none)
  const label = atRepl ? 'Python for the simulated board' : `Type for ${entry}: input() reads it`;
  return (
    <div className="prompt sim" onKeyDown={onKeyDown}>
      {hint && <div className="hint">{hint}</div>}
      <div className="row">
        {repl ? <b>{prompt.trim()}</b> : prompt ? <span className="asks">{prompt}</span> : running ? <b className="live"><Icon name="play" size={12} /></b> : null}
        <TextField label={label} hideLabel mono value={line} onChange={(v) => { setLine(v); setHint(''); }} onEnter={send}
          placeholder={repl ? (prompt === '... ' ? 'An empty line runs the block' : 'Type Python and press Enter') : prompt ? 'Type the answer and press Enter'
            : atRepl ? 'A line runs — Ctrl+C stops it' : `Running ${entry} — what you type here goes to input(); Stop ends it`} />
      </div>
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
