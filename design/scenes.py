"""The circuits shown in the prototype screens.

Each scene returns one <svg> for the 692 × 820 canvas (or a smaller picture). The circuits are
the acceptance examples of the analysis (§1.11): *Traffic lights* on the Pico W, *Distance meter*
on the ESP32 and *Heart & knob* on the micro:bit. Every wire ends on a real pin or hole.
"""
import math

from svgparts import (P, f, Breadboard, defs, wire, led, resistor, button, buzzer, pot, pico, esp32,
                      microbit, oled, hcsr04, servo, HEART, slide_switch, ldr, rgb_led, battery,
                      pir, line_sensor, soil_sensor, temp_sensor, dht, mpu6050, hcsr04_in)

W, H = 692, 820


def _svg(body: str, w: int = W, h: int = H, vb: str = "") -> str:
    vb = vb or f"0 0 {w} {h}"
    return f'<svg class="scene" width="{w}" height="{h}" viewBox="{vb}" font-family="Inter">{defs()}{body}</svg>'


def cursor(x, y, kind: str = "arrow") -> str:
    if kind == "hand":
        return (f'<g transform="translate({x},{y})"><path d="M5,9 V2.5 a1.6,1.6 0 0 1 3.2,0 V8 V6.5 a1.6,1.6 0 0 1 3.2,0 V8.5 V7.2 a1.6,1.6 0 0 1 3.2,0 V9.5 V8.5 a1.6,1.6 0 0 1 3.2,0 V15 c0,4 -2.5,6.5 -6.5,6.5 h-1 c-2.5,0 -4,-1 -5.5,-3 L1.5,13.5 a1.7,1.7 0 0 1 2.7,-2 Z" '
                'fill="#fff" stroke="#111" stroke-width="1.2" stroke-linejoin="round"/></g>')
    return (f'<g transform="translate({x},{y})"><path d="M0,0 L0,16 L4.2,12.2 L7,18.5 L9.6,17.4 L6.9,11.2 L12.4,11.2 Z" '
            'fill="#111" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></g>')


# ------------------------------------------------------------------ Pico W · Traffic lights
LEDS = [(8, "green", "R1", "LED1"), (13, "amber", "R2", "LED2"), (18, "red", "R3", "LED3")]


def traffic(variant: str = "build") -> str:
    """variant: build · wiring · props · run · fault · error"""
    bb = Breadboard(120, 300)
    X = lambda c: bb.xy(c, "a")[0]
    o = [bb.svg(strip=(18, "top") if variant == "wiring" else None, rail_labels={"T-": ("GND", "#3a3d42"), "B-": ("GND", "#3a3d42")})]
    lit = {"run": "red"}.get(variant)
    for col, color, rname, _ in LEDS:
        if not (variant == "fault" and col == 8):
            o.append(resistor(bb.xy(col, "e"), bb.xy(col, "f"), "220", selected=(variant == "props" and col == 18)))
        state = "on" if color == lit else ("burnt" if variant == "fault" and col == 8 else "off")
        o.append(led(bb.xy(col, "g"), bb.xy(col + 1, "g"), color, state))
    o.append(button(bb.xy(24, "e"), bb.xy(26, "f")))
    psvg, pins = pico(152, 200, hl=(20,) if variant == "wiring" else ())
    o.append(psvg)
    gp13_end = bb.xy(8, "f") if variant == "fault" else bb.xy(8, "a")
    o.append(wire([pins[17], (408, 236), (232, 236), gp13_end], "green"))
    o.append(wire([pins[19], (440, 252), (312, 252), bb.xy(13, "a")], "yellow"))
    if variant == "wiring":
        o.append(wire([pins[20], (456, 268), (392, 268), (392, 346)], "purple", drawing=True))
    else:
        o.append(wire([pins[20], (456, 268), (392, 268), bb.xy(18, "a")], "purple"))
    o.append(wire([pins[21], (456, 64), (640, 64), (640, 346), (488, 346), bb.xy(24, "a")], "blue"))
    o.append(wire([pins[3], bb.xy(5, "T-")], "black"))
    o.append(wire([bb.xy(1, "T-"), bb.xy(1, "B-")], "black"))
    for col, *_ in LEDS:
        o.append(wire([bb.xy(col + 1, "j"), bb.xy(col + 1, "B-")], "black"))
    o.append(wire([bb.xy(26, "j"), bb.xy(26, "B-")], "black"))
    if variant == "wiring":
        o.append(cursor(392, 346))
    if variant == "run":
        o.append(cursor(500, 446, "hand"))
    if variant == "fault":
        x, y = bb.xy(8, "g")
        o.append(f'<circle cx="{x + 8}" cy="{y + 22}" r="21" fill="none" stroke="#d03b3b" stroke-width="2.4"/>'
                 f'<circle cx="{x + 8}" cy="{y + 22}" r="27" fill="none" stroke="#d03b3b" stroke-width="1.2" opacity=".45"/>'
                 f'<path d="M{x + 8},{y + 49} V562" stroke="#d03b3b" stroke-width="1.4" fill="none" stroke-dasharray="3 3"/>')
    if variant == "props":
        x, y = bb.xy(18, "e")
        o.append(f'<path d="M{x},{y + 39} H404 V596" stroke="#2563d9" stroke-width="1.4" fill="none" stroke-dasharray="3 3"/>')
    return _svg("".join(o))


# ------------------------------------------------------------------ ESP32 · Distance meter
def distance() -> str:
    bb = Breadboard(120, 300)
    o = [bb.svg(rail_labels={"T-": ("GND", "#3a3d42"), "T+": ("3V3", "#de3b3b"), "B+": ("5V", "#f08024"), "B-": ("GND", "#3a3d42")})]
    o.append(resistor(bb.xy(9, "g"), bb.xy(14, "g"), "1k"))
    o.append(resistor(bb.xy(14, "j"), bb.xy(14, "B-"), "2k"))
    esvg, ep = esp32(152, 200, led_on=False)
    o.append(esvg)
    osvg, op = oled(459, 40, lines=[("Distance", 11), ("34.0 cm", 19)], bar=34 / 128 * 134)
    o.append(osvg)
    hsvg, hp = hcsr04(216, 650)
    o.append(hsvg)
    o.append(wire([ep["B:3V3"], bb.xy(3, "T+")], "red"))
    o.append(wire([ep["B:GND"], bb.xy(4, "T-")], "black"))
    o.append(wire([ep["T:VIN"], (152, 30), (72, 30), (72, 564), bb.xy(1, "B+")], "orange"))
    o.append(wire([bb.xy(2, "T-"), bb.xy(2, "B-")], "black"))
    o.append(wire([op["GND"], bb.xy(29, "T-")], "black"))
    o.append(wire([op["VCC"], bb.xy(28, "T+")], "red"))
    o.append(wire([op["SCL"], (536, 240), (360, 240), ep["B:D22"]], "yellow"))
    o.append(wire([op["SDA"], (520, 252), (312, 252), ep["B:D21"]], "blue"))
    o.append(wire([ep["B:D5"], (264, 284), (232, 284), bb.xy(8, "f")], "green"))
    o.append(wire([ep["B:D18"], (280, 268), (328, 268), bb.xy(14, "f")], "purple"))
    o.append(wire([hp["VCC"], bb.xy(7, "B+")], "orange"))
    o.append(wire([hp["Trig"], bb.xy(8, "j")], "green"))
    o.append(wire([hp["Echo"], bb.xy(9, "j")], "white"))
    o.append(wire([hp["GND"], bb.xy(10, "B-")], "black"))
    # the sound going out to the object and back
    for r, op_ in ((24, .55), (34, .35), (44, .2)):
        for tx in (240 - 59, 240 + 59):
            o.append(f'<path d="M{tx - r * .7},{756 + r * .5} A{r} {r} 0 0 0 {tx + r * .7},{756 + r * .5}" stroke="#2563d9" stroke-width="2" fill="none" opacity="{op_}"/>')
    return _svg("".join(o))


# ------------------------------------------------------------------ micro:bit · Heart & knob
def heart() -> str:
    bb = Breadboard(120, 470)
    o = [bb.svg(rail_labels={"T-": ("GND", "#3a3d42"), "T+": ("3.3V", "#de3b3b")})]
    o.append(buzzer(bb.xy(14, "c"), bb.xy(17, "c"), playing=True))
    o.append(pot(bb.xy(21, "e"), bb.xy(23, "e"), bb.xy(25, "e"), angle=10, label="P2 · 562"))
    msvg, mp = microbit(184, 356, image=HEART, a_pressed=True, sound=True)   # pins on the breadboard's columns
    o.append(msvg)
    gx, gy = mp["GND@15"]
    o.append(wire([mp["GND@15"], (gx, 452), (136, 452), bb.xy(2, "T-")], "black"))
    o.append(wire([mp["3.3V@30"], (536, 404), bb.xy(27, "T+")], "red"))          # the I²C header's 3.3V
    px, _ = mp["P0"]
    o.append(wire([mp["P0"], (px, 464), (328, 464), bb.xy(14, "a")], "yellow"))
    px, _ = mp["P2"]
    o.append(wire([mp["P2"], (px, 458), (472, 458), bb.xy(23, "a")], "green"))
    o.append(wire([bb.xy(17, "a"), bb.xy(17, "T-")], "black"))
    o.append(wire([bb.xy(21, "a"), bb.xy(21, "T-")], "black"))
    o.append(wire([bb.xy(25, "a"), bb.xy(25, "T+")], "red"))
    o.append(cursor(184, 138, "hand"))
    return _svg("".join(o))


# ------------------------------------------------------------------ M6.1 · inputs pack (screens 17, 17b)
def mood_lamp() -> str:
    """Pico W running: a slide switch on GP16 (slid to 3, so it reads 0), a light sensor with 10 kΩ on GP26 in the
    dark, an RGB LED through three 220 Ω on GP15 / GP14 / GP13 showing red + blue."""
    bb = Breadboard(120, 300)
    o = [bb.svg(rail_labels={"T-": ("GND", "#3a3d42"), "T+": ("3V3", "#de3b3b"), "B-": ("GND", "#3a3d42")})]
    for col in (8, 10, 11):
        o.append(resistor(bb.xy(col, "e"), bb.xy(col, "f"), "220"))
    o.append(rgb_led(bb.xy(8, "h"), bb.xy(9, "h"), bb.xy(10, "h"), bb.xy(11, "h"), lit=(1, 0, .55)))
    o.append(slide_switch(bb.xy(15, "e"), bb.xy(16, "e"), bb.xy(17, "e"), position=1))
    o.append(ldr(bb.xy(21, "b"), bb.xy(23, "b")))
    o.append(resistor(bb.xy(23, "e"), bb.xy(23, "f"), "10k"))
    psvg, pins = pico(152, 200)
    o.append(psvg)
    o.append(wire([pins[20], (456, 236), (248, 236), bb.xy(8, "a")], "red"))        # GP15 → red
    o.append(wire([pins[19], (440, 252), (280, 252), bb.xy(10, "a")], "green"))     # GP14 → green
    o.append(wire([pins[17], (408, 268), (296, 268), bb.xy(11, "a")], "blue"))      # GP13 → blue
    o.append(wire([pins[21], (472, 236), (472, 282), (376, 282), bb.xy(16, "a")], "yellow"))   # GP16 → the switch's common
    o.append(wire([bb.xy(17, "a"), bb.xy(17, "T-")], "black"))
    o.append(wire([pins[31], (328, 64), (640, 64), (640, 282), (488, 282), bb.xy(23, "a")], "purple"))   # GP26 (ADC0)
    o.append(wire([pins[36], (248, 80), (104, 80), (104, 322), bb.xy(2, "T+")], "red"))   # 3V3 → the + rail
    o.append(wire([bb.xy(21, "a"), bb.xy(21, "T+")], "red"))
    o.append(wire([pins[3], bb.xy(5, "T-")], "black"))
    o.append(wire([bb.xy(9, "j"), bb.xy(9, "B-")], "black"))
    o.append(wire([bb.xy(23, "j"), bb.xy(23, "B-")], "black"))
    o.append(wire([bb.xy(1, "T-"), bb.xy(1, "B-")], "black"))
    o.append(cursor(376, 380, "hand"))
    return _svg("".join(o))


def modules() -> str:
    """Pico W running (M6.4 design): a DHT22 and a GY-521 (MPU6050) standing in row f; an HC-SR04 in row a turned to
    face away from the breadboard, its Echo through a 1 k + 2 k divider; the Pico W below, as on screen 18."""
    bb = Breadboard(120, 230)
    o = [bb.svg(rail_labels={"B-": ("GND", "#3a3d42"), "B+": ("3V3", "#de3b3b")})]
    o.append(dht(bb.xy(2, "f"), bb.xy(3, "f"), bb.xy(4, "f"), "DHT22"))
    o.append(mpu6050([bb.xy(c, "f") for c in range(7, 15)], tilt=(30, 0)))
    o.append(hcsr04_in(bb.xy(20, "a"), bb.xy(21, "a"), bb.xy(22, "a"), bb.xy(23, "a"), up=True, cm=34))
    o.append(resistor(bb.xy(22, "d"), bb.xy(25, "d"), "1k"))
    o.append(resistor(bb.xy(25, "c"), bb.xy(28, "c"), "2k"))
    psvg, pins = pico(140, 720)
    o.append(psvg)
    up = lambda n, y, to: wire([pins[n], (pins[n][0], y), (to[0], y), to], COL[n])
    COL = {36: "red", 38: "black", 26: "yellow", 32: "green", 31: "blue", 40: "orange", 29: "white", 27: "purple"}
    o.append(up(36, 590, bb.xy(1, "B+")))
    o.append(up(38, 582, bb.xy(2, "B-")))
    o.append(wire([bb.xy(2, "j"), bb.xy(2, "B+")], "red"))
    o.append(wire([bb.xy(4, "j"), bb.xy(4, "B-")], "black"))
    o.append(up(26, 540, bb.xy(3, "i")))                       # GP20 → DATA
    o.append(wire([bb.xy(7, "j"), bb.xy(7, "B+")], "red"))
    o.append(wire([bb.xy(8, "j"), bb.xy(8, "B-")], "black"))
    o.append(up(32, 566, bb.xy(9, "i")))                       # GP27 → SCL
    o.append(up(31, 558, bb.xy(10, "i")))                      # GP26 → SDA
    o.append(wire([pins[40], (pins[40][0], 600), (100, 600), (100, 220), (bb.xy(20, "e")[0] - 12, 220), (bb.xy(20, "e")[0] - 12, 352), bb.xy(20, "e")], "orange"))   # VBUS → VCC
    o.append(up(29, 548, bb.xy(21, "e")))                      # GP22 → Trig
    o.append(up(27, 574, bb.xy(25, "e")))                      # GP21 ← the divider
    o.append(wire([bb.xy(23, "e"), bb.xy(23, "B-")], "black"))
    o.append(wire([bb.xy(28, "e"), bb.xy(28, "B-")], "black"))
    return _svg("".join(o))


def greenhouse() -> str:
    """Pico W running (M6.3 design): a TMP36, a PIR on VBUS seeing motion (held), an IR line sensor over the black
    line and a capacitive soil sensor, each standing in row f, wired from the free holes below; the Pico W below the
    breadboard so its top-row pins come straight up. B+ is 3V3, B− GND."""
    bb = Breadboard(120, 150)
    o = [bb.svg(rail_labels={"B-": ("GND", "#3a3d42"), "B+": ("3V3", "#de3b3b")})]
    o.append(temp_sensor(bb.xy(2, "f"), bb.xy(3, "f"), bb.xy(4, "f")))
    o.append(pir(bb.xy(7, "f"), bb.xy(8, "f"), bb.xy(9, "f"), motion=True))
    o.append(line_sensor(bb.xy(12, "f"), bb.xy(13, "f"), bb.xy(14, "f"), over_line=True))
    o.append(soil_sensor(bb.xy(19, "f"), bb.xy(20, "f"), bb.xy(21, "f"), moisture=0.35))
    psvg, pins = pico(140, 640)
    o.append(psvg)
    # the rails: 3V3 and GND from the Pico W
    o.append(wire([pins[36], (pins[36][0], 492), (bb.xy(1, "B+")[0], 492), bb.xy(1, "B+")], "red"))
    o.append(wire([pins[38], (pins[38][0], 500), (bb.xy(2, "B-")[0], 500), bb.xy(2, "B-")], "black"))
    # TMP36: +Vs, GND from the rails, Vout to GP26
    o.append(wire([bb.xy(2, "j"), bb.xy(2, "B+")], "red"))
    o.append(wire([bb.xy(4, "j"), bb.xy(4, "B-")], "black"))
    o.append(wire([pins[31], (pins[31][0], 478), (bb.xy(3, "i")[0] - 0, 478), bb.xy(3, "i")], "yellow"))
    # PIR: VCC from VBUS (5 V), OUT to GP22, GND
    o.append(wire([pins[40], (pins[40][0], 470), (bb.xy(7, "j")[0], 470), bb.xy(7, "j")], "orange"))
    o.append(wire([pins[29], (pins[29][0], 462), (bb.xy(8, "i")[0], 462), bb.xy(8, "i")], "green"))
    o.append(wire([bb.xy(9, "j"), bb.xy(9, "B-")], "black"))
    # line sensor: OUT to GP21, GND, VCC 3V3
    o.append(wire([pins[27], (pins[27][0], 486), (bb.xy(12, "i")[0], 486), bb.xy(12, "i")], "blue"))
    o.append(wire([bb.xy(13, "j"), bb.xy(13, "B-")], "black"))
    o.append(wire([bb.xy(14, "j"), bb.xy(14, "B+")], "red"))
    # soil: AOUT to GP27, VCC 3V3, GND
    o.append(wire([pins[32], (pins[32][0], 454), (bb.xy(19, "i")[0], 454), bb.xy(19, "i")], "purple"))
    o.append(wire([bb.xy(20, "j"), bb.xy(20, "B+")], "red"))
    o.append(wire([bb.xy(21, "j"), bb.xy(21, "B-")], "black"))
    o.append(cursor(bb.xy(8, "f")[0] + 4, bb.xy(8, "f")[1] - 64, "hand"))
    return _svg("".join(o))


def gpio_battery() -> str:
    """micro:bit editing: the GPIO board's own micro-USB plugged in (its 5V pins live); a 2×AA pack on the bottom rails
    lighting an LED by itself, selected; the 4×AA and 9 V packs drawn beside, for the design."""
    bb = Breadboard(120, 448)
    o = [bb.svg(rail_labels={"T-": ("GND", "#3a3d42"), "T+": ("5V", "#de3b3b")})]
    msvg, mp = microbit(184, 340, usb=True)
    o.append(msvg)
    gx, _ = mp["GND@15"]
    o.append(wire([mp["GND@15"], (gx, 434), (136, 434), bb.xy(2, "T-")], "black"))
    o.append(wire([mp["5V"], (mp["5V"][0], 440), (152, 440), bb.xy(3, "T+")], "red"))   # the GPIO board's 5V
    o.append(resistor(bb.xy(5, "a"), bb.xy(8, "a"), "220"))
    o.append(led(bb.xy(8, "b"), bb.xy(10, "b"), "green", "on"))
    o.append(wire([bb.xy(5, "e"), bb.xy(5, "T+")], "red"))
    o.append(wire([bb.xy(10, "e"), bb.xy(10, "T-")], "black"))
    # bottom rails: a 2×AA pack lights its own LED (B+ / B−), the pack below the breadboard
    o.append(battery(bb.xy(20, "B+"), bb.xy(20, "B-"), "2xAA"))
    o.append(wire([bb.xy(21, "B+"), bb.xy(21, "j")], "red"))
    o.append(resistor(bb.xy(21, "h"), bb.xy(24, "h"), "220"))
    o.append(led(bb.xy(24, "i"), bb.xy(26, "i"), "red", "on", lean=-22))
    o.append(wire([bb.xy(26, "j"), bb.xy(26, "B-")], "black"))
    x, y = bb.xy(20, "B+")
    o.append(f'<rect x="{x - 56}" y="{y + 26}" width="112" height="70" rx="8" fill="none" stroke="#2563d9" stroke-width="1.6" stroke-dasharray="4 3"/>')
    return _svg("".join(o))


def battery_kinds() -> str:
    """The three packs, as the parts panel offers them."""
    o = []
    for i, kind in enumerate(("2xAA", "4xAA", "9V")):
        x = 70 + i * 130
        o.append(battery((x - 0, 40), (x, 24), kind))
    return _svg("".join(o), 190, 82, "0 -122 400 172")


# ------------------------------------------------------------------ small pictures
def board_art(kind: str) -> str:
    if kind == "pico":
        s, _ = pico(40, 150)
        return _svg(s, 270, 135, "-10 10 380 190")
    if kind == "esp32":
        s, _ = esp32(60, 180)
        return _svg(s, 270, 135, "0 8 380 190")
    s, _ = microbit(80, 330, image=HEART)
    return _svg(s, 270, 135, "8 0 376 420")


def bootsel() -> str:
    """The connection helper (screen 14): the Pico W, its BOOTSEL button ringed, the USB plug coming in."""
    svg, _ = pico(60, 150)
    yt = 150 - 7 * P
    cy = (yt + 150) / 2
    bx, by = 60 + 2 * P + 6, cy - 10
    ring = (f'<circle cx="{bx}" cy="{f(by)}" r="13" fill="none" stroke="#2563d9" stroke-width="2.4"/>'
            f'<circle cx="{bx}" cy="{f(by)}" r="19" fill="none" stroke="#2563d9" stroke-width="1.2" opacity=".45"/>'
            f'<path d="M{bx + 14},{f(by - 14)} L{bx + 52},{f(by - 52)}" stroke="#2563d9" stroke-width="1.4"/>'
            f'<rect x="{bx + 50}" y="{f(by - 70)}" width="112" height="22" rx="6" fill="#2563d9"/>'
            f'<text x="{bx + 106}" y="{f(by - 55)}" font-size="11" font-weight="700" fill="#fff" text-anchor="middle" font-family="Inter">1 · hold BOOTSEL</text>')
    plug = (f'<rect x="{60 - 16 - 14 - 46}" y="{f(cy - 9)}" width="40" height="18" rx="3" fill="#3a3d42"/>'
            f'<path d="M{60 - 16 - 14 - 46},{f(cy)} H{60 - 16 - 14 - 96}" stroke="#3a3d42" stroke-width="6" stroke-linecap="round"/>'
            f'<rect x="{60 - 104}" y="{f(cy + 18)}" width="104" height="22" rx="6" fill="#2563d9"/>'
            f'<text x="{60 - 52}" y="{f(cy + 33)}" font-size="11" font-weight="700" fill="#fff" text-anchor="middle" font-family="Inter">2 · plug it in</text>')
    return _svg(svg + ring + plug, 420, 160, "-60 0 480 182")


def servo_hero() -> str:
    o = []
    cx, cy = 150, 150
    for a, lab in ((0, "0°"), (90, "90°"), (180, "180°")):
        r = math.radians(a - 180)
        x, y = cx + 128 * math.cos(r), cy + 128 * math.sin(r)
        o.append(f'<line x1="{cx}" y1="{cy}" x2="{x:.1f}" y2="{y:.1f}" stroke="#c9d0d8" stroke-width="1.2" stroke-dasharray="3 4"/>'
                 f'<text x="{cx + 146 * math.cos(r):.1f}" y="{cy + 146 * math.sin(r) + 4:.1f}" font-size="12" font-weight="600" fill="#7c8594" text-anchor="middle">{lab}</text>')
    o.append(f'<path d="M{cx - 112},{cy} A112 112 0 0 1 {cx + 112},{cy}" stroke="#e1e5ea" stroke-width="1.5" fill="none"/>')
    o.append(f'<path d="M{cx - 112},{cy} A112 112 0 0 1 {cx + 112 * math.cos(math.radians(-135)):.1f},{cy + 112 * math.sin(math.radians(-135)):.1f}" stroke="#2563d9" stroke-width="3" fill="none" stroke-linecap="round"/>')
    o.append(servo(cx, cy, angle=45, s=2.2))
    return _svg("".join(o), 220, 128, "-24 0 404 236")


def servo_wiring() -> str:
    """Servo on a Pico W: brown → GND (pin 38), red → VBUS (pin 40, 5 V), orange → GP15 (pin 20)."""
    s, pins = pico(40, 150)
    o = [s, servo(300, -60, angle=90, s=.9, rot=180, label=False)]
    o.append('<text x="262" y="-56" font-size="11" font-weight="700" fill="#e8f1fc" text-anchor="middle">SG90</text>')
    o.append(wire([(194, -71), (40, -71), pins[40]], "red"))
    o.append(wire([(194, -65), (72, -65), pins[38]], "brown"))
    o.append(wire([(194, -76), (180, -76), (180, -110), (404, -110), (404, 178), (344, 178), pins[20]], "orange"))
    for x, y, t in ((36, 24, "VBUS"), (80, 24, "GND"), (344, 196, "GP15")):
        o.append(f'<text x="{x}" y="{y}" font-size="11" font-weight="700" fill="#4b5563" text-anchor="middle">{t}</text>')
    return _svg("".join(o), 270, 198, "-30 -122 450 330")


def servo_pulses() -> str:
    """How a servo is told its angle: one pulse every 20 ms; its width is the angle."""
    o = []
    rows = [(0.5, 0, "0.5 ms"), (1.5, 90, "1.5 ms"), (2.5, 180, "2.5 ms")]
    x0, scale = 70, 7.2  # px per ms; 40 ms shown
    for i, (wms, ang, lab) in enumerate(rows):
        y = 18 + i * 52
        base, top = y + 32, y + 8
        d = f"M{x0},{base}"
        for k in range(2):
            px = x0 + k * 20 * scale
            d += f" H{px:.1f} V{top} H{px + wms * scale:.1f} V{base}"
        d += f" H{x0 + 40 * scale:.1f}"
        o.append(f'<line x1="{x0}" y1="{base}" x2="{x0 + 40 * scale}" y2="{base}" stroke="#e1e5ea"/>')
        o.append(f'<path d="{d}" stroke="#7c5cd6" stroke-width="2" fill="none" stroke-linejoin="round"/>')
        o.append(f'<text x="0" y="{top + 16}" font-size="12" font-weight="650" fill="#151a21">{lab}</text>')
        hx, hy = x0 + 40 * scale + 46, y + 24
        r = math.radians(ang - 180)
        o.append(f'<circle cx="{hx}" cy="{hy}" r="16" fill="#eef1f4"/><line x1="{hx}" y1="{hy}" x2="{hx + 14 * math.cos(r):.1f}" y2="{hy + 14 * math.sin(r):.1f}" stroke="#151a21" stroke-width="3" stroke-linecap="round"/>'
                 f'<circle cx="{hx}" cy="{hy}" r="3" fill="#151a21"/><text x="{hx + 26}" y="{hy + 4}" font-size="12" font-weight="650" fill="#151a21">{ang}°</text>')
    y = 18 + 3 * 52 - 6
    o.append(f'<path d="M{x0},{y} V{y + 6} H{x0 + 20 * scale} V{y}" stroke="#7c8594" fill="none"/>'
             f'<text x="{x0 + 10 * scale}" y="{y + 18}" font-size="11" fill="#7c8594" text-anchor="middle">20 ms — 50 pulses a second</text>')
    return _svg("".join(o), 520, 190, "0 0 520 190")


def plot() -> str:
    """Plotter (F-26): the numbers printed by the distance meter, one series, newest on the right."""
    import random
    rnd = random.Random(7)
    vals = []
    for i in range(80):
        t = i / 79
        v = 82 - 48 * (1 / (1 + math.exp(-(t - .55) * 12))) + rnd.uniform(-1.2, 1.2)
        vals.append(v)
    vals[-1] = 34.0
    w, h, l, r, t, b = 476, 196, 34, 10, 10, 22
    sx = lambda i: l + i / 79 * (w - l - r)
    sy = lambda v: t + (1 - v / 100) * (h - t - b)
    o = []
    for v in (0, 25, 50, 75, 100):
        o.append(f'<line x1="{l}" y1="{sy(v):.1f}" x2="{w - r}" y2="{sy(v):.1f}" stroke="#eef1f4"/>'
                 f'<text x="{l - 6}" y="{sy(v) + 3.5:.1f}" font-size="10" fill="#7c8594" text-anchor="end">{v}</text>')
    for i, lab in ((0, "−16 s"), (40, "−8 s"), (79, "now")):
        o.append(f'<text x="{sx(i):.1f}" y="{h - 6}" font-size="10" fill="#7c8594" text-anchor="{"start" if i == 0 else "end" if i == 79 else "middle"}">{lab}</text>')
    pts = " ".join(f"{sx(i):.1f},{sy(v):.1f}" for i, v in enumerate(vals))
    o.append(f'<polyline points="{pts}" fill="none" stroke="#2563d9" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>')
    hi = 52
    hx, hy = sx(hi), sy(vals[hi])
    o.append(f'<line x1="{hx:.1f}" y1="{t}" x2="{hx:.1f}" y2="{h - b}" stroke="#7c8594" stroke-dasharray="3 3"/>'
             f'<circle cx="{hx:.1f}" cy="{hy:.1f}" r="4.5" fill="#2563d9" stroke="#fff" stroke-width="2"/>'
             f'<g transform="translate({hx + 8:.1f},{hy - 34:.1f})"><rect width="86" height="30" rx="5" fill="#1f2937"/>'
             f'<text x="8" y="13" font-size="10" fill="#c3cad4">−5.6 s</text><text x="8" y="25" font-size="11" font-weight="700" fill="#fff">{vals[hi]:.1f} cm</text></g>')
    return f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}" font-family="Inter">{"".join(o)}</svg>'


def led_states() -> str:
    """Design system: an LED off, on and burnt out."""
    o = []
    for i, (st, lab) in enumerate((("off", "Off"), ("on", "On · 5.9 mA"), ("burnt", "Burnt out"))):
        x = 40 + i * 92
        o.append(led((x - 8, 20), (x + 8, 20), "red", st))
        o.append(f'<text x="{x}" y="86" font-size="11" fill="#4b5563" text-anchor="middle">{lab}</text>')
    return _svg("".join(o), 280, 96, "0 -10 280 106")


SCENES = {"modules": modules, "greenhouse": greenhouse, "moodlamp": mood_lamp, "gpiobattery": gpio_battery, "batterykinds": battery_kinds, "bootsel": bootsel, "ledstates": led_states, "traffic": traffic, "distance": distance, "heart": heart, "board": board_art, "servohero": servo_hero,
          "servowiring": servo_wiring, "servopulses": servo_pulses, "plot": plot}


def scene(name: str, *args: str) -> str:
    return SCENES[name](*args)
