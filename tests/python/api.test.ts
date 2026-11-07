import { describe, expect, it } from 'vitest';
import { apiFor, type ApiItem } from '@lib/editor';
import { VirtualClock } from '../../src/sim/clock';
import { runProject } from '../../src/sim/run';
import { nodeLoader } from './vm';

/**
 * M5.5 F-20: autocomplete never offers what the board doesn't have — every name in the catalogue exists in the
 * simulated board; and in the modules a student uses most, every public name the board has is in the catalogue.
 */
const BOARDS = ['pico-w', 'esp32-devkit-v1', 'microbit-v2'] as const;
/** Both ways; the others only one way (a catalogue name must exist). */
const BOTH_WAYS = ['machine', 'microbit', 'music', 'time', 'utime', 'random'];
/** On the board but left out on purpose: the simulator's own helpers, the WebAssembly port's file system classes,
 *  the micro:bit's pin and display classes (offered through pin0, display …). */
const LEFT_OUT = new Set(['time.start_date', 'os.mount', 'os.umount', 'os.VfsPosix', 'os.ilistdir', 'os.stat', 'os.uname_result']);
const leftOut = (path: string) => LEFT_OUT.has(path) || /^microbit\.MicroBit/.test(path);

async function boardNames(board: string, modules: string[]): Promise<Record<string, Record<string, string[] | null>>> {
  const code = `
import json
out = {}
for m in ${JSON.stringify(modules)}:
    mod = __import__(m)
    d = {}
    for n in dir(mod):
        if n.startswith('_'):
            continue
        v = getattr(mod, n)
        t = type(v).__name__
        d[n] = [k for k in dir(v) if not k.startswith('_')] if t not in ('function', 'bound_method', 'int', 'float', 'str', 'tuple', 'list', 'dict', 'bool', 'NoneType', 'builtin_function_or_method') else None
    out[m] = d
print(json.dumps(out))
`;
  const r = await runProject(await nodeLoader(), { board: board as never, files: { 'main.py': code }, clock: new VirtualClock(), maxUs: 2e6 });
  expect(r.error).toBeUndefined();
  return JSON.parse(r.output.trim().split('\n').pop()!);
}

describe('M5.5 the catalogue against the simulated boards', () => {
  it.each(BOARDS)('%s: every name it offers is there, and the main modules are complete', async (board) => {
    const api = apiFor(board);
    const real = await boardNames(board, [...api.keys()]);
    const missing: string[] = [];
    const notOffered: string[] = [];
    for (const [mod, item] of api) {
      const have = real[mod]!;
      for (const [name, member] of item.members) {
        if (member.hidden) continue;
        if (!(name in have)) { missing.push(`${mod}.${name}`); continue; }
        const inner = have[name];
        for (const m of members(member)) if (inner && !inner.includes(m)) missing.push(`${mod}.${name}.${m}`);
        if (BOTH_WAYS.includes(mod) && inner) {
          for (const m of inner) if (!member.members.has(m) && !leftOut(`${mod}.${name}.${m}`)) notOffered.push(`${mod}.${name}.${m}`);
        }
      }
      if (BOTH_WAYS.includes(mod)) {
        for (const name of Object.keys(have)) if (!item.members.has(name) && !leftOut(`${mod}.${name}`)) notOffered.push(`${mod}.${name}`);
      }
    }
    expect(missing, 'offered but not on the board').toEqual([]);
    expect(notOffered, 'on the board but not offered').toEqual([]);
  }, 30_000);
});

function members(item: ApiItem): string[] {
  return [...item.members.keys()];
}
