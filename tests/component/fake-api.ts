import { vi } from 'vitest';
import type { MicrolabApi, PyCompletion, PyEvent, PyLibrary, PyPlace, PySignature, RecentItem, Recovered, TreeEntry } from '../../src/renderer/app/api';

/** The preload's API for component tests: settings in memory, file choosers that answer as told, the app's close;
 *  the recent list and the recovery copy in memory, starting as `start` says (M5.7). */
/** The fake API, and (M12) what the Python 3 session would tell the window: `emitPy` sends it an event. */
export type FakeApi = MicrolabApi & { emitPy: (e: PyEvent) => void; disk: Map<string, string | null> };
/** Where new projects start (M12 Rev 11): MicroLab's folder in Documents. */
export const HOME = '/u/Documents/MicroLab';

export function fakeApi(project: Partial<MicrolabApi['project']> = {}, start: { recent?: RecentItem[]; recovery?: Recovered | null } = {},
  py: { pyfile?: Partial<MicrolabApi['pyfile']>; file?: Partial<MicrolabApi['file']>; libs?: Partial<MicrolabApi['python3']['libs']>; installed?: PyLibrary[];
    projects?: Partial<MicrolabApi['projects']>; disk?: Record<string, string | null> } = {}): FakeApi {
  // the computer's files (M12 Rev 11), in memory: a path → its text, or null for a folder
  const disk = new Map<string, string | null>(Object.entries(py.disk ?? {}));
  const dirOf = (p: string) => p.slice(0, p.lastIndexOf('/'));
  const under = (root: string) => [...disk.keys()].filter((k) => k.startsWith(`${root}/`));
  const tree = (root: string): TreeEntry[] => under(root).map((k) => ({ path: k.slice(root.length + 1), dir: disk.get(k) === null }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const projectOpened = (path: string) => {
    const isFile = typeof disk.get(path) === 'string';
    const root = isFile ? dirOf(path) : path;
    if (!disk.has(root) && !isFile) return { ok: false as const, message: `“${root.split('/').pop()}” isn't there any more.` };
    const file = isFile ? path : disk.has(`${root}/main.py`) ? `${root}/main.py` : undefined;
    return { ok: true as const, root, name: root.split('/').pop()!, ...(file ? { file: { path: file, text: disk.get(file)! } } : {}) };
  };
  // the libraries in MicroLab's folder (M12 slice 4): Install adds one, Remove takes it away; pip says a line
  let installed: PyLibrary[] = py.installed ?? [];
  const pipHandlers = new Set<(t: string) => void>();
  const stored: Record<string, unknown> = {};
  const pyHandlers = new Set<(e: PyEvent) => void>();
  const projectOpen = project.open ?? vi.fn(async () => ({ ok: false as const, canceled: true as const }));
  let recovered: Recovered | null = start.recovery ?? null;
  let recent: RecentItem[] = start.recent ?? [];
  return {
    versions: { app: '0.4.0', electron: '0' },
    settings: { get: vi.fn(async (k: string) => stored[k]), set: vi.fn(async (k: string, v: unknown) => { stored[k] = v; }) },
    project: {
      open: projectOpen,
      save: vi.fn(async () => ({ ok: false as const, canceled: true as const })),
      recent: vi.fn(async () => recent),
      openPath: vi.fn(async () => ({ ok: false as const, message: 'That file is no longer there.' })),
      forget: vi.fn(async (path: string) => { recent = recent.filter((r) => r.path !== path); }),
      ...project,
    },
    recovery: {
      get: vi.fn(async () => recovered),
      write: vi.fn(async (doc, about) => { recovered = { ...about, at: Date.now(), doc }; }),
      clear: vi.fn(async () => { recovered = null; }),
    },
    boards: { get: vi.fn(async () => ({ boards: [], drives: [] })), check: vi.fn(async () => {}), send: vi.fn(async () => ({ ok: false as const, message: 'no' })),
      install: vi.fn(async () => ({ ok: false as const, message: 'no' })),
      cancelInstall: vi.fn(async () => {}),
      onInstallStep: vi.fn(() => () => {}),
      files: {
        list: vi.fn(async () => ({ ok: false as const, message: 'no' })),
        read: vi.fn(async () => ({ ok: false as const, message: 'no' })),
        copy: vi.fn(async () => ({ ok: false as const, message: 'no' })),
        delete: vi.fn(async () => ({ ok: false as const, message: 'no' })),
        mkdir: vi.fn(async () => ({ ok: false as const, message: 'no' })),
        done: vi.fn(async () => {}),
      },
      console: { open: vi.fn(async () => ({ ok: true as const })), close: vi.fn(async () => {}), do: vi.fn(async () => {}), onOutput: vi.fn(() => () => {}) },
      onChange: vi.fn(() => () => {}) },
    app: { setDirty: vi.fn(), onCloseRequest: vi.fn(() => () => {}), close: vi.fn(), copy: vi.fn(async () => {}), openDriverPage: vi.fn(async () => {}), showFirmware: vi.fn(async () => {}) },
    pyfile: {
      save: vi.fn(async (text: string, o: { path?: string; name: string; from?: string }) => {
        const path = o.path ?? `${o.from ?? HOME}/copy of ${o.name}`;
        disk.set(path, text);
        return { ok: true as const, path, name: path.split('/').pop()! };
      }),
      ...py.pyfile,
    },
    projects: {
      home: vi.fn(async () => HOME),
      choose: vi.fn(async () => null),
      newPython: vi.fn(async (location: string, name: string) => {
        const root = `${location}/${name}`;
        if (disk.has(root)) return { ok: false as const, message: `There is already a project called “${name}” there: choose another name.` };
        disk.set(root, null);
        disk.set(`${root}/main.py`, 'print("Hello!")\n');
        return projectOpened(root);
      }),
      newBoard: vi.fn(async (location: string, name: string) => ({ ok: true as const, path: `${location}/${name}.mlab`, name })),
      openPython: vi.fn(async (path: string) => projectOpened(path)),
      tree: vi.fn(async (root: string) => tree(root)),
      newEntry: vi.fn(async (root: string, rel: string, kind: 'file' | 'folder') => {
        const full = `${root}/${rel}`;
        if (disk.has(full)) return { ok: false as const, message: `“${rel.split('/').pop()}” is already there.` };
        disk.set(full, kind === 'folder' ? null : '');
        return { ok: true as const, path: rel };
      }),
      rename: vi.fn(async (root: string, from: string, to: string) => {
        const a = `${root}/${from}`;
        const b = `${root}/${to}`;
        if (disk.has(b)) return { ok: false as const, message: `“${to.split('/').pop()}” is already there.` };
        for (const k of [a, ...under(a)]) { const v = disk.get(k)!; disk.delete(k); disk.set(b + k.slice(a.length), v); }
        return { ok: true as const, path: to };
      }),
      trash: vi.fn(async (root: string, rel: string) => { const a = `${root}/${rel}`; for (const k of [a, ...under(a)]) disk.delete(k); return { ok: true as const }; }),
      reveal: vi.fn(async () => {}),
      read: vi.fn(async (root: string, rel: string) => {
        const t = disk.get(`${root}/${rel}`);
        return typeof t === 'string' ? { ok: true as const, path: `${root}/${rel}`, name: rel.split('/').pop()!, text: t } : { ok: false as const, message: `“${rel}” isn't there any more.` };
      }),
      context: vi.fn(async () => null),
      onChanged: vi.fn(() => () => {}),
      ...py.projects,
    },
    // Open… on the Start page: a project goes through project.open, as the real dialog's .mlab does (M12)
    file: { open: vi.fn(async (): ReturnType<MicrolabApi['file']['open']> => { const r = await projectOpen(); return { kind: 'mlab' as const, ...r }; }), ...py.file },
    python3: {
      run: vi.fn(async () => ({ ok: true as const, version: '3.13.18' })),
      line: vi.fn(async () => {}),
      interrupt: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      shellComplete: vi.fn<(text: string) => Promise<string[]>>(async () => []),
      complete: vi.fn<(at: PyPlace) => Promise<PyCompletion[]>>(async () => []),
      signature: vi.fn<(at: PyPlace) => Promise<PySignature | null>>(async () => null),
      onEvent: vi.fn((h: (e: PyEvent) => void) => { pyHandlers.add(h); return () => { pyHandlers.delete(h); }; }),
      libs: {
        list: vi.fn(async () => installed),
        lookUp: vi.fn(async (name: string) => ({ ok: true as const, name, version: '2.32.5', summary: 'Python HTTP for Humans.' })),
        install: vi.fn(async (name: string) => {
          for (const h of pipHandlers) h(`Successfully installed ${name}-2.32.5\n`);
          installed = [...installed.filter((l) => l.name !== name), { name, version: '2.32.5', summary: 'Python HTTP for Humans.' }];
          return { ok: true as const };
        }),
        installFile: vi.fn(async () => ({ ok: false as const, canceled: true as const })),
        remove: vi.fn(async (name: string) => { installed = installed.filter((l) => l.name !== name); return { ok: true as const }; }),
        onOutput: vi.fn((h: (t: string) => void) => { pipHandlers.add(h); return () => { pipHandlers.delete(h); }; }),
        ...py.libs,
      },
    },
    emitPy: (e) => { for (const h of [...pyHandlers]) h(e); },
    disk,
  };
}
