import type { BoardId, NewProjectBoard } from '@lib/boards';
import { Icon } from '../ui';
import type { RecentItem, Recovered } from './api';
import { BOARD_ART, BOARD_CARDS, BOARD_CHIPS } from './boards';
import { whenText } from './when';

/**
 * The Start screen (01): a new project from the board the student will use (F-01), open a .mlab (F-02), the
 * recent projects (F-05, M5.7) — and, when MicroLab ended with changes not saved, that project offered back (F-03).
 */
export interface StartPageProps {
  onNew: (board: NewProjectBoard) => void;
  /** A new Python 3 file (M12, F-90, screen 31): the first card in the row. */
  onNewPython: () => void;
  /** Open…: a project or a .py file, whichever is chosen. */
  onOpen: () => void;
  recent?: RecentItem[];
  onOpenRecent?: (item: RecentItem) => void;
  onForget?: (item: RecentItem) => void;
  /** A project with unsaved changes from when MicroLab last ended (F-03). */
  recovered?: Recovered | null;
  onRecover?: () => void;
  onDiscard?: () => void;
}

export function StartPage({ onNew, onNewPython, onOpen, recent = [], onOpenRecent, onForget, recovered, onRecover, onDiscard }: StartPageProps) {
  return (
    <main className="start">
      <div className="start-main">
        {recovered && (
          <div className="card recover-card" role="alert">
            <span className="ri"><Icon name="restart" /></span>
            <div className="about">
              <h2>Your changes to “{recovered.name}” were kept</h2>
              <span className="small muted">MicroLab closed before they were saved ({whenText(recovered.at).replace(/^Today /, 'today at ')}). Get them back, or let them go.</span>
            </div>
            <button type="button" className="btn" onClick={onDiscard}>Let them go</button>
            <button type="button" className="btn primary" onClick={onRecover}>Get them back</button>
          </div>
        )}
        <div>
          <h1>Start something new</h1>
          <p className="muted">Python on this computer, or a board in the simulator — the breadboard and a starter <code>main.py</code> are ready for you.</p>
        </div>
        <div className="bcards">
          <div className="card bcard">
            <div className="art"><PyCardArt /></div>
            <div className="about"><b><span className="pyicon" aria-hidden="true">&gt;_</span> Python 3</b><span className="small muted">As in IDLE: turtle, tkinter, libraries</span></div>
            <span className="small muted mono">print("Hello!")</span>
            <button type="button" className="btn" onClick={onNewPython}><Icon name="plus" size={14} /> New Python file</button>
          </div>
          {BOARD_CARDS.map((b) => (
            <div key={b.id} className="card bcard">
              <div className="art"><img src={b.art} alt={b.title} draggable={false} /></div>
              <div className="about"><b>{b.title}</b><span className="small muted">{b.about}</span></div>
              <span className="small muted mono">{b.imports}</span>
              <button type="button" className="btn" onClick={() => onNew(b.id)}><Icon name="plus" size={14} /> New {b.short} project</button>
            </div>
          ))}
        </div>
        <section className="card recent-card" aria-label="Recent">
          <div className="rh">
            <h2>Recent</h2>
            <button type="button" className="btn ghost sm link" onClick={onOpen}><Icon name="folder" size={14} /> Open a project or a .py file…</button>
          </div>
          {recent.length === 0 ? (
            <p className="small muted empty">The projects and Python files you open or save show here. A <code>.mlab</code> project or a <code>.py</code> file — yours, or your teacher's — opens with <b>Open a project or a .py file…</b></p>
          ) : (
            <ul>
              {recent.map((r) => (
                <li key={r.path} className={r.missing ? 'missing' : undefined}>
                  <button type="button" className="row-btn" disabled={r.missing} title={r.missing ? `${r.where} is no longer there` : r.path}
                    onClick={() => onOpenRecent?.(r)}>
                    <span className="pic">{r.board === PYTHON3 ? <span className="pyicon big" aria-hidden="true">&gt;_</span> : <img src={BOARD_ART[r.board as BoardId]} alt="" draggable={false} />}</span>
                    <span className="nm"><b>{r.board === PYTHON3 ? `${r.name}.py` : r.name}</b><span className="mono tiny muted">{r.missing ? `${r.where} — no longer there` : r.where}</span></span>
                    <span className={r.board === PYTHON3 ? 'chip py' : 'chip'}>{r.board === PYTHON3 ? 'Python 3' : BOARD_CHIPS[r.board as BoardId] ?? r.board}</span>
                    <span className="small muted when">{whenText(r.at)}</span>
                  </button>
                  {r.missing && <button type="button" className="btn ghost sm" onClick={() => onForget?.(r)}>Take off the list</button>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

/** A recent item that is a Python 3 file (M12): the recent list keeps it with "python3" as its board. */
export const PYTHON3 = 'python3';

/** The Python 3 card's picture (screen 31): a small editor with a few lines of turtle, and the spiral they draw. */
function PyCardArt() {
  const colours = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#32ade6', '#af52de'];
  const segs: React.ReactNode[] = [];
  let x = 212;
  let y = 68;
  let a = 0;
  for (let i = 0; i < 54; i++) {
    const nx = x + i * 1.05 * Math.cos((a * Math.PI) / 180);
    const ny = y - i * 1.05 * Math.sin((a * Math.PI) / 180);
    segs.push(<line key={i} x1={x.toFixed(1)} y1={y.toFixed(1)} x2={nx.toFixed(1)} y2={ny.toFixed(1)} stroke={colours[i % 6]} strokeWidth={1.4} />);
    [x, y, a] = [nx, ny, a + 59];
  }
  const lines: [string, string, string][] = [['#c678dd', 'import', ' turtle'], ['#61afef', 't', ' = turtle.Turtle()'], ['#c678dd', 'for', ' i in range(60):'],
    ['#e5c07b', '    t', '.forward(i * 3)'], ['#e5c07b', '    t', '.left(59)']];
  return (
    <svg viewBox="0 0 270 135" role="img" aria-label="Python 3: a turtle program and the spiral it draws" style={{ width: '100%', height: '100%' }}>
      <rect x="8" y="10" width="150" height="112" rx="9" fill="#1f2430" />
      <circle cx="20" cy="21" r="3.2" fill="#ff5f57" /><circle cx="30" cy="21" r="3.2" fill="#febc2e" /><circle cx="40" cy="21" r="3.2" fill="#28c840" />
      {lines.map(([c, k, rest], i) => (
        <text key={i} x="18" y={42 + i * 15} fontSize="9.5" fontFamily="JetBrains Mono, monospace" fill={c} xmlSpace="preserve">{k}<tspan fill="#d7dae0">{rest}</tspan></text>
      ))}
      {segs}
    </svg>
  );
}
