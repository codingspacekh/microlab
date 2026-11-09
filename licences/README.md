# Licences of what MicroLab ships

The licence texts `npm run licences` (`scripts/licences.ts`) puts in **THIRD_PARTY_LICENSES.txt** — shown in
*About ▸ Licences* (M11.4, N-11) — that can't be read from the installed files themselves. The npm packages, pip,
Jedi and parso, Electron and the library pack carry their own; the build reads them where they are.

| Folder | What | Licences | Taken from |
|---|---|---|---|
| `python/` | CPython 3.13.18 and every library it is built with (OpenSSL, SQLite, Tcl/Tk, zlib, …) | Python-2.0, 0BSD, Apache-2.0, BSD, MIT, TCL, X11, Zlib, bzip2 | python-build-standalone's *full* builds ([`python/README.md`](python/README.md)) |
| `micropython/` | MicroPython v1.29.0 — the simulation's WebAssembly build, and the Pico W firmware | MIT (its own `LICENSE`, listing its bundled parts) | micropython/micropython at `v1.29.0` |
| `pico-w-firmware/` | In the Pico W firmware: Infineon's **cyw43-driver** (Wi-Fi/Bluetooth) and the **pico-sdk** | cyw43: Raspberry Pi's licence — redistribution only with RP2040 and its notice reproduced (`LICENSE.RP`); pico-sdk: BSD-3-Clause | the submodules of MicroPython v1.29.0 (cyw43-driver `055d642`, pico-sdk `98a542c`) |
| `micropython-microbit/` | micro:bit MicroPython v2.1.2 (the micro:bit firmware) | MIT | microbit-foundation/micropython-microbit-v2 |
| `micropython-microbit/codal/` | **CODAL**, which the micro:bit firmware is built on, and Nordic's nRF5 SDK in it | CODAL: MIT (Lancaster University); nRF5 SDK: Nordic's 5-clause licence — binaries only with a Nordic chip, notice reproduced | lancaster-university/codal-microbit-v2, codal-core, codal-nrf52; microbit-foundation/codal-microbit-nrf5sdk (`LICENCE.txt`) — 2026-11-09 |

**A new firmware, Python or library**: its licence texts here first; `scripts/licences.ts` names the folders of each
firmware (`FIRMWARE_LICENCES`) and refuses one it doesn't know.
