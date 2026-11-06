import { vi } from 'vitest';
import type { MicrolabApi } from '../../src/renderer/app/api';

/** The preload's API for component tests: settings in memory, file choosers that answer as told, the app's close. */
export function fakeApi(project: Partial<MicrolabApi['project']> = {}): MicrolabApi {
  const stored: Record<string, unknown> = {};
  return {
    versions: { app: '0.4.0', electron: '0' },
    settings: { get: async (k) => stored[k], set: async (k, v) => { stored[k] = v; } },
    project: {
      open: vi.fn(async () => ({ ok: false as const, canceled: true as const })),
      save: vi.fn(async () => ({ ok: false as const, canceled: true as const })),
      ...project,
    },
    boards: { get: vi.fn(async () => ({ boards: [], drives: [] })), onChange: vi.fn(() => () => {}) },
    app: { setDirty: vi.fn(), onCloseRequest: vi.fn(() => () => {}), close: vi.fn() },
  };
}
