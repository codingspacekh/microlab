import { useEffect, useState } from 'react';
import { newProject, projectNameProblem, type ProjectDoc } from '@lib/project';
import type { MicrolabApi, PyProjectOpen } from './api';
import { Dialog, Icon, TextField } from '../ui';

/**
 * New project (M12 Rev 11, F-100, screen 31e): its name and where it goes, asked before it opens — for Python and
 * for boards alike, "just like in PyCharm, not a single file everywhere" (the teacher). The location starts at
 * MicroLab's folder in Documents every time — never at the last one chosen, which on a computer everyone uses would
 * be someone else's; Choose… opens the computer's folder window. The line below says what will be made.
 */
export type NewKind = { python: true } | { board: Parameters<typeof newProject>[0]; title: string };

/** "…/Documents/MicroLab/Sokha" as "Documents/MicroLab/Sokha": where it is, from the user's Documents. */
export const shortPath = (p: string) => {
  const m = /[\\/](Documents[\\/].*|Documents)$/.exec(p);
  return (m ? m[1]! : p).replace(/\\/g, '/');
};

export function NewProject({ api, kind, onCancel, onPython, onBoard }: {
  api: MicrolabApi;
  kind: NewKind;
  onCancel: () => void;
  onPython: (r: Extract<PyProjectOpen, { ok: true }>) => void;
  onBoard: (made: { doc: ProjectDoc; path: string; name: string }) => void;
}) {
  const python = 'python' in kind;
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void api.projects.home().then(setLocation); }, [api]);

  const wrong = projectNameProblem(name);
  const made = `${shortPath(location)}/${name.trim() || '…'}${python ? '' : '.mlab'}`;
  const choose = async () => {
    const chosen = await api.projects.choose(location);
    if (chosen) { setLocation(chosen); setProblem(null); }
  };
  const create = async () => {
    setTried(true);
    if (wrong || !location || busy) return;
    setBusy(true);
    if (python) {
      const r = await api.projects.newPython(location, name);
      setBusy(false);
      if (r.ok) onPython(r); else setProblem(r.message);
    } else {
      const doc = newProject(kind.board);
      const r = await api.projects.newBoard(location, name, doc);
      setBusy(false);
      if (r.ok) onBoard({ doc, path: r.path, name: r.name }); else if ('message' in r) setProblem(r.message);
    }
  };
  return (
    <Dialog role="dialog" width={600} title={python ? 'New Python project' : `New ${kind.title} project`} icon={<Icon name="folderplus" />} onCancel={onCancel}
      actions={[{ label: 'Cancel', onClick: onCancel }, { label: 'Create project', primary: true, onClick: () => void create(), disabled: busy }]}>
      <div className="newproj">
        <TextField label="Project name" value={name} autoFocus onEnter={() => void create()} placeholder={python ? 'guessing_game' : 'Traffic lights'}
          onChange={(v) => { setName(v); setProblem(null); }} error={(tried || name) && wrong ? wrong : problem ?? undefined} />
        <div className="loc">
          <TextField label="Location" mono icon="folder" value={shortPath(location)} onChange={() => {}} disabled />
          <button type="button" className="btn" onClick={() => void choose()}>Choose…</button>
        </div>
        <p className="made note" role="status">
          <Icon name="info" size={14} />
          <span>{python
            ? <>MicroLab will make the folder <b className="mono">{made}</b> with <code>main.py</code> in it. Everything for this project goes in that folder.</>
            : <>MicroLab will save the project as <b className="mono">{made}</b>: its circuit and its files, together.</>}</span>
        </p>
        <p className="small muted tip">
          On a computer others use too: keep your projects in a folder with your name — <b>Choose…</b>, then your folder (or <i>New Folder</i> the first
          time). The location starts here each time, so you never save into the last person's folder by mistake.
        </p>
      </div>
    </Dialog>
  );
}
