import type { OpenResult, ProjectDoc, SaveResult } from '@lib/project';
import type { BoardListing, ConsoleAction, ConsoleKind, SendRequest, SendResult } from '@lib/repl';

/** What the board did, or why it couldn't. */
export type Result<T> = ({ ok: true } & T) | { ok: false; message: string };
import type { Detection, FoundBoard, InstallResult, InstallStep, UsbChip } from '@lib/usb';

/** What the preload gives the window (src/preload/index.ts): the only way to Node (architecture §2.2). */
export interface MicrolabApi {
  /** The app's version; the system it runs on ("macOS 26.0"), when the app gives it. */
  versions: { app: string; electron: string; system?: string };
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
    /** Asks the board (by id) what it is: its program stops for a moment and starts again (M10.2, R10). */
    check(id: string): Promise<void>;
    /** Sends the project's files to the board (F-50): only those that changed; then it restarts and runs main.py. */
    send(id: string, files: ProjectDoc['files'], req: SendRequest): Promise<SendResult>;
    /** Installs MicroPython from the firmware shipped with the app (F-52, screen 14b); its steps come as it goes. */
    install(kind: 'pico' | 'microbit'): Promise<InstallResult>;
    cancelInstall(): Promise<void>;
    onInstallStep(handler: (step: InstallStep) => void): () => void;
    /** The board's files (F-53, screen 15); its program waits while they are looked at, until done. */
    files: {
      list(id: string, project: ProjectDoc['files']): Promise<Result<{ listing: BoardListing; board: string }>>;
      read(id: string, paths: string[]): Promise<Result<{ files: Record<string, Uint8Array> }>>;
      copy(id: string, files: ProjectDoc['files'], keep: boolean): Promise<Result<{ sent: { path: string; size: number }[]; same: string[]; keptIn?: string }>>;
      delete(id: string, paths: string[], keep: boolean): Promise<Result<{ keptIn?: string }>>;
      mkdir(id: string, path: string): Promise<Result<object>>;
      done(id: string): Promise<void>;
    };
    /** The board's console (F-51): opened, the port stays open (Thonny can't use the board) until closed. */
    console: {
      open(id: string): Promise<{ ok: true } | { ok: false; message: string }>;
      close(id: string): Promise<void>;
      do(id: string, action: ConsoleAction): Promise<void>;
      /** What a board prints, as it comes (at most every 40 ms). */
      onOutput(handler: (id: string, chunks: { text: string; kind: ConsoleKind }[]) => void): () => void;
    };
    onChange(handler: (now: Detection, changes: { plugged: FoundBoard[]; unplugged: FoundBoard[] }) => void): () => void;
  };
  app: {
    /** Tells the main process whether there are unsaved changes, so closing the window asks first. */
    setDirty(dirty: boolean): void;
    /** The window is being closed with unsaved changes: the handler asks the student. Returns an unsubscribe. */
    onCloseRequest(handler: () => void): () => void;
    /** Closes the window, changes or not (after the student said so). */
    close(): void;
    /** Puts text on the clipboard (the helper's report for the teacher). */
    copy(text: string): Promise<void>;
    /** Opens a USB chip's official driver page in the system's browser (R5) — only those pages. */
    openDriverPage(chip: UsbChip): Promise<void>;
    /** Shows a firmware file in Finder / File Explorer, to drag onto the board's drive by hand. */
    showFirmware(kind: 'pico' | 'microbit'): Promise<void>;
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
    boards: { get: async () => ({ boards: [], drives: [] }), check: async () => {}, send: async () => ({ ok: false, message: 'Sending to a board needs the MicroLab app.' }),
      install: async () => ({ ok: false, message: 'Installing MicroPython needs the MicroLab app.' }),
      cancelInstall: async () => {},
      onInstallStep: () => () => {},
      files: {
        list: async () => ({ ok: false, message: 'A board needs the MicroLab app.' }),
        read: async () => ({ ok: false, message: 'A board needs the MicroLab app.' }),
        copy: async () => ({ ok: false, message: 'A board needs the MicroLab app.' }),
        delete: async () => ({ ok: false, message: 'A board needs the MicroLab app.' }),
        mkdir: async () => ({ ok: false, message: 'A board needs the MicroLab app.' }),
        done: async () => {},
      },
      console: { open: async () => ({ ok: false, message: 'A board needs the MicroLab app.' }), close: async () => {}, do: async () => {}, onOutput: () => () => {} },
      onChange: () => () => {} },
    app: { setDirty: () => {}, onCloseRequest: () => () => {}, close: () => window.close(), copy: async (t) => navigator.clipboard?.writeText(t), openDriverPage: async () => {}, showFirmware: async () => {} },
  };
}
