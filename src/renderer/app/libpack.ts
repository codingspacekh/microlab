import { parsePack } from '@lib/libpack';
import json from '../../../library/lib-pack/pack.json';

/** The library pack (F-54, M6.7), shipped inside the app: its index and its files' text, offline. */
export const PACK = parsePack(json);

const RAW = import.meta.glob<string>('../../../library/lib-pack/**/*', { query: '?raw', import: 'default', eager: true });

/** A file of the pack by its path under library/lib-pack/ ('bmp280/bmp280.py', 'bmp280/LICENSE'). */
export function readPack(path: string): string {
  const text = RAW[`../../../library/lib-pack/${path}`];
  if (text === undefined) throw new Error(`The library pack has no ${path}.`);
  return text;
}
