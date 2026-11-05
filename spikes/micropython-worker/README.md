# Spike: MicroPython WebAssembly in a worker (M0, throw-away — T10)

Never imported by `src/`. Results and the decision are in [`docs/acceptance/M0.md`](../../docs/acceptance/M0.md).

| File | What it measures | Run |
|---|---|---|
| `node-spike.mjs` | load, print, errors, built-in modules, `time.sleep` CPU, the JS bridge, `sys.modules['time']`, Stop from a bridge call, files and `lib/`, speed | `npm run spike:node` |
| `settrace-spike.mjs` | `sys.settrace` line hook: Stop in a plain loop, cost | `node spikes/micropython-worker/settrace-spike.mjs` |
| `electron-main.mjs` + `index.html` + `worker.mjs` | the same inside an Electron window and worker: shared memory, pin read during sleep, Stop (in-VM and by ending the worker), the line being run | `npm run spike:electron` |
