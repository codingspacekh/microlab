/** What the preload gives the window (src/preload/index.ts): the only way to Node (architecture §2.2). */
export interface MicrolabApi {
  versions: { app: string; electron: string };
  settings: {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
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
  };
}
