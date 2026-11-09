import { useEffect, useRef, useState } from 'react';
import type { MicrolabApi, PyLibrary } from '../app/api';
import { Dialog } from '../ui/Dialog';
import { Icon } from '../ui/Icon';
import { TextField } from '../ui/TextField';

/**
 * Libraries for Python 3 (M12, F-95, screen 31d): those installed in MicroLab's own folder (every program sees them),
 * a library looked up by its name on PyPI — PyPI has no search for programs — or chosen from those often used in class;
 * Install (or Update) and Remove, with what pip says as it works; without the internet, said plainly, and a .whl file
 * from the teacher installs the same way. The summaries are PyPI's, as each library's authors wrote them.
 */
export const OFTEN_USED = ['numpy', 'matplotlib', 'pygame', 'pillow', 'requests'];

type Found = { ok: true; name: string; version: string; summary: string } | { ok: false; message: string; offline?: true };
const same = (a: string, b: string) => a.toLowerCase().replace(/[-_.]+/g, '-') === b.toLowerCase().replace(/[-_.]+/g, '-');

export function Libraries({ api, onClose, onChanged }: { api: MicrolabApi; onClose: () => void; onChanged?: (libs: PyLibrary[]) => void }) {
  const libs = api.python3.libs;
  const [installed, setInstalled] = useState<PyLibrary[]>([]);
  const [name, setName] = useState('');
  const [found, setFound] = useState<Found | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const log = useRef<HTMLPreElement>(null);

  const refresh = async () => {
    const list = await libs.list();
    setInstalled(list);
    onChanged?.(list);
  };
  useEffect(() => { void refresh(); }, []);
  useEffect(() => libs.onOutput((t) => setSaid((s) => s + t)), [libs]);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [said]);

  const lookUp = async (n = name) => {
    const want = n.trim();
    if (!want) return;
    setName(want);
    setProblem(null);
    setFound(null);
    const r = await libs.lookUp(want);
    setFound(r);
    setOnline(r.ok ? true : r.offline ? false : online);
  };
  const run = async (what: string, act: () => Promise<{ ok: true } | { ok: false; message: string } | { ok: false; canceled: true }>) => {
    setBusy(what);
    setSaid('');
    setProblem(null);
    const r = await act();
    setBusy(null);
    if (!r.ok && 'message' in r) setProblem(r.message);
    await refresh();
  };
  const there = found?.ok ? installed.find((l) => same(l.name, found.name)) : undefined;

  return (
    <Dialog role="dialog" title="Libraries for Python 3" width={720} onCancel={onClose} icon={<Icon name="grid" />}
      note={<span className="small muted">No internet? A teacher's <code>.whl</code> file installs the same way.</span>}
      actions={[
        { label: 'Install from a .whl file…', onClick: () => void run('a .whl file', () => libs.installFile()) },
        { label: 'Done', primary: true, onClick: onClose },
      ]}>
      <div className="pylibs">
        {online !== null && (
          <span className={online ? 'pill ok net' : 'pill warn net'}><Icon name={online ? 'check' : 'warn'} size={12} /> {online ? 'Connected to PyPI' : 'No internet'}</span>
        )}
        <div className="row look">
          <TextField label="A library's name on PyPI" hideLabel icon="search" value={name} onChange={setName} onEnter={() => void lookUp()}
            placeholder="A library's name, as on PyPI: numpy, pygame, requests…" />
          <button type="button" className="btn primary" disabled={!name.trim() || !!busy} onClick={() => void lookUp()}>Look up on PyPI</button>
        </div>
        <div className="row often">
          <span className="tiny muted">Often used in class:</span>
          {OFTEN_USED.map((n) => (
            <button key={n} type="button" className="pill btn-pill" disabled={!!busy} onClick={() => void lookUp(n)}>{n}</button>
          ))}
        </div>
        {found && (found.ok ? (
          <div className="pk found" role="group" aria-label={`${found.name} on PyPI`}>
            <b>{found.name}</b><span className="v">{found.version}</span><span className="d">{found.summary}</span>
            {there && there.version === found.version
              ? <button type="button" className="btn sm" disabled><Icon name="check" size={12} /> Installed</button>
              : <button type="button" className="btn sm" disabled={!!busy} onClick={() => void run(found.name, () => libs.install(found.name))}>
                  <Icon name="plus" size={12} /> {there ? `Update to ${found.version}` : 'Install'}
                </button>}
          </div>
        ) : <p className={found.offline ? 'note warn' : 'note'} role="alert">{found.message}</p>)}
        {(busy || said) && (
          <pre className="pipout" ref={log} role="log" aria-label="What pip says">{busy && !said ? `Installing ${busy}…` : said}</pre>
        )}
        {problem && <p className="note bad" role="alert">{problem}</p>}
        <div className="gh">Installed in MicroLab · {installed.length}</div>
        {installed.length === 0
          ? <p className="small muted">None yet. What you install goes in MicroLab's own folder — not into a Python on this computer — and every program you run sees it.</p>
          : (
            <ul className="pkgs" aria-label="Installed in MicroLab">
              {installed.map((l) => (
                <li key={l.name} className="pk">
                  <b>{l.name}</b><span className="v">{l.version}</span><span className="d">{l.summary}</span>
                  <button type="button" className="btn ghost sm" aria-label={`Remove ${l.name}`} disabled={!!busy}
                    onClick={() => void run(l.name, () => libs.remove(l.name))}><Icon name="trash" size={12} /> Remove</button>
                </li>
              ))}
            </ul>
          )}
      </div>
    </Dialog>
  );
}
