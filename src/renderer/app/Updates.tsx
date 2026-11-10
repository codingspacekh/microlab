import { useCallback, useEffect, useState } from 'react';
import type { UpdateState } from '@lib/updates';
import type { MicrolabApi } from './api';
import { Checkbox, Dialog, Icon } from '../ui';

/**
 * Updates in the window (M11, Rev 13, F-109; screens 34, 34b), as the gradebook and OneEditor show them. The main
 * process looks (when MicroLab opens, then every 6 hours) and says what there is; here: a note above the status bar
 * when there is something to say — one is out (What's new, Download), downloading, ready (Restart and update, or Later:
 * it goes in when MicroLab is next closed), a Mac's .dmg in Downloads, once "Updated to …" — and the Updates window.
 */
export function useUpdates(api: MicrolabApi) {
  const [state, setState] = useState<UpdateState | null>(null);
  /** Later pressed: the note waits until there is something new to say. */
  const [later, setLater] = useState(false);
  useEffect(() => {
    let live = true;
    void api.updates.get().then((s) => { if (live) setState(s); });
    const off = api.updates.onChange((s) => {
      setState((was) => { if (was?.status !== s.status) setLater(false); return s; });
    });
    return () => { live = false; off(); };
  }, [api]);
  const update = useCallback((p: Promise<UpdateState>) => { void p.then(setState); }, []);
  return { state, later, onLater: () => setLater(true), update };
}

export function UpdateNote({ api, state: s, later, onLater, onRestart, update }: ReturnType<typeof useUpdates> & { api: MicrolabApi; onRestart: () => void }) {
  const [notes, setNotes] = useState(false);
  if (!s || s.mode === 'off') return null;
  const shown = s.updatedTo !== null || s.status === 'available' || s.status === 'downloading' || (s.status === 'ready' && !later) || s.status === 'dmg';
  if (!shown) return null;
  return (
    <section className="unote" role="region" aria-label="Updates">
      {s.updatedTo !== null && s.status !== 'ready' ? (
        <>
          <Icon name="check" size={14} />
          <span><b>Updated to {s.updatedTo}.</b>{s.updatedNotes.length > 0 && <> New: {s.updatedNotes.join(' · ')}</>}</span>
          <span className="spacer" />
          <button type="button" className="btn sm" onClick={() => update(api.updates.seen())}>OK</button>
        </>
      ) : s.status === 'available' ? (
        <>
          <Icon name="info" size={14} />
          <span><b>MicroLab {s.version} is out.</b></span>
          <span className="spacer" />
          {s.notes.length > 0 && <button type="button" className="btn sm" aria-expanded={notes} onClick={() => setNotes((n) => !n)}>What's new</button>}
          <button type="button" className="btn sm primary" onClick={() => update(api.updates.download())}>Download</button>
        </>
      ) : s.status === 'downloading' ? (
        <>
          <Icon name="info" size={14} />
          <span>Downloading {s.version}… {s.percent} %</span>
          <span className="ubar" role="progressbar" aria-label={`Downloading ${s.version}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={s.percent}><i style={{ width: `${s.percent}%` }} /></span>
          <span className="tiny muted">keep working</span>
        </>
      ) : s.status === 'ready' ? (
        <>
          <Icon name="check" size={14} />
          <span><b>{s.version} is ready.</b> It goes in when you next close MicroLab, or now:</span>
          <span className="spacer" />
          <button type="button" className="btn sm" onClick={onLater}>Later</button>
          <button type="button" className="btn sm primary" onClick={onRestart}>Restart and update</button>
        </>
      ) : (
        <>
          <Icon name="info" size={14} />
          <span><b>MicroLab {s.version} is in Downloads.</b> Open it and drag MicroLab into Applications.</span>
          <span className="spacer" />
          <button type="button" className="btn sm" onClick={() => update(api.updates.showDmg())}>Show in Finder</button>
          <button type="button" className="btn sm primary" onClick={() => update(api.updates.openDmg())}>Open it</button>
        </>
      )}
      {notes && s.status === 'available' && <ul className="unotes">{s.notes.map((line, i) => <li key={i}>{line}</li>)}</ul>}
    </section>
  );
}

/** Check for Updates… (the app menu, Help, About): the version, a look at once, what is out, Download updates by itself. */
export function UpdatesWindow({ api, state: s, update, onRestart, onClose }: { api: MicrolabApi; state: UpdateState | null; update: (p: Promise<UpdateState>) => void; onRestart: () => void; onClose: () => void }) {
  useEffect(() => { update(api.updates.check()); }, [api, update]);
  const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const off = !s || s.mode === 'off';
  const action = s?.status === 'available' || (s?.status === 'error' && s.version)
    ? { label: 'Download', primary: true, onClick: () => update(api.updates.download()) }
    : s?.status === 'ready' ? { label: 'Restart and update', primary: true, onClick: onRestart } : null;
  return (
    <Dialog role="dialog" title="Updates" width={520} icon={<Icon name="restart" />} onCancel={onClose}
      actions={[
        ...(off ? [] : [{ label: 'Check now', onClick: () => update(api.updates.check()), disabled: s?.status === 'checking' || s?.status === 'downloading' }]),
        { label: 'Close', onClick: onClose, primary: !action },
        ...(action ? [action] : []),
      ]}>
      <div className="uwin">
        <p><b>MicroLab {s?.current ?? api.versions.app}</b></p>
        {off ? (
          <p className="small muted">Updates work only in the installed MicroLab (they are off when it runs from its source code).</p>
        ) : (
          <>
            <p className="small" role="status">
              {s!.status === 'checking' ? 'Looking for a newer version…'
                : s!.status === 'none' ? 'This is the newest version.'
                : s!.status === 'available' ? `MicroLab ${s!.version} is out.`
                : s!.status === 'downloading' ? `Downloading ${s!.version}… ${s!.percent} %`
                : s!.status === 'ready' ? `${s!.version} is ready: it goes in when you next close MicroLab.`
                : s!.status === 'dmg' ? `MicroLab ${s!.version} is in Downloads.`
                : s!.status === 'error' ? s!.error : ''}
              {s!.checkedAt && <><br /><span className="muted">Last looked: {when(s!.checkedAt)}.</span></>}
            </p>
            {s!.notes.length > 0 && s!.version && (
              <div className="box"><b>What's new in {s!.version}:</b><ul>{s!.notes.map((line, i) => <li key={i}>{line}</li>)}</ul></div>
            )}
            <Checkbox label="Download updates by itself" hint="It still goes in only when you restart MicroLab." value={s!.autoDownload}
              onChange={(on) => update(api.updates.setAuto(on))} />
          </>
        )}
      </div>
    </Dialog>
  );
}
