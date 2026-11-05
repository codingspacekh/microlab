import { contextBridge } from 'electron';

/** The only bridge from the window to Node (architecture §2.2). M0 exposes the app version only. */
contextBridge.exposeInMainWorld('microlab', {
  versions: { app: process.env.npm_package_version ?? '0.0.0', electron: process.versions.electron },
});
