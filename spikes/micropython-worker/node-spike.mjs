// M0 spike (throw-away, T10): what can the official MicroPython WebAssembly build do for MicroLab?
// Run: npm run spike:node
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { loadMicroPython } from '@micropython/micropython-webassembly-pyscript';

const require = createRequire(import.meta.url);
const pkgDir = dirname(require.resolve('@micropython/micropython-webassembly-pyscript'));
const results = new Proxy({}, { set(t, k, v) { t[k] = v; console.log(k, JSON.stringify(v)); return true; } });
const out = [];
const err = [];

async function load(wasm = 'micropython.wasm') {
  out.length = 0;
  err.length = 0;
  const t0 = performance.now();
  const mp = await loadMicroPython({
    url: join(pkgDir, wasm),
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
    heapsize: 4 * 1024 * 1024,
  });
  return { mp, ms: performance.now() - t0 };
}

function run(mp, code) {
  try {
    mp.runPython(code);
    return null;
  } catch (e) {
    return String(e?.message ?? e);
  }
}

// 1. load time
{
  const { mp, ms } = await load();
  results.loadMs = Math.round(ms);
  const m0 = process.memoryUsage();
  results.rssMb = Math.round(m0.rss / 1e6);

  // 2. print and an exception with its line
  run(mp, 'print("hello from MicroPython")\nimport sys\nprint(sys.version)\nprint(sys.implementation)');
  results.print = [...out];
  out.length = 0;
  const e = run(mp, 'x = 1\ny = 2\nprint(z)\n');
  results.errorText = e;
  results.errorStderr = [...err];

  // 3. built-in modules
  out.length = 0;
  run(mp, `
import sys
mods = []
for name in ('machine', 'time', 'os', 'micropython', 'js', 'asyncio', 'json', 'random', 'struct', 'math', 'neopixel', 'framebuf'):
    try:
        __import__(name)
        mods.append(name + ':yes')
    except ImportError:
        mods.append(name + ':no')
print(' '.join(mods))
print('path', sys.path)
import time
print('time has', [n for n in ('sleep', 'sleep_ms', 'sleep_us', 'ticks_ms', 'ticks_us', 'ticks_diff', 'time_ns') if hasattr(time, n)])
`);
  results.modules = [...out];

  // 4. what does the built-in time.sleep(1) cost? (busy-wait burns CPU)
  out.length = 0;
  const c0 = process.cpuUsage();
  const w0 = performance.now();
  run(mp, 'import time\ntime.sleep(1)');
  const wall = performance.now() - w0;
  const cpu = process.cpuUsage(c0);
  results.builtinSleep1 = { wallMs: Math.round(wall), cpuMs: Math.round((cpu.user + cpu.system) / 1000) };

  // 5. a JS module seen from Python: pin writes reach JS, pin reads come from shared memory
  const shared = new Int32Array(new SharedArrayBuffer(64));
  const trace = [];
  const ream = {
    pin_write: (pin, value) => { trace.push([pin, value]); },
    pin_read: (pin) => Atomics.load(shared, pin),
    sleep_ms: (ms) => { Atomics.wait(shared, 15, 0, ms); },   // index 15 = the control word
    ticks_ms: () => Math.floor(performance.now()),
  };
  mp.registerJsModule('_ream', ream);
  Atomics.store(shared, 4, 1);
  out.length = 0;
  const e5 = run(mp, `
import _ream
_ream.pin_write(15, 1)
_ream.pin_write(15, 0)
print('read GP4 =', _ream.pin_read(4))
`);
  results.bridge = { trace, printed: [...out], error: e5 };

  // 6. our own time module in place of the built-in one (sys.modules first)
  out.length = 0;
  const c1 = process.cpuUsage();
  const w1 = performance.now();
  const e6 = run(mp, `
import sys, _ream
class _Time:
    def sleep(self, s): _ream.sleep_ms(int(s * 1000))
    def sleep_ms(self, ms): _ream.sleep_ms(ms)
    def ticks_ms(self): return _ream.ticks_ms()
sys.modules['time'] = _Time()
import time
print('our time:', type(time).__name__)
time.sleep(1)
`);
  const cpu1 = process.cpuUsage(c1);
  results.ourSleep1 = { wallMs: Math.round(performance.now() - w1), cpuMs: Math.round((cpu1.user + cpu1.system) / 1000), printed: [...out], error: e6 };

  // 7. Stop from inside a bridge call: the JS side schedules a KeyboardInterrupt
  let calls = 0;
  mp.registerJsModule('_stop', {
    tick: () => { calls += 1; if (calls === 1000) mp._module._mp_sched_keyboard_interrupt(); },
  });
  out.length = 0;
  const w7 = performance.now();
  const e7 = run(mp, `
import _stop
try:
    for _ in range(300000):
        _stop.tick()
    print('NOT stopped: loop ran to the end')
except KeyboardInterrupt:
    print('stopped by KeyboardInterrupt')
`);
  results.stopViaBridge = { printed: [...out], error: e7, ms: Math.round(performance.now() - w7), calls };

  // 8. files: lib/ on the import path, open() reads a project file
  mp.FS.mkdir('/lib');
  mp.FS.writeFile('/lib/mylib.py', 'def hello():\n    return "hello from lib/mylib.py"\n');
  mp.FS.mkdir('/www');
  mp.FS.writeFile('/www/index.html', '<h1>MicroLab</h1>');
  out.length = 0;
  const e8 = run(mp, `
import sys, os
print('cwd', os.getcwd(), 'path', sys.path)
if '/lib' not in sys.path: sys.path.append('/lib')
import mylib
print(mylib.hello())
print(open('/www/index.html').read())
print(os.listdir('/'))
`);
  results.files = { printed: [...out], error: e8 };

  // 9. speed: a tight loop
  out.length = 0;
  const w9 = performance.now();
  run(mp, 'n = 0\nfor i in range(1000000):\n    n += i\nprint(n)');
  results.loop1e6Ms = Math.round(performance.now() - w9);
  const w9b = performance.now();
  run(mp, 'import _ream\nfor i in range(100000):\n    _ream.pin_write(15, i & 1)');
  results.bridgeCalls1e5Ms = Math.round(performance.now() - w9b);
}

// 10. the settrace build: a line hook for "the line being run" and for Stop in a plain loop
{
  const { mp, ms } = await load('micropython-settrace.wasm');
  results.settraceLoadMs = Math.round(ms);
  let lines = 0;
  mp.registerJsModule('_hook', {
    line: (n) => { lines += 1; if (lines === 50000) mp._module._mp_sched_keyboard_interrupt(); },
  });
  out.length = 0;
  const w = performance.now();
  const e = run(mp, `
import sys, _hook
def tr(frame, event, arg):
    if event == 'line':
        _hook.line(frame.f_lineno)
    return tr
sys.settrace(tr)
try:
    for _ in range(300000):
        pass
    sys.settrace(None)
    print('NOT stopped: loop ran to the end')
except KeyboardInterrupt:
    sys.settrace(None)
    print('plain loop stopped by KeyboardInterrupt')
`);
  results.stopViaSettrace = { printed: [...out], error: e, ms: Math.round(performance.now() - w), lines };

  // cost of tracing: the same 1e6 loop with a line hook
  out.length = 0;
  const w2 = performance.now();
  const e2 = run(mp, `
import sys
count = [0]
def tr(frame, event, arg):
    return tr
sys.settrace(tr)
n = 0
for i in range(200000):
    n += i
sys.settrace(None)
print(n)
`);
  results.settraceLoop2e5Ms = { ms: Math.round(performance.now() - w2), error: e2 };
  const w3 = performance.now();
  run(mp, 'n = 0\nfor i in range(200000):\n    n += i');
  results.plainLoop2e5MsSettraceBuild = Math.round(performance.now() - w3);
}

console.log('done');
