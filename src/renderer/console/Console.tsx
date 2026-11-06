import { useLayoutEffect, useRef } from 'react';
import { Icon } from '../ui/Icon';
import type { ConsoleChunk } from '../app/useRun';
import './console.css';

/**
 * The console (F-23, screen 03): what the board prints, the app's notes in grey, errors in red; it follows the end
 * while new text comes, unless the student has scrolled up to read. The REPL comes in M9.
 */
export interface ConsoleProps {
  chunks: ConsoleChunk[];
  running: boolean;
  entry: string;
  onClear: () => void;
}

export function Console({ chunks, running, entry, onClear }: ConsoleProps) {
  const body = useRef<HTMLDivElement>(null);
  const atEnd = useRef(true);
  useLayoutEffect(() => {
    const el = body.current;
    if (el && atEnd.current) el.scrollTop = el.scrollHeight;
  }, [chunks]);

  return (
    <div className="console">
      <div className="chead">
        <span className="ctab on"><Icon name="term" size={14} /> Console</span>
        <span className="spacer" />
        <button type="button" className="btn ghost sm" onClick={onClear} disabled={chunks.length === 0}>Clear</button>
      </div>
      <div className="cbody" ref={body} role="log" aria-label="Console" aria-live="polite"
        onScroll={(e) => { const el = e.currentTarget; atEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24; }}>
        {chunks.length === 0
          ? <span className="sys">Press Run to start the simulation. print() output and errors appear here.</span>
          : chunks.map((c, i) => <span key={i} className={c.kind === 'out' ? undefined : c.kind}>{c.text}</span>)}
      </div>
      <div className="prompt">
        {running
          ? <><b className="live"><Icon name="play" size={12} /></b><span>Running {entry} — Stop ends it at once</span></>
          : <><b>&gt;&gt;&gt;</b><span>The REPL comes later; press Run to run {entry}</span></>}
      </div>
    </div>
  );
}
