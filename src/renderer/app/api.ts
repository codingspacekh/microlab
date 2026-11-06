import type { OpenResult, ProjectDoc, SaveResult } from '@lib/project';
import type { Detection, FoundBoard } from '@lib/usb';

/** What the preload gives the window (src/preload/index.ts): the only way to Node (architecture §2.2). */
export interface MicrolabApi {
  versions: { app: string; electron: string };
  settings: {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
  };
  project: {
    /** Asks for a .mlab and opens it (F-02); cancelled, or a message if it can't be opened. */
    open(): Promise<OpenResult>;
    /** Saves to `path`; with no path, asks where (Save as), starting from `name` (F-02, M4.6). */
    save(doc: ProjectDoc, opts: { path?: string; name: string }): Promise<SaveResult>;
  };
  /** Real boards on USB (F-55): what is plugged in now, and every change. */
  boards: {
    get(): Promise<Detection>;
    onChange(handler: (now: Detection, changes: { plugged: FoundBoard[]; unplugged: FoundBoard[] }) => void): () => void;
  };
  app: {
    /** Tells the main process whether there are unsaved changes, so closing the window asks first. */
    setDirty(dirty: boolean): void;
    /** The window is being closed with unsaved changes: the handler asks the student. Returns an unsubscribe. */
    onCloseRequest(handler: () => void): () => void;
    /** Closes the window, changes or not (after the student said so). */
    close(): void;
  };
}

declare global {
  interface Window {
    microlab?: MicrolabApi;
  }
}

/** The preload's API; in a plain browser (the dev page, a component test) settings live in memory. */
export function getApi(): MicrolabApi {
  if (window.microlab) return window.microlab;
  const mem = new Map<string, unknown>();
  return {
    versions: { app: '0.0.0', electron: '' },
    settings: { get: async (key) => mem.get(key), set: async (key, value) => { mem.set(key, value); } },
    project: {
      open: async () => ({ ok: false, message: 'Opening a file needs the MicroLab app.' }),
      save: async () => ({ ok: false, message: 'Saving a file needs the MicroLab app.' }),
    },
    boards: { get: async () => ({ boards: [], drives: [] }), onChange: () => () => {} },
    app: { setDirty: () => {}, onCloseRequest: () => () => {}, close: () => window.close() },
  };
}
