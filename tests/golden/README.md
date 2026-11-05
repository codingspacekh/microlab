# Golden outputs (M2.9, N-01)

Each `<board>/<name>.py` is run on the **real board**; what it prints is saved next to it as `<name>.txt`. The
golden test (`tests/python/golden.test.ts`) runs every snippet in the simulator and fails if its output differs
from the recording. Snippets with no `.txt` yet are skipped.

## Recording (the teacher, once per board, and again after a firmware update)

1. Install mpremote: `pip install mpremote` (or `pipx install mpremote`).
2. Flash the firmware the simulator copies: **MicroPython v1.29.0** on the Pico W and the ESP32 DevKit V1;
   **micropython-microbit-v2 v2.1.2** on the micro:bit V2.
3. Plug in **one board, with nothing wired to it**. The micro:bit lies **flat on the table, face up**, untouched.
4. `npm run golden -- --board pico-w` (or `esp32-devkit-v1`, `microbit-v2`). Add `--port /dev/tty.usbmodem101`
   (Windows: `--port COM5`) if more than one board is connected.

The script hard-resets the board before every snippet (so every pin starts as after power-on), runs the snippet with
`mpremote run`, and writes the `.txt`. Check the new files into git; note the date in `docs/acceptance/M2.md`.

## Writing a snippet

- Print values; catch errors and print them as `Type: message` (`mpremote run` names the file `<stdin>`, the
  simulator `main.py`, so tracebacks would differ).
- Nothing that changes from run to run: no random numbers, no raw timings (round them: `ms // 100`), no readings
  of unconnected analog pins.
- First line: a comment saying what it checks and any setup it needs.
