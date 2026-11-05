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
| `sys.settrace` on | `mpconfigvariant.h` | the line being run (screen 03) |
| **No ASYNCIFY**; binaryen `--spill-pointers` and a stack-only GC scan (`MICROLAB_SPILL_POINTERS`) | `mpconfigvariant.mk`, `main.c` in the patch | the program runs synchronously in the worker (sleep = `Atomics.wait`), and the GC can collect while it runs. Upstream's ASYNCIFY GC made every collection return to JavaScript mid-program and was ~70 % slower |
| Name section kept (`-g2` at link time; no DWARF) | `mpconfigvariant.mk` | the spill-pointers pass finds `__stack_pointer` by name. The `.wasm` is 603 KB instead of 384 KB |
| No extra frozen libraries (asyncio only), default ROM level | `mpconfigvariant.mk` | code that runs here also runs on the boards (N-01) |

Still to do (M2): drop the `js` / `jsffi` modules, so students can't reach JavaScript.

## Checks after a rebuild

```bash
node spikes/micropython-worker/hook-spike.mjs   # Stop in while True, an IRQ during a busy loop, settrace, speed
node spikes/micropython-worker/gc-spike.mjs     # GC: bounded memory, survivors intact, objects held by C, Stop
```

From M2 on, the `python` and `integration` test layers run against these files.
