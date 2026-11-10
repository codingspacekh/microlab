# 1. System Analysis & Requirements

*Revision 1 (2026-11-05): first analysis — a draft for the teacher's comments. Open questions are in §1.10; the design uses the defaults shown there until they are answered.*

*Revision 2 (2026-11-05): the teacher's answers — a **2D** workspace (Q1); ESP32 DevKit V1 30-pin (Q2); the parts list in §1.4 (Q3); **Send to board** in v1 (Q4); the robot arena in phase 2 (Q5); **English only** (Q6). The app is called **REAMLab** — **R**aspberry Pi · **E**SP32 · **A**rduino · **M**icro:bit (Q10; "Circuit Lab" already exists). Arduino may come in a later phase (Q13).*

*Revision 3 (2026-11-05): **TypeScript, not Rust** (Q14) — MicroPython's own compiler runs as WebAssembly; the circuit solver keeps a performance test and can move to Rust → WebAssembly only if it is ever too slow (R9).*

*Revision 4 (2026-11-05): the prototype is approved ("all are already good"). **Files on the board** — a project is a folder tree that mirrors the board's file system (`main.py`, `lib/`, `www/`), the simulator sees the same files, Send to board copies only what changed, a **Board files** panel, and a **library pack** shipped with the app (F-21, F-50, F-53, F-54, §1.12, Q15). **IoT** (web pages served by the Pico W / ESP32, a pretend Wi-Fi network) goes to a **later phase** (F-80–F-82, Q16).*

*Revision 5 (2026-11-05): **Board connection with no setup** — the app notices a board as soon as it is plugged in, says which board it is and whether it runs MicroPython, and shows it in the top bar at all times; no port, speed or driver to pick (F-55). When something is wrong (charge-only cable, missing driver, port used by another program, no MicroPython yet) a **connection helper** says what and how to fix it (F-56, §1.13, Q17, N-12). Installing MicroPython from the app becomes a *should* for the micro:bit and Pico, a *could* for the ESP32 (F-52, Q18, agreed).*

*Revision 6 (2026-11-05): the app is renamed **MicroLab**, project files `.mlab` (Q10). **Layout and form controls** (lessons from the gradebook): every screen fills the window's width at any size, with nothing fixed-size for its own sake (N-13), and every form control — fields, dropdowns, checkboxes, radio buttons, switches, sliders, steppers, pickers — is the app's own, styled in every state, never the browser's default (N-14). The prototype's screens are now fluid and the design system shows the full set of controls.*

*Revision 7 (2026-11-06): **Run runs the open file, as Thonny does** (Q19). python.microbit.org only ever runs `main.py`, so trying another file means importing it from `main.py` — tedious for students. In MicroLab, Run starts a fresh board and runs the file in the editor; every other project file can still be imported. `main.py` keeps one job: it is the file a board runs **by itself when it is switched on** (F-22, F-50, §1.12).*

*Revision 8 (2026-11-06): two facts from the teacher's real boards, for the connection helper and installing MicroPython (§1.13, F-52, F-56). **The Pico and Pico W have no power light** — their only LED is the program's — so the helper's cable test for a Pico is its BOOTSEL drive: hold BOOTSEL while plugging in; if `RPI-RP2` appears, the cable carries data. **macOS asks before an app may write to a removable drive** (`RPI-RP2`, `MICROBIT`): installing MicroPython says so and offers to show the file to drag across by hand.*

*Revision 9 (2026-11-09): **Learn is about the components, for children** — the teacher: "I don't want it to be about specific board … electronics for kids perspective where we tell students how the component operate behind the scene, how it work, how it use or connect, what the principle idea behind it, not about code, it's more about specification of the component." A part page is now **what it is, how it works inside (a picture to play with), the idea behind it, its specifications, how to connect it, and the mistakes it shows** — for students of **10–13** (Q20): short sentences, everyday comparisons, real units explained; **no code and no particular board** (F-40). **Board pages stay**, about the board as a component — what is on it, its pins and power, its limits — with no code (F-41). **Ideas pages** (voltage, current, resistance, a circuit, the breadboard, digital and analog, PWM) and the **glossary** stay (F-42, F-45). The **Examples tab is taken out** (F-04: the example projects stay as the acceptance suite and as `.mlab` files a teacher opens); code snippets per part (F-25) leave Learn. The first Learn slice is the **Basics** group (Q21).*

*Revision 18 (2026-11-10): **Run on the simulator, the real board, or both** — from the classroom trial; the teacher: *"i already tested it worked fine. just one thing which would be better if we can run the simulator and board simultaneously or run on board directly when we click on run file without send to board."* Run's ⌄ menu chooses where Run (F5) runs the open file — *The simulator*, *The real board*, *Both at once* — kept until changed (F-125, Q40); on the real board the project's changed files are copied first, never its `main.py` (Q41); built **before v1.0.0**, as the trial's fix (Q42). Design 37, 37b, 37c — approved (*"all good"*, 2026-11-10).*

*Revision 17 (2026-11-10): **the exam and teacher-mode design is approved** (screens 35–36d) and its defaults agreed — the teacher: *"it's all fine"*. Q28–Q33, Q38 and Q39 move to *Decided*; the request goes to **codingspacekh@gmail.com** through a route in the codingspacekh.dev site (Q36, Q37). The plan is M13 in `MILESTONES.md`, its design in `02-architecture.md` §2.12.*

*Revision 16 (2026-11-10): **Teacher mode** — the teacher: *"when we install the app we need to ask whether they use the app as a teacher or student … if they are teacher, they need to give verification to the author, until the author approved then the teacher mode are available on their computer else they just use it a student mode which is what it is now"*; *"the app will be open source for everyone later on, so it shouldn't be just me that can be a teacher. anyone can be but I need their verification"*; *"it should be send from the microlab itself to an assigned email then i send them the licence file"*. Every copy of MicroLab starts in **student mode** — MicroLab as it is now. A teacher asks for **teacher mode** from inside MicroLab (*Help ▸ I'm a teacher…*), not in the installer (a Mac has no installer to ask in, and school computers are often set up by someone else). The request goes from MicroLab to the author's email; the author checks who they are and sends back a **teacher licence** (`.mllicence`), signed with the author's own key and tied to a key made on the teacher's computer. Only teacher mode can **make an exam**, every exam file is **signed** by the teacher who made it, and a student's MicroLab opens only exams from a verified teacher — so a student can't make a fake exam with a passcode they know (F-118–F-124, §1.16, Q34–Q39, R17–R19, screens 36–36d; 35, 35b, 35c updated). M13 is now teacher mode, then exam mode.*

*Revision 15 (2026-11-10): **Exam mode** — the teacher: *"because the students use a shared computer without any login account, so everyone can open any project even though it is not belong to them. this results in a big problem especially in the exam where they can just look at someone else's code without even writing it"*. A passcode that only MicroLab asks for would protect nothing — the files are on the computer, open to Notepad and File Explorer — so this comes in two steps, **exam mode first** (*"let just do the exam mode first"*), projects locked with a passcode later (§1.15). The teacher makes an **exam file** (`.mlexam`) from a starter project — a board or a Python 3 one — with their own passcode, and copies it to each computer; opening it asks the student's name, gives them their own copy and opens it **full screen**, with no way in MicroLab to any other project until they **Hand in**, or the teacher's passcode lets them out. Work is handed in on the teacher's **ICT hand-in site**, as now: Hand in shows the files to upload (F-110–F-117, §1.15, Q24–Q33, R13–R16, screens 35–35f). Built as **M13** once the design is agreed.*

*Revision 14 (2026-11-09): **Windows 10 too, and the slowest school computer** — the teacher: most school computers run **Windows 10**, 64-bit; the weakest is an **Intel Core i5 with 4 GB** (some 8 GB), every one a **24-inch full-HD (1920 × 1080) desktop**, most with an SSD. MicroLab runs on Windows 10 (22H2, 64-bit) and Windows 11 (N-06, Q9); the speed budgets are met on that i5 with 4 GB (N-05, M11.5). GitHub's CI has no Windows 10 — the installer is checked on a real school computer.*

*Revision 13 (2026-11-09): **M11 begins; an icon, About, and updates** — the teacher: *"please create the app icon, and prepare for auto update when the next feature is released to download just the same way we did in the gradebook and OneEditor app. also in about microlab please add all right 2026 CodingSpaceKH, visit codingspacekh.dev for contribution etc"*. The app icon (F-107, screen 32); About MicroLab (F-108, screen 33); updates as the gradebook and OneEditor have them — a GitHub release feed, looked for when MicroLab opens and every 6 hours, a note to download and to restart, *Download updates by itself* off to start, What's new from `whats-new.json`, Macs signed with the teacher's own certificate (F-109, screens 34, 34b).*

*Revision 12 (2026-11-09): **The Python 3 screen, finished by the teacher's trial** — (1) the project's tree and the shell can each be hidden and shown again (F-102); (2) New file / New folder's button says *Create*; (3) the Python logo on every `.py` file (F-103); (4) the theme in Aa *"is not working yet"*: its panel was cut off by the tabs' strip — fixed — and the theme now colours the whole Python 3 screen (F-104); (5) more fonts — for the code: five, shipped inside MicroLab (F-105); (6) completions of turtle and tkinter came without their `( )`: names that are another name for a function (`pack = pack_configure`, `title = wm_title`, `fd = forward`) are now followed to it (F-97); (7) the app's size shown, 75–150 %, with *Back to 100 %* (F-106). Screens 31b updated; 31g, 31h new.*

*Revision 11 (2026-11-09): **Projects as folders, a shell that moves** — the teacher, after trying M12: (1) *"the shell should be allowed to move to different position, and resizable"*: below or beside the editor, resized by its edge (F-98); (2) *"the code completion should improve on pair symbol like quotation, bracket, parentheses"*: typed in pairs, in both editors (F-99); (3) *"when a new project is created the app should show the file explorer to request them where they save … then show the file tree … ensure that the student store their file or project in their belonging folder"* — the computers are open to everyone (no sign-in): *"allow the student to better organize their file/project just like in pycharm, not a single file everywhere"*: every new project, Python or board, asks its name and location first; a Python project is a folder with its tree in the app (F-100, F-101); (4) the `>_` badge on the Start page taken out. Screens 31, 31b updated; 31e, 31f new.*

*Revision 10 (2026-11-09): **A Python 3 IDE in MicroLab** — the teacher: "integrate pure Python IDLE in the microlab so that student can write their python3 code in the application directly … in the front page add another panel to go to python 3 ide editor"; with **turtle** and **tkinter**, plain **`.py` files**, and **libraries from PyPI** installed when the internet is there. A new Start-page card opens the **Python 3** screen: an editor for `.py` files and a shell, as IDLE has (F-90–F-97). It runs **real CPython 3.13, shipped inside MicroLab** (a self-contained build per platform and processor, with Tcl/Tk), the student's program in its own process, as Thonny does (Q22, §1.14). Learn (M8) waits until after the pilot.*

Name: **MicroLab**.

---

## Contents

1. [1.1 Problem](#11-problem)
2. [1.2 Stakeholders & scope](#12-stakeholders--scope)
3. [1.3 Domain analysis](#13-domain-analysis)
4. [1.4 Functional requirements](#14-functional-requirements)
5. [1.5 Non-functional requirements](#15-non-functional-requirements)
6. [1.6 How the simulation works (the key decision)](#16-how-the-simulation-works-the-key-decision)
7. [1.7 The circuit model](#17-the-circuit-model)
8. [1.8 The component library and learning content](#18-the-component-library-and-learning-content)
9. [1.9 Risks](#19-risks)
10. [1.10 Decisions & open questions](#110-decisions--open-questions)
11. [1.11 Proposed way to build it](#111-proposed-way-to-build-it)
12. [1.12 Files on the board](#112-files-on-the-board) *(Rev 4)*
13. [1.13 Connecting a real board](#113-connecting-a-real-board)
14. [1.14 Python 3 in MicroLab](#114-python-3-in-microlab-rev-10) *(Rev 5)*
15. [1.15 Exam mode](#115-exam-mode-rev-15) *(Rev 15)*
16. [1.16 Teacher mode](#116-teacher-mode-rev-16) *(Rev 16)*

---

## 1.1 Problem

The teacher teaches electronics and robotics with **Python**, on three boards: **BBC micro:bit V2**, **Raspberry Pi Pico W** and **ESP32**. Today:

- There are not enough kits for every student, parts get lost or burnt, and students cannot practise at home without a kit.
- A wrong wire (5 V into a 3.3 V pin, an LED without a resistor, a short circuit) breaks real parts — and students learn little from a dead part.
- **Tinkercad Circuits** is close to what is wanted (build on a breadboard, wire up, write code, simulate), but it runs Arduino C++ and blocks, has no MicroPython, no Pico W, no ESP32, and needs an online account.
- **Wokwi** simulates Pico and ESP32 with MicroPython, but it is online, has no micro:bit, no teaching content, and its advanced features are paid.
- The **micro:bit Python Editor** has a simulator, but only of the micro:bit itself — no external parts.
- Students switch between pinout PDFs, datasheets, tutorial websites and the editor to finish one project.

**Goal:** one offline desktop app where a student picks a board, places parts on a breadboard, wires them up, writes **MicroPython** and runs it in a simulation that behaves like the real board — and where every part and board comes with a clear explanation of how it works, what its pins are and how to connect it.

## 1.2 Stakeholders & scope

| | |
|---|---|
| Users | **Students** (build, code, run, learn). **The teacher** (prepares starter projects and examples, shares them as files, checks students' work). No accounts. |
| Boards | BBC micro:bit V2 · Raspberry Pi Pico W · ESP32 DevKit V1 (30-pin). *Later phase:* Arduino (Q13). |
| Programming language | **MicroPython only** — the same language and libraries as on the real boards. |
| App language | English only. |
| Platforms | Windows 10 (22H2, 64-bit) and Windows 11, macOS (Intel and Apple Silicon) — *(Rev 14)* most school computers run Windows 10. |
| Scale | One student, one project at a time; a project has up to ~40 parts and ~100 wires. |
| Out of scope (v1) | Arduino (a later phase, Q13), C++, block coding, other boards, PCB design, AC / RF / high-voltage circuits, full SPICE accuracy, mains electricity, cloud accounts, live collaboration, a 3D workspace. |

## 1.3 Domain analysis

### The three boards

| | micro:bit V2 | Raspberry Pi Pico W | ESP32 DevKit |
|---|---|---|---|
| Chip | nRF52833 | RP2040 + CYW43439 (Wi-Fi) | ESP32-WROOM-32 |
| Logic level | 3.3 V | 3.3 V | 3.3 V |
| Pins students use | Edge connector P0–P20 (P0, P1, P2, 3V, GND are the big rings); needs an **edge-connector breakout** on a breadboard — the school uses the T-shaped *micro:bit GPIO Board* (2 × 13 header across the channel, 3.3V and 5V, I²C header; resources/microbit_gpio_board.webp) | GP0–GP28, 3V3, VBUS, VSYS, GND | GPIO 0–39 (not all exposed), 3V3, VIN/5V, GND; also as a second board, *ESP32 with extension board*: a G-V-S triple per signal, V = 3.3 V or 5 V by jumper (resources/esp32_extension_board.jpg) |
| Analog in | `pin0.read_analog()` → 0–1023 | ADC on GP26–GP28, `read_u16()` → 0–65535 | ADC1 (GPIO 32–39) and ADC2 (not usable while Wi-Fi is on) |
| Built in | 5×5 LED display, buttons A/B, touch logo, accelerometer + compass, microphone, speaker, temperature, radio | LED on `Pin("LED")`, BOOTSEL button, temperature sensor (ADC 4), Wi-Fi | LED on GPIO 2 (most DevKits), BOOT button, touch pins, DAC on GPIO 25/26, Wi-Fi, Bluetooth |
| MicroPython modules | `microbit`, `music`, `radio`, `speech`, `neopixel`, `machine` (part) | `machine`, `time`, `network`, `neopixel`, `rp2` | `machine`, `time`, `network`, `neopixel`, `esp32` |
| Traps worth teaching | Several edge pins (e.g. P3, P4, P10) are shared with the LED display | ADC only on 3 pins; VBUS is 5 V | GPIO 34–39 are input only; strapping pins (0, 2, 5, 12, 15) affect booting; ADC2 vs Wi-Fi |

The board data (every pin's name, number, functions and limits) is checked against each board's official pinout and datasheet in M1 and kept as data files, so all three boards are described the same way.

### Three levels of simulation

| Level | What it means | Used for |
|---|---|---|
| **Electrical** | Voltages and currents in the circuit | Resistors, LEDs, buttons, potentiometers, LDRs, power, shorts, the multimeter; Ohm's law lessons |
| **Logic** | A pin is HIGH, LOW or floating; PWM duty cycle | Digital inputs and outputs, pull-ups, PWM brightness and speed |
| **Behaviour / protocol** | A module answers like the real chip | Servo (pulse width → angle), HC-SR04 (echo time from a distance), DHT11/22, I²C OLED and LCD, NeoPixels |

A real breadboard project mixes all three, so the simulator does too (§1.6, §1.7).

### Teaching faults to detect

Real mistakes should show a visible, explained result instead of silently "working":

| Mistake | What the simulator shows |
|---|---|
| LED with no resistor | The LED "burns" (dark, with a puff icon) and a message: current ≈ 60 mA, an LED takes about 20 mA |
| LED the wrong way round | Stays dark; hover explains the long leg (anode) |
| 3V3 or a HIGH pin wired straight to GND | Short circuit warning; the board stops |
| 5 V into a GPIO pin | Warning: the pin takes at most 3.3 V |
| Input pin with nothing connected | Reads change at random (floating); hint about pull-up / pull-down |
| Motor or many LEDs straight on a GPIO pin | Warning: more current than a pin can give; use a driver |
| Servo powered from 3V3 | Warning: servos need about 5 V and more current |
| Analog read on a pin without ADC | The same error the real board gives, explained |

### Entities

| Entity | Main fields |
|---|---|
| Project | name, board, parts, wires, files (`main.py` + extra modules), notes, format version |
| Board | type, position, pin map (from board data) |
| Part (component instance) | type, position, rotation, properties (e.g. resistor 220 Ω, LED red) |
| Pin | part, name, functions, electrical role |
| Wire | from pin, to pin, colour, bend points |
| Breadboard | size (full / half); its rows and rails are connected inside |
| Net (worked out, never stored) | the set of pins that are electrically one point |
| Component type (library entry) | pins, properties, electrical model, behaviour model, picture, learn page, example code per board |
| Run | the code running, the console, pin history, faults found |

## 1.4 Functional requirements

Priority: **M** = MVP, **S** = should (soon after), **C** = could (later).

### Projects
| ID | Requirement | P |
|---|---|---|
| F-01 | New project: choose the board (micro:bit V2, Pico W, ESP32); it is placed with a breadboard and a starter `main.py` | M |
| F-02 | Save and open a project as one file (`.mlab`, Q10) that opens on any laptop with the app | M |
| F-03 | Autosave and crash recovery | M |
| F-04 | Examples: open a ready project from the library (e.g. *Blink*, *Traffic lights*, *Servo sweep*) for any of the three boards. *(Rev 9)* No Examples tab: the example projects are the acceptance suite (M3) and `.mlab` files the teacher hands out (`npm run examples`) | C |
| F-05 | Recent projects on the start screen | S |
| F-06 | Export a picture of the circuit and a wiring list (part pin → board pin) for printing or the real build | S |

### Building the circuit
| ID | Requirement | P |
|---|---|---|
| F-10 | Parts panel by category with search; drag a part onto the workspace | M |
| F-11 | Move, rotate, duplicate and delete parts; select several | M |
| F-12 | Breadboard (half and full) whose rows and power rails connect like a real one; hovering a hole highlights everything joined to it | M |
| F-13 | Draw a wire from pin to pin; choose its colour; add bend points; a wire ends only on a pin or a hole | M |
| F-14 | Part properties in an inspector (resistor value with colour bands, LED colour, servo model …) | M |
| F-15 | Hover a pin: its name and what it can do (e.g. *GP15 · PWM 7B · I²C1 SCL · SPI1 TX*) | M |
| F-16 | Undo / redo for every change | M |
| F-17 | Zoom, pan, fit to window | M |
| F-18 | Wiring check before running: pins left unconnected, parts not on the breadboard, wires to nowhere | S |
| F-19 | Schematic view of the same circuit, made automatically | C |

### Code
| ID | Requirement | P |
|---|---|---|
| F-20 | Code editor: Python colours, line numbers, auto-indent, the board's modules in autocomplete (e.g. `machine.Pin(` shows its arguments) | M |
| F-21 | More than one file per project (`main.py` plus modules such as `ssd1306.py`). *(Rev 4)* A project is a **folder tree that mirrors the board**: `main.py`, `lib/` for libraries, `www/` for web pages; any text file (`.py`, `.html`, `.css`, `.js`, `.json`, `.txt`). The simulated MicroPython sees the same files, so `import ssd1306` and `open('www/index.html')` work as on the board. On the micro:bit there are no folders: files sit next to `main.py`, and the app warns when the project is near the micro:bit's small space (§1.12) | S |
| F-22 | **Run / Stop / Restart** the simulation; Stop always works, even in `while True:` with no sleep. *(Rev 7)* **Run runs the file open in the editor**, as Thonny does (Q19): a fresh board, its start-up file (`boot.py` on the Pico W and ESP32 — the micro:bit has none), then the open file as `__main__`; the other files can be imported. The button names the file (*▶ Run led_test.py*); its ⌄ menu has *Run main.py (as when the board is switched on)*. When the open file isn't Python, Run runs the last Python file run, or `main.py` | M |
| F-23 | Console: `print()` output, `input()`, and the REPL after the program ends | M |
| F-24 | Errors: the line is highlighted, the real MicroPython message is shown, and a short student-friendly explanation beside it (e.g. *"NameError: name 'pin' isn't defined" → Python is case-sensitive: you named it `Pin`*) | M |
| F-25 | Code snippets for each part ("Insert example code for this servo on GP15"). *(Rev 9)* Not in Learn, which has no code; later, if at all | C |
| F-26 | Plotter: numbers printed as `print(a, b)` are drawn as live lines (as in Mu / Thonny) | S |

### Simulation
| ID | Requirement | P |
|---|---|---|
| F-30 | The program runs in a real MicroPython interpreter with the selected board's pins and modules (§1.6) | M |
| F-31 | Digital out/in, internal pull-up/pull-down, IRQs on pin changes | M |
| F-32 | Analog in (ADC) with each board's range (1023 / 65535 / ESP32 attenuation) | M |
| F-33 | PWM: LED brightness, motor speed, buzzer pitch, servo angle | M |
| F-34 | I²C, SPI, UART modules answer at the protocol level (OLED, LCD, sensors) | M |
| F-35 | Change inputs while running: press buttons, turn a potentiometer, set light level, move an obstacle in front of the ultrasonic sensor, set temperature, tilt / shake the micro:bit | M |
| F-36 | See and hear outputs: LED glow, servo arm, motor spin, buzzer sound, OLED/LCD contents, NeoPixel colours, the micro:bit display and speaker | M |
| F-37 | Fault detection with explanations (§1.3 *Teaching faults*) | M |
| F-38 | Multimeter: measure voltage, current and resistance between two points | S |
| F-39 | Timing like the board: `time.sleep(1)` takes one second; `time.ticks_ms()` is real | M |
| F-3A | Pin history (logic view) for a few chosen pins | C |
| F-3B | *(Rev 4: moved to the IoT phase, F-80–F-82)* | — |

### Learn
| ID | Requirement | P |
|---|---|---|
| F-40 | **Part page** for every part, for students of 10–13 *(Rev 9: about the component, not a board, no code)*: **what it is** and what it is used for; **look inside** — a picture to play with that shows how it works (turn the potentiometer's knob and the wiper slides along its track; press the button and its contacts touch; the LED's current flows one way only); **the idea behind it** (a resistor holds the current back: Ohm's law with an everyday comparison); **its specifications**, each number explained (an LED: about 2 V across it, 20 mA, 30 mA at most); **its legs** and how to tell them apart; **how to connect it** — in a breadboard, to a battery or a supply's + and −, with the parts it needs (an LED's resistor and how to choose it); **the mistakes** — what goes wrong, as the simulator shows it (screen 04's faults) | M |
| F-41 | **Board page**: interactive pinout (hover / filter by PWM, ADC, I²C …), power pins, limits, built-in parts. *(Rev 9)* The board as a component: what is on it (the chip, the USB, the regulator, its own LEDs and buttons), what its pins can do and give, its limits — no code | M |
| F-42 | Glossary: voltage, current, resistance, Ohm's law, PWM, pull-up, I²C, ADC … linked from the part pages. *(Rev 9)* One or two lines each, for 10–13 | S |
| F-45 | *(Rev 9)* **Ideas pages**: the big ideas a part page leans on, each with a picture to play with — voltage, current and resistance (water in pipes), a circuit (a loop, open and closed), the breadboard (which holes are joined), series and parallel, digital and analog, PWM | M |
| F-43 | Guided projects: step-by-step lessons that check each step (*"Place a 220 Ω resistor in row 12" ✓*) | S |
| F-44 | Part pages open from the parts panel, from a part on the workspace (right-click → *Learn about this*) and from a search | M |

### Real boards
| ID | Requirement | P |
|---|---|---|
| F-50 | **Send to board**: copy the project's files to a real board over USB and run them (as Thonny / `mpremote` do). *(Rev 4)* The whole folder tree, only the files that changed (compared by size and checksum); folders made as needed; files on the board that aren't in the project are left alone unless the student ticks *Remove other files*. *(Rev 7)* On its own a board always starts `main.py`, which the app says when it sends; *Run this file on the board* runs the open file there without making it `main.py`, as Thonny does (Q19) | S |
| F-51 | Console of the real board (print output, errors, REPL) | S |
| F-125 | *(Rev 18)* **Run on: the simulator, the real board, or both** (screens 37, 37b, 37c). Run's ⌄ menu has *Run on*: *The simulator* · *The real board* (named: *Pico W*) · *Both at once*; kept on this computer until changed; the Run button says where (*▶ Run main.py · sim + Pico W*). On the real board Run needs no *Send to board*: the project's files that changed are copied first (only those, as F-50 compares them), **never its `main.py`**, so the board's own start-up program stays as it was; then the open file runs from the editor, as *Run this file on the board* (F-50, Q19), and the board's console opens. *Both at once* starts the simulator and the board together; the console shows the two side by side; each reads its own buttons and sensors (the picture's, the real ones), which the banner says. Stop (Shift+F5) and Restart act on everything running; a board unplugged ends its side only. With no board plugged in, or one that isn't the project's board, Run uses the simulator and says so (*· sim — no board*) and the board choices are greyed. The check before running (M9) comes first, as now | M |
| F-52 | Install MicroPython firmware on a new board. *(Rev 5)* **micro:bit and Pico: S** — the firmware ships with the app (offline) and is copied to the drive the board shows (`.hex` to `MICROBIT`, `.uf2` to `RPI-RP2`), the micro:bit's files are copied back afterwards; **ESP32: C** — the helper links to a guide (Q18) | S / C |
| F-53 | *(Rev 4)* **Board files** panel: the real board's files and folders with sizes and free space; open a file read-only, copy files to and from the laptop, delete, make a folder; a warning before anything on the board is deleted or replaced | S |
| F-54 | *(Rev 4)* **Library pack** shipped with the app, works offline: drivers the parts need (e.g. `ssd1306`, `dht`, `hcsr04`, `neopixel` helpers; `microdot` for the IoT phase), each with its licence. *Add library* puts it in the project's `lib/` (next to `main.py` on the micro:bit); Send to board copies it. A part's page says which library it needs | S |
| F-55 | *(Rev 5)* **Board connection with no setup.** The app watches the USB ports all the time. Within 2 s of a board being plugged in it shows *which board* it is (micro:bit V2, Pico W, ESP32), *whether it runs MicroPython* and which version — no port, speed or driver to choose. A **board chip** in the top bar always shows the state (no board · board found · connected · busy · needs help); a short message appears when a board is plugged in or out, with a warning when it doesn't match the project's board. Several boards are listed and the last one used is remembered. The app never keeps the port to itself while idle, so Thonny and other tools can still use the board (§1.13) | S |
| F-56 | *(Rev 5)* **Connection helper**: when a board doesn't connect, it says what is wrong and what to do, in plain words — charge-only cable, missing USB driver (with the driver installer shipped in the app), port in use by another program (named when it can be), board without MicroPython (offers F-52), wrong board for the project, board unplugged during a copy. It checks step by step with a picture of the board ("Is the board's light on?") and can copy a short report for the teacher (§1.13) | S |

### IoT (later phase) *(Rev 4)*
| ID | Requirement | P |
|---|---|---|
| F-80 | Web pages for IoT projects on the Pico W / ESP32: `www/` files served by the board's own small web server (sockets or `microdot`) to phones and laptops on the same Wi-Fi | Later phase |
| F-81 | In the simulator, the board's web page opens in a panel inside MicroLab: buttons on the page reach the student's code (e.g. switch an LED), no real network needed | Later phase |
| F-82 | Pretend Wi-Fi: `network.WLAN` connects to a pretend network; `urequests` reaches a small built-in test server (was F-3B) | Later phase |

### Python 3 *(Rev 10)*
| ID | Requirement | P |
|---|---|---|
| F-90 | A **Python 3** card on the Start page — the first in the row of boards, before the micro:bit — opens the Python 3 screen with a new file; the top bar has *Workspace · Python 3 · Learn* | M |
| F-91 | **`.py` files, as IDLE**: New, Open, Save, Save as; the recent `.py` files in the Start page's Recent list with the projects; several files open in tabs; a file's folder is where the program runs (`open('data.txt')` finds the file beside it) | M |
| F-92 | **Run** (F5) runs the file in the editor with real **CPython 3**; the **shell** shows what it prints and errors in red, takes `input()`'s answers, and after the program its **`>>>`** has the program's names (as IDLE's *Run Module*); **Stop** (Ctrl+C) interrupts it; ↑ ↓ history, Tab completes | M |
| F-93 | **turtle and tkinter** work as on a computer with Python: their windows open beside MicroLab and close with the program, or when Stop is pressed | M |
| F-94 | **Friendly errors** for CPython's own messages (screen 05's way): the line marked, *What this means*, Go to line | S |
| F-95 | **Libraries** (a Packages window): the ones installed; a library **looked up by its name** on PyPI (its version and summary — PyPI has no search for programs), or chosen from a short list of those often used in class; Install and Remove with `pip` when the internet is there; offline, install from a `.whl` file a teacher hands out. They go into MicroLab's own folder for Python, never into a Python installed on the computer, and every program sees them | M |
| F-96 | The **Plotter** for numbers a Python 3 program prints (as M9's) | S |
| F-97 | The editor knows Python 3: highlighting, indentation, completions of names and of the libraries installed (Jedi, shipped) | S |
| F-98 | *(Rev 11)* The Python 3 **shell below or beside the editor**, chosen with two buttons in its bar, **resized by dragging its edge**; both remembered | M |
| F-99 | *(Rev 11)* **Brackets and quotes typed in pairs** in the editors: `(` `[` `{` `"` `'` put their pair after the cursor; the closing one typed steps over it; Backspace after an opening one removes both; a selection typed over with a quote or bracket is wrapped | M |
| F-100 | *(Rev 11)* **New project asks first**: its name and location (MicroLab's folder in Documents to start with, every time — never the last one chosen, which on a shared computer is someone else's; *Choose…* opens the computer's folder window), and says what it will make; the project is saved from the start. A Python project is a folder with `main.py`; a board project a `.mlab` file | M |
| F-101 | *(Rev 11)* **A Python project's tree** beside the editor (as PyCharm's Project view): its files and folders, as on disk and kept up to date; a double-click opens a file (`.py`, and text files) in a tab; New file, New folder, Rename, Delete (to the Recycle Bin / Bin), Show in Explorer / Finder. Open a project takes a folder or a `.mlab`; a `.py` file opens its folder as the project. Recent lists projects | M |
| F-102 | *(Rev 12)* The Python 3 screen's **tree and shell can each be hidden and shown again** (buttons beside Aa, the tree's ‹, the shell's ×; Ctrl+B, Ctrl+J); remembered; Run shows a hidden shell | M |
| F-103 | *(Rev 12)* **The Python logo** (the Python Software Foundation's, unaltered) on every `.py` file — the project's tree, the tabs | S |
| F-104 | *(Rev 12)* **The editor's theme colours the whole Python 3 screen** — the tree, the tabs, the editor, the shell | M |
| F-105 | *(Rev 12)* **The code font** chosen in Aa from a dropdown — thirteen, shipped inside MicroLab (SIL OFL): JetBrains Mono, Fira Code, Source Code Pro, Cascadia Code, IBM Plex Mono, Atkinson Hyperlegible Mono, Roboto Mono, Inconsolata, Noto Sans Mono, Red Hat Mono, Space Mono, Courier Prime, Anonymous Pro — for the editors and the shell; the text size 11–36 px; remembered | S |
| F-106 | *(Rev 12)* **The app's size** in the status bar: − and +, a menu of 75–150 %, **Back to 100 %**; ⌘− ⌘+ ⌘0 / Ctrl+ do the same and the number follows; remembered | S |
| F-107 | *(Rev 13)* **The app icon**, grown from the logo (screen 32): the window, the Dock / taskbar, the installer, `.mlab` files; one 1024 px picture, made by a script, every other size by the build | M |
| F-108 | *(Rev 13)* **About MicroLab** (screen 33): the icon, the version, what MicroLab is and what is inside it (Python 3, MicroPython), **© 2026 CodingSpaceKH. All rights reserved.**, **codingspacekh.dev** to contribute, report a problem or share an idea (opened in the browser); **Licences** (N-11); **Check for updates** — from the app menu (Mac), Help (Windows) and the logo in the top bar | M |
| F-109 | *(Rev 13)* **Updates, as the gradebook and OneEditor have them** (screens 34, 34b): installers published as a GitHub release; MicroLab looks when it opens and every 6 hours; a note above the status bar — *is out* / Download, downloading, *ready* / **Restart and update** or Later (it goes in at the next close; never restarts by itself, never with unsaved work), *Updated to* once; *Check for Updates…* (the app menu, Help, About); *Download updates by itself* off to start; What's new from `whats-new.json` (the build refuses a version without notes); offline, silent; a Mac copy that can't update itself gets the new `.dmg` in Downloads | M |

### Teacher
| ID | Requirement | P |
|---|---|---|
| F-60 | A teacher makes a starter project (circuit and/or code) and shares the file | M (with F-02) |
| F-61 | Lock parts of a starter project (e.g. the circuit is given, the student writes the code) | C |

### Exam mode *(Rev 15)*
| ID | Requirement | P |
|---|---|---|
| F-110 | **Make an exam** (the teacher; screen 35): *(Rev 16)* in **teacher mode only**, signed with the teacher's key (F-122) — *File ▸ Make an exam…* from the open project, board or Python 3 — the exam's **title**, the teacher's **passcode** (twice, at least 6 characters), the **hand-in site's address** (shown to students when they hand in), and what students may use: *Send to a real board* (on to start), *Install libraries* (off). Saves **one `.mlexam` file**: the starter project, the title and the settings, and the passcode only as a slow hash (scrypt), never the passcode itself. The teacher copies it to each computer (a USB stick, a shared folder) when the exam begins | M |
| F-111 | **Start the exam** (the student; screen 35b): opening a `.mlexam` (a double-click, *Open…*, or dropped on MicroLab) shows its title and asks the student's **name**; *Start* makes their own copy in `Documents/MicroLab/Exams/<title>/<name>` and opens it full screen. A name already there is **taken** — only the teacher's passcode opens someone's exam again, so no one can type another's name to see their work. One exam at a time | M |
| F-112 | **Inside the exam only** (screens 35c, 35d): **full screen**; the top bar shows the exam's title, the student's name, the time and **Hand in**. No Start page, *Open…*, *New*, *Recent*, *Save as*, other windows or Examples; the Python 3 tree shows only the exam's folder; libraries can't be installed unless the teacher allowed it; the Board files panel can't open files that are on a real board (another student's could be there). Everything else in the project works as always: the circuit, Run and Stop, the editor and its settings, the shell, the Plotter, the friendly errors | M |
| F-113 | **Leaving needs the teacher** (screen 35e): closing MicroLab, leaving full screen (Esc, F11, the window's buttons) or ending the exam early asks for the teacher's passcode. Each wrong passcode makes the next try wait longer (1 s, 2 s, 4 s … at most a minute) | M |
| F-114 | **Nothing is lost**: the exam is saved every few seconds and on every Run. If the computer is switched off or MicroLab is ended from outside (Task Manager), MicroLab goes **straight back into the exam** the next time it starts, where the student was, still full screen | M |
| F-115 | **Hand in** (screen 35f): *Hand in…* asks once (*you can't change it after this*), saves, and ends the exam on that computer. MicroLab leaves full screen and shows **the files to upload** — opened in Explorer / Finder — with the hand-in site's address (F-110). A board exam hands in its `.mlab` with its code files beside it (`main.py`, `lib/…`), so the site shows the code; a Python 3 exam its folder. Opening the exam again afterwards shows it read-only; the teacher's passcode reopens it for changes | M |
| F-116 | **A Python 3 program in an exam stays in its folder**: `open()` of a file outside the exam's folder, listing other folders, starting other programs (`subprocess`, `os.system`) and `ctypes` stop with a clear message (*In an exam, a program may only use the files in its own folder*) — through Python's **audit hooks** (PEP 578), set by MicroLab's runner before the student's code; Python's own files (the standard library, Tcl/Tk for turtle and tkinter) are still read. A MicroPython program already has only its project's files (§1.12) | M |
| F-117 | **Exams on this computer** (the teacher's passcode): *File ▸ Exams on this computer…* lists the exams there — title, students, handed in or not — and deletes them once collected, so the next class can't open them in Notepad | S |

### Teacher mode *(Rev 16)*
| ID | Requirement | P |
|---|---|---|
| F-118 | **Two modes.** Every copy starts in **student mode** — everything MicroLab does today. **Teacher mode** adds *Make an exam* and *Exams on this computer* (F-110, F-117) and, later, the teacher key for locked projects (§1.15). Help shows which mode this computer is in, and in teacher mode the teacher's name and school | M |
| F-119 | **Ask for teacher mode** (screen 36): *Help ▸ I'm a teacher…* — name, school, school email, a web page where the author can check them (the school's staff page, say), a note; a **teacher passcode** (twice, at least 8 characters) that locks the key MicroLab makes on this computer. The request carries the key's public half only; the private half never leaves the computer. The window says plainly: *use your own computer — not one students use* | M |
| F-120 | **Sent from MicroLab** (screen 36b): *Send request* sends it to the author's address, set in MicroLab's build, through a small form on codingspacekh.dev — MicroLab holds no email password (it is open source). Offline, or if the form fails: the request as text, with *Copy* and *Open in my email app* (a `mailto:`), to send by hand. The request is also kept, so the licence can be matched to it later | M |
| F-121 | **The licence** (screen 36c): the author checks who the teacher is and runs `npm run licence` on the request, which signs it with the **author's key** (kept only on the author's computer) and makes a `.mllicence` — the teacher's name, school, email, the key's public half, a number and the date. The teacher opens it (a double-click, or *Help ▸ Load teacher licence…*); MicroLab checks the author's signature and that the licence is for **this computer's key**, and teacher mode is on. A licence copied to another computer does nothing there | M |
| F-122 | **Signed exams** (screens 35, 35b, 35c, 36d): *Make an exam* asks the teacher passcode and signs the exam file with the teacher's key, the licence inside it. A student's MicroLab opens an exam only if both signatures check out — the author's on the licence, the teacher's on the exam — and shows who made it: *Exam by Srey Leak · Riverside High School* with a tick, on the start screen and in the exam bar. An exam file changed after it was made, unsigned, or from a licence that isn't valid is refused (36d) | M |
| F-123 | **Taking a licence back**: a list of withdrawn licence numbers ships with every update and is read from codingspacekh.dev when online (a plain file, no server); a withdrawn teacher's exams no longer open and their teacher mode turns off | S |
| F-124 | **A new computer**: the teacher asks again from it (a new key, a new licence); the author sees it is the same person | S |

### Robotics (phase 2)
| ID | Requirement | P |
|---|---|---|
| F-70 | Robot arena: a 2D top view of a robot car (two DC motors + driver, ultrasonic, line sensors) driven by the same circuit and code, on a floor with a track and obstacles | C |

### Parts in v1 (default list, to confirm in Q3)

| Group | Parts |
|---|---|
| Basics | Breadboard (half, full), resistor, LED (5 colours), RGB LED, push button, slide switch, potentiometer, LDR (light sensor), active and passive buzzer, battery pack (2×AA, 4×AA, 9 V), micro:bit edge-connector breakout |
| Sensors | HC-SR04 ultrasonic, DHT11 / DHT22, PIR motion, IR line sensor, soil moisture, TMP36 / LM35 temperature, MPU6050 accelerometer (S) |
| Actuators | SG90 servo, DC motor + L298N / L9110S driver, relay module (S), 28BYJ-48 stepper + ULN2003 (S) |
| Displays | SSD1306 OLED (I²C), 16×2 LCD (I²C), 7-segment digit, WS2812 NeoPixel strip / ring, MAX7219 8×8 matrix (C) |
| *(Rev 8, the teacher, 2026-11-07)* The SunFounder Universal Maker Sensor Kit's list too — modelled on common modules, not on SunFounder's boards exactly | **Modules:** button, photoresistor, potentiometer, RGB LED, passive buzzer and traffic light modules (3–4 pins, their resistors on board); touch (TTP223), vibration (SW-420), IR obstacle avoidance, Hall, flame, raindrop, water level, gas/smoke (MQ-2), joystick, rotary encoder, IR speed sensor; **chips:** PCF8591 ADC/DAC, BMP280, DS18B20 (1-Wire), DS1302 RTC, VL53L0X time-of-flight, MAX30102 pulse oximeter; **outputs:** 5 V relay, centrifugal pump, L9110 driver, TT motor; breadboard power supply module (3.3 / 5 V); **wireless:** ESP8266 (AT over UART), JDY-31 Bluetooth (UART) — in the IoT phase |

## 1.5 Non-functional requirements

| ID | Requirement |
|---|---|
| N-01 | **Faithful MicroPython.** The code runs in the real MicroPython interpreter. Code that works in the simulator works on the board unchanged (for the parts and modules the simulator supports). Anything not supported says so clearly; it never behaves differently in silence. |
| N-02 | **Correct electronics for teaching.** The circuit solver gives hand-checked answers (voltage divider, LED current, series / parallel resistors) within 1 %. |
| N-03 | **Never freezes.** Student code runs apart from the window; Stop works within 0.5 s whatever the code does. |
| N-04 | Works fully offline; no account, no internet. |
| N-05 | Runs smoothly on ordinary student laptops: start ≤ 5 s, a 40-part circuit runs at full speed, ≤ 500 MB RAM. *(Rev 14)* Measured on the slowest school computer: an Intel Core i5, 4 GB, SSD, 1920 × 1080, Windows 10 64-bit. |
| N-06 | Windows 10 (22H2, 64-bit) *(Rev 14)*, Windows 11 and macOS (Intel + Apple Silicon) with the same features. |
| N-07 | Plain language for students; every error and warning says what to do next. |
| N-08 | Private: no tracking or analytics; projects are files the student owns. |
| N-09 | A project file from an older version always opens in a newer one. |
| N-10 | New parts are mostly **data** (pins, picture, model, learn page, examples), so the library can grow without changing the simulator. |
| N-12 | *(Rev 5)* A board is noticed within 2 s of being plugged in or out, with no setup; nothing the student does on a real board needs a port name, a speed or a terminal command. |
| N-13 | *(Rev 6)* **The layout fills the window.** Every screen uses the whole width at any window size from 1280 × 720 up: no empty bands at the sides, no fixed page width. Panels share the width by proportion between a minimum and a maximum (parts ~17 %, code ~34 %, the canvas the rest), the dividers can be dragged and are remembered, the circuit is fitted to the canvas (F-17), and dialogs are centred with their content filling them. Checked at 1280, 1440 and 1920 wide. |
| N-14 | *(Rev 6)* **Every form control is the app's own.** Text and number fields, dropdowns, checkboxes, radio buttons, switches, sliders, steppers, colour and value pickers, search boxes and time fields come from the design system and are styled in every state (normal, hover, focus, error, disabled) — never the browser's or the operating system's default look (no native `<select>`, date, time or colour picker). Only the system's own Open / Save dialogs are native. |
| N-11 | Open-source licences of everything bundled are compatible and listed in the app. Board and part pictures are drawn for this app, not copied from vendors or other simulators. |

## 1.6 How the simulation works (the key decision)

The hardest part is running a student's MicroPython program so it **drives the simulated circuit**. The options:

| Option | How | For | Against |
|---|---|---|---|
| A. **Real MicroPython (WebAssembly) + simulated board hardware** | The official MicroPython *webassembly* port runs in a background worker. The modules that touch hardware (`machine`, `microbit`, `neopixel`, `time` …) are replaced by our versions that talk to the circuit simulator. One engine, three "board personalities". | The real language, real error messages, real `time`; the same approach for all three boards; fully offline; the micro:bit Foundation's own simulator works this way | We write the hardware layer for each board (the main work); timing is close, not cycle-exact |
| B. Emulate the real chip and run the real firmware | An instruction-level emulator of each chip runs the real MicroPython firmware (an open-source RP2040 emulator exists) | Exact on that chip | Only the RP2040 is realistic; no open-source emulator for the nRF52833 or the ESP32's Xtensa core; three very different engines |
| C. A Python-like interpreter in JavaScript (Skulpt, Brython) | Run "Python" in the page | Easy to start | Not MicroPython: different errors, missing modules, code that works here may fail on the board — breaks N-01 |
| D. Translate Python to JavaScript | Compile and run | Fast | Same problems as C, and harder to debug |

**Recommendation: A.** It is the only option that gives the same MicroPython on all three boards, offline, with one engine to test and maintain.

How it fits together:

```
┌──────────────── Window (UI) ────────────────┐      ┌──── Simulation worker ─────────────┐
│ Workspace (SVG) · Code editor · Console     │      │ MicroPython (WebAssembly)          │
│ Part pages · Inspector                      │      │   main.py of the student           │
└──────────────┬──────────────────────────────┘      │   our machine / microbit / time …  │
               │ inputs (button, slider)              └─────────────┬──────────────────────┘
               ▼                                                    │ pin writes / reads,
┌──────────────── Circuit engine (pure TypeScript) ─────────────────┴──────────────────────┐
│ nets from breadboard + wires → solve voltages & currents → part behaviours → faults      │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

- `time.sleep()` really waits (the worker blocks), and **Stop** ends the worker — so a `while True:` without sleep can never freeze the window (N-03).
- A pin write updates the circuit at once; a pin read returns the circuit's current voltage, so pull-ups, buttons and potentiometers behave like the real thing.
- Protocol modules (I²C OLED, DHT11, NeoPixels) are answered by part *behaviour models* rather than bit-by-bit timing, which keeps it fast on weak laptops.
- The same hardware layer is what makes **Send to board** (F-50) simple: the student's files go to the real board unchanged.

This is the biggest technical risk, so it is proven first in a throw-away spike (M0, §1.11).

## 1.7 The circuit model

1. **Connectivity.** Breadboard rows, rails, wires and pins are joined into *nets* (union–find). Pure, fast, easy to test.
2. **Electrical solve.** A small DC solver (*modified nodal analysis*) works out every net's voltage and every part's current. LEDs and diodes are non-linear and solved by iteration. A circuit has at most a few dozen nets, so a solve takes well under a millisecond and can run at every pin change.
3. **PWM** is treated by its average (duty × voltage) for brightness and motor speed, and by its pulse width for servos, so the solver doesn't need microsecond steps.
4. **Behaviours.** Each part type has a small model: LED brightness from current, servo angle from pulse width, motor speed from voltage, ultrasonic echo from the distance slider, OLED pixels from I²C commands.
5. **Faults** are checks on the solved values (current above a part's or pin's limit, a short, 5 V on a 3.3 V pin) (§1.3).

Every step is pure TypeScript with known answers, e.g. *3.3 V → 220 Ω → red LED (2.0 V) gives (3.3 − 2.0) / 220 ≈ 5.9 mA*.

## 1.8 The component library and learning content

Each part is one folder, so adding a part is mostly writing data (N-10):

```
library/parts/servo-sg90/
  part.json          pins, properties, limits, electrical + behaviour model name
  art.svg            the picture on the workspace (our own drawing)
  learn.md           what it is · how it works · pins · numbers · connecting · mistakes
  wiring/            one wiring picture per board (made from a ready project)
  examples/
    microbit.py   pico-w.py   esp32.py     + a ready project per board for "Try it"
```

*(Rev 9)* A part's Learn page is about the part itself: `learn.md` has the sections of F-40 (what it is · look inside · the idea · specifications · legs · connecting · mistakes), with no code and no board; its **look inside** picture is one of the app's interactive figures, named in `learn.md`; its numbers come from `part.json` so the page and the simulator agree. The examples per board stay as the acceptance suite (`library/examples/`), not in Learn.

*(Rev 9)* The content is now one page per part (not per board) and the ideas pages, for 10–13, with no code to test; it is still drafted with AI help from the datasheets and checked by the teacher, group by group, the Basics first.

The **content is the largest piece of work** in the project (about 30 parts × 3 boards of explanations, wiring and tested examples). Suggestion: drafts are written with AI help from the datasheets, then the teacher checks them; every example is an automated test (it must run in the simulator without errors and produce the expected outputs).

## 1.9 Risks

| # | Risk | Plan |
|---|---|---|
| R1 | MicroPython WebAssembly: blocking `sleep`, real-time pin reads and Stop inside a worker | Spike in M0 before anything else; fallback: run it in a separate process |
| R2 | The `microbit` module is large (display, music, radio, accelerometer) | Build it in steps; the micro:bit Foundation's open-source simulator is a reference (licence to check) |
| R3 | Solver stability with LEDs, shorts and open circuits | Pure-function tests with known answers, including the broken circuits |
| R4 | Volume of learning content and examples | Treat content as its own milestone; AI drafts + teacher review; examples tested automatically |
| R5 | USB drivers for real ESP32 boards on Windows (CP210x / CH340) | F-50 is a *should*, in a late milestone. *(Rev 5)* The connection helper (F-56) spots a known USB chip that has no driver and offers the installer shipped with the app; checked on clean Windows 11 and macOS machines in M10 |
| R10 | *(Rev 5)* Checking a board means briefly stopping its program (Ctrl-C), and opening an ESP32's port can restart it | The check runs only when a board is plugged in (it has just restarted anyway), then restarts the program with a soft reset; the serial lines are set so an ESP32 is not held in its bootloader; tested with each board in M10 |
| R6 | A full 3D workspace costs a lot of time and is harder to use for precise wiring (Q1) | Decided: 2D (Rev 2) |
| R8 | Arduino later (Q13): the classic Uno cannot run MicroPython | Keep the engine's board layer open to new boards; decide Arduino's language when its phase starts |
| R11 | *(Rev 10)* A bundled CPython makes the installers bigger (≈ 25 MB macOS, ≈ 45 MB Windows, compressed) and every binary in it must be signed (macOS notarization) | A self-contained build (python-build-standalone) per platform and processor; signed with the app in M11, as Thonny does; checked on clean macOS and Windows 11 machines |
| R12 | *(Rev 10)* Stop on Windows: a child process has no Ctrl+C signal of its own | The program's process starts in its own process group and gets CTRL_BREAK, which MicroLab's runner turns into a KeyboardInterrupt; killed if it doesn't stop within 0.5 s (N-03) — checked on Windows 11 at the milestone's gate |
| R13 | *(Rev 15)* **Full screen is not a lock.** On Windows Alt+Tab, the Windows key, Ctrl+Alt+Del and Task Manager still work (macOS: ⌘Tab, Mission Control); File Explorer can still open other students' files on the disk | MicroLab can't stop this, but it makes it **seen**: leaving MicroLab's full screen is obvious to the teacher walking round; MicroLab never lets another project in (F-112); ended from outside, it comes back into the exam (F-114). Files on the disk are closed later with locked projects (§1.15). Said plainly in the exam's help for the teacher |
| R14 | *(Rev 15)* A Python 3 program's own windows (turtle, tkinter) must show **above** MicroLab's full screen | MicroLab's window is full screen but not *always on top*; a program's window is brought to the front when it opens; checked on Windows 10 and macOS at M13's gate |
| R15 | *(Rev 15)* Audit hooks are **not a sandbox**: a library with C code, installed before the exam, could get round them | Libraries can't be installed in an exam unless the teacher allows it (F-110), and the libraries folder is checked against the list at the exam's start (a new one, not allowed, is not on the path); the hooks catch what a student would try (`open`, `os.listdir`, `subprocess`, `ctypes`). Tested by a list of escape attempts in M13 |
| R16 | *(Rev 15)* The exam file on a computer before the exam can be opened to read the starter; a short passcode can be guessed from the file | The teacher copies it when the exam begins (said in *Make an exam*); the passcode is at least 6 characters and kept only as a slow scrypt hash, so trying passcodes against a copied file takes years, not seconds |
| R17 | *(Rev 16)* **The author's key is everything**: if it leaks, anyone can make teacher licences; if it is lost, no new teacher can be approved | Kept only on the author's computer, never in the repository or CI, locked with a passphrase, with a backup offline. MicroLab accepts **two** author keys, so a new one can be brought in by an update and the old one withdrawn later |
| R18 | *(Rev 16)* **Open source**: anyone can build a MicroLab that skips the checks, and a student could install it on a school computer (a per-user install needs no administrator) and leave the exam at will | Building one is far beyond most students; the official installers are signed (the Mac with the author's certificate); IT can stop installs on the school computers; the exam bar of a fake build can lie, so the teacher walking round still matters (R13). A signed exam still can't be **made** without an approved teacher's key |
| R19 | *(Rev 16)* The request form is open to anyone, so it can be used to send spam to the author's email | The form only takes MicroLab's request format, a few per hour from one address, with a size limit; the author ignores what isn't a real request |
| R9 | The TypeScript circuit solver is too slow on weak laptops (Q14) | Performance test from M1 (≤ 1 ms for 40 parts); if missed, rewrite only the solver in Rust → WebAssembly behind the same interface |
| R7 | Looking like a copy of Tinkercad or Wokwi | Our own layout, pictures and wording; similar *workflow* only |

## 1.10 Decisions & open questions

### Decided

| # | Question | Decision |
|---|---|---|
| — | Language | MicroPython only |
| — | Boards | micro:bit V2, Pico W, ESP32 |
| — | Workflow | As the gradebook: analysis → HTML prototype → comments → architecture & milestones → TDD, one gate per milestone |
| Q1 | *(Rev 2)* 2D or 3D workspace? | **2D** breadboard view. A 3D workspace is out of scope for v1. |
| Q2 | *(Rev 2)* Which ESP32 board? | **ESP32 DevKit V1, 30-pin** (ESP32-WROOM-32) |
| Q3 | *(Rev 2)* Which parts? | The list in §1.4 *Parts in v1* |
| Q4 | *(Rev 2)* Send code to real boards in v1? | **Yes** — F-50 and F-51 in v1, after the simulator works (M10) |
| Q5 | *(Rev 2)* Robot arena (F-70)? | **Phase 2** |
| Q6 | *(Rev 2)* The app's language | **English only** |
| Q10 | *(Rev 2, Rev 6)* The app's name | ~~REAMLab~~ → *(Rev 6)* **MicroLab** ("Circuit Lab" already exists; no other electronics simulator is called MicroLab). Project files **`.mlab`** |
| Q15 | *(Rev 4)* How are files put on the board and read back? | Over USB serial through MicroPython's **raw REPL**, as Thonny and `mpremote` do: the app interrupts the board, sends small Python commands (`os.listdir`, `open(…).write(…)` in chunks, `os.remove`, `os.mkdir`, `os.statvfs`) and reads the answers. Works on any board with MicroPython, no extra firmware or driver. Not the USB drives: the Pico's BOOTSEL drive only takes firmware, and a `.hex` on the micro:bit's drive replaces the firmware and wipes its files (§1.12) |
| Q17 | *(Rev 5)* Can the app show that a board is connected, with no setup? | **Yes** — F-55, F-56, §1.13. The board is recognised by its USB IDs, then asked for its MicroPython version |
| Q18 | *(Rev 5)* Install MicroPython from inside the app (F-52)? | **Yes for the micro:bit and Pico** (S): one file copied to the board's drive, firmware shipped with the app. **ESP32 stays C** (needs `esptool-js`); the helper links to a guide |
| Q16 | *(Rev 4)* IoT web pages and Wi-Fi in v1? | **Later phase** (F-80–F-82). v1 keeps the folder tree and `www/` files ready for it |
| Q22 | *(Rev 10)* How does MicroLab run Python 3? | **A real CPython 3.13 shipped inside the app** (python-build-standalone, with Tcl/Tk), the program in its own process. Pyodide (CPython as WebAssembly) was tried first (spike, 2026-11-09): it ran Python 3.14, `input()`, Stop and a library from PyPI, but has **no tkinter and no turtle**. The native spike ran Python 3.13.18 with Tk 9.0.4, `input()` through a pipe, Ctrl+C in 44 ms, CPython's messages, and `pip install` into an app folder |
| Q23 | *(Rev 10)* Python 3 projects or plain files? | **Plain `.py` files**, as IDLE; libraries installed with `pip` from PyPI when online, or from a `.whl` file (the teacher, 2026-11-09) |
| Q24 | *(Rev 15)* How does an exam begin? | **An exam file** (`.mlexam`) the teacher makes once and copies to each computer; opening it starts the exam; the teacher's passcode ends it (the teacher, 2026-11-10) |
| Q25 | *(Rev 15)* How is exam work handed in? | **On the teacher's ICT hand-in site**, as now — *"they can just upload their works to my ict-handin site"* (the teacher, 2026-11-10). MicroLab only shows the files to upload (F-115); the site takes files, a folder or a `.zip` |
| Q26 | *(Rev 15)* Which exams? | **Both**: board projects and Python 3 projects (the teacher, 2026-11-10) |
| Q40 | *(Rev 18)* When a board is plugged in, where does Run run? | **A choice, remembered**: *The simulator* · *The real board* · *Both at once* in Run's ⌄ menu; the simulator when no fitting board is plugged in (the teacher, 2026-11-10) |
| Q41 | *(Rev 18)* Run on the real board: the project's other files? | **The changed ones are copied first**, never `main.py`; then the open file runs from the editor (the teacher, 2026-11-10) |
| Q42 | *(Rev 18)* Before v1.0.0, or after? | **Before** — it is the classroom trial's fix (the teacher, 2026-11-10) |
| Q27 | *(Rev 15)* What about other apps and copied code? | **Full screen** (F-112, R13). Switching to another app and pasted code are not recorded (the teacher, 2026-11-10) |
| Q28 | *(Rev 15)* Exam mode before v1.0.0, or after? | **After**: M13 starts once v1.0.0 is out (the classroom trial and the slowest computer first) — agreed (the teacher, 2026-11-10) |
| Q29 | *(Rev 15)* A time limit in MicroLab? | **No** — the teacher keeps the time; the top bar shows the clock — agreed (the teacher, 2026-11-10) |
| Q30 | *(Rev 15)* Real boards in an exam? | **Send to board on** (the teacher can turn it off in *Make an exam*); opening files that are on a board **off** — agreed (the teacher, 2026-11-10) |
| Q31 | *(Rev 15)* Exams left on the computer after the hand-in | **Kept until the teacher deletes them** (F-117) — in case an upload failed — agreed (the teacher, 2026-11-10) |
| Q32 | *(Rev 15)* Does the hand-in site take a `.mlab`? | Hand in gives the `.mlab` **and** its code files beside it, so the site shows the code whatever it does with the `.mlab` — agreed (the teacher, 2026-11-10) |
| Q33 | *(Rev 15)* The student's name: typed, or chosen from a class list in the exam file? | **Typed** (as the name on the hand-in site) — agreed (the teacher, 2026-11-10) |
| Q38 | *(Rev 16)* One passcode or two? | **Two**: the teacher passcode (locks the teacher's key, asked when making an exam) and each exam's own passcode (lets students out); a teacher may choose the same for both — agreed (the teacher, 2026-11-10) |
| Q39 | *(Rev 16)* How long does a licence last? | **No end date**; withdrawn when needed (F-123) — agreed (the teacher, 2026-11-10) |
| Q34 | *(Rev 16)* Who can be a teacher? | **Anyone the author has checked** — MicroLab will be open source for everyone, so not only the author (the teacher, 2026-11-10) |
| Q36 | *(Rev 16)* Where does the request form live? | **An API route in the codingspacekh.dev site** (Next.js on Vercel, with Supabase): `POST /api/microlab/teacher-request` checks the request's format and size, limits how often one address may send, keeps the request in a Supabase table, and emails it through an email service (Resend) with the teacher's address as *Reply-To*, so the licence goes back with a plain Reply. Its keys stay in Vercel's settings, never in MicroLab |
| Q37 | *(Rev 16)* The assigned email address | **codingspacekh@gmail.com** (the teacher, 2026-11-10) — the form's destination and the address shown for sending by hand; a build setting, so a fork sets its own |
| Q35 | *(Rev 16)* How does a teacher ask, and how is the licence given? | **From MicroLab itself, to an assigned email**; the author sends back the licence file (the teacher, 2026-11-10). Asked from *Help*, not when installing (F-119) |
| Q20 | *(Rev 9)* Who reads Learn? | **Students of 10–13**: short sentences, everyday comparisons, the real units explained (the teacher, 2026-11-09) |
| Q21 | *(Rev 9)* Learn's first slice, and how a part shows how it works | **The Basics group** first; each part with a **picture to play with** (look inside), still pictures only where nothing moves (the teacher, 2026-11-09) |
| Q19 | *(Rev 7)* Can Run run any file, as in Thonny, not only `main.py` as on python.microbit.org? | **Yes** (F-22, F-50, §1.12). It is how the boards themselves work: on a soft reset into the raw REPL (what Thonny uses), the Pico W and ESP32 run `boot.py` but not `main.py`, and the micro:bit runs neither (it has no `boot.py`); Thonny then sends the file in the editor, which runs as `__main__`. `main.py` only runs by itself on a normal start (checked in the firmware: `ports/rp2/main.c`, `ports/esp32/main.c`, micro:bit `codal_port/main.c`). A helper file can carry its own test code under `if __name__ == "__main__":` |
| Q14 | *(Rev 3)* Rust instead of TypeScript, since the app "is like a compiler"? | **TypeScript + Electron.** We don't write a compiler: MicroPython's own compiler and VM (C) run as the official WebAssembly build, already near native speed. What we write — the board hardware layer, the circuit solver (~30 nets: microseconds per solve), the editor UI — needs no Rust speed, and the hardware layer has to talk to MicroPython's JavaScript bridge anyway. Rust would add a second language and test setup for one maintainer; Tauri would use a different browser engine per OS (sound, rendering, SharedArrayBuffer to check); a native Rust UI has no code editor as good as CodeMirror. Electron is the same choice as EasyMedia. **Safeguard:** the circuit engine stays pure behind one interface (`solve(netlist) → voltages, currents`) with a performance test in M1 (a 40-part circuit solves in ≤ 1 ms); if real laptops ever miss it, only the solver is rewritten in Rust → WebAssembly, against the same tests (§1.11, R9) |

### Still open (sensible defaults are used in the design)

| # | Question | Default in design |
|---|---|---|
| Q6b | Students' age / grades (for the wording of part pages) | Grades 7–12 |
| Q7 | Guided projects (F-43) in v1? | After v1.0 (part pages and examples first) |
| Q8 | Schematic view (F-19)? | Later (C) |
| Q9 | Windows 11 + macOS, as the other apps? | Yes — *(Rev 14)* and Windows 10 (64-bit): most school computers run it |
| Q11 | Installers and updates as in the gradebook (v1.21 updates by themselves)? | Yes, at the end, one final build |
| Q12 | Is the source public (GPL-3.0 like EasyMedia) or private? | Private at first; **public since 2026-11-09**, all rights reserved (no licence) — CI is free for a public repo |
| Q13 | *(Rev 2)* Arduino in a later phase: which boards, and in which language? The classic **Uno / Nano (AVR) cannot run MicroPython** — they need C++ and a separate engine. Arduino's **Nano ESP32** and **Nano RP2040 Connect** do run MicroPython and would fit the current engine with little extra work | Decided when that phase starts; until then the board layer is kept open to new boards (R8) |

## 1.11 Proposed way to build it

### Steps (the gradebook's workflow)

1. **This analysis** → teacher's comments → Revision 2 ✅ · Revision 3 ✅ (2026-11-05).
2. **HTML prototype** in `design/` (same build script and conventions as the gradebook) — ✅ approved 2026-11-05 ("all are already good"): 13 screens in `design/screens/` (open `index.html`); rebuild with `python3 design/build.py`. The Board files panel (F-53), the board chip and the connection helper (F-55, F-56) get screens when M10 is designed. *(Rev 6)* Renamed MicroLab; every screen now fills the browser window (resize it to check 1280–1920 wide); new screen **12b · Form controls** (N-13, N-14).
3. **`docs/02-architecture.md`** and **`docs/MILESTONES.md`** (TDD rules, Definition of Done, exit gates, `docs/acceptance/M<n>.md`) — 📝 Rev 1 written 2026-11-05, for the teacher's comments; the milestones below are detailed there.
4. Coding, milestone by milestone, test first.

### Suggested technology

| Part | Choice | Why |
|---|---|---|
| Desktop shell | **Electron** + Vite + TypeScript | As the other edutools apps; Windows + macOS; USB serial for F-50 |
| UI | **React** | As the gradebook |
| Workspace | **SVG** | Sharp at any zoom, exact pin hit-testing, testable in the DOM |
| Code editor | **CodeMirror 6** | Light, offline, good Python support and autocomplete |
| MicroPython | Official **webassembly** port, version pinned, in a Web Worker | §1.6 option A |
| Circuit engine | Our own pure TypeScript (connectivity + MNA solver + behaviours), behind one interface with a performance test | Small, fully unit-testable; can be swapped for Rust → WebAssembly if ever too slow (Q14) |
| Real boards | Electron's built-in **Web Serial** (or `serialport` in the main process), MicroPython raw REPL | F-50, F-51, F-53, Q15 |
| Tests | **Vitest** (unit, integration, component, acceptance) + **Playwright** for Electron | As the other apps |

### Suggested milestones (detailed later in `MILESTONES.md`)

```
M0 Foundations + MicroPython spike ─► M1 Circuit engine ─► M2 MicroPython runtime & board layers
        ┌──────────────────────────────────────────────────────────────────┘
        ▼
M3 Code drives circuit ─► M4 Walking skeleton (Blink on all 3 boards) ─► M5 Circuit editor
        ┌──────────────────────────────────────────────────────────────────┘
        ▼
M6 Parts pack 1: inputs & basics ─► M7 Parts pack 2: actuators & displays ─► M8 Learn pages
        ┌──────────────────────────────────────────────────────────────────┘
        ▼
M9 Errors, faults & multimeter ─► M10 Real boards (USB) ─► M11 Hardening & v1.0
        └─► later phases: guided projects · robot arena (F-70) · IoT web pages & Wi-Fi (F-80–F-82) · Arduino (Q13)
```

| # | Milestone | Proven by (acceptance, written first) |
|---|---|---|
| M0 | Tooling, test layers, Electron shell; **spike**: MicroPython WebAssembly in a worker — `print`, `time.sleep(1)` takes 1 s, Stop ends `while True: pass`, a fake `Pin.value(1)` seen in JavaScript | The spike's measurements in `docs/acceptance/M0.md` |
| M1 | Breadboard connectivity, nets, DC solver, LED/diode model, fault rules, board pin data | Hand-checked circuits: divider, LED current, series/parallel, short, reversed LED |
| M2 | `machine.Pin / PWM / ADC / I2C / Timer`, `time`, and the micro:bit, Pico W, ESP32 pin maps and modules; the project's folder tree loaded into the simulated file system (F-21, §1.12) — tested headless | Python snippets run per board; their pin traces and errors match the real boards' |
| M3 | Runtime ↔ circuit: pin writes drive the solver, reads come from it | *Blink*, *Button + pull-up*, *Potentiometer dimmer* on each board, checked without a UI |
| M4 | First usable app: board, breadboard, 5 parts, wires, editor, Run / Stop, console, save / open | E2E: build *Blink* on Pico W, run it, the LED blinks; same on micro:bit and ESP32 |
| M5 | Full editor: rotate, inspector, undo / redo, pin hover, wire colours, zoom | E2E per prototype screen |
| M6–M7 | The parts in §1.4, each with its behaviour model and examples; the library pack for the parts that need one (F-54) | Every part's examples run as acceptance tests on all three boards |
| M8 | Part pages, board pinouts, glossary, Try it | Every part has a complete page; every Try it project runs |
| M9 | Friendly errors, all faults, multimeter, plotter | One test per fault and per explained error |
| M10 | Board detection and the board chip, connection helper (F-55, F-56); raw-REPL protocol (tested against a fake board), Send to board with changed files only, board console, Board files panel (F-50, F-51, F-53, Q15) | Detection and the helper's cases tested against recorded USB lists and a fake board; manual: each board plugged into clean Windows 11 and macOS machines is shown within 2 s, each helper case is staged (charge-only cable, no driver, Thonny holding the port, no MicroPython); the same projects — with `lib/` files — on real boards behave as in the simulator; files copied both ways match by checksum |
| M11 | Performance budget, accessibility, licences, installers, updates | N-01–N-11, teacher's classroom trial |

The examples library doubles as the acceptance suite: every example project is run automatically in every milestone from M3, and in M10 the teacher runs the same files on the real boards to confirm the simulator matches.

## 1.12 Files on the board *(Rev 4)*

MicroPython keeps a small file system in each board's flash, so programs, libraries and web pages are ordinary files.

| | Pico W | ESP32 DevKit V1 | micro:bit V2 |
|---|---|---|---|
| Space for files (about — measured on real boards in M10) | ~850 KB (Wi-Fi firmware takes part of the 2 MB) | ~1.5–2 MB (4 MB flash) | ~20 KB |
| Folders | Yes | Yes | **No** — one flat list |
| Libraries | `/lib` is on the import path | `/lib` is on the import path | next to `main.py` |
| Web pages (IoT phase) | Yes, Wi-Fi | Yes, Wi-Fi | No Wi-Fi (radio only) |

**One tree in three places.** The same files exist in the project (on the laptop), in the simulator (loaded into the WebAssembly MicroPython's file system before each run) and on the real board (copied by Send to board). Nothing changes between them, so code that opens a file or imports a library behaves the same everywhere (N-01).

```
Traffic lights.mlab
  main.py
  lib/ssd1306.py        ← from the library pack (F-54)
  www/index.html        ← IoT phase (F-80)
  www/style.css
```

**Talking to the board (Q15).** Over the USB serial port: Ctrl-C stops the running program, Ctrl-A enters the raw REPL, the app sends a short Python command, Ctrl-D runs it, and the answer comes back as text. Files are written in small chunks with a checksum after each file. The same channel gives the board's console (F-51) and the Board files panel (F-53). The protocol is written once as a pure, tested module (a fake board answers in the tests); only the serial port itself is in Electron.

**Which file runs** *(Rev 7, Q19)*. Run in MicroLab runs the file open in the editor, after a fresh start of the board, as Thonny does; the other files are there to import. A real board **on its own** (switched on, or reset) runs `main.py` — on the Pico W and ESP32 after `boot.py`; the micro:bit has no `boot.py`. So a student can try `led_test.py` with one click, and makes it the board's program by putting it in `main.py` (or importing it from there).

**micro:bit.** Its files are kept to the flat list and its ~20 KB; the app warns when a project will not fit. Flashing a new MicroPython `.hex` (F-52) wipes the micro:bit's files, so the app copies the project's files back afterwards.

## 1.13 Connecting a real board *(Rev 5)*

Getting the computer to "see" the board is where most students get stuck: which COM port, which speed, which driver, why nothing appears. MicroLab does all of it by itself and only asks the student to act when something physical is wrong.

**How the app recognises a board.** Every USB device reports two numbers, a vendor ID and a product ID. The app's main process lists the USB serial ports about once a second and compares the list with the one before, so it sees a board arrive or leave without any setup.

| What is plugged in | USB IDs | What the app knows from them |
|---|---|---|
| Pico / Pico W running MicroPython | `2E8A:0005` | A Pico with MicroPython |
| Pico held in BOOTSEL (drive `RPI-RP2`) | `2E8A:0003` | A Pico ready for new firmware — no MicroPython running |
| micro:bit | `0D28:0204` (its USB interface chip) | A micro:bit; MicroPython or a MakeCode program — asked next |
| ESP32 DevKit V1 | `10C4:EA60` (CP2102) or `1A86:7523` / `1A86:55D4` (CH340 / CH9102) | A USB-serial chip, probably an ESP32 — asked next |

**Then it asks the board.** It opens the port, sends Ctrl-C (stop) and Ctrl-B, and reads MicroPython's greeting, e.g. `MicroPython v1.24.1 on 2024-11-29; Raspberry Pi Pico W with RP2040`. That confirms the board, the Wi-Fi variant (Pico or Pico W) and the version. A soft reset (Ctrl-D) then starts the board's own program again, and the port is closed (R10). This happens once per plug-in; after that the app talks to the board only when the student sends, opens the console or opens Board files.

**The board chip** in the top bar, next to *Send to board*:

| State | Chip | Click shows |
|---|---|---|
| No board | ○ No board | What to plug in; *Help connecting* (F-56) |
| Connected | ● Pico W · MicroPython 1.24 | Port, board, version, free space; *Send*, *Console*, *Board files* |
| Wrong board | ● ESP32 — project is for Pico W | Change the project's board, or plug in the right one |
| Busy | ● Pico W — used by another program | Close Thonny / another MicroLab window; *Try again* |
| Needs help | ⚠ Board found, can't connect | The helper, at the step that failed |

**The connection helper (F-56).** Each problem the app can tell apart gets its own message:

| What the app sees | Most likely cause | What the helper says |
|---|---|---|
| No new USB device after the student says it's plugged in | Charge-only cable (the most common), loose cable, dead USB port | micro:bit, ESP32: "Is the board's power light on? Yes → the cable only carries power: try another cable." *(Rev 8)* Pico / Pico W, which have no power light: "Hold BOOTSEL while you plug it in — does a drive called RPI-RP2 appear? No → the cable only carries power." Picture of each board (screen 14) |
| A known USB chip (CP210x / CH340) but no serial port | Driver missing (mostly Windows) | Offers the driver installer shipped with the app, then checks again |
| The port exists but can't be opened | Another program has it open | Names Thonny, Arduino IDE, mu, another MicroLab window when it can; *Try again* |
| The port opens but no MicroPython greeting | A program that won't stop, a MakeCode program, Arduino code, or no MicroPython yet | Offers to install MicroPython (F-52, Q18) or a guide; warns that installing wipes a micro:bit's files |
| Pico in BOOTSEL | Firmware mode | Offers to install MicroPython (F-52) or explains how to restart it normally. *(Rev 8)* On macOS, says first that the system will ask to allow MicroLab to write to the RPI-RP2 drive (screen 14b) |
| Board doesn't match the project | Wrong board picked or plugged in | As the chip's *Wrong board* state |
| Board unplugged during a copy | Cable pulled | Says which files were copied; Send again finishes the rest (files are written under a temporary name and renamed at the end, so no half-written file is left) |

A *Copy report* button gathers the operating system, the USB list, the ports and the last messages, so a teacher can see the problem at a glance.

**Testing.** The detection rules are pure functions: a recorded USB list in, a board state out. The helper's steps run against a fake board (the same fake used for the raw REPL, Q15). Real cables, drivers and boards are checked by hand in M10 on clean Windows 11 and macOS machines.

## 1.14 Python 3 in MicroLab *(Rev 10)*

**What runs the code.** MicroLab ships a self-contained **CPython 3.13** for each platform and processor (macOS Apple silicon and Intel, Windows x64): the standard library, Tcl/Tk for tkinter and turtle, and `pip`. Nothing is installed on the computer, and a Python already there is never used or touched.

**How a program runs** (as Thonny does): the main process starts the bundled `python` with MicroLab's small runner script, in the folder of the file being run. The runner reads the student's file and runs it as `__main__`; it sends what the program prints and its tracebacks to the window, asks the window when the program calls `input()`, and, when the program ends, keeps its names for the shell's `>>>`. Stop sends Ctrl+C (SIGINT; on Windows CTRL_BREAK, R12) and, if the program ignores it, ends the process. A tkinter or turtle window is the program's own window, as with IDLE. One Python process is kept ready, so Run starts at once.

**Libraries.** A folder in MicroLab's own data holds the libraries the student installs (`pip install --target`), and it is on every program's path. The Packages window lists them and searches PyPI when the internet is there; offline, a `.whl` file installs the same way. Removing one deletes it from that folder.

**What is shared with the simulator.** The code editor, the shell (its `>>>`, history, Tab, Ctrl+C), the friendly errors (with CPython's own messages), the Plotter, the window's layout. The Python 3 screen has no circuit and no board.

## 1.15 Exam mode *(Rev 15)*

**The problem.** The school's computers have no sign-in: everyone uses the same account, so every project on a computer can be opened by everyone. In an exam a student can open someone else's project and hand in code they never wrote. A passcode that only MicroLab asks for would not help: a project is ordinary files on the disk, readable in Notepad. So this comes in two steps.

**Step 1 — exam mode (M13).** During an exam a student is kept **inside their own exam** in MicroLab:

1. **The teacher makes the exam once** (F-110): from a starter project — a circuit to finish, a Python file to complete, or an empty one — *File ▸ Make an exam…*, a title, the teacher's passcode, the hand-in site's address. The result is one `.mlexam` file (a zip, as a `.mlab`: `exam.json` — title, kind, settings, the passcode's scrypt hash and salt — and `starter/`).
2. **At the exam** the teacher copies it to each computer (USB stick or a shared folder). Each student opens it, types their name, and is in: their own copy, full screen (F-111, F-112).
3. **During the exam** MicroLab has no way to any other project; a Python 3 program can't read outside its folder (F-116); closing or leaving needs the teacher's passcode (F-113); a switched-off computer comes back into the exam (F-114).
4. **At the end** the student presses *Hand in*: the exam ends on that computer and the files to upload are shown, for the ICT hand-in site (F-115). The teacher deletes the exams from the computers once collected (F-117).

**What it does not stop** (R13): switching to File Explorer or Notepad with Alt+Tab or the Windows key — MicroLab can't prevent that, but full screen makes it plain to see — a student looking at a neighbour's screen, or a passcode told to a student.

**Step 2 — locked projects (later).** A student's own projects locked with a passcode they choose — the project **encrypted** with it, so neither MicroLab nor Notepad can read it without the passcode — and a **teacher key** that opens every locked project, kept only on the teacher's own computer (the classroom computers hold only the half that locks). That closes the files on the disk, between lessons as well as in exams. To be designed after M13.

## 1.16 Teacher mode *(Rev 16)*

**Why.** *Make an exam* would otherwise be in every copy of MicroLab, so a student could make their own exam from the teacher's starter, with a passcode they know, and leave whenever they like — and it would look the same. Only a verified teacher may make an exam, and a student's MicroLab must be able to check that, **offline**.

**How the trust works** (signatures, no server to ask):

1. **The author's key.** The author has one key pair. The private half stays on the author's computer (R17); every copy of MicroLab carries the public half, which can check a signature but never make one.
2. **The teacher's key.** *I'm a teacher…* makes a key pair on the teacher's computer, the private half locked with the teacher passcode (the computer's own account is shared by everyone at a school, so it can't be what protects it).
3. **The request** — name, school, email, a page to check them on, the public half — goes to the author's email through the form on codingspacekh.dev (F-120).
4. **The licence.** The author checks the teacher (a call, the school's website, a school email address) and runs `npm run licence`, which signs *this teacher, this key*. The `.mllicence` goes back by email; opened on the teacher's computer, teacher mode is on (F-121).
5. **The exam file** is signed with the teacher's key and carries the licence. A student's MicroLab checks the author's signature on the licence and the teacher's on the exam before it starts (F-122).

**What it gives.** No accounts, no sign-in, nothing online when an exam runs; a student can't make an exam a student's MicroLab will open, and can't use a teacher's licence on another computer. **What it doesn't** (R18): someone who builds their own MicroLab from the open source can make a copy that skips the checks.

**For a fork.** The author's public key and the request address are build settings: someone running their own MicroLab sets their own, and their licences work only in their own builds.

