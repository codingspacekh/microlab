import type { NewProjectBoard } from '@lib/boards';
import { Icon } from '../ui';
import { BOARD_CARDS } from './boards';

/**
 * The Start screen (01, M4.2 minimal): a new project from the board the student will use (F-01), open a .mlab
 * (F-02), and the ways into Learn and Examples. Recent projects (F-05) join it in M5.
 */
export interface StartPageProps {
  onNew: (board: NewProjectBoard) => void;
  onOpen: () => void;
  onLearn: () => void;
  onExamples: () => void;
}

export function StartPage({ onNew, onOpen, onLearn, onExamples }: StartPageProps) {
  return (
    <main className="start">
      <div className="start-main">
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
        <div className="card open-card">
          <span className="ri"><Icon name="folder" /></span>
          <div className="about">
            <h2>Open a project</h2>
            <span className="small muted">A <code>.mlab</code> file — one of yours, or a starter project from your teacher.</span>
          </div>
          <button type="button" className="btn primary" onClick={onOpen}><Icon name="folder" size={14} /> Open a project…</button>
        </div>
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
