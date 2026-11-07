import { useState } from 'react';
import { partKind } from '@lib/editor';
import { addLibrary, filesFor, isAdded, librariesFor, needsOf, wouldReplace, type Library } from '@lib/libpack';
import type { ProjectDoc } from '@lib/project';
import { PACK, readPack } from '../app/libpack';
import { BOARD_NAMES } from '../app/boards';
import { Dialog, Icon } from '../ui';
import type { BoardId } from '@lib/boards';

/**
 * Add a library (screen 22, M6.7, F-54): the library pack's drivers that run on the project's board — those for the
 * parts in its circuit first, each with who wrote it and its licence — and how to start with the chosen one, to
 * copy. Add puts its files in lib/ with its licence beside them; a file of the same name the student changed is
 * replaced only when they say so. Parts that need nothing (MicroPython's own modules) say so.
 */
export function AddLibrary({ doc, onDoc, onCopy, onClose }: {
  doc: ProjectDoc; onDoc: (doc: ProjectDoc) => void; onCopy: (text: string) => void; onClose: () => void;
}) {
  const board = doc.project.board;
  const libs = librariesFor(PACK, board);
  const usedBy = (lib: Library) => doc.project.parts.filter((p) => lib.parts.includes(p.type)).map((p) => p.id.toUpperCase());
  const mine = libs.filter((l) => usedBy(l).length);
  const other = libs.filter((l) => !usedBy(l).length);
  const builtIn = doc.project.parts.flatMap((p) => {
    const n = needsOf(PACK, p.type, board);
    return n?.kind === 'built-in' ? [{ part: p, modules: n.modules }] : [];
  });
  const [chosen, setChosen] = useState<string | undefined>((mine[0] ?? other[0])?.id);
  const [asking, setAsking] = useState<{ lib: Library; files: string[] } | null>(null);
  const shown = libs.find((l) => l.id === chosen);

  const add = (lib: Library) => {
    const replace = wouldReplace(doc, lib, readPack);
    if (replace.length) { setAsking({ lib, files: replace }); return; }
    onDoc(addLibrary(doc, lib, readPack));
  };

  const row = (lib: Library) => {
    const used = usedBy(lib);
    const added = isAdded(doc, lib, readPack);
    const replace = added ? [] : wouldReplace(doc, lib, readPack);
    const code = filesFor(lib, board).slice(0, -1).map(([, to]) => to.slice(4));
    const folder = code.every((f) => f.includes('/')) ? `${code[0]!.split('/')[0]}/ · ${code.length} files` : code.join(', ');
    return (
      <li key={lib.id} aria-label={lib.title} className={lib.id === chosen ? 'lib on' : 'lib'}>
        <button type="button" className="pick" aria-pressed={lib.id === chosen} onClick={() => setChosen(lib.id)}>
          <b>{lib.title}</b> <span className="mono tiny muted">{folder}</span>{used.length > 0 && <span className="for"> · {used.join(', ')}</span>}
        </button>
        <span className="act">
          {added ? <span className="pill ok"><Icon name="check" size={12} /> in lib/</span>
            : replace.length ? <button type="button" className="btn sm" aria-label={`Replace… ${lib.id}`} onClick={() => add(lib)}>Replace…</button>
              : <button type="button" className={lib.id === chosen ? 'btn sm primary' : 'btn sm'} aria-label={`Add ${lib.id}`} onClick={() => add(lib)}><Icon name="plus" size={12} /> Add</button>}
        </span>
        <span className="meta">
          {replace.length > 0 && <span className="warn-ink">Your {replace.join(', ')} {replace.length === 1 ? 'is' : 'are'} different — it would be replaced. </span>}
          {lib.licence} · {lib.authors} · <span className="src">{lib.source.replace('https://github.com/', '')}</span>
        </span>
      </li>
    );
  };

  return (
    <Dialog title="Add a library" role="dialog" width={960} icon={<Icon name="book" size={20} />} onCancel={onClose}
      note={<><Icon name="lock" size={14} /> In the app — no internet needed. Licences in <span className="mono">lib/LICENSE-…txt</span></>}
      actions={[{ label: 'Close', onClick: onClose }]}>
      <p className="small muted">
        <span className="pill">{BOARD_NAMES[board as BoardId] ?? board}</span>{' '}
        Drivers for the parts, as their authors wrote them. They go in <span className="mono">lib/</span> with their licence, and onto the board with <i>Send to board</i>.
      </p>
      {libs.length === 0 ? (
        <p className="small libnone">
          None of the library pack runs on the micro:bit: its MicroPython has no <span className="mono">machine.I2C</span> objects or numbered pins.
          Each part's example talks to the part itself (<span className="mono">microbit.i2c</span>, <span className="mono">pin0</span> …).
        </p>
      ) : (
        <div className="libs">
          <div className="liblist">
            {mine.length > 0 && (
              <>
                <div className="tag">For the parts in this circuit</div>
                <ul aria-label="For the parts in this circuit">{mine.map(row)}</ul>
              </>
            )}
            {builtIn.map(({ part, modules }) => (
              <p key={part.id} className="libnote"><Icon name="check" size={14} /> <span><b>{part.id.toUpperCase()} · {partKind(part.type).name}</b> needs nothing: <span className="mono">{modules.join(' and ')}</span> {modules.length === 1 ? 'is' : 'are'} part of MicroPython.</span></p>
            ))}
            {other.length > 0 && (
              <>
                <div className="tag">{mine.length ? 'Other parts' : 'For the parts'}</div>
                <ul aria-label="Other parts">{other.map(row)}</ul>
              </>
            )}
          </div>
          {shown && (
            <section className="libstart" aria-label={`How to start with ${shown.id}`}>
              <div className="ph"><Icon name="file" size={14} /> <b>How to start</b> <span className="muted">· {shown.id}</span><span className="spacer" />
                <button type="button" className="btn ghost sm" onClick={() => onCopy(shown.use[board as keyof typeof shown.use] ?? '')}><Icon name="copy" size={12} /> Copy</button></div>
              <pre className="mono">{shown.use[board as keyof typeof shown.use]}</pre>
              <p className="small muted">{shown.summary}</p>
            </section>
          )}
        </div>
      )}
      {asking && (
        <Dialog title={`Replace your ${asking.files[0]}?`} width={460} onCancel={() => setAsking(null)}
          actions={[
            { label: 'Keep mine', onClick: () => setAsking(null) },
            { label: 'Replace it', danger: true, onClick: () => { onDoc(addLibrary(doc, asking.lib, readPack)); setAsking(null); } },
          ]}>
          <p className="small">{asking.files.join(', ')} {asking.files.length === 1 ? 'is' : 'are'} not the {asking.lib.id} library's own. Adding it puts the library's {asking.files.length === 1 ? 'file' : 'files'} there instead; your changes are lost.</p>
        </Dialog>
      )}
    </Dialog>
  );
}

/** The inspector's Library line (screen 22b): what the part needs on the project's board. */
export function LibraryLine({ doc, type, onDoc }: { doc: ProjectDoc; type: string; onDoc: (doc: ProjectDoc) => void }) {
  const board = doc.project.board;
  const need = needsOf(PACK, type, board);
  const elsewhere = !need && PACK.libraries.some((l) => l.parts.includes(type));
  if (!need && !elsewhere) return null;
  let body: React.ReactNode;
  if (need?.kind === 'library') {
    const lib = need.library;
    body = isAdded(doc, lib, readPack)
      ? <span className="row small" style={{ gap: 6 }}><span className="pill ok"><Icon name="check" size={12} /> {lib.id}</span>{' '}<span className="muted">in lib/ · {lib.licence}</span></span>
      : <span className="row small" style={{ gap: 6 }}><span className="mono">{lib.id}</span><span className="muted">{lib.licence}</span><span className="spacer" />
        <button type="button" className="btn sm primary" aria-label={`Add the ${lib.id} library`} onClick={() => {
          const ok = wouldReplace(doc, lib, readPack).length === 0;
          if (ok) onDoc(addLibrary(doc, lib, readPack));
        }} disabled={wouldReplace(doc, lib, readPack).length > 0} title={wouldReplace(doc, lib, readPack).length ? 'You have your own file of that name: use Add a library to replace it' : undefined}><Icon name="plus" size={12} /> Add</button></span>;
  } else if (need?.kind === 'built-in') {
    body = <span className="small">None needed: <span className="mono">{need.modules.join(', ')}</span> {need.modules.length === 1 ? 'is' : 'are'} part of MicroPython</span>;
  } else {
    body = <span className="small">None for the micro:bit — its example talks to the part itself</span>;
  }
  return <div className="prop" role="group" aria-label="Library"><span>Library</span><div className="pv">{body}</div></div>;
}
