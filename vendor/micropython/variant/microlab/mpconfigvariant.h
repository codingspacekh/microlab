// MicroLab's MicroPython: the webassembly port as a simulated board (docs/acceptance/M0.md, Decision).
//  - time.sleep blocks the simulation worker with Atomics.wait (nothing yields to JavaScript); ASYNCIFY is
//    on only so the garbage collector can scan registers (see mpconfigvariant.mk).
//  - A VM hook into JavaScript every 64 backward jumps / returns: Stop (KeyboardInterrupt) and pin IRQs
//    work even in `while True: pass`.
//  - sys.settrace, for the line being run (screen 03).
//  - The port's default ROM level (EXTRA_FEATURES), as on the Pico W and ESP32, and no extra frozen
//    libraries, so code that runs here also runs on the boards (N-01).

#define MICROPY_PY_SYS_SETTRACE (1)

#define MICROPY_VM_HOOK_COUNT (64)
#define MICROPY_VM_HOOK_INIT static uint vm_hook_divisor = MICROPY_VM_HOOK_COUNT;
#define MICROPY_VM_HOOK_POLL if (--vm_hook_divisor == 0) { \
        vm_hook_divisor = MICROPY_VM_HOOK_COUNT; \
        extern void mp_js_hook(void); \
        mp_js_hook(); \
}
#define MICROPY_VM_HOOK_LOOP MICROPY_VM_HOOK_POLL
#define MICROPY_VM_HOOK_RETURN MICROPY_VM_HOOK_POLL
