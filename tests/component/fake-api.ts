import { vi } from 'vitest';
import type { MicrolabApi, RecentItem, Recovered } from '../../src/renderer/app/api';

/** The preload's API for component tests: settings in memory, file choosers that answer as told, the app's close;
 *  the recent list and the recovery copy in memory, starting as `start` says (M5.7). */
export function fakeApi(project: Partial<MicrolabApi['project']> = {}, start: { recent?: RecentItem[]; recovery?: Recovered | null } = {}): MicrolabApi {
  const stored: Record<string, unknown> = {};
  let recovered: Recovered | null = start.recovery ?? null;
  let recent: RecentItem[] = start.recent ?? [];
  return {
    versions: { app: '0.4.0', electron: '0' },
    settings: { get: async (k) => stored[k], set: async (k, v) => { stored[k] = v; } },
    project: {
      open: vi.fn(async () => ({ ok: false as const, canceled: true as const })),
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
  };
}
