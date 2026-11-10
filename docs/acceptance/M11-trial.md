# M11.7 — The classroom trial: the plan

Gate record: [`M11.md`](M11.md) (items 2–4) · Requirements N-01–N-14 · Rev 14: the school computers (Windows 10,
64-bit; the slowest an Intel Core i5 with 4 GB, an SSD, a 24-inch 1920 × 1080 screen).

What GitHub's computers can't check: MicroLab on a real school computer, in a real lesson. Write the results in the
tables (or tell me them); a problem goes in `issues/` with a screenshot, as before.

## Before the lesson

1. **A test installer** (no release needed): `git push origin dev:installer`, then **Actions ▸ installer ▸ the run ▸
   Artifacts ▸ MicroLab-test-installer-windows-x64** (kept 14 days). For a Mac: `npm run dist` on the Mac.
2. Put it on a USB stick with **`tests/fixtures/projects/forty-parts.mlab`** (the speed budgets' 40-part circuit)
   and, for the real-board part, a micro:bit or a Pico W and a data USB cable.
3. Install it on **the slowest school computer** and on one more. The first time Windows says *Windows protected
   your PC*: **More info ▸ Run anyway**. It installs for the student alone; no administrator password.

## On the slowest school computer (N-05, N-06)

| What | How | Budget | Result |
|---|---|---|---|
| Start | A stopwatch from the double-click to the Start page — the first start after switching on, then a second | ≤ 5 s | |
| A 40-part circuit at full speed | Open `forty-parts.mlab`, **Run anyway**: the console prints `writes …` each second | ≥ 10 000 | |
| Its memory | **Task Manager ▸ MicroLab** (the group, opened up: add its lines) while it runs; again after a minute | ≤ 500 MB, not growing | |
| Python 3 | A new Python project, a turtle drawing (`import turtle` — `t = turtle.Turtle()`, a few `t.forward(100)`, `t.left(90)`), **Run**; Task Manager again | ≤ 500 MB | |
| The screen | 1920 × 1080 at the computer's own scaling (Settings ▸ Display): the Start page, a board project, Python 3 — nothing cut off | — | |
| Windows 10 | Everything below works as on the teacher's Mac | — | |

For comparison, GitHub's computers (a run of the tests, 2026-11-09): start 0.9–1.4 s; the 40-part circuit 24 000–52 000
writes a second in 270–380 MB; Python 3 with Jedi about 255 MB. The first help while typing in Python 3 may take a
few seconds on a slower computer (Jedi starting); after that it is quick.

## In the lesson

Try each with students — what they do without being shown is the real test.

| | Try | Look for | Notes |
|---|---|---|---|
| N-07 | A micro:bit project: the heart; then a mistake typed on purpose (`dispaly`) | the explanation is understood; *Go to line* | |
| N-02 | A Pico W, an LED and a resistor on the breadboard, wired by dragging; then the LED without its resistor | it lights; then the pin is damaged — the card says why and what to do | |
| N-03 | `while True: pass`, then **Stop** (Shift+F5) | it stops at once, every time | |
| N-12, N-01 | Plug in the micro:bit or Pico W | named within 2 s with no setup; **Send to board** runs the same program on it | |
| — | Python 3: `input()`, a turtle drawing, an error | the shell and the explanation | |
| N-04 | The whole lesson with Wi-Fi off | nothing asks for the internet | |
| N-13, N-14 | Make the window smaller and larger; the menus, the console's edge, **Close project** | nothing cut off; every control works | |
| — | A student closes MicroLab with unsaved work, or it crashes | the Start page offers the work back | |

**Note**: where students got stuck, words they didn't understand, anything slow, anything that went wrong.

## After the trial: v1.0.0

1. The fixes from the notes, on `dev`, each with its test.
2. `"version": "1.0.0"` in `package.json`, and what's new in `src/main/whats-new.json` — a draft, for your words:
   - *MicroLab 1.0 — ready for class, on Windows 10 and 11 and on Macs*
   - *F5 runs your program and Shift+F5 stops it, on a board as in Python 3*
   - *Run on the simulator, your real board, or both at once — choose in Run's menu; no Send to board needed* (11.8)
   - *The console under your code hides (Ctrl+J) and grows or shrinks — drag its edge*
   - *Close project, in the project menu, goes back to the Start page*
   - *A program left running no longer fills the computer's memory; clearer colours for hints, comments and line numbers*
3. The check green on GitHub (an Apple-chip Mac, an Intel Mac, Windows); `dev` merged into `main`; tagged `v1.0.0`;
   the tag pushed — the *Release* workflow makes the draft and builds the Windows installer
   ([RELEASING.md](../RELEASING.md)). Needed first, once: the `RELEASES_TOKEN` secret, and `CSC_NAME` on the Mac.
4. On the Mac: `npm run release:mac` adds the two Mac installers. Look at the draft, then **publish** it.
5. **Gate item 3, an update on each**: with 1.0.0 installed on a Windows computer and both kinds of Mac, the next
   release (1.0.1, the first fixes) is seen within 6 hours — **Download**, **Restart and update**.
