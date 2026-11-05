# 2. Architecture

*Revision 2 (2026-11-05): renamed **MicroLab** (`.mlab` files); layout and form-control rules (N-13, N-14) in §2.1, §2.8, §2.10.*

*Revision 1 (2026-11-05): first architecture, for the teacher's comments. It follows requirements Rev 5
([`01-analysis-and-requirements.md`](01-analysis-and-requirements.md)) and the approved prototype
([`../design/screens/index.html`](../design/screens/index.html)). Points the M0 spike must confirm are marked **(spike)**.*

## 2.1 Decisions

| Decision | Choice | Why |
|---|---|---|
| App type | **Electron** desktop app, Windows 11 + macOS (Intel, Apple Silicon) | Offline (N-04), USB serial for real boards, same as the other edutools apps (Q9, Q14) |
| Language | **TypeScript** everywhere; Python only for the simulated board modules | One language and one test runner for one maintainer (Q14) |
| Build | **electron-vite** (main · preload · renderer · worker), `electron-builder` for installers | One config for the four bundles; installers as in the gradebook (Q11) |
| UI | **React 19** | As the gradebook |
| Workspace | **SVG** drawn by React from the project model | Sharp at any zoom, exact pin hit-testing, testable in the DOM |
| Code editor | **CodeMirror 6** with a Python mode and our own completion source per board | Light, offline, good autocomplete (F-20) |
| MicroPython | The official **webassembly** port, version pinned, in a **Web Worker** | The real compiler, VM and error messages (N-01, §1.6 option A). The npm build or our own build with a small patch (a stop hook), decided by the spike (R1) |
| Circuit engine | Our own **pure TypeScript**: connectivity, MNA solver, part behaviours, fault rules | Small, unit-testable, ≤ 1 ms per solve; can become Rust → WebAssembly behind the same interface if ever too slow (Q14, R9) |
| Real boards | **`serialport`** in the main process; our raw-REPL protocol in pure TypeScript | Port list with USB IDs and hot-plug for F-55 without the browser's port chooser; the protocol is testable against a fake board (Q15) |
| Project file | `.mlab` = a **zip**: `project.json` + the `files/` tree | One file to share (F-02), holds the board's folder tree (F-21, §1.12), versioned for N-09 |
| Validation | **Zod** for `project.json`, part and board data | Bad or old files give a clear message, never a crash |
| Tests | **Vitest** (unit · python · integration · component · acceptance) + **Playwright for Electron** | As the other apps; MicroPython WebAssembly also runs in Node, so the board layer is tested headless |
| Lint | ESLint with a boundary rule (pure folders import no Electron, Node, DOM or React), and a **controls rule**: no `<select>`, no `<input type="date" / "time" / "color" / "range" / "number">` outside `src/renderer/ui/` | Keeps the engine pure and portable (Q14); only our own controls reach the screen (N-14) |
| Layout | CSS grid and flex only; panel widths as proportions with `clamp()` limits; draggable dividers (remembered in settings); no fixed page width | Fills the window at any size (N-13) — the gradebook's lesson |
| Form controls | Our own kit in `src/renderer/ui/`: TextField, NumberStepper (with unit and quick values), Select (listbox, groups, disabled options), Checkbox, Radio, Switch, Slider, Segmented, ColourPicker, SearchField, TimeField — accessible (keyboard, ARIA roles), every state drawn as on prototype screen 12b | N-14; one look everywhere, tested once |

**Not in v1:** schematic view (F-19), robot arena (F-70), IoT and Wi-Fi (F-80–F-82), Arduino (Q13),
guided projects (Q7), the micro:bit `radio` module (one simulated board has no one to talk to: it
raises a clear "not simulated in MicroLab" error, as N-01 asks).

## 2.2 Processes and layers

```
┌─ Main process (Node) ── src/main ──────────────────────────────────────────────────────────┐
│ windows · menus · open/save .mlab · autosave & recovery · settings · USB: port watcher,    │
│ serial connections, firmware copy (F-50–F-56) · installers/updates (M11)                    │
└───────────────▲─────────────────────────────────────────────────────────────────────────────┘
                │ typed IPC, only through src/preload (contextIsolation on, no nodeIntegration)
┌─ Renderer (window) ── src/renderer ───────────────────┐      ┌─ Simulation worker ── src/sim ───────────┐
│ React: start · workspace (SVG) · editor · console ·   │      │ MicroPython (WebAssembly)                 │
│ plotter · inspector · learn pages · dialogs           │ ───► │   student's files in its file system      │
│ state: project store + undo stack (lib/editor)        │ ◄─── │   board modules (python/<board>/)         │
└───────────────────────────────────────────────────────┘      │ _ream bridge (JS) → circuit engine        │
                                                               │   (lib/circuit + lib/parts, in-worker)    │
                                                               └───────────────────────────────────────────┘
┌─ PURE libraries ── src/lib/** (no Electron, Node, DOM, React — enforced by lint) ──────────────────────────┐
│ circuit · parts · boards · project · editor · errors · repl · usb · learn                                 │
└───────────────────────────────────────────────────────────────────────────────────────────────────────────┘
┌─ Data ── library/ (boards, parts, examples, library pack, firmware, learn content) ───────────────────────┐
```

**Rules**
- Dependencies point to `src/lib` and `library/`, never the other way.
- **The circuit engine runs inside the simulation worker**, next to MicroPython. A pin write solves the
  circuit at once and a pin read returns the solved voltage, with no message round trip.
- The worker cannot receive messages while Python is running (a busy loop or a `sleep` blocks it).
  So **everything going in is shared memory, everything coming out is messages**:

| Direction | Channel | Contents |
|---|---|---|
| Window → worker | `SharedArrayBuffer` *control* (Atomics) | Stop, restart, "input changed" wake-up |
| Window → worker | `SharedArrayBuffer` *inputs* | Buttons pressed, knob and slider values, sensor settings (distance, light, temperature, tilt) — one slot per input, laid out from the netlist |
| Window → worker | `postMessage` (before a run only) | The netlist, part properties, the project's files, the board |
| Worker → window | `postMessage`, at most 60 per second | Part states (LED brightness, servo angle, OLED pixels, NeoPixel colours, display), console text, the line being run, faults, errors, end of run |

`SharedArrayBuffer` needs the window to be cross-origin isolated: the renderer is served from a custom
`app://` protocol that sends the COOP/COEP headers **(spike)**.

## 2.3 How a run works

```
Run ─► renderer: wiring check (F-18) → netlist → postMessage(start{board, netlist, files})
     ─► worker: fresh MicroPython · files written to its file system (F-21) · board modules on the path
             · run boot.py then main.py
Python  Pin(15, Pin.OUT).value(1)
     ─► python/rp2/machine.py ─► _ream.pin_write(15, 1) ─► engine: drive net → solve → behaviours → faults
     ◄─ part states batched to the window (≤ 60/s) · a fault (burnt LED, short) stops the run with its message
Python  time.sleep(0.5)
     ─► clock.sleep(500): Atomics.wait on *control* in short slices; wakes for Stop, or an input change
        (runs the engine, then pending IRQ handlers via micropython.schedule)
Stop ─► control flag set → the VM's poll hook raises KeyboardInterrupt (normal end, REPL ready, F-23) (spike)
     ─► if Python hasn't stopped after 300 ms: the worker is terminated and a fresh one prepared (N-03: ≤ 0.5 s)
```

**Time.** `time.sleep`, `ticks_ms`, `ticks_us` and timers all read a `Clock`. The app uses the
`RealClock` (wall time, F-39). Tests use a `VirtualClock` that jumps ahead on `sleep` and creeps forward
on every poll, so ten simulated seconds of *Blink* take a few milliseconds and busy-wait loops still end.

**Engine timing.** The circuit is solved on every pin change and input change, and on a 10 ms tick for
parts that move over time (a servo turning, a motor spinning up). PWM is solved by its average for
brightness and speed, and read by pulse width for servos (§1.7).

**While running**, the circuit cannot be edited (the parts panel and wiring are greyed out); the inputs
work, and the code can't be edited either (the editor shows the line being run). Stop to change things.

## 2.4 The simulated board (hardware layer)

Each board is three things, so a new board (Q13) is mostly data plus one folder of Python:

| Piece | Where | What |
|---|---|---|
| Board data | `library/boards/<id>/board.json` | Every pin: label, number, position on the picture, functions (ADC, PWM, I²C, SPI, UART, touch, DAC), input-only, strapping, limits (mA, V), built-in parts (LED on `Pin("LED")` / GPIO 2, buttons, display) — checked against the official pinout (M1) |
| Board modules | `src/python/<id>/` (`machine.py`, `microbit/`, `neopixel.py`, `dht.py`, `rp2.py`, `esp32.py` …) | The board's MicroPython API in Python, with the **same signatures and error messages** as the real firmware (`ValueError: invalid pin`, `OSError: [Errno 19] ENODEV`) |
| `_ream` bridge | `src/sim/bridge.ts` (registered as a JS module) | A small, board-neutral set of calls: `pin_mode`, `pin_write`, `pin_read`, `adc_read`, `pwm_set`, `i2c_transfer`, `spi_transfer`, `uart_write/read`, `bitstream`, `pulse_in`, `irq_set` … into the engine |

**Protocol parts answer at the transaction level, not bit by bit** (§1.6). `I2C.writeto(0x3C, buf)` →
the engine finds the parts whose SDA/SCL pins are on those nets → the SSD1306 behaviour takes the bytes
→ ACK, or `ENODEV` if it isn't wired as on the real board. `time_pulse_us(echo, 1)` after a trigger
pulse → the HC-SR04 behaviour returns 58 µs per cm of the distance slider. `neopixel.write()` →
`bitstream` → the strip's behaviour gets the colours.

**Faithfulness (N-01) is tested against the real boards.** Each board module has *golden* tests:
snippets run on a real board by hand (with `mpremote`), their output and error text saved in
`tests/golden/<board>/`; the simulated board must print the same.

## 2.5 The circuit engine (`src/lib/circuit`, `src/lib/parts`)

```
project (board, breadboard, parts, wires)
   │ toNetlist()            union–find over breadboard strips, rails, wires, pins (F-12)
   ▼
netlist: nets + devices     each part type gives devices: resistor, diode/LED, switch, source,
   │                        pin driver (HIGH/LOW/Hi-Z with pull-up/down), probe
   │ solve(netlist, state)  MNA, Newton iterations for diodes; ≤ 1 ms for 40 parts (perf test, Q14)
   ▼
voltages & currents ──► behaviours (lib/parts): LED brightness, servo angle, motor speed, OLED frame…
                    └─► faults (lib/circuit/faults): over-current, short, 5 V on a 3.3 V pin,
                        floating input, servo on 3V3 … each with numbers and a fix (F-37, §1.3)
```

- `solve()` is the **one interface** Q14 asks for: plain data in, plain data out. Rust → WebAssembly
  would replace only this function, against the same tests.
- A **behaviour** is a pure state machine per part type: `(state, inputs from the solve, bus
  transactions, dt) → (state, outputs, faults)`. No timers or I/O inside.
- Faults are checks on the solved values, so the same rules give the live warnings (M9) and the
  wiring check (F-18).

## 2.6 Real boards (`src/main/usb`, `src/lib/usb`, `src/lib/repl`)

```
src/main/usb/watcher.ts   SerialPort.list() about once a second (+ the USB device list on Windows,
                          to spot a chip with no driver) → diff → lib/usb/detect.ts
lib/usb/detect.ts         PURE: USB IDs + greeting → board state (F-55, §1.13 table)
lib/usb/helper.ts         PURE: what was seen → the helper's step and message (F-56)
lib/repl/                 PURE raw-REPL protocol over a byte-stream interface: enter, exec, files
                          (list, read, write in chunks under a temporary name, rename, checksum),
                          soft reset (Q15, R10)
src/main/usb/board.ts     opens the port (DTR/RTS set so an ESP32 isn't held in its bootloader),
                          runs lib/repl over it, closes it when idle
src/main/usb/firmware.ts  copies the shipped .hex / .uf2 to the MICROBIT / RPI-RP2 drive (F-52, Q18)
```

- The port is opened only to check a newly plugged board, to send, to show the console or Board
  files, and closed again, so Thonny can use the board in between (F-55).
- **Send to board** compares the project's files with the board's (size + checksum) and sends only
  what changed (F-50).
- The tests use `FakeBoard`: a small MicroPython-like responder over an in-memory stream, with a file
  system, greetings per board, and faults to stage (busy, no reply, unplugged mid-copy).

## 2.7 The project file and the library

**`.mlab`** (a zip):

```
project.json      { format: 1, board: "pico-w", breadboard, parts[], wires[], view, notes, locked? }
files/main.py     the folder tree as on the board (F-21, §1.12)
files/lib/ssd1306.py
```

- `src/lib/project/format.ts` reads and writes it; `migrate.ts` upgrades every older `format` in
  steps, with a saved file per old version in `tests/fixtures/projects/` (N-09).
- Autosave writes the open project to the app's data folder every few seconds and on every run;
  after a crash the start screen offers to recover it (F-03).
- Examples (F-04) are ordinary `.mlab` sources, opened as a copy.

**`library/`** (shipped with the app, read-only, all data — N-10):

```
library/boards/<id>/      board.json · art.svg · learn.md (F-41)
library/parts/<id>/       part.json (pins, properties, limits, device + behaviour model names) ·
                          art.svg · learn.md · wiring/ · examples/<board>.py + expect.json (F-40, §1.8)
library/examples/<id>/    <board>.mlab sources + expect.json
library/lib-pack/         ssd1306.py, dht helpers, hcsr04.py … + LICENCES (F-54)
library/firmware/         micro:bit .hex, Pico / Pico W .uf2, pinned versions + licences (F-52)
library/drivers/          CP210x / CH340 installers for Windows, if their licences allow it; else a link (F-56, R5)
library/glossary.md       (F-42)
```

**The prototype's drawings become the first library art.** `design/svgparts.py` already draws each
board and part from its real pin positions; `scripts/export-art.py` writes its pictures to `art.svg`
and the pin coordinates into `part.json` / `board.json`, so the app looks like the approved screens and
every wire ends on a real pin.

`expect.json` says what a run must show, e.g. `{"seconds": 4, "pins": {"GP15": "toggles 1 Hz"},
"console": ["Distance: 25 cm"]}`. The acceptance suite runs every example on every board with the
`VirtualClock` (§2.3).

## 2.8 Project structure

```
src/
  main/              Electron main: app, windows, menus, ipc handlers, files, autosave, settings, usb/
  preload/           the only bridge: a typed `ream` API (files, board, app) — nothing else reaches Node
  renderer/          React UI
    ui/              the form-control kit and layout pieces (Panel, Divider, Dialog) — the only place native inputs appear (N-13, N-14)
    app/             shell, routes between Start · Workspace · Learn · Examples
    workspace/       SVG canvas, parts panel, wiring, inspector, multimeter, fault overlays
    editor/          CodeMirror setup, completion per board, error underline, file tree
    console/         console, REPL, plotter (F-23, F-26)
    learn/           part pages, board pages, glossary (F-40–F-44)
    board/           board chip, Send to board, Board files, connection helper (F-50–F-56)
    sim-client.ts    starts/stops the worker, owns the shared buffers, applies part states
  sim/               the worker: loader (MicroPython WebAssembly), bridge, clock, run control
  python/            board modules: common/ · microbit/ · rp2/ · esp32/
  lib/               PURE
    circuit/         netlist, connectivity, solver, devices, faults
    parts/           behaviour models, one file per part type
    boards/          board data types, pin queries ("which pins can do PWM?")
    project/         model, .mlab format, migrations, file tree rules (micro:bit flat, size limits)
    editor/          commands with undo/redo, selection, snapping to holes, wire paths
    errors/          MicroPython error → friendly explanation (F-24)
    repl/  usb/      §2.6
    learn/           learn-page parsing and checks (every part has every section)
library/             §2.7
scripts/             export-art.py · record-golden (runs snippets on a real board) · build helpers
design/              the HTML prototype (`python3 design/build.py`)
spikes/              throw-away experiments, never imported (M0)
tests/               unit · python · integration · component · acceptance · e2e · golden/ · fixtures/
```

## 2.9 Commands

```bash
npm run dev          # the app with live reload
npm run check        # the gate: lint, type-check, all Vitest projects + coverage, build
npm run e2e          # Playwright against the built Electron app
npm run perf         # the solver and run-speed budgets (also part of check)
npm run golden -- --board pico-w   # record golden outputs from a real board (manual, M2)
npm run art          # design/svgparts.py → library art and pin positions
npm run dist         # installers: Windows .exe, Mac .dmg (Apple chip, Intel) (M11)
```

## 2.10 Where to add things

- **A part** → `library/parts/<id>/` (data, art, learn page, examples + `expect.json`); a behaviour in
  `src/lib/parts` with unit tests, if it needs a new one; its examples join the acceptance suite by
  themselves.
- **A board** → `library/boards/<id>/`, `src/python/<id>/`, golden outputs from the real board, and the
  board's line in `lib/usb/detect.ts`.
- **An electrical rule or fault** → `src/lib/circuit` with a hand-checked test (N-02), then its
  message in the fault table.
- **A friendlier error message** → `src/lib/errors` with the real MicroPython text as the test input.
- **A screen** → design it in `design/` first; a React component tested with Testing Library; an E2E
  for the story. Lay it out with grid / flex and proportions (no fixed page width), use only the
  controls from `src/renderer/ui/`, and check it at 1280, 1440 and 1920 wide (N-13, N-14).
- **A new kind of control** → add it to `src/renderer/ui/` with every state (normal, hover, focus,
  error, disabled) and keyboard use, show it on prototype screen 12b first.
- **Anything touching the real board** → through `lib/repl` (tested with `FakeBoard`); only
  `src/main/usb` opens ports.
- **A change to `project.json`** → bump `format`, add a migration step and a saved old file to
  `tests/fixtures/projects/`.
