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
  onOpen: () => void;
  onLearn: () => void;
  onExamples: () => void;
  recent?: RecentItem[];
  onOpenRecent?: (item: RecentItem) => void;
  onForget?: (item: RecentItem) => void;
  /** A project with unsaved changes from when MicroLab last ended (F-03). */
  recovered?: Recovered | null;
  onRecover?: () => void;
  onDiscard?: () => void;
}

export function StartPage({ onNew, onOpen, onLearn, onExamples, recent = [], onOpenRecent, onForget, recovered, onRecover, onDiscard }: StartPageProps) {
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
          <h1>Start a new project</h1>
          <p className="muted">Choose the board you'll use. The breadboard and a starter <code>main.py</code> are ready for you.</p>
        </div>
        <div className="bcards">
          {BOARD_CARDS.map((b) => (
            <div key={b.id} className="card bcard">
              <div className="art"><img src={b.art} alt={b.title} draggable={false} /></div>
              <div className="about"><b>{b.title}</b><span className="small muted">{b.about}</span></div>
              <span className="small muted mono">{b.imports}</span>
              <button type="button" className="btn" onClick={() => onNew(b.id)}><Icon name="plus" size={14} /> New {b.short} project</button>
            </div>
          ))}
        </div>
        <section className="card recent-card" aria-label="Recent projects">
          <div className="rh">
            <h2>Recent projects</h2>
            <button type="button" className="btn ghost sm link" onClick={onOpen}><Icon name="folder" size={14} /> Open a project…</button>
          </div>
          {recent.length === 0 ? (
            <p className="small muted empty">The projects you open or save show here. A <code>.mlab</code> file — one of yours, or a starter project from your teacher — opens with <b>Open a project…</b></p>
          ) : (
            <ul>
              {recent.map((r) => (
                <li key={r.path} className={r.missing ? 'missing' : undefined}>
                  <button type="button" className="row-btn" disabled={r.missing} title={r.missing ? `${r.where} is no longer there` : r.path}
                    onClick={() => onOpenRecent?.(r)}>
                    <span className="pic"><img src={BOARD_ART[r.board as BoardId]} alt="" draggable={false} /></span>
                    <span className="nm"><b>{r.name}</b><span className="mono tiny muted">{r.missing ? `${r.where} — no longer there` : r.where}</span></span>
                    <span className="chip">{BOARD_CHIPS[r.board as BoardId] ?? r.board}</span>
                    <span className="small muted when">{whenText(r.at)}</span>
                  </button>
                  {r.missing && <button type="button" className="btn ghost sm" onClick={() => onForget?.(r)}>Take off the list</button>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <aside className="start-side">
        <div className="card side-card">
          <h2><Icon name="book" /> Learn</h2>
          <p className="small muted">How every part works, its pins, and how to connect it to your board.</p>
          <button type="button" className="btn" onClick={onLearn}>Open Learn</button>
        </div>
        <div className="card side-card">
          <h2><Icon name="bulb" /> Examples</h2>
          <p className="small muted">Ready projects to run and change.</p>
          <button type="button" className="btn" onClick={onExamples}>See the examples</button>
        </div>
        <div className="card side-card tip">
          <b className="small"><Icon name="bulb" size={12} /> Tip</b>
          <p className="small">A teacher's starter project is just a <code>.mlab</code> file: open it here and it's yours to change.</p>
        </div>
      </aside>
    </main>
  );
}
