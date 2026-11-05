import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { LoadMicroPython, RawLoadMicroPython } from '../../src/sim/vm';

/** MicroLab's own MicroPython build (vendor/micropython), loaded in Node for the python and integration layers. */
const dir = join(process.cwd(), 'vendor/micropython');
let loader: LoadMicroPython | undefined;

export async function nodeLoader(): Promise<LoadMicroPython> {
  if (!loader) {
    const mod = (await import(pathToFileURL(join(dir, 'micropython.mjs')).href)) as { loadMicroPython: RawLoadMicroPython };
    loader = (opts) => mod.loadMicroPython({ ...opts, url: join(dir, 'micropython.wasm') });
  }
  return loader;
}
