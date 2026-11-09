import { contextBridge, ipcRenderer, webFrame } from 'electron';

/** The only bridge from the window to Node (architecture §2.2): the app version, the settings file, project files. */
/** What the main process passed the window (webPreferences.additionalArguments): --microlab-<name>=<value>. */
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--microlab-${name}=`))?.slice(`--microlab-${name}=`.length);

contextBridge.exposeInMainWorld('microlab', {
  versions: { app: arg('version') ?? '0.0.0', electron: process.versions.electron, system: arg('system') ?? '' },
  settings: {
    get: (key: string): Promise<unknown> => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: unknown): Promise<void> => ipcRenderer.invoke('settings:set', key, value),
  },
  project: {
    open: (): Promise<unknown> => ipcRenderer.invoke('project:open'),
    save: (doc: unknown, opts: unknown): Promise<unknown> => ipcRenderer.invoke('project:save', doc, opts),
    recent: (): Promise<unknown> => ipcRenderer.invoke('project:recent'),
    openPath: (path: string): Promise<unknown> => ipcRenderer.invoke('project:open-path', path),
    forget: (path: string): Promise<void> => ipcRenderer.invoke('project:forget', path),
  },
  // Python 3 (M12): .py files, and the session that runs them
  pyfile: {
    save: (text: string, opts: unknown): Promise<unknown> => ipcRenderer.invoke('py:save', text, opts),
  },
  // updates (M11, F-109), as the gradebook and OneEditor
  updates: {
    get: (): Promise<unknown> => ipcRenderer.invoke('updates:get'),
    check: (): Promise<unknown> => ipcRenderer.invoke('updates:check'),
    download: (): Promise<unknown> => ipcRenderer.invoke('updates:download'),
    install: (): Promise<unknown> => ipcRenderer.invoke('updates:install'),
    setAuto: (on: boolean): Promise<unknown> => ipcRenderer.invoke('updates:auto', on),
    seen: (): Promise<unknown> => ipcRenderer.invoke('updates:seen'),
    showDmg: (): Promise<unknown> => ipcRenderer.invoke('updates:show-dmg'),
    openDmg: (): Promise<unknown> => ipcRenderer.invoke('updates:open-dmg'),
    onChange: (handler: (state: unknown) => void): (() => void) => {
      const listener = (_e: unknown, state: unknown) => handler(state);
      ipcRenderer.on('updates:state', listener);
      return () => { ipcRenderer.removeListener('updates:state', listener); };
    },
  },
  // projects as folders (M12 Rev 11): made, opened, their tree and its files
  projects: {
    home: (): Promise<unknown> => ipcRenderer.invoke('projects:home'),
    choose: (from: string): Promise<unknown> => ipcRenderer.invoke('projects:choose', from),
    newPython: (location: string, name: string): Promise<unknown> => ipcRenderer.invoke('projects:new-python', location, name),
    newBoard: (location: string, name: string, doc: unknown): Promise<unknown> => ipcRenderer.invoke('projects:new-board', location, name, doc),
    openPython: (path: string): Promise<unknown> => ipcRenderer.invoke('projects:open-python', path),
    tree: (root: string): Promise<unknown> => ipcRenderer.invoke('projects:tree', root),
    newEntry: (root: string, rel: string, kind: string): Promise<unknown> => ipcRenderer.invoke('projects:new-entry', root, rel, kind),
    rename: (root: string, from: string, to: string): Promise<unknown> => ipcRenderer.invoke('projects:rename', root, from, to),
    trash: (root: string, rel: string): Promise<unknown> => ipcRenderer.invoke('projects:trash', root, rel),
    reveal: (root: string, rel: string): Promise<unknown> => ipcRenderer.invoke('projects:reveal', root, rel),
    read: (root: string, rel: string): Promise<unknown> => ipcRenderer.invoke('projects:read', root, rel),
    context: (items: unknown): Promise<unknown> => ipcRenderer.invoke('projects:context', items),
    onChanged: (handler: (root: string) => void): (() => void) => {
      const listener = (_e: unknown, root: string) => handler(root);
      ipcRenderer.on('projects:changed', listener);
      return () => { ipcRenderer.removeListener('projects:changed', listener); };
    },
  },
  file: {
    open: (): Promise<unknown> => ipcRenderer.invoke('file:open'),
  },
  python3: {
    run: (code: string, file: string): Promise<unknown> => ipcRenderer.invoke('py:run', code, file),
    line: (text: string): Promise<void> => ipcRenderer.invoke('py:line', text),
    interrupt: (): Promise<void> => ipcRenderer.invoke('py:interrupt'),
    stop: (): Promise<void> => ipcRenderer.invoke('py:stop'),
    shellComplete: (text: string): Promise<unknown> => ipcRenderer.invoke('py:shell-complete', text),
    version: (): Promise<unknown> => ipcRenderer.invoke('py:version'),
    complete: (at: unknown): Promise<unknown> => ipcRenderer.invoke('py:complete', at),
    signature: (at: unknown): Promise<unknown> => ipcRenderer.invoke('py:signature', at),
    onEvent: (handler: (e: unknown) => void): (() => void) => {
      const listener = (_e: unknown, ev: unknown) => handler(ev);
      ipcRenderer.on('py:event', listener);
      return () => { ipcRenderer.removeListener('py:event', listener); };
    },
    libs: {
      list: (): Promise<unknown> => ipcRenderer.invoke('py:libs-list'),
      lookUp: (name: string): Promise<unknown> => ipcRenderer.invoke('py:libs-lookup', name),
      install: (name: string): Promise<unknown> => ipcRenderer.invoke('py:libs-install', name),
      installFile: (): Promise<unknown> => ipcRenderer.invoke('py:libs-install-file'),
      remove: (name: string): Promise<unknown> => ipcRenderer.invoke('py:libs-remove', name),
      onOutput: (handler: (text: string) => void): (() => void) => {
        const listener = (_e: unknown, t: string) => handler(t);
        ipcRenderer.on('py:libs-output', listener);
        return () => { ipcRenderer.removeListener('py:libs-output', listener); };
      },
    },
  },
  recovery: {
    get: (): Promise<unknown> => ipcRenderer.invoke('recovery:get'),
    write: (doc: unknown, about: unknown): Promise<void> => ipcRenderer.invoke('recovery:write', doc, about),
    clear: (): Promise<void> => ipcRenderer.invoke('recovery:clear'),
  },
  boards: {
    get: (): Promise<unknown> => ipcRenderer.invoke('boards:get'),
    check: (id: string): Promise<void> => ipcRenderer.invoke('boards:check', id),
    send: (id: string, files: unknown, req: unknown): Promise<unknown> => ipcRenderer.invoke('boards:send', id, files, req),
    install: (kind: string): Promise<unknown> => ipcRenderer.invoke('boards:install', kind),
    cancelInstall: (): Promise<void> => ipcRenderer.invoke('boards:install-cancel'),
    onInstallStep: (handler: (step: unknown) => void): (() => void) => {
      const listener = (_e: unknown, step: unknown) => handler(step);
      ipcRenderer.on('boards:install-step', listener);
      return () => { ipcRenderer.removeListener('boards:install-step', listener); };
    },
    files: {
      list: (id: string, project: unknown): Promise<unknown> => ipcRenderer.invoke('boards:files-list', id, project),
      read: (id: string, paths: string[]): Promise<unknown> => ipcRenderer.invoke('boards:files-read', id, paths),
      copy: (id: string, files: unknown, keep: boolean): Promise<unknown> => ipcRenderer.invoke('boards:files-copy', id, files, keep),
      delete: (id: string, paths: string[], keep: boolean): Promise<unknown> => ipcRenderer.invoke('boards:files-delete', id, paths, keep),
      mkdir: (id: string, path: string): Promise<unknown> => ipcRenderer.invoke('boards:files-mkdir', id, path),
      done: (id: string): Promise<void> => ipcRenderer.invoke('boards:files-done', id),
    },
    console: {
      open: (id: string): Promise<unknown> => ipcRenderer.invoke('boards:console-open', id),
      close: (id: string): Promise<void> => ipcRenderer.invoke('boards:console-close', id),
      do: (id: string, action: unknown): Promise<void> => ipcRenderer.invoke('boards:console-do', id, action),
      onOutput: (handler: (id: string, chunks: unknown) => void): (() => void) => {
        const listener = (_e: unknown, id: string, chunks: unknown) => handler(id, chunks);
        ipcRenderer.on('boards:console', listener);
        return () => { ipcRenderer.removeListener('boards:console', listener); };
      },
    },
    onChange: (handler: (now: unknown, changes: unknown) => void): (() => void) => {
      const listener = (_e: unknown, now: unknown, changes: unknown) => handler(now, changes);
      ipcRenderer.on('boards:changed', listener);
      return () => { ipcRenderer.removeListener('boards:changed', listener); };
    },
  },
  app: {
    setDirty: (dirty: boolean): void => ipcRenderer.send('app:dirty', dirty),
    onCloseRequest: (handler: () => void): (() => void) => {
      const listener = () => handler();
      ipcRenderer.on('app:close-request', listener);
      return () => { ipcRenderer.removeListener('app:close-request', listener); };
    },
    close: (): Promise<void> => ipcRenderer.invoke('app:close'),
    copy: (text: string): Promise<void> => ipcRenderer.invoke('app:copy', text),
    openDriverPage: (chip: string): Promise<void> => ipcRenderer.invoke('app:open-driver-page', chip),
    showFirmware: (kind: string): Promise<void> => ipcRenderer.invoke('app:show-firmware', kind),
    // the app's size (M12 Rev 12, F-106): the window's zoom
    zoom: { get: (): number => webFrame.getZoomFactor(), set: (f: number): void => webFrame.setZoomFactor(f) },
    // About MicroLab (M11, F-108): its website; the app menu's About and Check for Updates…
    openWebsite: (): Promise<void> => ipcRenderer.invoke('app:website'),
    // About ▸ Licences (M11.4, N-11)
    licences: (): Promise<string | null> => ipcRenderer.invoke('app:licences'),
    onMenu: (handler: (action: string) => void): (() => void) => {
      const listener = (_e: unknown, action: string) => handler(action);
      ipcRenderer.on('app:menu', listener);
      return () => { ipcRenderer.removeListener('app:menu', listener); };
    },
  },
});
