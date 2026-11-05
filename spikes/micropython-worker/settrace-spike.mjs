// M0 spike: sys.settrace for "the line being run" (screen 03) and for Stop in a loop with no calls.
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { loadMicroPython } from '@micropython/micropython-webassembly-pyscript';

const pkgDir = dirname(createRequire(import.meta.url).resolve('@micropython/micropython-webassembly-pyscript'));
for (const wasm of ['micropython.wasm', 'micropython-settrace.wasm']) {
  const out = [];
  const mp = await loadMicroPython({ url: join(pkgDir, wasm), stdout: (l) => out.push(l), stderr: (l) => out.push('ERR ' + l) });
  let lines = 0;
  const seen = new Set();
  mp.registerJsModule('_hook', {
    line: (n) => { lines += 1; seen.add(n); if (lines === 20000) mp._module._mp_sched_keyboard_interrupt(); },
  });
  mp.FS.writeFile('/main.py', 'x = 0\nwhile True:\n    x += 1\n    pass\n');
  const t = performance.now();
  try {
    mp.runPython(`
import sys, _hook
print('has settrace:', hasattr(sys, 'settrace'))
def tr(frame, event, arg):
    if event == 'line':
        _hook.line(frame.f_lineno)
    return tr
src = open('/main.py').read()
code = compile(src, 'main.py', 'exec')
try:
    sys.settrace(tr)
    exec(code, {'__name__': '__main__'})
except KeyboardInterrupt:
    sys.settrace(None)
    print('plain while True stopped by KeyboardInterrupt')
`);
  } catch (e) { out.push('EXC ' + String(e.message ?? e).slice(0, 300)); }
  console.log(wasm, { ms: Math.round(performance.now() - t), lines, linesSeen: [...seen].sort(), out });

  // overhead: 200k iterations, traced vs not
  if (wasm.includes('settrace')) {
    const time = (code) => { const t0 = performance.now(); mp.runPython(code); return Math.round(performance.now() - t0); };
    const plain = time('def f():\n    n = 0\n    for i in range(200000):\n        n += i\nf()');
    const traced = time(`
import sys
def tr(frame, event, arg):
    return tr
def f():
    n = 0
    for i in range(200000):
        n += i
sys.settrace(tr)
f()
sys.settrace(None)`);
    const tracedJs = time(`
import sys, _hook
def tr(frame, event, arg):
    if event == 'line':
        _hook.line(frame.f_lineno)
    return tr
def f():
    n = 0
    for i in range(200000):
        n += i
sys.settrace(tr)
try:
    f()
except KeyboardInterrupt:
    pass
sys.settrace(None)`);
    console.log('200k loop ms', { plain, tracedPythonOnly: traced, tracedWithJsCall: tracedJs });
  }
}
