import { readFileSync } from 'node:fs';
import type { Link } from '@lib/repl';

/**
 * A link that plays back an exchange recorded on a real board (tests/fixtures/repl): each write must be the bytes the
 * recording's app sent next, and is answered with what the board sent then. Any other write fails the test.
 */
export interface Recorded { source: string; exchange: ({ t: number; app: string } | { t: number; board: string })[] }

export function loadRecording(name: string): Recorded {
  return JSON.parse(readFileSync(`tests/fixtures/repl/${name}.json`, 'utf8')) as Recorded;
}

export const latin1 = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
export const text = (b: Uint8Array) => String.fromCharCode(...b);

/** All the app's writes, and all the board's bytes, of a recording in order. */
export const appWrites = (r: Recorded) => r.exchange.flatMap((x) => ('app' in x ? [x.app] : []));
export const boardText = (r: Recorded) => r.exchange.map((x) => ('board' in x ? x.board : '')).join('');

export function replay(r: Recorded): Link & { done: () => boolean; mismatch?: string } {
  let at = 0;
  const listeners = new Set<(d: Uint8Array) => void>();
  const link = {
    mismatch: undefined as string | undefined,
    done: () => at >= r.exchange.length || r.exchange.slice(at).every((x) => 'board' in x),
    onData(l: (d: Uint8Array) => void) { listeners.add(l); return () => listeners.delete(l); },
    async write(data: Uint8Array) {
      const next = r.exchange[at];
      const got = text(data);
      if (!next || !('app' in next) || next.app !== got) {
        link.mismatch = `expected ${JSON.stringify(next && 'app' in next ? next.app : '(nothing)')}, got ${JSON.stringify(got)}`;
        throw new Error(link.mismatch);
      }
      at++;
      const answer: string[] = [];
      while (at < r.exchange.length && 'board' in r.exchange[at]!) answer.push((r.exchange[at++] as { board: string }).board);
      setTimeout(() => { for (const a of answer) for (const l of listeners) l(latin1(a)); }, 0);
    },
  };
  return link;
}
