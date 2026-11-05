# MicroLab's MicroPython (WebAssembly)

The MicroPython that runs students' programs in the simulation worker: the official **webassembly** port, built by
us with a small variant and patch. Why we build it ourselves: [`docs/acceptance/M0.md`](../../docs/acceptance/M0.md)
(*Decision*).

| | |
|---|---|
| MicroPython | **v1.29.0** (git tag), MIT licence, © Damien P. George and contributors |
| Emscripten | **6.0.13**, Docker image `emscripten/emsdk:6.0.13` |
| Built files | `micropython.mjs`, `micropython.wasm` — kept in the repo, so nobody needs Docker or Emscripten to work on MicroLab |
| Variant | `variant/microlab/` (based on upstream's *standard*) |
| Patch | `microlab.patch` (applied to the MicroPython checkout before building) |
| Build | `./scripts/build-micropython.sh` (needs git and a running Docker — Docker Desktop, or `colima start`) |

## What is different from upstream

| Change | Where | Why |
|---|---|---|
| A VM hook every 64 backward jumps / returns calls `Module.microlabHook` (the worker's: Stop flag, pending pin IRQs) | `variant/microlab/mpconfigvariant.h`, `library.js` in the patch | Stop and button IRQs must work even in `while True: pass` (N-01, N-03) |
| **No `sys.settrace`**; instead the VM keeps the chain of running frames (`MICROLAB_FRAMES`) and exports `microlab_frame_line(depth)` / `microlab_frame_file(depth)`; the VM hook stores the live `ip` first | `mpconfigvariant.h`, `py/{bc,vm,mpstate,runtime}.*` and `main.c` in the patch | the line being run (screen 03), read at any call into JavaScript (`time.sleep`) or VM hook. settrace made every Python call ~30 times slower (186 µs in npm's settrace build, 30 µs in ours, ~1 µs without; docs/acceptance/M2.md) |
| No `js` and `jsffi` modules (`MICROLAB_NO_JS_MODULES`) | `modjs.c`, `modjsffi.c` in the patch | a student's program can't reach JavaScript |
| The boards' standard `asyncio` frozen (`variant/microlab/manifest.py`), not the port's | `mpconfigvariant.mk` | the port's schedules with JavaScript and imports `js` / `jsffi` |
| **No ASYNCIFY**; binaryen `--spill-pointers` and a stack-only GC scan (`MICROLAB_SPILL_POINTERS`) | `mpconfigvariant.mk`, `main.c` in the patch | the program runs synchronously in the worker (sleep = `Atomics.wait`), and the GC can collect while it runs. Upstream's ASYNCIFY GC made every collection return to JavaScript mid-program and was ~70 % slower |
| Name section kept (`-g2` at link time; no DWARF) | `mpconfigvariant.mk` | the spill-pointers pass finds `__stack_pointer` by name. The `.wasm` is 577 KB instead of 384 KB |
| No other frozen libraries, default ROM level | `mpconfigvariant.mk` | code that runs here also runs on the boards (N-01) |

## Checks after a rebuild

```bash
node spikes/micropython-worker/hook-spike.mjs   # Stop in while True, an IRQ during a busy loop, speed (its settrace check now fails: settrace is gone)
node spikes/micropython-worker/gc-spike.mjs     # GC: bounded memory, survivors intact, objects held by C, Stop
```

From M2 on, the `python` and `integration` test layers run against these files.
