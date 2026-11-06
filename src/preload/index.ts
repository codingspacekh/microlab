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
  },
});
