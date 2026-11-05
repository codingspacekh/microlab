/// <reference lib="webworker" />
/**
 * The simulation worker (architecture §2.2): one run per 'start' message. Started by the window's sim-client
 * (M4) with `new Worker(new URL('../sim/worker.ts', import.meta.url), { type: 'module' })`.
 */
import { loadMicroPython } from '../../vendor/micropython/micropython.mjs';
import wasmUrl from '../../vendor/micropython/micropython.wasm?url';
import type { LoadMicroPython, RawLoadMicroPython } from './vm';
import { handleStart, type StartMessage } from './worker-core';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const load: LoadMicroPython = (options) => (loadMicroPython as RawLoadMicroPython)({ ...options, url: wasmUrl });

scope.onmessage = (e: MessageEvent<StartMessage>) => {
  if (e.data.type === 'start') void handleStart(e.data, (m) => scope.postMessage(m), load);
};
