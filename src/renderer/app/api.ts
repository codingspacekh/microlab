import type { OpenResult, ProjectDoc, SaveResult } from '@lib/project';
import type { BoardListing, ConsoleAction, ConsoleKind, SendRequest, SendResult } from '@lib/repl';

/** A recent project (F-05): where it is from the home folder, and whether it is still there. */
export interface RecentItem { path: string; name: string; board: string; at: number; where: string; missing: boolean }
/** The recovery copy (F-03): the project's name, its file if it had one, when it was written. */
export interface Recovered { name: string; path?: string; at: number; doc: ProjectDoc }

/** What the board did, or why it couldn't. */
export type Result<T> = ({ ok: true } & T) | { ok: false; message: string };
import type { Detection, FoundBoard, InstallResult, InstallStep, UsbChip } from '@lib/usb';

/** What the preload gives the window (src/preload/index.ts): the only way to Node (architecture §2.2). */
/** A .py file opened (M12, F-91). */
export type PyOpen = { ok: true; path: string; name: string; text: string } | { ok: false; message: string } | { ok: false; canceled: true };
export type PySave = { ok: true; path: string; name: string } | { ok: false; message: string } | { ok: false; canceled: true };
/** A library installed in MicroLab's folder (src/main/python3/libraries.ts). */
export interface PyLibrary { name: string; version: string; summary: string }
/** What the Python 3 session tells the window (src/main/python3/session.ts). */
export interface PyPlace { code: string; line: number; column: number; path: string }
export interface PyCompletion { name: string; type: string; doc?: string; call?: 'args' | 'empty' }
export interface PySignature { name: string; params: string[]; active: number; doc: string }
export interface PyError { type: string; message: string; file: string; line: number | null }
export type PyEvent =
  | { ready: string } | { out: string } | { err: string } | { input: true } | { prompt: string }
  | { ended: 'done' | 'stopped' } | { ended: 'error'; error: PyError } | { replError: PyError } | { window: true } | { exit: number | null };

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
    /** The projects opened or saved lately, newest first (F-05, screen 01). */
    recent(): Promise<RecentItem[]>;
    /** Opens a recent project by its path, without asking. */
    openPath(path: string): Promise<OpenResult>;
    /** Takes a project off the recent list. */
    forget(path: string): Promise<void>;
  };
  /** .py files (M12, F-91): opened and saved as IDLE does; they join the recent list (board "python3"). */
  pyfile: {
    open(): Promise<PyOpen>;
    openPath(path: string): Promise<PyOpen>;
    /** To its file, or asking where (Documents/Python) when it has none. */
    save(text: string, opts: { path?: string; name: string }): Promise<PySave>;
  };
  /** Open… on the Start page (screen 31): a project or a .py file, whichever is chosen. */
  file: {
    open(): Promise<({ kind: 'mlab' } & OpenResult) | ({ kind: 'py' } & PyOpen) | { ok: false; canceled: true }>;
  };
  /** Python 3 (M12, F-92): a file run in the bundled CPython; its events come through onEvent. */
  python3: {
    run(code: string, file: string): Promise<{ ok: true; version: string } | { ok: false; message: string }>;
    /** input()'s answer, or a line for the shell. */
    line(text: string): Promise<void>;
    /** Ctrl+C. */
    interrupt(): Promise<void>;
    /** Stop: the program ends, its windows close. */
    stop(): Promise<void>;
    onEvent(handler: (e: PyEvent) => void): () => void;
    /** Tab at >>> (F-92): what finishes `text`, from the program's names. */
    shellComplete(text: string): Promise<string[]>;
    /** Help while typing (F-97, Jedi): the names that fit at a place in the code (line from 1, column from 0). */
    complete(at: PyPlace): Promise<PyCompletion[]>;
    /** The call being typed at a place: its arguments, the one being typed. */
    signature(at: PyPlace): Promise<PySignature | null>;
    /** Libraries (F-95, screen 31d), in MicroLab's own folder. */
    libs: {
      list(): Promise<PyLibrary[]>;
      /** A library looked up by its name on PyPI. */
      lookUp(name: string): Promise<{ ok: true; name: string; version: string; summary: string } | { ok: false; message: string; offline?: true }>;
      install(name: string): Promise<{ ok: true } | { ok: false; message: string }>;
      /** Asks for a .whl file and installs it. */
      installFile(): Promise<{ ok: true } | { ok: false; message: string } | { ok: false; canceled: true }>;
      remove(name: string): Promise<{ ok: true } | { ok: false; message: string }>;
      /** What pip says while it installs. */
      onOutput(handler: (text: string) => void): () => void;
    };
  };
  /** The copy of a project with unsaved changes (F-03): offered back if the app ended without saving or giving
   *  the changes up. */
  recovery: {
    get(): Promise<Recovered | null>;
    write(doc: ProjectDoc, about: { name: string; path?: string }): Promise<void>;
    clear(): Promise<void>;
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
      recent: async () => [],
      openPath: async () => ({ ok: false, message: 'Opening a file needs the MicroLab app.' }),
      forget: async () => {},
    },
    recovery: { get: async () => null, write: async () => {}, clear: async () => {} },
    pyfile: {
      open: async () => ({ ok: false, message: 'Opening a file needs the MicroLab app.' }),
      openPath: async () => ({ ok: false, message: 'Opening a file needs the MicroLab app.' }),
      save: async () => ({ ok: false, message: 'Saving a file needs the MicroLab app.' }),
    },
    file: { open: async () => ({ ok: false, canceled: true }) },
    python3: {
      run: async () => ({ ok: false, message: 'Python 3 needs the MicroLab app.' }),
      line: async () => {}, interrupt: async () => {}, stop: async () => {}, onEvent: () => () => {},
      shellComplete: async () => [], complete: async () => [], signature: async () => null,
      libs: {
        list: async () => [],
        lookUp: async () => ({ ok: false, message: 'Libraries need the MicroLab app.' }),
        install: async () => ({ ok: false, message: 'Libraries need the MicroLab app.' }),
        installFile: async () => ({ ok: false, message: 'Libraries need the MicroLab app.' }),
        remove: async () => ({ ok: false, message: 'Libraries need the MicroLab app.' }),
        onOutput: () => () => {},
      },
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
