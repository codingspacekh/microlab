import { contextBridge, ipcRenderer } from 'electron';

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
    open: (): Promise<unknown> => ipcRenderer.invoke('py:open'),
    openPath: (path: string): Promise<unknown> => ipcRenderer.invoke('py:open-path', path),
    save: (text: string, opts: unknown): Promise<unknown> => ipcRenderer.invoke('py:save', text, opts),
  },
  file: {
    open: (): Promise<unknown> => ipcRenderer.invoke('file:open'),
  },
  python3: {
    run: (code: string, file: string): Promise<unknown> => ipcRenderer.invoke('py:run', code, file),
    line: (text: string): Promise<void> => ipcRenderer.invoke('py:line', text),
    interrupt: (): Promise<void> => ipcRenderer.invoke('py:interrupt'),
    stop: (): Promise<void> => ipcRenderer.invoke('py:stop'),
    onEvent: (handler: (e: unknown) => void): (() => void) => {
      const listener = (_e: unknown, ev: unknown) => handler(ev);
      ipcRenderer.on('py:event', listener);
      return () => { ipcRenderer.removeListener('py:event', listener); };
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
  },
});
