"""Learn's pictures (M8 design, requirements Rev 9): how a part works inside, drawn for students of 10–13 — the
pictures they play with on a part page, and the ideas pages' pictures. Same drawing style as scenes.py."""
import math

from scenes import _svg
from svgparts import P, f, Breadboard, battery, led, pico, pot, resistor, wire

INK, MUTED, ACCENT, LINE = "#1f2937", "#6b7280", "#2563d9", "#d6dbe1"


def label(x, y, text, anchor="start", size=11, weight=600, fill=INK) -> str:
    return f'<text x="{f(x)}" y="{f(y)}" font-size="{size}" font-weight="{weight}" fill="{fill}" text-anchor="{anchor}" font-family="Inter">{text}</text>'


def callout(x1, y1, x2, y2, text, anchor="start", sub="") -> str:
    """A thin line from the thing to its name; the name, and under it a quieter line."""
    o = [f'<circle cx="{f(x1)}" cy="{f(y1)}" r="2.6" fill="{ACCENT}"/>',
         f'<path d="M{f(x1)},{f(y1)} L{f(x2)},{f(y2)}" stroke="{ACCENT}" stroke-width="1.1"/>']
    dx = 5 if anchor == "start" else -5
    o.append(label(x2 + dx, y2 + 4, text, anchor, 14, 700))
    if sub:
        o.append(label(x2 + dx, y2 + 21, sub, anchor, 12.5, 500, MUTED))
    return "".join(o)


def led_inside(state: str = "on") -> str:
    """A 5 mm LED drawn big and see-through: on the left the thin anode post, its gold wire across to the chip; on the
    right the cathode's big piece with the cup the chip sits in; the long + leg and the short − leg; the flat edge on
    the − side. Lit, the chip glows and the current's way round is drawn beside the legs."""
    o = []
    cx, top, base = 200, 40, 214
    glow = state == "on"
    tint = "#ff8a7a" if glow else "#f6c9c3"
    if glow:
        o.append(f'<circle cx="{cx + 14}" cy="100" r="92" fill="url(#glow-red)" opacity=".7"/>')
    o.append(f'<path d="M{cx - 66},{base} V{top + 66} A66 66 0 0 1 {cx + 66},{top + 66} V{base} Z" fill="{tint}" fill-opacity=".38" stroke="#e0685a" stroke-width="2"/>')
    o.append(f'<rect x="{cx - 76}" y="{base}" width="152" height="12" rx="3" fill="{tint}" fill-opacity=".5" stroke="#e0685a" stroke-width="2"/>')
    o.append(f'<path d="M{cx + 76},{base - 2} V{base + 14}" stroke="#b44a3e" stroke-width="6"/>')
    ax, kx = cx - 34, cx + 22                    # the anode's leg (left), the cathode's (right)
    # anode post: a thin stem with a small flag at its top
    o.append(f'<path d="M{ax - 5},{base + 12} V{128} H{ax + 10} V{138} H{ax + 5} V{base + 12} Z" fill="#c7ccd2" stroke="#8f969f"/>')
    # cathode: a wide stem with the reflector cup on top
    o.append(f'<path d="M{kx - 8},{base + 12} V{124} H{kx - 26} L{kx - 20},{100} H{kx + 26} L{kx + 32},{124} H{kx + 8} V{base + 12} Z" fill="#c7ccd2" stroke="#8f969f"/>')
    o.append(f'<path d="M{kx - 20},{100} L{kx - 12},{116} H{kx + 18} L{kx + 26},{100}" fill="#aeb4bb" stroke="#8f969f"/>')
    chip = "#fff3b0" if glow else "#7a2f28"
    o.append(f'<rect x="{kx - 6}" y="{104}" width="12" height="9" rx="1" fill="{chip}" stroke="#5a1f1a"/>')
    o.append(f'<path d="M{ax + 6},{128} C{ax + 10},{70} {kx - 10},{72} {kx},{104}" stroke="#d4a017" stroke-width="1.6" fill="none"/>')
    if glow:
        for a in range(-160, -10, 25):
            r = math.radians(a)
            o.append(f'<path d="M{f(kx + 16 * math.cos(r))},{f(106 + 16 * math.sin(r))} L{f(kx + 34 * math.cos(r))},{f(106 + 34 * math.sin(r))}" stroke="#ffd166" stroke-width="2.4" stroke-linecap="round"/>')
    # legs: the anode's long, the cathode's short
    o.append(f'<path d="M{ax},{base + 12} V{base + 136}" stroke="#a5abb2" stroke-width="4"/>')
    o.append(f'<path d="M{kx},{base + 12} V{base + 86}" stroke="#a5abb2" stroke-width="4"/>')
    o.append(label(ax, base + 156, "+", "middle", 18, 800, "#d94545") + label(kx, base + 106, "−", "middle", 18, 800, INK))
    if glow:   # in at +, up the post, over the wire, through the chip, down the cup, out at −
        path = f'M{ax - 16},{base + 126} V{124} C{ax - 12},{52} {kx + 4},{56} {kx + 44},{108} V{base + 80}'
        o.append(f'<path d="{path}" stroke="{ACCENT}" stroke-width="2.4" fill="none" stroke-dasharray="7 6" marker-end="url(#arr)"/>')
    o.append(callout(kx + 6, 108, cx + 124, 62, "The chip", sub="the light is made here"))
    o.append(callout(cx - 4, 78, cx + 124, 104, "Gold wire", sub="thinner than a hair"))
    o.append(callout(kx + 28, 120, cx + 124, 146, "The cup (−)", sub="holds the chip"))
    o.append(callout(cx + 76, base + 6, cx + 124, 196, "Flat edge", sub="on the − side"))
    o.append(callout(ax, base + 110, cx - 120, base + 110, "Long leg: anode (+)", "end", "to the + side"))
    o.append(callout(kx, base + 70, cx - 120, base + 70, "Short leg: cathode (−)", "end", "to the − side, GND"))
    arr = (f'<defs><marker id="arr" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="7" markerHeight="7" orient="auto">'
           f'<path d="M0,0 L10,5 L0,10 Z" fill="{ACCENT}"/></marker></defs>')
    return _svg(arr + "".join(o), 520, 400, "-90 0 560 400")


def led_states_row() -> str:
    """The same LED at three currents, under the slider: too little, just right, too much."""
    o = []
    for i, (state, lab, sub) in enumerate((("off", "0 mA", "dark"), ("on", "15 mA", "bright — just right"), ("burnt", "48 mA", "burnt out"))):
        x = 50 + i * 130
        o.append(led((x - 8, 10), (x + 8, 10), "red", state))
        o.append(label(x, 70, lab, "middle", 11.5, 700) + label(x, 84, sub, "middle", 10.5, 500, MUTED))
    return _svg("".join(o), 390, 92, "0 -20 390 112")


def led_connect() -> str:
    """How to connect an LED, with no board: a 4×AA pack on the top rails; + rail → a5, the 220 Ω from b5 to b9, the
    LED's long leg in c9 and its short leg in c11; a11 → − rail."""
    bb = Breadboard(40, -150, cols=17)
    o = [bb.svg()]
    o.append(battery(bb.xy(2, "T+"), bb.xy(2, "T-"), "4xAA"))
    o.append(wire([bb.xy(5, "T+"), bb.xy(5, "a")], "red"))
    o.append(resistor(bb.xy(5, "b"), bb.xy(9, "b"), "220"))
    o.append(led(bb.xy(9, "c"), bb.xy(11, "c"), "red", "on"))
    o.append(wire([bb.xy(11, "a"), bb.xy(11, "T-")], "black"))
    o.append(label(bb.xy(7, "b")[0], bb.xy(7, "b")[1] + 22, "220 Ω", "middle", 10.5, 700))
    o.append(label(bb.xy(13, "d")[0] + 8, bb.xy(10, "d")[1] + 4, "LED", "start", 10.5, 700))
    return _svg("".join(o), 470, 300, "-40 -300 380 330")


def pot_inside(at: float = 0.25) -> str:
    """A potentiometer with its cover off: the carbon track in a horseshoe from leg 1 to leg 3, the wiper on the knob's
    shaft touching it at `at` (0–1 from leg 1), leg 2 from the wiper. Beside it, the track pulled straight: 3.3 V
    across it, the wiper's voltage where it touches."""
    o = []
    cx, cy, r = 150, 140, 86
    a0, a1 = 135 + 15, 405 - 15          # 300° of turn, from leg 1 (bottom left) to leg 3 (bottom right)
    pt = lambda deg, rr=r: (cx + rr * math.cos(math.radians(deg)), cy + rr * math.sin(math.radians(deg)))
    o.append(f'<circle cx="{cx}" cy="{cy}" r="{r + 26}" fill="#2b5fa8" stroke="#1b3f73" stroke-width="2"/>')
    x0, y0 = pt(a0)
    x1, y1 = pt(a1)
    o.append(f'<path d="M{f(x0)},{f(y0)} A{r} {r} 0 1 1 {f(x1)},{f(y1)}" stroke="#2d2a26" stroke-width="18" fill="none" stroke-linecap="round"/>')
    o.append(f'<path d="M{f(x0)},{f(y0)} A{r} {r} 0 1 1 {f(x1)},{f(y1)}" stroke="#4a443d" stroke-width="12" fill="none" stroke-linecap="round" stroke-dasharray="2 3"/>')
    wa = a0 + (a1 - a0) * at
    wx, wy = pt(wa)
    o.append(f'<circle cx="{cx}" cy="{cy}" r="30" fill="#e9ebee" stroke="#9ba2aa" stroke-width="2"/>')
    o.append(f'<path d="M{cx},{cy} L{f(wx)},{f(wy)}" stroke="#c9a227" stroke-width="7" stroke-linecap="round"/>')
    o.append(f'<circle cx="{f(wx)}" cy="{f(wy)}" r="7" fill="#e3c25a" stroke="#8a6d12" stroke-width="1.5"/>')
    o.append(f'<circle cx="{cx}" cy="{cy}" r="6" fill="#8a6d12"/>')
    # the three legs out of the bottom
    for i, (lx, n) in enumerate(((cx - 40, "1"), (cx, "2"), (cx + 40, "3"))):
        o.append(f'<path d="M{lx},{cy + r + 22} V{cy + r + 70}" stroke="#a5abb2" stroke-width="5"/>')
        o.append(label(lx, cy + r + 88, n, "middle", 13, 800))
    o.append(f'<path d="M{f(x0)},{f(y0)} Q{cx - 60},{cy + r + 10} {cx - 40},{cy + r + 22}" stroke="#a5abb2" stroke-width="3" fill="none"/>')
    o.append(f'<path d="M{f(x1)},{f(y1)} Q{cx + 60},{cy + r + 10} {cx + 40},{cy + r + 22}" stroke="#a5abb2" stroke-width="3" fill="none"/>')
    o.append(f'<path d="M{cx},{cy} V{cy + r + 22}" stroke="#c9a227" stroke-width="3" stroke-dasharray="4 3"/>')
    o.append(callout(*pt(175, r + 4), 18, 30, "The track", "end", "carbon: it holds back"))
    o.append(callout(wx, wy, 300, 30, "The wiper", "start", "slides along it as you turn"))
    # the track pulled straight, with its volts
    sx, sy, sw = 330, 168, 250
    o.append(label(sx, sy - 76, "The track, pulled straight", "start", 14, 700))
    o.append(f'<rect x="{sx}" y="{sy - 9}" width="{sw}" height="18" rx="9" fill="#4a443d"/>')
    o.append(f'<rect x="{sx}" y="{sy - 9}" width="{f(sw * at)}" height="18" rx="9" fill="{ACCENT}" opacity=".85"/>')
    wxp = sx + sw * at
    o.append(f'<path d="M{f(wxp)},{sy - 26} V{sy - 8}" stroke="#8a6d12" stroke-width="3"/><path d="M{f(wxp - 7)},{sy - 30} h14 l-7,9 Z" fill="#e3c25a" stroke="#8a6d12"/>')
    o.append(label(sx, sy + 34, "leg 1 · 0 V", "start", 13, 600, MUTED) + label(sx + sw, sy + 34, "leg 3 · 3.3 V", "end", 13, 600, MUTED))
    o.append(label(wxp, sy - 36, f"leg 2: {round(3.3 * at + 1e-9, 2):.2f} V", "middle", 15, 800, ACCENT))
    o.append(label(sx, sy + 70, f"1 ↔ 2: {10 * at:.1f} kΩ", "start", 14, 700) + label(sx + sw, sy + 70, f"2 ↔ 3: {10 * (1 - at):.1f} kΩ", "end", 14, 700))
    return _svg("".join(o), 640, 330, "-140 0 740 330")


def water() -> str:
    """Voltage, current and resistance as water: a pump pushes water round a loop of pipe; a narrow part holds it back;
    the flow is the same all the way round. Under it, the same loop as a circuit."""
    o = []
    # the loop of pipe
    o.append(f'<rect x="40" y="30" width="420" height="150" rx="40" fill="none" stroke="#9cc3ef" stroke-width="22"/>')
    o.append(f'<rect x="40" y="30" width="420" height="150" rx="40" fill="none" stroke="#5c9ce6" stroke-width="14"/>')
    # the narrow part (resistance), top middle
    o.append(f'<rect x="210" y="19" width="80" height="22" fill="#fff"/>'
             f'<path d="M200,23 L230,33 H270 L300,23 M200,37 L230,29 H270 L300,37" stroke="#9cc3ef" stroke-width="3" fill="none"/>'
             f'<rect x="230" y="29" width="40" height="4" fill="#5c9ce6"/>')
    # the pump (voltage), left
    o.append(f'<circle cx="40" cy="105" r="30" fill="#fff" stroke="#3a3d42" stroke-width="3"/>'
             f'<path d="M30,92 L56,105 L30,118 Z" fill="#3a3d42"/>')
    # flow arrows (current)
    for x, y, rot in ((140, 180, 180), (360, 180, 180), (460, 105, 270), (120, 30, 0), (380, 30, 0)):
        o.append(f'<path d="M-7,-6 L7,0 L-7,6 Z" fill="#fff" transform="translate({x},{y}) rotate({rot})"/>')
    o.append(callout(40, 75, 40, -10, "The pump: voltage", "start", "how hard it pushes · volts, V"))
    o.append(callout(250, 18, 330, -10, "The narrow pipe: resistance", "start", "how much it holds back · ohms, Ω"))
    o.append(callout(250, 190, 250, 222, "The flow: current", "middle", "how much goes round · amps, A"))
    # the same as a circuit
    cy = 300
    o.append(label(250, cy - 30, "The same loop as a circuit", "middle", 11.5, 700))
    o.append(f'<path d="M80,{cy} H210 M290,{cy} H420 V{cy + 50} H80 V{cy}" stroke="#3a3d42" stroke-width="2.5" fill="none"/>')
    o.append(f'<rect x="210" y="{cy - 9}" width="80" height="18" rx="3" fill="#e3cb98" stroke="#bfa26e"/>' + label(250, cy + 4, "resistor", "middle", 10, 700))
    o.append(f'<rect x="64" y="{cy + 8}" width="32" height="34" rx="3" fill="#fff" stroke="#3a3d42" stroke-width="2"/>'
             + label(80, cy + 23, "+", "middle", 12, 800, "#d94545") + label(80, cy + 38, "−", "middle", 12, 800))
    o.append(label(108, cy + 30, "battery", "start", 10, 700, MUTED))
    return _svg("".join(o), 560, 360, "-20 -30 580 390")


def breadboard_inside() -> str:
    """The breadboard's holes, and the metal strips under them that join each column of five and each rail."""
    bb = Breadboard(30, -150, cols=12)
    o = [bb.svg()]
    for col in range(1, 13):
        for rows in (("a", "e"), ("f", "j")):
            x, y1 = bb.xy(col, rows[0])
            _, y2 = bb.xy(col, rows[1])
            o.append(f'<rect x="{f(x - 4)}" y="{f(y1 - 6)}" width="8" height="{f(y2 - y1 + 12)}" rx="3" fill="#c9a227" opacity=".55"/>')
    for row in ("T-", "T+", "B+", "B-"):
        y = bb.xy(1, row)[1]
        o.append(f'<rect x="{f(bb.xy(1, row)[0] - 6)}" y="{f(y - 4)}" width="{f(11 * P + 12)}" height="8" rx="3" fill="#c9a227" opacity=".55"/>')
    return _svg("".join(o), 250, 170, "-10 -170 230 330")


def pico_parts() -> str:
    """The Pico W as a component: what is on it, named for 10–13."""
    s, _ = pico(60, 150)
    yt = 150 - 7 * P
    cy = (yt + 150) / 2
    o = [s]
    o.append(callout(60 + 9 * P, cy - 17, 60 + 9 * P, -40, "RP2040: the brain", "middle", "runs your program"))
    o.append(callout(60 + 13 * P + 22, cy - 19, 60 + 17 * P, -40, "Wi-Fi chip", "start", "under the metal lid"))
    o.append(callout(60 - 16 - 3, cy, -10, cy + 70, "USB socket", "end", "power and programs in"))
    o.append(callout(60 + 2 * P + 6, cy - 10, 60 + 2 * P, -40, "BOOTSEL button", "end", "for new firmware"))
    o.append(callout(60 + 5 * P + 9, cy, 60 + 5 * P, 230, "Flash memory", "middle", "keeps your files"))
    o.append(callout(60 + 19 * P, 150 + 8, 60 + 17 * P, 230, "40 pins", "start", "20 on each side"))
    return _svg("".join(o), 540, 300, "-140 -70 560 330")


FIGS = {"ledinside": led_inside, "ledstatesrow": led_states_row, "ledconnect": led_connect, "potinside": pot_inside,
        "water": water, "bbinside": breadboard_inside, "picoparts": pico_parts}


def fig(name: str, *args: str) -> str:
    return FIGS[name](*args)
