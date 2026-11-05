import { loadMicroPython } from '/mp/micropython.mjs';
self.postMessage({ type: 'log', text: 'worker alive, isolated=' + self.crossOriginIsolated });

let mem; let mp; const out = []; let lineCalls = 0;
const ream = {
  pin_read: (pin) => Atomics.load(mem, pin),
  ticks_ms: () => Math.floor(performance.now()),
  // sleep in slices on the wake counter; Stop wakes it at once
  sleep_ms: (ms) => {
    const end = performance.now() + ms;
    for (;;) {
      if (Atomics.load(mem, 0)) { mp._module._mp_sched_keyboard_interrupt(); return; }
      const left = end - performance.now();
      if (left <= 0) return;
      Atomics.wait(mem, 1, Atomics.load(mem, 1), Math.min(left, 50));
    }
  },
  // the line hook: tell the window the line, and stop if asked
  line: (n) => { lineCalls++; if (lineCalls % 100000 === 0) self.postMessage({ type: 'log', text: 'line calls ' + lineCalls + ' flag ' + Atomics.load(mem, 0) + ' line ' + n }); Atomics.store(mem, 2, n); if (Atomics.load(mem, 0)) mp._module._mp_sched_keyboard_interrupt(); },
};

self.addEventListener('error', (e) => self.postMessage({ type: 'error', text: String(e.message) }));
self.addEventListener('unhandledrejection', (e) => self.postMessage({ type: 'error', text: String(e.reason?.stack ?? e.reason) }));
self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'init') {
    mem = new Int32Array(m.sab);
    const t = performance.now();
    self.postMessage({ type: 'log', text: 'loading' });
    mp = await loadMicroPython({ url: '/mp/micropython-settrace.wasm', stdout: (l) => out.push(l), stderr: (l) => out.push(l) });
    const loadMs = Math.round(performance.now() - t);
    self.postMessage({ type: 'log', text: 'loaded in ' + loadMs });
    mp.registerJsModule('_ream', ream);
    self.postMessage({ type: 'log', text: 'registered' });
    try { mp.runPython(`
import sys, _ream
class _Time:
    def sleep(self, s): _ream.sleep_ms(int(s * 1000))
    def sleep_ms(self, ms): _ream.sleep_ms(ms)
    def ticks_ms(self): return _ream.ticks_ms()
    def ticks_diff(self, a, b): return a - b
sys.modules['time'] = _Time()
def _tr(frame, event, arg):
    if event == 'line':
        _ream.line(frame.f_lineno)
    return _tr
def _run(src):
    code = compile(src, 'main.py', 'exec')
    sys.settrace(_tr)
    try:
        exec(code, {'__name__': '__main__'})
    except KeyboardInterrupt:
        print('KeyboardInterrupt')
    finally:
        sys.settrace(None)
`); } catch (err) { self.postMessage({ type: 'log', text: 'setup failed: ' + String(err.message ?? err) }); }
    self.postMessage({ type: 'log', text: 'setup ran; out=' + JSON.stringify(out) });
    self.postMessage({ type: 'ready', info: { workerIsolated: self.crossOriginIsolated, loadMs } });
  } else if (m.type === 'run') {
    out.length = 0;
    const t = performance.now();
    try {
      mp.globals.get('_run')(m.code);
    } catch (err) { out.push('EXC ' + String(err.message ?? err)); }
    self.postMessage({ type: 'done', out: [...out], runMs: Math.round(performance.now() - t) });
  }
};
