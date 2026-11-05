# MicroLab variant (see mpconfigvariant.h). The default frozen manifest (asyncio only).
# ASYNCIFY lets the garbage collector scan WebAssembly's registers (emscripten_scan_registers), so memory is
# collected safely while a student's `while True:` program runs — as in upstream's standard variant.
JSFLAGS += -s ASYNCIFY
