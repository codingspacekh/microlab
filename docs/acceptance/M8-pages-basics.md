# M8 Learn — the basic parts, the words drafted

*Draft 1, 2026-11-16, for the teacher to correct ("you draft"). The words of slice 8.2's pages, in the voice and the
layout of the two approved pages — the LED (screen 30b) and the potentiometer (30c), which are not repeated here.
Each page: a heading with what it is and where you meet it, then **1 Look inside · 2 The idea · 3 Its numbers ·
4 Connect it · 5 Mistakes**. No code, no board. A word in* italics *opens the glossary. The numbers are the
simulator's own; in the app they are read from it, not typed.*

Plan: [`M8-draft.md`](M8-draft.md)

---

## Breadboard

**A board full of holes that joins parts without solder.** Push a leg in and a metal clip under the hole grips it.
*Where you meet it:* on every maker's desk — it is how a circuit is tried before it is made for good.

**1 Look inside** — *push a wire into any hole.*
The holes joined to it light up. Under each short column of five holes lies one strip of metal: five holes, one
piece. The gap down the middle cuts every column in two, so the top five and the bottom five are not joined. Along
the edges run two long strips, the rails: one for + and one for −, all the way along.

**2 The idea**
Holes in the same strip are the same point of the circuit, as if the legs in them were twisted together. So to join
two parts, put one leg of each in the same column. To keep two legs apart, put them in different columns.

**3 Its numbers**
- Holes in a strip: **5** — room for five legs at one point.
- The gap in the middle: just wide enough for a chip or a button to sit across it, legs on each side.
- Rails: **two on each long edge**, marked + (red) and − (blue).
- Sizes: mini, half and full — more columns, the same idea.

**4 Connect it**
Battery + to the red rail, battery − to the blue rail. Now every part can reach + and − with one short wire.
A part goes *across* columns: one leg in one column, the other leg in another.

**5 Mistakes**
- **Both legs in one column.** The strip joins the two legs, so the *current* goes round the part, not through it.
  MicroLab says the part is skipped.
- **A part across the rails.** Its legs join + straight to −: check which way the strips run.
- **Forgetting the gap.** A wire in the top half does not reach the bottom half of the same column.

---

## Resistor

**A part that holds the current back.** It has no top or bottom: it works the same both ways round.
*Where you meet it:* in front of nearly every LED, and anywhere a current must be kept small.

**1 Look inside** — *slide its resistance.*
With a small resistance the current rushes through and the LED after it glares. Slide it up: the current thins and
the LED dims. The stripes on its body change as you slide — they are how a resistor says its value.

**2 The idea**
A resistor is a narrow place in the path. The same push (*voltage*) gets less flow (*current*) through a narrower
place. Twice the resistance, half the current: that is *Ohm's law*, current = voltage ÷ resistance.
9 V across 470 Ω gives 9 ÷ 470 = 0.019 A — 19 mA.

**3 Its numbers**
- Resistance: in **ohms (Ω)**; 1 000 Ω is 1 kΩ.
- Its stripes: the first two are digits, the third says how many zeros follow. Red-red-brown is 2, 2, one zero:
  **220 Ω**. Brown-black-orange is 1, 0, three zeros: **10 kΩ**. The gold stripe goes on the right.
- How much heat it can take: **¼ watt** — plenty for LEDs and sensors.
- Legs: two, either way round.

**4 Connect it**
In the loop, one after the other with the part it protects: battery + → resistor → LED → battery −.
It does not matter whether it comes before the LED or after it — the same current flows all round a loop.

**5 Mistakes**
- **Too small a value.** 22 Ω instead of 220 Ω lets ten times the current through: the LED burns out.
- **Reading the stripes backwards.** Start from the end away from the gold stripe.
- **Beside the LED, not in line with it.** A resistor next to the LED, joined at both ends, protects nothing.

---

## RGB LED

**Three LEDs — red, green and blue — in one clear case.** Mixed, they make any colour.
*Where you meet it:* every dot of a phone or TV screen is three tiny ones; mood lamps; status lights.

**1 Look inside** — *three sliders: red, green, blue.*
Three tiny chips sit side by side under the dome. Slide red and green up together: your eye sees yellow. All three:
white. Each chip has its own leg; the fourth, longest leg is shared by all three.

**2 The idea**
Your eye has only three kinds of colour sensor — for red, green and blue. Any colour you see is a mix of those
three, so three lights are enough to make them all. Inside, it is simply three LEDs sharing one leg.

**3 Its numbers**
- Push each colour needs: red about **2 V**; green and blue about **3 V**.
- Best current: **10–20 mA** for each colour; **30 mA** at most.
- The shared leg: the longest. On a *common cathode* one it goes to −; on a *common anode* one, to +.
- Legs: four — red, shared, green, blue.

**4 Connect it**
One resistor for **each** colour leg — three in all — and the shared leg to battery − (common cathode).
On 5 V: 220 Ω for red, 150 Ω for green and for blue. On 3 V the green and blue chips barely open: they stay dim.

**5 Mistakes**
- **One resistor on the shared leg.** The three colours then share it: turning one up dims the others, and the
  colour is wrong.
- **The shared leg to the wrong side.** Nothing lights. Common cathode goes to −, common anode to +.
- **No resistors.** As with any LED: too much current, and the chip burns out.

---

## Push button

**Two pieces of metal that touch while you press.** Let go, and a spring pulls them apart.
*Where you meet it:* a doorbell, a keyboard key, a game controller.

**1 Look inside** — *press it.*
Under the cap is a springy metal dome. Press: the dome comes down across the two contacts and the loop is closed —
the current flows. Let go: the dome springs up, the loop is open, the current stops.

**2 The idea**
A circuit is a loop, and current only flows round a loop with no gap. A button is a gap you can close with a
finger.

**3 Its numbers**
- Legs: **four**, in two pairs. The two legs of a pair are joined inside, always.
- Pressing joins one pair to the other pair.
- Size: 12 mm across. It sits across the gap in the middle of the breadboard.
- It can carry far more current than an LED needs.

**4 Connect it**
In the loop, anywhere: battery + → button → resistor → LED → battery −. Use one leg from each pair — two legs
that are on opposite sides of the gap in the breadboard.

**5 Mistakes**
- **Two legs of the same pair.** They are already joined, so the LED is on all the time and pressing changes
  nothing.
- **Turned a quarter turn.** Then the joined pairs lie the other way: try the diagonal legs — they always work.
- **Left out of the loop.** A button beside the loop, not in it, switches nothing.

---

## Slide switch

**A switch that stays where you put it.** Slide it one way or the other.
*Where you meet it:* the on–off switch of a torch or a toy.

**1 Look inside** — *slide it.*
A small metal bridge rides under the knob. Slid left, it joins the middle leg to the left leg. Slid right, it joins
the middle leg to the right leg. The middle leg is always in.

**2 The idea**
One way in, a choice of two ways out. Use only one way out and it is an on–off switch. Use both and it chooses
between two things — a red light or a green one.

**3 Its numbers**
- Legs: **three** in a row. The **middle** one is the common leg.
- Positions: two, and it stays in each.
- Unlike a push button, it needs no finger to hold it.

**4 Connect it**
As an on–off switch: battery + → middle leg; one outer leg → resistor → LED → battery −. The other outer leg stays
empty.

**5 Mistakes**
- **Using the two outer legs only.** They are never joined to each other: nothing ever lights.
- **All three legs in one column.** The breadboard joins them: the switch does nothing.

---

## Light sensor (LDR)

**A resistor that changes with the light.** The brighter the light on it, the more current it lets through.
*Where you meet it:* street lamps that switch on at dusk; a night light.

**1 Look inside** — *slide the light from dark to bright.*
The wiggly line on its face is a track of a special material. In the dark the track holds the current back hard.
Shine light on it and the current gets through more and more easily.

**2 The idea**
Light is energy. When it falls on the track it knocks tiny charges loose, and loose charges are what current is made
of. More light, more loose charges, less resistance.
On its own an LDR only changes how hard it resists. Put a fixed resistor after it and the *voltage* between the two
moves up and down with the light — a *voltage divider*. That moving voltage is what a circuit can read.

**3 Its numbers**
- In the dark: up to **1 MΩ** (a million ohms).
- In dim light (10 lux): about **15 kΩ**. In a bright room (100 lux): about **3 kΩ**. In sunlight: under **1 kΩ**.
- Legs: two, either way round.
- It is slow: it takes a moment to follow a sudden change.

**4 Connect it**
Battery + → LDR → 10 kΩ resistor → battery −. Read the voltage at the point between them. With a 3 V battery it is
about 0.4 V when it is nearly dark and about 2.3 V in a bright room.

**5 Mistakes**
- **No resistor after it.** Then the point you read is joined straight to the battery: it never changes.
- **The resistor far too small or too big.** The voltage hardly moves. 10 kΩ suits room light.

---

## Buzzer

**A thin disc that shakes the air — that is the sound.**
*Where you meet it:* an alarm clock, a microwave's beep, a smoke alarm.

**1 Look inside** — *slide the pitch; switch between active and passive.*
Inside is a thin metal disc with a slice of a special crystal on it. Push it with a voltage and the disc bends; take
the voltage away and it springs back. Bend it hundreds of times a second and the air in front shakes in waves — you
hear a note. Faster bending, higher note.
An **active** buzzer has a tiny circuit inside that does the pushing for it: give it steady volts and it hums one
note. A **passive** buzzer has none: it must be pushed and let go, again and again, from outside.

**2 The idea**
Sound is air shaking. How many times a second it shakes is the *frequency*, in *hertz* (Hz): 440 Hz is the note A.
A buzzer turns an electric push into a push on the air.

**3 Its numbers**
- Active: one note, about **2 300 Hz**; it needs at least **2 V**; it takes a few mA.
- Passive: any note you push it at; the pushes must swing by at least **1 V**.
- Legs: two. The **+** is marked on top, and its leg is the longer one.

**4 Connect it**
Active: battery + → buzzer + ; buzzer − → battery −. Put a push button in the loop and it is a doorbell.
Passive: the same two legs, but to something that switches on and off quickly — steady volts will not do.

**5 Mistakes**
- **A passive buzzer on steady volts.** One small click as it bends, then silence.
- **An active buzzer the wrong way round.** Its little circuit will not start: silence. Turn it round.
- **Expecting a tune from an active one.** It knows one note only.

---

## Battery pack

**Where the push comes from.** A battery pushes current round the loop until its chemicals are used up.
*Where you meet it:* torches, remote controls, toys — anything not plugged into the wall.

**1 Look inside** — *choose 2 × AA, 4 × AA or a 9 V battery; slide what it has to feed.*
Each AA cell pushes with 1.5 volts. In a pack they stand in a row, + to −, and their pushes add up: two make 3 V,
four make 6 V. A 9 V battery is six small cells in one case. Slide the current it must give: the more it feeds, the
sooner it is empty.

**2 The idea**
A battery is a pump, not a tank of current. It pushes the same charges round and round the loop. *Voltage* is how
hard it pushes. Cells in a row push together, so their volts add.

**3 Its numbers**
- 2 × AA: **3 V**. 4 × AA: **6 V**. 9 V battery: **9 V**.
- How long it lasts: an AA cell holds about 2 000 mAh — it could light one LED at 15 mA for about 130 hours. A 9 V
  battery holds much less, about 500 mAh.
- Wires: **red is +**, **black is −**.

**4 Connect it**
Red to the breadboard's + rail, black to the − rail. Choose the pack by what the circuit needs: an LED with its
resistor is happy on any of them — with the right resistor for those volts.

**5 Mistakes**
- **+ joined straight to −.** A *short circuit*: a huge current, the wire and the battery get hot, and the battery
  is soon flat. MicroLab stops and shows where.
- **Too many volts for the part.** 9 V into something made for 3 V breaks it.
- **One cell in backwards.** Its push works against the others: the pack gives far less.
