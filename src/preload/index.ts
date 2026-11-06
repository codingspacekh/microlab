import { contextBridge, ipcRenderer } from 'electron';

/** The only bridge from the window to Node (architecture §2.2): the app version, the settings file, project files. */
contextBridge.exposeInMainWorld('microlab', {
  versions: { app: process.env.npm_package_version ?? '0.0.0', electron: process.versions.electron },
  settings: {
    get: (key: string): Promise<unknown> => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: unknown): Promise<void> => ipcRenderer.invoke('settings:set', key, value),
  },
  project: {
    open: (): Promise<unknown> => ipcRenderer.invoke('project:open'),
    save: (doc: unknown, opts: unknown): Promise<unknown> => ipcRenderer.invoke('project:save', doc, opts),
  },
  app: {
    setDirty: (dirty: boolean): void => ipcRenderer.send('app:dirty', dirty),
    onCloseRequest: (handler: () => void): (() => void) => {
      const listener = () => handler();
      ipcRenderer.on('app:close-request', listener);
      return () => { ipcRenderer.removeListener('app:close-request', listener); };
    },
    close: (): Promise<void> => ipcRenderer.invoke('app:close'),
  },
});
