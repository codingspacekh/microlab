# MicroLab variant (see mpconfigvariant.h). Frozen: the boards' standard asyncio (manifest.py).
FROZEN_MANIFEST = $(VARIANT_DIR)/manifest.py
# No ASYNCIFY (it made the GC yield to JavaScript mid-program and cost ~70 % speed, docs/acceptance/M0.md).
# Instead binaryen's spill-pointers pass keeps every pointer-sized local on the C stack around calls, so the
# garbage collector finds them with emscripten_scan_stack alone (MICROLAB_SPILL_POINTERS in main.c).
JSFLAGS += -s BINARYEN_EXTRA_PASSES=--spill-pointers
# The pass finds __stack_pointer by name, so keep the name section (-g2 at link time only; no DWARF).
JSFLAGS += -g2
