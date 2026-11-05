// M0 spike: MicroLab's own MicroPython build (scripts/build-micropython.sh) — the VM hook.
// Proves: Stop in `while True: pass`, a pin IRQ handler runs during it, settrace still works, the speed cost.
// Run: node spikes/micropython-worker/hook-spike.mjs
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const results = {};
const show = (k, v) => { results[k] = v; console.log(k, JSON.stringify(v)); };

async function load(which) {
  const out = [];
  let loadMicroPython; let url;
  if (which === 'microlab') {
    ({ loadMicroPython } = await import(join(root, 'vendor/micropython/micropython.mjs')));
    url = join(root, 'vendor/micropython/micropython.wasm');
  } else {
    const pkg = createRequire(import.meta.url).resolve('@micropython/micropython-webassembly-pyscript');
    ({ loadMicroPython } = await import(pkg));
    url = join(dirname(pkg), which);
  }
  const t = performance.now();
  const mp = await loadMicroPython({ url, stdout: (l) => out.push(l), stderr: (l) => out.push(l) });
  return { mp, out, ms: Math.round(performance.now() - t) };
}

const run = (mp, code) => { try { mp.runPython(code); return null; } catch (e) { return String(e.message ?? e).slice(0, 400); } };
const time = (mp, code) => { const t = performance.now(); const e = run(mp, code); return { ms: Math.round(performance.now() - t), error: e }; };

{
  const { mp, out, ms } = await load('microlab');
  show('loadMs', ms);
  out.length = 0;
  run(mp, `
import sys
print(sys.version)
print('settrace', hasattr(sys, 'settrace'))
mods = []
for n in ('js', 'jsffi', 'asyncio', 'pathlib', 'unittest', 'logging', 'machine', 'time', 'os', 'json', 'framebuf', 'random', 'struct', 'math'):
    try:
        __import__(n); mods.append(n + ':yes')
    except ImportError:
        mods.append(n + ':no')
print(' '.join(mods))
`);
  show('about', [...out]);

  // 1. Stop `while True: pass` and a one-line `x += 1` loop
  let hooks = 0; let stopAt = 0;
  mp._module.microlabHook = () => { hooks += 1; if (stopAt && hooks >= stopAt) mp._module._mp_sched_keyboard_interrupt(); };
  for (const code of ['while True:\n    pass\n', 'x = 0\nwhile True: x += 1\n', 'x = 0\nwhile True:\n    x += 1\n']) {
    hooks = 0; stopAt = 2000; out.length = 0;
    const t = performance.now();
    const err = run(mp, `try:\n${code.split('\n').map((l) => '    ' + l).join('\n')}\nexcept KeyboardInterrupt:\n    print('KeyboardInterrupt')\n`);
    show('stop ' + JSON.stringify(code), { out: [...out], error: err, hooks, ms: Math.round(performance.now() - t) });
  }
  stopAt = 0;

  // 2. A pin IRQ during `while True: pass`: the hook schedules the handler (soft IRQ, as on the boards)
  const schedule = mp.pyimport('micropython').schedule;
  let handler = null; let presses = 0;
  mp.registerJsModule('_ream', { irq_set: (fn) => { handler = fn; } });
  mp._module.microlabHook = () => {
    hooks += 1;
    if (handler && hooks % 500 === 0 && presses < 3) { presses += 1; schedule(handler, 15); }
    if (hooks > 100000) mp._module._mp_sched_keyboard_interrupt();   // guard
  };
  hooks = 0; out.length = 0;
  const e2 = run(mp, `
import _ream
count = 0
def on_press(pin):
    global count
    count += 1
    print('pressed', pin, count)
_ream.irq_set(on_press)
try:
    while count < 3:
        pass
    print('loop ended after 3 presses')
except KeyboardInterrupt:
    print('NOT delivered: stopped by the guard')
`);
  show('irqDuringBusyLoop', { out: [...out], error: e2, hooks });

  // 3. settrace still gives lines
  const lines = [];
  mp.registerJsModule('_h', { line: (n) => lines.push(n) });
  out.length = 0;
  const e3 = run(mp, `
import sys, _h
def tr(f, e, a):
    if e == 'line': _h.line(f.f_lineno)
    return tr
sys.settrace(tr)
exec(compile('a = 1\\nb = 2\\nc = a + b\\n', 'main.py', 'exec'), {})
sys.settrace(None)
`);
  show('settraceLines', { lines, error: e3 });

  // 4. speed: the same loops, our build (hook set, cheap) vs npm builds
  mp._module.microlabHook = () => {};
  const loop = 'def f():\n    n = 0\n    for i in range(1000000):\n        n += i\nf()';
  show('loop1e6_microlab_hookSet', time(mp, loop));
  mp._module.microlabHook = undefined;
  show('loop1e6_microlab_noHook', time(mp, loop));
}
for (const wasm of ['micropython.wasm', 'micropython-settrace.wasm']) {
  const { mp } = await load(wasm);
  show('loop1e6_npm_' + wasm, time(mp, 'def f():\n    n = 0\n    for i in range(1000000):\n        n += i\nf()'));
}
