// M0 spike: the garbage collector in MicroLab's own MicroPython builds (scripts/build-micropython.sh).
//  - variant microlab (ASYNCIFY): gc_collect's emscripten_scan_registers unwinds the stack and resumes after a
//    setTimeout(0), so the program has to be started with an asyncify-aware ccall ({ async: true }).
//  - variant microlab-sync (no ASYNCIFY, binaryen --spill-pointers): the stack scan alone finds every pointer,
//    the program runs synchronously (the same ccall; `async` is ignored).
// Proves: allocation-heavy loops finish, memory stays bounded, live objects survive collections (also objects
// held only by C code while Python runs inside it), Stop still works; what it costs.
// Run: node spikes/micropython-worker/gc-spike.mjs            (vendor/micropython)
//      BUILD=<folder> HEAP=<bytes> node spikes/micropython-worker/gc-spike.mjs
import { performance } from 'node:perf_hooks';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const build = process.env.BUILD ?? join(root, 'vendor/micropython');
const heapsize = Number(process.env.HEAP ?? 256 * 1024);   // small, so collections happen often
const show = (k, v) => console.log(k, JSON.stringify(v));
const { loadMicroPython } = await import(join(build, 'micropython.mjs'));

// Count event-loop turns while Python runs: each one is a GC unwind/rewind (ASYNCIFY build only).
let turns = 0;
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...a) => { turns += 1; return realSetTimeout(fn, ms, ...a); };

// A fresh interpreter per test; the asyncify-aware runner the worker would use; errors printed by Python.
async function run(code, hook = () => {}) {
  const out = [];
  const mp = await loadMicroPython({ url: join(build, 'micropython.wasm'), heapsize, stdout: (l) => out.push(l), stderr: (l) => out.push(l) });
  const M = mp._module;
  M.microlabHook = () => hook(M);
  const wrapped = `try:\n${code.trim().split('\n').map((l) => '    ' + l).join('\n')}\nexcept BaseException as e:\n    import sys\n    sys.print_exception(e)\n`;
  const len = M.lengthBytesUTF8(wrapped);
  const buf = M._malloc(len + 1);
  M.stringToUTF8(wrapped, buf, len + 1);
  const value = M._malloc(3 * 4);
  turns = 0;
  const t = performance.now();
  try {
    await M.ccall('mp_js_do_exec', 'number', ['pointer', 'number', 'pointer'], [buf, len, value], { async: true });
  } catch (e) {
    return { ms: Math.round(performance.now() - t), abort: String(e.message ?? e).slice(0, 300) };
  }
  return { ms: Math.round(performance.now() - t), turns, out };
}

show('build', { build, heapsize });

// 1. A plain 1 M loop (big ints, so it allocates) — this aborted with runPython in the ASYNCIFY build
show('loop1e6', await run('def f():\n    n = 0\n    for i in range(1000000):\n        n += i\n    return n\nprint(f())'));

// 2. Allocation-heavy loop: memory must stay bounded
show('alloc', await run(`
import gc
samples = []
for i in range(200000):
    s = str(i) * 3
    l = [i, s, (i, i)]
    if i % 50000 == 0:
        samples.append(gc.mem_alloc())
print('mem_alloc', samples, 'mem_free', gc.mem_free())
`));

// 3. Survivors interleaved with garbage across many collections; a wrong collection would corrupt them.
//    (A dict growing among such garbage fragments the heap — MemoryError, as on a real board — so the
//    survivors go into a list sized first.)
show('survivors', await run(`
import gc
N = 3000
keep = [None] * N
for i in range(N):
    keep[i] = 'v' + str(i)
    junk = [str(j) for j in range(10)]
gc.collect()
print('bad', len([i for i in range(N) if keep[i] != 'v' + str(i)]), 'mem_free', gc.mem_free())
`));

// 4. Objects held only by C code while Python runs inside it (list(map(f)), sorted(key=f), join of a generator,
//    comprehensions): what a stack-only scan misses without ASYNCIFY or --spill-pointers.
show('heldByC', await run(`
import gc
def f(i):
    return str(i) * 3
ok = []
for rnd in range(5):
    a = list(map(f, range(1500)))
    ok.append(all(a[i] == str(i) * 3 for i in range(1500)))
    b = sorted(range(1500), key=lambda i: str((i * 7919) % 1500))
    ok.append(sorted(b) == list(range(1500)))
    c = ','.join(str(i) for i in range(1500))
    ok.append(c.split(',') == [str(i) for i in range(1500)])
    d = {str(i): [i, str(i)] for i in range(500)}
    ok.append(all(d[str(i)] == [i, str(i)] for i in range(500)))
    a = b = c = d = None
print('correct', ok.count(True), 'of', len(ok), 'mem_free', gc.mem_free())
`));

// 5. Stop an allocating `while True:` (KeyboardInterrupt from the hook)
let hooks = 0;
show('stopAllocLoop', await run('x = 0\nwhile True:\n    x = str(x)[:3] + "a"\n', (M) => { hooks += 1; if (hooks === 20000) M._mp_sched_keyboard_interrupt(); }));
