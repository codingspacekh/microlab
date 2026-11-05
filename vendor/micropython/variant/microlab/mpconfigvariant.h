// MicroLab's MicroPython: the webassembly port as a simulated board (docs/acceptance/M0.md, Decision).
//  - Runs synchronously in the simulation worker: no ASYNCIFY. time.sleep blocks with Atomics.wait, and the
//    garbage collector scans only the C stack — binaryen's --spill-pointers pass keeps every pointer there
//    (mpconfigvariant.mk; MICROLAB_SPILL_POINTERS in main.c, vendor/micropython/microlab.patch).
//  - A VM hook into JavaScript every 64 backward jumps / returns: Stop (KeyboardInterrupt) and pin IRQs
//    work even in `while True: pass`.
//  - No sys.settrace: it made every Python call ~30 times slower (docs/acceptance/M2.md). Instead the VM keeps
//    only the chain of running frames (MICROLAB_FRAMES; microlab_frame_line/_file in main.c), so the line
//    being run (screen 03) can be read at any call into JavaScript or VM hook.
//  - No `js` and `jsffi` modules (MICROLAB_NO_JS_MODULES): a student's program can't reach JavaScript; the
//    boards' own asyncio is frozen instead of the port's JavaScript-scheduled one (manifest.py).
//  - The port's default ROM level (EXTRA_FEATURES), as on the Pico W and ESP32, and no extra frozen
//    libraries, so code that runs here also runs on the boards (N-01).

#define MICROLAB_FRAMES (1)
#define MICROLAB_NO_JS_MODULES (1)

#define MICROLAB_SPILL_POINTERS (1)

#define MICROPY_VM_HOOK_COUNT (64)
#define MICROPY_VM_HOOK_INIT static uint vm_hook_divisor = MICROPY_VM_HOOK_COUNT;
#define MICROPY_VM_HOOK_POLL if (--vm_hook_divisor == 0) { \
        vm_hook_divisor = MICROPY_VM_HOOK_COUNT; \
        code_state->ip = ip;   /* so microlab_frame_line reads the line being run */ \
        extern void mp_js_hook(void); \
        mp_js_hook(); \
}
#define MICROPY_VM_HOOK_LOOP MICROPY_VM_HOOK_POLL
#define MICROPY_VM_HOOK_RETURN MICROPY_VM_HOOK_POLL
