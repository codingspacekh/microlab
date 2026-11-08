# MicroLab — Milestones & TDD Workflow

How MicroLab is built, **in what order**, and **how each part is proven to work** before the next one starts.

- Requirements (F-30, N-01, Q15…): [`01-analysis-and-requirements.md`](01-analysis-and-requirements.md)
- System design (processes, engine, board layer, file format): [`02-architecture.md`](02-architecture.md)
- UI prototype: [`../design/screens/index.html`](../design/screens/index.html)

*Revision 5 (2026-11-06): **Real boards next.** The teacher has a micro:bit V2 and a Pico W at hand: **M10 (Real boards) is built right after M4**, before M5–M9 (the milestones keep their numbers). Its step 0 — prototype screens 13–16 — is drawn and waiting for approval. The golden recordings deferred in M2 were made on both boards (docs/acceptance/M2.md 26–31).*

*Revision 4 (2026-11-06): **Build like Tinkercad, earlier** — the teacher asked for Tinkercad's way of placing parts, wires with bend points and part values in M4, not M5: new slice **M4.3b** takes the first part of M5.1 (delete), M5.2 (the full breadboard), M5.3 (bend points, wire colour) and M5.4 (the inspector).*

*Revision 3 (2026-11-06): **Run runs the open file**, as Thonny does (requirements Rev 7, Q19): the run's entry file in M4.5, the button's file name and its ⌄ menu with the file tree in M5.6.*

*Revision 2 (2026-11-05): renamed **MicroLab**; layout and form-control rules (N-13, N-14) in the Definition of Done, M4 and M11.*

*Revision 1 (2026-11-05): first plan, for the teacher's comments. No code is written before it is agreed.*

---

## Contents

1. [Principles](#1-principles)
2. [The TDD workflow](#2-the-tdd-workflow)
3. [Testing strategy per layer](#3-testing-strategy-per-layer)
4. [Definition of Done and milestone gates](#4-definition-of-done-and-milestone-gates)
5. [Milestone overview](#5-milestone-overview)
6. [Milestones in detail](#6-milestones-in-detail)
7. [Requirement → milestone map](#7-requirement--milestone-map)
8. [Progress tracker](#8-progress-tracker)

---

## 1. Principles

1. **The riskiest thing first.** MicroPython WebAssembly in a worker, with real `sleep`, pin calls and a
   Stop that always works (R1), is proven in a throw-away spike in M0, before anything is built on it.
2. **Build from the inside out.** The circuit engine (pure TypeScript), then the simulated boards
   (headless), then the two joined, then the UI. Each layer rests on one that is already tested.
3. **Faithful is the product (N-01, N-02).** Electrical answers are checked by hand; MicroPython output
   and error messages are checked against **real boards** (golden tests, §3.1).
4. **A thin end-to-end slice early.** By M4 a student can build *Blink* on each board and run it. Later
   milestones *add* to a working app.
5. **The examples are the acceptance suite.** Every example project has an `expect.json` and runs
   automatically on every board in every milestone from M3; in M10 the same files run on the real boards.
6. **One gate per milestone.** A milestone is finished only when its **exit gate** passes (§4). The next
   one does not start before that.
7. **Design before UI.** A screen is built only after its prototype screen is approved. Screens not in the
   approved prototype (Board files, the board chip, the connection helper) are designed at the start of M10.
8. **Small, always green.** Slices of an hour or two. `main` always passes `npm run check`.

## 2. The TDD workflow

### 2.1 The cycle

```
        ┌──────────────┐
        │ 1. RED       │  Write ONE small test for the next behaviour. Run it. It must fail
        │              │  (and fail for the right reason).
        └──────┬───────┘
               ▼
        ┌──────────────┐
        │ 2. GREEN     │  Write the simplest code that makes it pass. Run ALL tests.
        └──────┬───────┘
               ▼
        ┌──────────────┐
        │ 3. REFACTOR  │  Clean up names, duplication, structure. Tests stay green.
        └──────┬───────┘  Commit.
               └──────────► next test
```

### 2.2 Double-loop TDD (feature level)

```
OUTER LOOP — acceptance test (slow, few)
  "Blink on the Pico W: with GP15 → 220 Ω → red LED → GND, the LED is lit for 0.5 s and dark for 0.5 s,
   four times in 4 simulated seconds, and the console prints nothing unexpected"
  ── written FIRST (examples/blink/expect.json), fails until the whole feature works ──
        │
        ▼
  INNER LOOP — unit / python / integration tests (fast, many), red → green → refactor
    • the LED, resistor and pin share one net per breadboard strip (F-12)
    • 3.3 V → 220 Ω → red LED gives 5.9 mA ± 1 % (N-02)
    • Pin(15, Pin.OUT).value(1) reaches the bridge as pin_write(15, 1) (F-31)
    • time.sleep(0.5) moves the VirtualClock by 500 ms
        │
        ▼
  outer test passes → feature done
```

### 2.3 Rules

| # | Rule |
|---|---|
| T1 | **No production code without a failing test first**, for `src/lib`, `src/sim`, `src/python`, `src/main`. |
| T2 | UI *behaviour* is test-driven (a wire dropped on empty space is not created). UI *looks* are checked against the prototype screen, not unit-tested. |
| T3 | Write a short **test list** before starting a feature: behaviours, edge cases and requirement IDs. Tick them off one by one. |
| T4 | **Every bug starts with a failing regression test** that reproduces it. |
| T5 | Test names carry the requirement ID: `describe('F-12 breadboard strips')`, `it('N-02 LED current within 1 %')`. |
| T6 | Electrical tests use **hand-worked answers** written in the test (`(3.3 − 2.0) / 220`), never numbers copied from the solver's own output. |
| T7 | Board behaviour is compared with the **real board** (golden files), not with what we think MicroPython does. |
| T8 | Keep the unit suite **under 10 seconds**. MicroPython tests are `python`; worker, file and USB tests are `integration`; browser tests are `e2e`. |
| T9 | Commit on green. Small commits, message starts with the milestone or ID: `M1 N-02: LED current from the solver`. |
| T10 | Spikes only in `spikes/`, never imported by `src/`, rewritten test-first. |

### 2.4 Worked example (N-02, LED current)

```ts
// 1. RED — tests/unit/circuit/led.test.ts
describe('N-02 LED current', () => {
  it('3.3 V → 220 Ω → red LED is (3.3 − 2.0) / 220 ≈ 5.9 mA', () => {
    const r = solve(netlist`3V3 -[220]- A; A -|>|red- GND`);
    expect(r.current('led1')).toBeCloseTo((3.3 - 2.0) / 220, 4);   // within 1 %
  });
  it('the same LED reversed carries no current', () => {
    const r = solve(netlist`3V3 -[220]- A; A -|<|red- GND`);
    expect(r.current('led1')).toBeLessThan(1e-6);
  });
});
// 2. GREEN — diode model with Newton iterations in src/lib/circuit/devices/diode.ts
// 3. REFACTOR — share the convergence loop with the LED colours, commit "M1 N-02: LED current"
```

## 3. Testing strategy per layer

| Layer | What is tested | Tools | How / target |
|---|---|---|---|
| `src/lib/circuit` | Connectivity, solver, devices, faults | Vitest `unit` | Hand-worked answers (T6), broken circuits included. **≥ 95 %** line + branch. Perf: 40 parts ≤ 1 ms |
| `src/lib/parts` | Behaviour state machines (servo, HC-SR04, SSD1306, DHT, NeoPixel …) | Vitest `unit` | Inputs → outputs, from the datasheets. ≥ 90 % |
| `src/lib/project`, `editor`, `errors`, `repl`, `usb`, `boards`, `learn` | File format and migrations, undo/redo, friendly errors, raw REPL, detection | Vitest `unit` | `FakeBoard` for the REPL, recorded port lists for detection. ≥ 90 % |
| `src/python` + `src/sim` | The board modules running in real MicroPython | Vitest `python` (MicroPython WebAssembly in Node) | Snippets → pin traces, console text, errors; **golden files from real boards** (§3.1). ≥ 85 % of the bridge |
| Worker, main process | Run control and Stop, shared buffers, files, autosave, serial | Vitest `integration` | A real worker; temp folders; `FakeBoard` over a fake port |
| `src/renderer` | Behaviour: placing, wiring, inspector, editor, console, dialogs | Vitest `component` + Testing Library | jsdom; the worker and the `ream` API replaced by fakes |
| Requirements | Every example on every board | Vitest `acceptance` | `.mlab` + `expect.json`, headless with the `VirtualClock` |
| Whole app | Key student stories | Playwright for Electron `e2e` | The built app; ~1–2 stories per UI milestone |
| Real boards | Faithfulness, USB, drivers | Manual, recorded in `docs/acceptance/M<n>.md` | M2 (golden recording), M10 (the full matrix) |

### 3.1 Fixtures

| Fixture | Made from | Used for |
|---|---|---|
| `tests/fixtures/circuits/*.ts` | Hand-drawn circuits with hand-worked answers (divider, LED, series/parallel, short, reversed LED, no resistor) | Solver and faults (M1) |
| `tests/golden/<board>/*.py` + `.out` | Snippets run on a real micro:bit V2, Pico W and ESP32 with `mpremote` (`npm run golden`), their output and errors saved | The board modules must print the same (M2, T7) |
| `library/examples/*/` + `library/parts/*/examples/` | The example projects and their `expect.json` | Acceptance from M3 |
| `tests/fixtures/projects/format-<n>.mlab` | A saved file per old format | Every old file still opens (N-09) |
| `tests/fixtures/usb/*.json` | Port lists recorded on Mac and Windows with each board, BOOTSEL, no driver, two boards | Detection and the helper (M10) |
| The design screens' circuits (`design/scenes.py`) | *Traffic lights*, *Blink*, the ESP32 distance project … | The same circuits in e2e tests, so the app matches the approved screens |

## 4. Definition of Done and milestone gates

### 4.1 Definition of Done (every feature)

- [ ] Test list written; every item has a test that went red → green.
- [ ] Requirement ID in test names and the commit message.
- [ ] `npm run check` passes (lint, type-check, unit, python, integration, component, acceptance, build).
- [ ] Coverage thresholds for the touched layer still met; perf budgets still met.
- [ ] Matches the prototype screen (if it has UI).
- [ ] Fills the window at 1280, 1440 and 1920 wide — no empty bands, nothing cut off (N-13).
- [ ] Uses only the controls from `src/renderer/ui/`; lint passes the controls rule (N-14).
- [ ] No `TODO` left in the code.

### 4.2 Milestone exit gate (all must pass)

1. ✅ All Definition-of-Done items for every feature in the milestone.
2. ✅ The milestone's **automated acceptance tests** pass (and `npm run e2e` from M4 on).
3. ✅ The milestone's **manual checks** done by the teacher, results noted in `docs/acceptance/M<n>.md`.
4. ✅ No open bugs marked *blocker*.
5. ✅ `dev` merged into `main`, tagged `v0.<n>.0`.

If a gate fails, fix forward inside the same milestone. Do **not** start the next one.

### 4.3 Branches

| Branch | Purpose |
|---|---|
| `dev` | Day-to-day work; every commit is green locally. |
| `main` | Only gate-passed milestones, merged from `dev` with `--no-ff` and tagged. |

The repository is local only (Q12: private). `.github/workflows/ci.yml` runs the same checks if it is
ever pushed; until then `npm run check` is the gate.

## 5. Milestone overview

```
M0 Foundations + MicroPython spike ─► M1 Circuit engine ─► M2 Simulated boards (headless)
        ┌──────────────────────────────────────────────────────────────┘
        ▼
M3 Code drives the circuit ─► M4 Walking skeleton ─► M5 Full editor
        ┌──────────────────────────────────────────────────────────────┘
        ▼
M6 Parts pack 1: inputs ─► M7 Parts pack 2: outputs & displays ─► M8 Learn
        ┌──────────────────────────────────────────────────────────────┘
        ▼
M9 Errors, faults & multimeter ─► M10 Real boards ─► M11 Hardening & v1.0
        └─► later phases: guided projects (Q7) · robot arena (F-70) · IoT & Wi-Fi (F-80–F-82; Rev 8: the ESP8266 and the
            JDY-31 Bluetooth modules, over UART) · Arduino (Q13)
```

| # | Milestone | Main requirements | Size | Rough part-time weeks* |
|---|---|---|---|---|
| M0 | Foundations + MicroPython spike | tooling, test layers, Electron shell, R1 | S | 1 |
| M1 | Circuit engine | §1.7, F-12 (engine), F-37 (rules), N-02, board data, Q14 perf | M | 1.5 |
| M2 | Simulated boards (headless) | F-21 (engine), F-30–F-33, F-39, N-01, N-03 | L | 3 |
| M3 | Code drives the circuit | F-31–F-33 joined to the engine, acceptance runner | M | 1.5 |
| M4 | Walking skeleton | F-01, F-02, F-10, F-13, F-20, F-22, F-23, F-60 (screens 01, 02, 03 in part) | M | 2.5 |
| M5 | Full editor | F-03, F-05, F-11–F-17, F-20, F-21 (UI) (screens 01, 02, 02b) | L | 2.5 |
| M6 | Parts pack 1: inputs & micro:bit sensors | F-34, F-35, F-36 (sound), F-54 (screens 06, 07 in part) | L | 3 |
| M7 | Parts pack 2: outputs & displays | F-33, F-34, F-36, F-54 (screens 06, 07) | L | 3 |
| M8 | Learn | F-04, F-06, F-25, F-40–F-42, F-44 (screens 09, 10, 11) | L | 3 |
| M9 | Errors, faults & multimeter | F-18, F-24, F-26, F-37, F-38, N-07 (screens 04, 05, 07) | M | 2 |
| M10 | Real boards | F-50–F-56, Q15, Q17, Q18, N-12 (screen 08 + new screens) | L | 2.5 |
| M11 | Hardening & v1.0 | N-05, N-06, N-09, N-11, installers (Q11), classroom trial | M | 1.5 |

\* *Very rough, for one maintainer working part-time: about 27 weeks in all. Re-estimate after M2.*
*The learning content (M6–M8) is the largest piece of work (R4); it can be drafted alongside M3–M5.*

## 6. Milestones in detail

Each milestone lists: **goal · build order (TDD slices) · tests written first · exit gate.**

---

### M0 — Foundations + MicroPython spike

**Goal:** an empty but fully tested Electron project, and a measured answer to R1: can the official
MicroPython WebAssembly run student code in a worker with real `sleep`, pin calls and a reliable Stop?

**Build order**
1. `git init`, branches `dev` / `main`; electron-vite with main · preload · renderer · worker bundles;
   a placeholder window titled **MicroLab**, served from `app://` with the COOP/COEP headers.
2. Vitest projects `unit`, `python`, `integration`, `component`, `acceptance`; coverage thresholds.
3. ESLint boundary rule: `src/lib/**` imports nothing from `electron`, Node built-ins, `react` or the DOM.
4. Playwright for Electron with a smoke test; `npm run check`, `npm run e2e`, a dormant CI file.
5. **Spike** in `spikes/micropython-worker/` (not test-first, T10), measuring:
   - load time of MicroPython in a worker (window and Node);
   - `print()` reaches the window; an exception gives the line number;
   - `time.sleep(1)` takes 1 s ± 20 ms and doesn't freeze the window;
   - a registered JS module sees `Pin(15).value(1)`; a pin read gets a value from a `SharedArrayBuffer`
     written by the window **while** Python sleeps;
   - Stop ends `while True: pass` in ≤ 0.5 s: by a poll hook (needs our own build?) or by ending the worker;
   - files written to its file system: `import mylib` from `lib/` works;
   - `self.crossOriginIsolated` is true in the packaged app on macOS and Windows.

**Tests first**
- Boundary rule: a file in `src/lib/` importing `electron` fails lint; the same import in `src/main/` passes.
- Component: the placeholder renders "MicroLab".
- E2E smoke: the built app opens its window with that title.

**Exit gate**
- `npm run check` and `npm run e2e` green.
- `docs/acceptance/M0.md` holds the spike's numbers and the decision: **npm build or our own build**, and how
  Stop works. If R1 fails, the fallback (MicroPython in a separate process) is planned before M2.
- Manual: the teacher opens the placeholder app.

---

### M1 — Circuit engine (pure TypeScript)

**Goal:** a breadboard circuit becomes nets, voltages, currents and faults, with hand-checked answers
(N-02) and no UI.

**Build order (TDD slices)**
1. Board data for the three boards (`board.json`: pins, positions, functions, limits, pull resistors,
   pin output resistance), checked by a Zod schema; pin queries ("pins with ADC").
2. `npm run art`: `design/svgparts.py` → `art.svg` and pin positions for the boards and the first parts.
3. Breadboard model (half, full): strips of five, power rails; `toNetlist()` with union–find (F-12).
4. Linear devices and the MNA solver: resistor, supply, pin driver (HIGH / LOW / high-impedance with
   pull-up / pull-down).
5. Diode and LED (five colours, forward voltages), Newton iterations.
6. Switch, push button, potentiometer, LDR as resistances that inputs can change.
7. Fault rules: over-current (part, pin, board total), short, over-voltage on a pin, floating input,
   servo on 3V3 (§1.3).
8. Perf test (Q14): a 40-part circuit solves in ≤ 1 ms.

**Tests first**
- Divider: 3.3 V, 10 k + 10 k → **1.65 V**; LED: 3.3 V → 220 Ω → red → **5.9 mA ± 1 %**; series and parallel.
- 3V3 wired to GND → *short*; LED straight on a HIGH pin → over-current with the number shown on screen 04.
- A reversed LED carries no current; an input pin on a net with nothing driving it → *floating*.
- Every pin in each `board.json` equals a hand-typed table from the official pinout.

**Exit gate**
- `src/lib/circuit` ≥ 95 % coverage; perf ≤ 1 ms on the teacher's slowest laptop.
- Manual: the teacher checks the three printed pin tables against the boards.

---

### M2 — Simulated boards (headless)

**Goal:** each board's MicroPython API runs in real MicroPython, in Node and in the worker, and behaves
like the real board — same results, same errors (N-01).

**Build order**
1. The sim core without a worker: load MicroPython, write the project's files into its file system,
   run `boot.py` then `main.py`, collect the console, report errors with file and line (F-21, F-30).
2. `Clock`: `RealClock` and `VirtualClock`; `time.sleep*`, `ticks_*` (F-39).
3. The `_ream` bridge and `python/common`: `machine.Pin` (modes, `value`, `on/off/toggle`, pulls, `irq`).
4. **Pico W** (`python/rp2`): `Pin("LED")`, `ADC` on GP26–28 and ADC 4, `PWM` (`freq`, `duty_u16`), `Timer`.
5. **ESP32** (`python/esp32`): input-only GPIO 34–39, `ADC` with `atten` / `width`, `PWM` (`duty`,
   `duty_u16`), `DAC`, `TouchPad`.
6. **micro:bit** (`python/microbit`): `pin0`–`pin20` (`read/write_digital`, `read/write_analog`,
   `is_touched`), `button_a/b`, `display` and `Image`, `accelerometer`, `music`, `sleep`,
   `running_time`, `temperature`; a flat file system (§1.12).
7. Bus APIs: `I2C`, `SPI`, `UART`, `bitstream`, `time_pulse_us` reach the bridge; with nothing answering
   they fail as on the real board (`ENODEV`, timeouts).
8. The worker wrapper: shared *control* and *inputs* buffers; Stop (N-03).
9. Golden outputs: about 20 snippets per board recorded from the real boards (`npm run golden`).

**Tests first**
- Per board: a snippet's pin trace (`[t, pin, value]`) equals the expected one.
- `Pin(34, Pin.OUT)` on the ESP32, `ADC(Pin(5))` on the Pico, `pin3.read_analog()` while the micro:bit
  display is on: the real board's error text.
- `time.sleep(1)` moves the `VirtualClock` by 1000 ms; Stop ends `while True: pass` in ≤ 0.5 s (integration).
- `import ssd1306` from `lib/` works on the Pico; `os.listdir()` on the micro:bit is flat.
- Every golden snippet prints exactly what the real board printed.

**Exit gate**
- `python` and `integration` green; ≥ 85 % of `src/sim` + `src/python`.
- Manual: golden recordings made on the three real boards and noted in `docs/acceptance/M2.md`.

---

### M3 — Code drives the circuit

**Goal:** the engine runs inside the worker; pin writes drive the circuit and pin reads come from it.
Proven without any UI.

**Build order**
1. Engine in the worker: `pin_write` → solve; `pin_read` / `adc_read` → solved voltage (pull-ups, buttons,
   knobs behave as real).
2. Inputs from the shared buffer wake a sleeping program; IRQs on edges run through `micropython.schedule`.
3. PWM by average (LED brightness, motor speed); pulse width kept for servos (§1.7).
4. Part states out to the window, batched to ≤ 60 per second.
5. Faults stop the run with their message.
6. The acceptance runner: every `.mlab` + `expect.json` on every board, headless, `VirtualClock`.
7. The first examples: *Blink*, *Button + pull-up*, *Potentiometer dimmer* for all three boards.

**Tests first**
- The nine example runs above pass their `expect.json`.
- An IRQ counter counts three simulated presses.
- *Blink* with the resistor removed: the run stops with the over-current fault.
- Run speed: a tight `led.toggle()` loop on the *Blink* circuit does ≥ 10 000 pin writes per second.

**Exit gate**
- Acceptance suite green (9 runs); perf budgets met.

---

### M4 — Walking skeleton (first usable app)

**Goal:** the real app, end to end: pick a board, place a few parts, wire them, write code, run it, save it.

**Build order**
1. Design tokens from `design/src/styles.css`; the shell: top bar (Workspace · Learn · Examples), status bar;
   panels with proportional widths and draggable dividers (N-13).
1b. The form-control kit in `src/renderer/ui/` — every control on screen 12b, every state, keyboard use (N-14).
2. Start screen (01, minimal): new project from a board (F-01), open a `.mlab`.
3. Workspace: board, half breadboard, resistor, LED, push button, potentiometer from the library art;
   drag from the parts panel (F-10), move (F-11), wires from pin to pin (F-13, basic).
3b. *(Rev 4)* Build like Tinkercad: a part is dragged from the panel, or clicked and then placed with a click
   (Esc cancels; from the keyboard: Enter picks it up, arrows move it hole by hole, Enter places it); wires with
   **bend points** — click a pin or hole, click on the canvas for each bend (snapped to the hole grid), click a pin or
   hole to end it (Backspace takes the last bend back, Esc cancels); a drag from point to point is still a straight
   wire. Select a part, a wire or the breadboard: the **inspector** (screen 02b) sets the resistor's value (E12
   stepper, quick values, colour bands), the LED's colour, the potentiometer's value, the wire's colour and the
   breadboard's size (half / full; shrinking is refused while parts use columns 31–63). **Delete** removes the
   selected part or wire (F-11, F-12, F-13, F-14).
4. Editor: CodeMirror, Python, one `main.py` (F-20, basic).
5. Run / Stop / Restart, console with `print()` (F-22, F-23); the LED glows, the button can be pressed (03).
   *(Rev 3)* The run takes an **entry file** (the open file; `main.py` while a project has only that) and runs it
   as `__main__`; `boot.py` first on the Pico W and ESP32 only — the micro:bit has none (Q19).
6. Save / open `.mlab` format 1 (F-02); a teacher's starter file is just a saved project (F-60).

**Tests first**
- Lint: a `<select>` or `<input type="color">` outside `src/renderer/ui/` fails the controls rule.
- Component: each control in the kit — Select opens with Enter, arrows move, Esc closes; Stepper − / + step
  through E12 values; a disabled control can't be changed.
- E2E: at 1280 × 720, 1440 × 900 and 1920 × 1080 the panels fill the window with no horizontal scroll; a
  divider dragged to a new width is still there after a restart.
- Component: a part dropped on the breadboard snaps to holes; a wire dropped on empty space is not created.
- *(Rev 4)* Component: a part clicked then placed with a click; by keyboard; a wire with two bends; the
  inspector changes a resistor's value, an LED's colour, a wire's colour and the breadboard's size; Delete.
- Unit: save → open gives the same project.
- Python: a run with entry `led_test.py` runs it as `__main__` (not `main.py`), and it can import another
  project file; `boot.py` runs first on the Pico W and ESP32, never on the micro:bit (Q19).
- E2E: build *Blink* on the Pico W from a new project, run it, the LED blinks; the same on micro:bit and ESP32.

**Exit gate**
- E2E green.
- Manual: the teacher builds *Blink* by hand on all three boards.

---

### M5 — Full editor

**Goal:** building and coding as on screens 01, 02 and 02b.

**Build order**
1. Rotate, duplicate, select several (F-11; delete came in M4.3b); undo / redo for every command (F-16).
2. Zoom, pan, fit (F-17); hovering a hole lights its strip (F-12); the full breadboard came in M4.3b.
3. Moving and deleting a wire's bend points (F-13; making them and wire colours came in M4.3b); pin hover card (F-15, screen 02).
4. The inspector for every part of M6 / M7 and the "Joins" line (F-14, screen 02b; the resistor, LED, potentiometer, wire and breadboard came in M4.3b).
5. Autocomplete from each board's modules, with a short explanation (F-20, screen 02b).
6. File tree: add / rename / delete files, `lib/`, the micro:bit's flat list and size warning (F-21).
   *(Rev 3)* Run runs the file open in the editor: the button names it (*▶ Run led_test.py*); its ⌄ menu has
   *Run main.py (as when the board is switched on)*; a non-Python file runs the last Python file run, or `main.py` (F-22, Q19).
7. Autosave and crash recovery (F-03); recent projects and the full Start screen (F-05, screen 01).

**Tests first**
- Every command: do then undo gives back the same project (one test over all commands).
- Autocomplete on the Pico shows `machine.Pin(id, mode=-1, pull=-1, …)`; the micro:bit shows `pin0…`.
- Making a folder in a micro:bit project is refused with a message.
- Component: with `led_test.py` open, Run says *Run led_test.py* and starts it; *Run main.py* from its menu
  starts `main.py`; with `index.html` open, Run runs the last Python file run (Q19).
- E2E: the app is killed while editing; on restart the project is offered back.

**Exit gate**
- E2E per screen 01, 02, 02b; the teacher compares the app with the prototype.

---

### M6 — Parts pack 1: inputs and the micro:bit's sensors

**Goal:** every input part in §1.4, each with its behaviour, controls while running, examples on all three
boards and the library-pack file it needs.

**Build order** (one part per slice: behaviour → example + `expect.json` per board → control → art)
1. Slide switch, LDR (light slider), RGB LED, battery packs, the micro:bit GPIO board (its pins and art are in since M1; here: its 5V switch and USB).
2. Active and passive buzzer with sound (Web Audio) (F-36).
3. PIR (a *motion* button), IR line sensor, soil moisture, TMP36 / LM35 (temperature slider).
4. DHT11 / DHT22 (the `dht` module), HC-SR04 (`time_pulse_us`, distance slider, screen 07), MPU6050 (S).
5. *(Rev 8)* The SunFounder Universal Maker Sensor Kit's inputs, on common modules (requirements §1.4, Rev 8):
   a. modules with a digital and/or analog output — button, photoresistor and potentiometer modules; touch (TTP223),
      vibration (SW-420), IR obstacle avoidance, Hall, flame, raindrop, water level, gas/smoke (MQ-2, its heater's
      current); joystick (two axes and a button), rotary encoder (quadrature), IR speed sensor (pulses);
   b. chips: PCF8591 (I²C ADC/DAC), BMP280 (I²C, its compensation), DS18B20 (`onewire`, `ds18x20`), DS1302 (three
      pins followed edge by edge), VL53L0X and MAX30102 (I²C; the hardest — last); a design screen before the UI.
6. micro:bit buttons A/B, touch logo, tilt / shake, temperature, light level (screen 06) (F-35).
7. Library pack files for these parts, with licences (F-54).

**Tests first**
- Each behaviour against its datasheet (HC-SR04: 58 µs per cm; DHT22: the bytes and checksum).
- Each part's examples pass on every board.

**Exit gate**
- Acceptance suite green; manual: the teacher tries every new part in the app.

---

### M7 — Parts pack 2: outputs and displays

**Goal:** every actuator and display in §1.4, the full bus support (F-34) and the micro:bit's display and music.

**Build order**
1. SG90 servo (pulse width → angle, the arm turns over time); DC motor with L298N / L9110S; relay (S);
   28BYJ-48 + ULN2003 (S); *(Rev 8, SunFounder's kit)* TT motor, centrifugal pump (through the relay or the driver),
   RGB LED, passive buzzer and traffic light modules, the breadboard power supply module (3.3 / 5 V).
2. SSD1306 OLED (I²C, screen 07) and its library-pack driver; 16×2 LCD over I²C; 7-segment digit.
3. WS2812 NeoPixel strip and ring (`neopixel`, `bitstream`); MAX7219 (C).
4. micro:bit 5×5 display and speaker, `music` on pin 0 (screen 06).
5. SPI and UART complete (F-34).

**Tests first**
- Servo: 1.5 ms → 90°, 0.5 ms → 0°; SSD1306: the init sequence and `show()` give the expected pixels;
  NeoPixel: GRB byte order per board.
- A servo on 3V3 raises the M1 warning; a motor straight on a pin raises over-current.
- Each part's examples pass on every board.

**Exit gate**
- Acceptance suite green; manual: the teacher tries every new part; screens 06 and 07 compared with the app.

---

### M8 — Learn

**Goal:** a page for every part and board, the glossary, the examples screen, and the ways into them.

**Build order**
1. The part page (F-40, screen 09) from `learn.md`, `part.json` and the wiring pictures; *Try it*.
2. The board page with the pin filter (F-41, screen 10); glossary (F-42); entry points (F-44).
3. Examples screen (F-04, screen 11); *Insert example code for this part* (F-25).
4. Export a picture of the circuit and the wiring list (F-06).
5. Content: drafts from the datasheets with AI help, checked by the teacher (R4).

**Tests first**
- The learn checker: every part has every section, a wiring picture and an example per board.
- Every *Try it* opens a project that passes its `expect.json`.
- The wiring list for *Traffic lights* equals the one printed on screen 08.

**Exit gate**
- Manual: the teacher has reviewed every page (checklist in `docs/acceptance/M8.md`).

---

### M9 — Errors, faults and the multimeter

**Goal:** mistakes in the code and in the circuit explain themselves (N-07).

**Build order**
1. Friendly errors (F-24, screen 05): about 40 common MicroPython errors, each with its explanation; the
   line underlined; the REPL after the program ends (F-23).
2. Faults on the workspace (F-37, screen 04): burnt LED, short, over-voltage …; the Problems list.
3. Wiring check before running (F-18).
4. Multimeter: voltage, current, resistance between two points (F-38).
5. Plotter (F-26, screen 07).

**Tests first**
- One test per explained error, using the real MicroPython text as input.
- One test per fault in §1.3, from the circuit to the message shown.
- The multimeter on the divider reads 1.65 V.

**Exit gate**
- Manual: the teacher makes each mistake in §1.3 and reads the message.

---

### M10 — Real boards

**Goal:** the same project runs on a real board, the board is found with no setup, and every common
connection problem says how to fix it.

**Build order**
0. **Design first:** prototype screens for the board chip and its states, the connection helper, and
   Board files (F-53, F-55, F-56) — approved before their UI slices. *(Rev 5)* Drawn: screens 13 (board chip),
   13b (every state), 14 (connection helper), 14b (install MicroPython), 15 (Board files), 16 (running on the board).
   **Approved by the teacher 2026-11-06** ("all are very well designed").
1. Detection (`lib/usb/detect`) from recorded port lists; the port watcher; the board chip (F-55, N-12).
2. Raw REPL over a byte stream with `FakeBoard`; the greeting check and soft reset on plug-in (Q15, R10).
3. Send to board: changed files only, temporary name then rename (F-50, screen 08).
4. The board's console (F-51).
5. Board files panel (F-53).
6. The connection helper, with Windows driver detection (F-56, R5).
7. Install MicroPython on a micro:bit or Pico from the app (F-52, Q18).

**Tests first**
- Each recorded port list → the right board state (Pico, BOOTSEL, micro:bit, ESP32 by chip, no driver, two boards).
- `FakeBoard`: three files, one changed → one written; unplugged mid-copy → no half file, and Send again finishes.
- Port busy → the helper's *used by another program* step; no greeting → *no MicroPython* step.
- Installing MicroPython on a micro:bit copies the project's files back afterwards.

**Exit gate**
- Manual matrix in `docs/acceptance/M10.md`: three boards × macOS and Windows 11, each shown within 2 s;
  each helper case staged (charge-only cable, no driver, Thonny holding the port, no MicroPython).
- The examples with `lib/` files run on the real boards as in the simulator; files copied both ways
  match by checksum.

---

### M11 — Hardening & v1.0

**Goal:** fast, accessible, licensed and installable.

**Build order**
1. Performance budgets on the slowest school laptop: start ≤ 5 s, ≤ 500 MB, a 40-part circuit at full speed (N-05).
2. The same features on Windows 11 and macOS Intel / Apple Silicon (N-06).
3. Keyboard use of the main actions; contrast (design system); every screen checked at 1280, 1440 and 1920 wide
   and only our own controls on screen (N-13, N-14).
4. Licences of everything bundled listed in the app, checked by a script (N-11).
5. Saved files from every earlier format open (N-09).
6. Installers and updates as in the gradebook (Q11); README.

**Exit gate**
- N-01–N-12 checked one by one in `docs/acceptance/M11.md`.
- The teacher's classroom trial, tagged `v1.0.0`.

## 7. Requirement → milestone map

| Requirement | Engine / headless | UI |
|---|---|---|
| F-01 new project, F-02 save / open, F-60 starter project | M4 | M4 |
| F-03 autosave, F-05 recent projects | M5 | M5 |
| F-04 examples | M3 (runner) | M8 |
| F-06 picture and wiring list | M8 | M8 |
| F-10 parts panel, F-13 wires | — | M4, M5 |
| F-11 move / rotate, F-14 inspector, F-15 pin hover, F-16 undo, F-17 zoom | M5 (`lib/editor`) | M5 |
| F-12 breadboard | M1 | M4, M5 |
| F-18 wiring check | M1 (rules) | M9 |
| F-20 editor and autocomplete | M2 (module lists) | M4, M5 |
| F-21 folder tree | M2 | M5 |
| F-22 Run / Stop, F-23 console and REPL | M2 | M4, M9 |
| F-24 friendly errors | M9 | M9 |
| F-25 snippets | — | M8 |
| F-26 plotter | — | M9 |
| F-30 real MicroPython, F-39 timing | M0 (spike), M2 | M4 |
| F-31 digital, F-32 analog, F-33 PWM | M2, M3 | M4 |
| F-34 I²C / SPI / UART | M2, M6, M7 | M6, M7 |
| F-35 inputs while running, F-36 outputs | M3, M6, M7 | M4, M6, M7 |
| F-37 faults | M1, M3 | M9 |
| F-38 multimeter | M1 | M9 |
| F-40–F-42, F-44 Learn | M8 | M8 |
| F-50 Send to board, F-51 console, F-53 Board files | M10 | M10 |
| F-52 install MicroPython (micro:bit, Pico) | M10 | M10 |
| F-54 library pack | M6, M7 | M5 (Add library) |
| F-55 board chip, F-56 connection helper | M10 | M10 |
| N-01 faithful MicroPython | M2 (golden), M10 | — |
| N-02 correct electronics | M1 | — |
| N-03 never freezes | M0, M2 | M4 |
| N-05 performance | M1, M3 | M11 |
| N-06 Windows + macOS, N-11 licences | M0 | M11 |
| N-07 plain language | M9 | M9 |
| N-08 private | M0 (no analytics) | — |
| N-09 old files open | M4 (format 1) | M11 |
| N-10 parts are data | M1, M6 | — |
| N-12 board found in 2 s | M10 | M10 |
| N-13 fills the window, N-14 our own controls | — | M4 (kit, shell), every UI milestone (DoD), M11 |
| F-19, F-3A, F-43, F-61, F-70, F-80–F-82 | later phases | |

## 8. Progress tracker

| Milestone | Status | Gate passed | Release tag |
|---|---|---|---|
| Analysis Rev 1–5 | ✅ Done — Rev 5: board connection with no setup (F-55, F-56), Q18 agreed | 2026-11-05 | |
| HTML prototype (13 screens) | ✅ Approved 2026-11-05 ("all are already good") | 2026-11-05 | |
| Real-board screens 13–16 | ✅ Approved 2026-11-06 ("all are very well designed") | 2026-11-06 | |
| Prototype Rev 6: MicroLab, fluid layout, screen 12b form controls | ✅ Agreed (M0 started on it) | 2026-11-05 | |
| Architecture Rev 1 + this plan | ✅ Agreed ("you can start M0") | 2026-11-05 | |
| M0 Foundations + MicroPython spike | ✅ Done — own MicroPython build (no ASYNCIFY); manual check not recorded ([acceptance](acceptance/M0.md)) | 2026-11-05 | `v0.0.0` |
| M1 Circuit engine | ✅ Done — pin tables checked by the teacher; slowest-laptop `npm run perf` skipped by the teacher ([acceptance](acceptance/M1.md)) | 2026-11-05 | `v0.1.0` |
| M2 Simulated boards (headless) | ✅ Done — golden recordings deferred at the merge, then made on the micro:bit V2 and Pico W 2026-11-06 (ESP32 to come) ([acceptance](acceptance/M2.md)) | 2026-11-06 | `v0.2.0` |
| M3 Code drives the circuit | ✅ Done ([acceptance](acceptance/M3.md)) | 2026-11-06 | `v0.3.0` |
| M4 Walking skeleton | ✅ Done — with Tinkercad-style building (3b) at the teacher's request; Blink by hand on the three boards checked by the teacher ([acceptance](acceptance/M4.md)) | 2026-11-06 | `v0.4.0` |
| M5 Full editor | ✅ Merged — all 7 slices (rotate / duplicate / select several / undo; zoom, pan, hover; bends and pin cards; the inspector's Joins; autocomplete per board; the project's files and Run the open file; autosave, recovery and recent projects); the teacher's gate answers built (the wheel zooms, wires follow the part); **open gate item**: the side-by-side look at screens 01 / 02 / 02b, merged first by the teacher's decision ([acceptance](acceptance/M5.md)) | 2026-11-07 (partly) | `v0.5.0` |
| M6 Parts pack 1: inputs | ✅ Merged — all 9 slices: the slide switch, LDR, RGB LED, battery packs, the GPIO board's USB, the active and passive buzzer, the PIR, line sensor, soil moisture, TMP36 / LM35, DHT11 / DHT22, HC-SR04, MPU6050 (I²C) — with their controls while running and sound from the laptop; slice 5: the SunFounder kit's 14 input modules and 6 chips; slice 6: the micro:bit's own buttons, logo, tilt, shake, light, temperature and microphone on a micro:bit inputs card; slice 7: the library pack (seven drivers with their licences, the micro:bit's own too) and Add a library; slice 8 (the teacher's requests): a new project is the board alone, the parts panel on a rail, mini / half / full breadboards, the editor's text size and theme; slice 9 (the teacher's request): a new micro:bit project is the micro:bit alone, wired at its five rings, its GPIO board from the parts panel and taken out in its inspector; the gate closed by the teacher ([acceptance](acceptance/M6.md)) | 2026-11-08 | `v0.6.0` |
| M7 Parts pack 2: outputs & displays | ⏳ | | |
| M8 Learn | ⏳ | | |
| M9 Errors, faults & multimeter | ⏳ | | |
| M10 Real boards | ✅ Merged — all seven slices, tried on the teacher's micro:bit V2 and Pico W; **open gate items** (Windows 11, an ESP32, a charge-only cable, the firmware copy from an installed MicroLab; the examples with `lib/` after M8) to be done later, by the teacher's decision ([acceptance](acceptance/M10.md)) | 2026-11-06 (partly) | `v0.10.0` |
| M11 Hardening & v1.0 | ⏳ | | |
