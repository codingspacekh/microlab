import { useMemo, useRef, useState, type ReactNode } from 'react';
import { printNames } from '@lib/plot';
import { Console, type ConsoleTab } from '../console/Console';
import { CodeEditor } from '../editor/CodeEditor';
import { useEditorLook, lookAttrs, EditorPrefs } from '../editor/EditorPrefs';
import { Icon } from '../ui/Icon';
import type { MicrolabApi } from '../app/api';
import type { PyRunState } from './usePython';
import { SHELL_MAX, SHELL_MIN, useShellPlace, type ShellLayout } from './useShellPlace';
import { python3Assist } from './assist';
import './python3.css';

/**
 * The Python 3 screen (M12, F-91, F-92; Rev 11, F-98, F-101; screens 31b, 31f): the project's tree on the left, its
 * files open in tabs (unsaved: a dot), the editor, and the shell — below it or on its right, resized by the edge
 * between: what the program prints, input() answered on its last line, then >>> in its names — with the Plotter
 * beside it. Run, Stop, the file's name and Save are in the top bar.
 */
export interface PyTab {
  /** Stays the same while the tab is open (a file renamed keeps its tab). */
  key: number;
  /** The file, in its project. */
  path: string;
  text: string;
  /** The text as last saved (or opened). */
  saved: string;
}

/** "main.py": a tab's file's name. */
export const fileName = (t: Pick<PyTab, 'path'>) => t.path.split(/[\\/]/).pop() ?? t.path;

export function PythonScreen({ api, side, tabs, at, onAt, onText, onClose, run, running, onType, onRerun, onClear, onClearPlot }: {
  api: MicrolabApi;
  /** The project's tree (Rev 11). */
  side?: ReactNode;
  tabs: PyTab[]; at: number; onAt: (i: number) => void; onText: (text: string) => void;
  onClose: (i: number) => void;
  run: PyRunState; running: boolean; onType: (text: string) => void; onRerun: () => void;
  onClear: () => void; onClearPlot: () => void;
}) {
  const [look, setLook] = useEditorLook(api);
  const [tab, setTab] = useState<ConsoleTab>('sim');
  const [goTo, setGoTo] = useState<{ file: string; line: number }>();
  // help while typing (F-97): asked for the file shown, by its path
  const where = useRef('');
  const [layout, setLayout] = useShellPlace(api);
  const assist = useMemo(() => python3Assist(api, () => where.current), [api]);
  const shown = tabs[at];
  const label = shown ? fileName(shown) : '';
  where.current = shown?.path ?? '';
  const names = shown && run.plot.width ? printNames(shown.text, run.plot.width) : null;
  // the error's line, in the file it was in (the runner names it by its path)
  const error = !running && run.ended?.ended === 'error' && run.ended.error ? run.ended.error : undefined;
  const errorHere = shown && error && error.file === shown.path ? error.line ?? undefined : undefined;
  return (
    <main className="pyscreen" aria-label="Python 3" {...lookAttrs(look)}>
      <div className="pybody">
      {side}
      <ShellSplit layout={layout} onLayout={setLayout}>
      <div className="pycol">
      <div className="pytabs" role="tablist" aria-label="Python files">
        {tabs.map((t, i) => (
          <span key={t.key} className={i === at ? 'pytab on' : 'pytab'}>
            <button type="button" role="tab" aria-selected={i === at} title={t.path} onClick={() => onAt(i)}>
              <Icon name="file" size={14} /> {fileName(t)}{t.text !== t.saved && <span className="dirty" title="Not saved" />}
            </button>
            <button type="button" className="btn ghost icon sm close" aria-label={`Close ${fileName(t)}`} onClick={() => onClose(i)}><Icon name="x" size={12} /></button>
          </span>
        ))}
        <span className="spacer" />
        <EditorPrefs look={look} onLook={setLook} />
      </div>
      <div className="pyed">
        {shown
          ? <CodeEditor key={shown.key} label={label} size={look.size} value={shown.text} onChange={onText}
              errorLine={errorHere} goTo={goTo?.file === shown.path ? goTo : undefined} assist={assist} />
          : <p className="pyempty small muted">Open a file from the project on the left — a double-click — or make one with <b>New file</b>.</p>}
      </div>
      </div>
      <div className="pyshell" style={{ flexBasis: `${Math.round(layout.size * 100)}%` }}>
        <Console name="Shell" chunks={run.console} running={running} entry={run.file ?? label} onClear={onClear}
          idleText={shown ? `Press Run (F5) to run ${label}. What it prints, and its errors, come here — and after it, >>> with its names.` : 'What a program prints, and its errors, come here.'}
          tab={tab} onTab={setTab} repl={run.repl} onType={onType} onSoftReset={onRerun}
          complete={run.repl ? (line, pos) => {
            // Tab at >>> (F-92): what finishes the name before the cursor, from the program's own names
            const typed = /[\w.]*$/.exec(line.slice(0, pos))![0];
            return api.python3.shellComplete(typed).then((options) => ({ from: pos - typed.length, options }));
          } : undefined}
          onGoTo={(file, line) => setGoTo({ file, line })}
          plot={{ data: run.plot, names, ...(run.startedAt ? { startedAt: run.startedAt } : {}), onClear: onClearPlot }}
          headExtra={(
            <span className="dock" role="group" aria-label="Where the shell is">
              {(['below', 'right'] as const).map((p) => (
                <button key={p} type="button" className={`btn ghost sm icon${layout.place === p ? ' on' : ''}`} aria-pressed={layout.place === p}
                  aria-label={p === 'below' ? 'Shell below the editor' : 'Shell on the right'} title={p === 'below' ? 'Shell below the editor' : 'Shell on the right'}
                  onClick={() => setLayout({ ...layout, place: p })}>
                  <Icon name={p === 'below' ? 'shellbelow' : 'shellright'} size={14} />
                </button>
              ))}
            </span>
          )} />
      </div>
      </ShellSplit>
      </div>
    </main>
  );
}

/**
 * The editor and the shell side by side or one above the other (F-98, screens 31b, 31f), and the edge between them:
 * dragged with the mouse, or moved with the arrow keys (Home / End: the smallest and largest shell). Its first child
 * is the editor's column, its last the shell; the edge goes between.
 */
function ShellSplit({ layout, onLayout, children }: { layout: ShellLayout; onLayout: (l: ShellLayout, save?: boolean) => void; children: React.ReactNode[] }) {
  const box = useRef<HTMLDivElement>(null);
  const right = layout.place === 'right';
  const [editor, shell] = children;
  const sizeAt = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return right ? (r.right - e.clientX) / r.width : (r.bottom - e.clientY) / r.height;
  };
  const step = (by: number) => onLayout({ ...layout, size: layout.size + by });
  return (
    <div ref={box} className={`pymain ${layout.place}`}>
      {editor}
      <div className="pygrip" role="separator" tabIndex={0} aria-label="The shell's size" aria-orientation={right ? 'vertical' : 'horizontal'}
        aria-valuemin={Math.round(SHELL_MIN[layout.place] * 100)} aria-valuemax={Math.round(SHELL_MAX * 100)} aria-valuenow={Math.round(layout.size * 100)}
        title={right ? 'Drag to make the shell wider or narrower' : 'Drag to make the shell taller or shorter'}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); e.currentTarget.classList.add('dragging'); }}
        onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) onLayout({ ...layout, size: sizeAt(e) }, false); }}
        onPointerUp={(e) => { e.currentTarget.classList.remove('dragging'); if (e.currentTarget.hasPointerCapture(e.pointerId)) { e.currentTarget.releasePointerCapture(e.pointerId); onLayout({ ...layout, size: sizeAt(e) }); } }}
        onKeyDown={(e) => {
          // the edge moves with the arrow towards the editor: the shell grows
          const grow: Record<string, number> = right ? { ArrowLeft: 1, ArrowRight: -1 } : { ArrowUp: 1, ArrowDown: -1 };
          const d = grow[e.key];
          if (d) { e.preventDefault(); step(d * 0.05); }
          else if (e.key === 'Home') { e.preventDefault(); onLayout({ ...layout, size: SHELL_MIN[layout.place] }); }
          else if (e.key === 'End') { e.preventDefault(); onLayout({ ...layout, size: SHELL_MAX }); }
        }} />
      {shell}
    </div>
  );
}
