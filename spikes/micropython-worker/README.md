# Spike: MicroPython WebAssembly in a worker (M0, throw-away — T10)

Never imported by `src/`. Results and the decision are in [`docs/acceptance/M0.md`](../../docs/acceptance/M0.md).

| File | What it measures | Run |
|---|---|---|
| `node-spike.mjs` | load, print, errors, built-in modules, `time.sleep` CPU, the JS bridge, `sys.modules['time']`, Stop from a bridge call, files and `lib/`, speed | `npm run spike:node` |
| `settrace-spike.mjs` | `sys.settrace` line hook: Stop in a plain loop, cost | `node spikes/micropython-worker/settrace-spike.mjs` |
| `electron-main.mjs` + `index.html` + `worker.mjs` | the same inside an Electron window and worker: shared memory, pin read during sleep, Stop (in-VM and by ending the worker), the line being run | `npm run spike:electron` |
| `hook-spike.mjs` | our own build (`vendor/micropython/`): Stop in `while True: pass`, a pin IRQ during a busy loop, `settrace`, speed against the npm builds | `node spikes/micropython-worker/hook-spike.mjs` |
| `gc-spike.mjs` | our own build: the GC while a program runs — bounded memory, survivors intact, objects held only by C code, Stop in an allocating loop | `node spikes/micropython-worker/gc-spike.mjs` (`BUILD=<folder>`, `HEAP=<bytes>`) |
