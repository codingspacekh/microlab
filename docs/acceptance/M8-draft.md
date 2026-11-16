# M8 Learn — the work, drafted

*Draft 2, 2026-11-16, with the teacher's answers of the same day (section 4). Nothing here is built. It follows the approved design (screens
30–30e, 2026-11-09) and requirements Rev 9 (F-40–F-42, F-44, F-45, F-06): Learn is about the components, for
students of 10–13 — how each works inside, the idea behind it, its numbers, how to connect it — with no code and no
particular board. The pilot is done and 1.0.1 is out, so the hold on M8 can end when the teacher says.*

Gate record: [`M8.md`](M8.md) · Plan: [`../MILESTONES.md`](../MILESTONES.md#m8--learn)

## 1. What a page is (agreed, screens 30b and 30c)

Every part page has the same seven sections, in this order:

| Section | What it holds | Where it comes from |
|---|---|---|
| What it is | Two or three sentences and what it is used for | written (`learn.md`) |
| **Look inside** | One picture to play with — a slider, a knob, a press — that shows the part working | an interactive figure in the app, named in `learn.md` |
| The idea | The one idea behind it, linked to an ideas page | written |
| Its numbers | The three to five numbers that matter, each with what it means in words | the simulator's own model of the part, so the page and a run always agree |
| Its legs | The part drawn with each leg named | the part's drawing in the workspace |
| How to connect it | One small circuit with a battery — no board — and how to choose what goes with it | written, its circuit drawn |
| Its mistakes | What goes wrong and what the simulator shows when it does | the simulator's fault cards |

A page has no code and names no board. A word in the glossary is underlined and opens its one or two lines in place.

## 2. The order of work

*Draft 2 (2026-11-16), after the teacher's answers: "just the basic parts and electronics concept and some regular
sensor first"; modules that repeat a basic part get "only a link"; chips and communication "later"; "you draft".*

### The first release — Learn 1 (suggested `v1.1.0`)

| Slice | What | Pages | Size | The teacher checks |
|---|---|---|---|---|
| 8.1 | **The page engine**: Learn's home (screen 30), a page shown from `learn.md`, the numbers read from the part's model, the checker test, the search, the ways in (parts panel, right-click a part → *Learn about this*, the inspector, a fault card's *Show me how*) — tried with the LED and the potentiometer | 2 | M | Home and the two pages beside screens 30, 30b, 30c |
| 8.2 | **The basic parts** — words drafted: [`M8-pages-basics.md`](M8-pages-basics.md) | 10 | L | every page read, every picture tried |
| 8.3 | **Electronics concepts**: voltage, current and resistance (30d) · a circuit is a loop · inside a breadboard · series and parallel · digital and analog · PWM — and **the glossary** | 6 + ~35 words | M | as 8.2 |
| 8.4 | **Regular sensors**: ultrasonic HC-SR04 · DHT11 / DHT22 · PIR motion · temperature (TMP36) · soil moisture · line sensor (IR) | 6 | M | as 8.2 |

A module that repeats a basic part has **no page of its own**: *Learn about this* on a button module opens the push
button's page, the potentiometer module's the potentiometer's, the photoresistor module's the LDR's, the traffic
light, RGB LED and passive buzzer modules' the LED's, the RGB LED's and the buzzer's.

### Later, one group at a time (each when the teacher asks for it)

| Slice | What | Pages |
|---|---|---|
| 8.5 | The boards as parts (Pico W — 30e — micro:bit V2, ESP32, ESP32 on its extension board) | 4 |
| 8.6 | The other sensor and the kit's modules that are parts of their own (MPU6050; touch, vibration, IR obstacle, hall, flame, raindrop, water level, gas, joystick, rotary encoder, IR speed sensor, RFID) | 13 |
| 8.7 | Actuators (servo, TT motor, the two drivers, relay, pump, the stepper with its board) and the breadboard power supply | 8 |
| 8.8 | Displays | 6 |
| 8.9 | Chips and communication | 9 |
| 8.10 | Export a picture of the circuit and its wiring list (F-06) | — |

**Tests first, every slice** (MILESTONES M8): the checker — every part of the slice has its sections, its figure, no
code block, no board's name, and every underlined word is in the glossary; a page's numbers equal the model's; each
figure's control moves what it shows by the simulator's own model; each way in opens the right page.

## 3. The pages, part by part

*Look inside* is the heart of each page, so each part's picture is drafted here: **what the student moves → what they
see**. Figures marked ♻ reuse one built for another part with different numbers, which is how 59 parts need about 30
figures. Numbers shown are the simulator's today.

### Basics (10) — first release, slice 8.2

| Part | Look inside: move → see | The idea | Its numbers | Its mistakes |
|---|---|---|---|---|
| Breadboard | Push a wire's end into a hole → the holes joined to it light up; the cover lifts to show the metal strips; the two long rails | Holes in a row are one piece of metal | 5 holes a strip; the gap in the middle; rails for + and − | Both legs of a part in one strip (it is skipped); a part across nothing |
| Resistor | Slide the resistance → the current through it thins, the LED after it dims; the colour bands change to say the value | It holds the current back | Ohms; its bands; ¼ W | Too small a value in front of an LED; reading the bands backwards |
| LED *(30b, agreed)* | Slide the current → the chip glows, then burns past 30 mA; turn it round → nothing flows | A one-way door that opens at about 2 V | Forward voltage by colour; 15–20 mA; 30 mA at most | No resistor; the wrong way round |
| RGB LED | Three sliders (red, green, blue) → the colour mixed, the three chips shown inside one case | Three LEDs sharing one leg | A forward voltage for each colour; 20 mA each; common cathode or anode | One resistor for all three; the common leg to the wrong side |
| Push button | Press → the metal bridge comes down on the two contacts and the loop closes; let go → it springs back | A gap in the loop that you close | Its four legs in two joined pairs | Wired across a joined pair: always on, or never |
| Slide switch | Slide → the middle leg joins the left leg or the right leg | One way in, a choice of two ways out | Three legs; the middle is common | Using the two outer legs only |
| Potentiometer *(30c, agreed)* | Turn the knob → the wiper slides along the track; the volts on leg 2 and the ohms each side | A voltage divider | 10 kΩ; a ¾ turn | The outer legs swapped (it turns backwards); the middle leg left out |
| Light sensor (LDR) | Slide the light from dark to bright → its resistance falls; with its partner resistor, the volts in the middle move | Light knocks electrons loose, so more current can pass | About 1 MΩ in the dark, a few kΩ in room light | No partner resistor, so nothing changes to read |
| Buzzer | Slide the pitch → the disc bends faster and the waves in the air close up; switch between *active* (hums by itself) and *passive* (needs pushing each time) | A disc that bends when pushed, and shakes the air | 2 300 Hz for the active one; what volts it needs | A passive buzzer given steady volts: one click, no sound |
| Battery pack | Choose 2 × AA, 4 × AA or 9 V → the cells in a row add their volts; slide what it feeds → how long it lasts | Cells in a row add their push | 1.5 V a cell; its mAh in words | The + and − joined by a wire (a short); too many volts for the part |

### Sensors (7) — six in the first release (slice 8.4), the MPU6050 later

| Part | Look inside: move → see | The idea |
|---|---|---|
| Ultrasonic HC-SR04 | Slide the wall nearer and farther → a click of sound goes out, bounces and comes back; the time and the distance | Sound takes time: distance = time × speed ÷ 2 |
| DHT11 / DHT22 | Slide the temperature and the dampness → the two little sensors inside change; the chip sends them as a row of long and short pulses | A chip measures, then sends numbers down one wire |
| MPU6050 motion | Tilt the board → a tiny weight on springs leans, and the three arrows (x, y, z) change | A weight on springs feels the pull of the Earth |
| PIR motion | Walk a figure across → warmth crosses two halves of the sensor one after the other; the output stays on for 3 s | It sees warmth that moves, not light |
| Line sensor (IR) | Slide it over white and black → the invisible light bounces back from white, is swallowed by black | A light and an eye side by side |
| Soil moisture | Pour water → the damp soil lets more current pass between the two prongs | Water carries current; dry soil doesn't |
| Temperature (TMP36) | Slide the temperature → its output climbs 10 mV for each degree | A chip whose voltage follows the heat |

### Modules (15) — later; those marked ♻ with a basic part get no page, only a link to it

| Part | Look inside: move → see | ♻ |
|---|---|---|
| Button module | Press → the same contacts as the push button, with its resistor already on the board | Push button |
| Touch (TTP223) | Bring a finger near → the pad's tiny charge changes and the chip notices | |
| Vibration (SW-420) | Shake → a spring inside touches its pin for a moment | |
| IR obstacle | Slide a hand closer → the light bounces back to the eye; turn the screw to set how near | Line sensor |
| Hall | Bring a magnet near → the current inside the chip is pushed to one side | |
| Flame | Bring a flame's light near → the eye that sees only infrared wakes | Line sensor |
| Raindrop | Drip water on the tracks → drops join the two combs | Soil moisture |
| Water level | Raise the water → more of the tracks are joined | Soil moisture |
| Gas / smoke (MQ-2) | Let smoke in → the warm bead inside lets more current through; it needs a minute to warm up | |
| Photoresistor module | Slide the light → as the LDR, with its partner resistor on the board | LDR |
| Potentiometer module | Turn → as the potentiometer | Potentiometer |
| Joystick | Push the stick → two potentiometers at right angles turn, and pressing it down is a button | Potentiometer |
| Rotary encoder | Turn a click at a time → two contacts open and close one after the other; which goes first tells the direction | |
| IR speed sensor | Spin the slotted wheel → the light beam is cut and let through; count the flashes | Line sensor |
| RFID reader RC522 | Bring the card near → the reader's coil powers the card's coil, and the card answers with its number | |

### Actuators (8) and output modules (4) — later; the three ♻ output modules get only a link

| Part | Look inside: move → see | The idea |
|---|---|---|
| Servo SG90 | Slide the pulse from short to long → the gears turn the arm to the angle, and a potentiometer inside tells it when to stop | It turns until what it feels matches what it is told |
| TT motor | Slide the volts → the coil in the magnet spins faster; swap + and − → it spins the other way; the gearbox slows it and makes it strong | A coil in a magnet is pushed round |
| L9110S driver | Set its two inputs → four switches open and close in pairs: forward, back, stop | A small signal switches a big current |
| L298N driver | As the L9110S, with the enable pin sliding the speed | ♻ L9110S |
| Relay module | Switch the coil on → the magnet pulls the lever and the other circuit's contacts click over | A switch worked by a magnet: two circuits that never touch |
| Water pump | Slide the volts → the wheel spins and throws the water out | ♻ TT motor |
| Stepper 28BYJ-48 and its ULN2003 board (one page) | Step once, then again → the four coils switch on in turn and the rotor follows a small step each time | Many small steps instead of a free spin |
| Traffic light module | Three switches → three LEDs, their resistors already on the board | ♻ LED |
| RGB LED module | Three sliders → as the RGB LED, resistors on the board | ♻ RGB LED |
| Passive buzzer module | Slide the pitch → as the buzzer | ♻ Buzzer |
| Breadboard power supply | Set each rail's jumper to 3.3 V or 5 V → what each rail gives, and how much current before it gets hot | It turns one voltage into a steadier, lower one |

### Displays (6) — later

| Part | Look inside: move → see | The idea |
|---|---|---|
| 7-segment digit | Click a segment, or choose a number → which of the seven LEDs light; the leg they share | Seven LEDs in the shape of an 8 |
| 4-digit display (TM1637) | Slow it down → one digit lit at a time, so fast the eye sees all four | Taking turns faster than you can see |
| 8 × 8 dot matrix (MAX7219) | Click the dots → the row and the column that meet at each one | Rows and columns: 16 wires for 64 lights |
| LCD 16 × 2 | Type a letter → the tiny dots that go dark to make it; turn the contrast screw | Crystals that twist to block the light |
| OLED SSD1306 | Draw on the grid → each dot is its own tiny light; zoom from the picture to the dots | A picture is dots, each one switched |
| NeoPixel strip / ring | Send a colour down the line → the first light keeps it and passes the rest on | Each light has a chip that takes its share and passes the rest |

### Chips (6) and communication (3) — later

| Part | Look inside: move → see |
|---|---|
| PCF8591 | Slide a voltage → the number it becomes (0–255), a staircase of steps |
| BMP280 | Slide the height above the sea → the air presses less on a tiny skin |
| DS18B20 | Slide the temperature → the number it sends; several on one wire, each with its own name |
| DS1302 clock | A crystal that shakes 32 768 times a second, counted into seconds; the little battery that keeps it going |
| VL53L0X | A flash of light out and back → the time, far shorter than sound's ♻ HC-SR04 |
| MAX30102 | Put a finger on → each heartbeat lets less light through; count the beats |
| USB-serial adapter | Type a letter → its eight bits go down the wire one after another, at a speed both ends agree |
| Bluetooth HC-05 | The same letters, by radio: pair, then send |
| GPS NEO-6M | Four satellites each say the time → how far each is → where you are |

### Electronics concepts and the glossary (first release, slice 8.3); the boards as parts (later)

- **Concepts**, each with a picture to play with: *Voltage, current and resistance* (30d, agreed: water in a loop of
  pipe, three sliders) · *A circuit is a loop* (open a switch anywhere → everything stops) · *Inside a breadboard*
  (as the breadboard's own picture, with a whole small circuit on it) · *Series and parallel* (two lamps one after
  the other, then side by side: how bright, and what happens when one is taken out) · *Digital and analog* (a
  switch's two levels beside a knob's any level, and the staircase that turns one into numbers) · *PWM* (slide how
  long it is on in each blink → the blinks too fast to see, the lamp dimmer).
- **Boards**: the Pico W (30e, agreed), the micro:bit V2, the ESP32 DevKit V1, and the ESP32 on its extension board —
  what is on each, its pins by kind, its limits in words, where its power comes from, its mistakes. The picture to
  play with: point at a pin → what it can do and give.
- **Glossary**, one or two lines each, for 10–13 — a first list of 35: voltage · current · resistance · circuit ·
  short circuit · ground (GND) · volt · amp · milliamp · ohm · Ohm's law · power · watt · series · parallel · conductor ·
  insulator · polarity · anode · cathode · forward voltage · voltage divider · digital · analog · signal · pulse ·
  frequency · hertz · PWM · duty · sensor · actuator · pull-up · pin · bit.

## 4. Decided, and still open

**Decided by the teacher, 2026-11-16**

| Question | Answer |
|---|---|
| What comes first? | "just the basic parts and electronics concept and some regular sensor first" — section 2's first release |
| Modules that repeat a basic part | "only a link": no page of their own |
| Chips and communication | "later" |
| Who writes the words | "you draft" — the teacher corrects |

**Still open** (defaults used until said otherwise)

1. **Which sensors are the "regular" ones?** Default: the six of slice 8.4 (ultrasonic, DHT, PIR, temperature, soil
   moisture, line sensor); the MPU6050 later.
2. **The stepper and its ULN2003 board**: one page for the pair (default), or two?
3. **English only** (default), as the rest of MicroLab.
4. **When to start building** 8.1: on the teacher's word, as every milestone.
