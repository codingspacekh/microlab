"""SVG drawings for the MicroLab prototype: the breadboard, the three boards and the parts.

One breadboard pitch (0.1 in) = 16 px at 100 % zoom. Every part is drawn from the holes or
pins it plugs into, so parts and wires always land on real holes — the same rule the app's
workspace will follow (F-12, F-13).
"""
import math

P = 16


def f(v: float) -> str:
    return f"{v:.1f}".rstrip("0").rstrip(".")


def defs() -> str:
    glows = {"red": "#ff4b3a", "amber": "#ffb000", "green": "#3ddc6a", "mbit": "#ff3a22",
             "blue": "#4d8dff", "white": "#fff6d8"}
    g = "".join(
        f'<radialGradient id="glow-{k}"><stop offset="0" stop-color="{c}" stop-opacity=".8"/>'
        f'<stop offset=".45" stop-color="{c}" stop-opacity=".35"/><stop offset="1" stop-color="{c}" stop-opacity="0"/></radialGradient>'
        for k, c in glows.items())
    return (f'<defs>{g}'
            '<filter id="lift" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity=".28"/></filter>'
            '<pattern id="mesh" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".9" fill="#7d848c"/></pattern>'
            '</defs>')


# ------------------------------------------------------------------ breadboard
ROWS = {"T-": 18, "T+": 34, "B+": 264, "B-": 280}
for _i, _r in enumerate("abcde"):
    ROWS[_r] = 62 + _i * P
for _i, _r in enumerate("fghij"):
    ROWS[_r] = 174 + _i * P
RAILS = ("T-", "T+", "B+", "B-")


def rail_hole(col: int) -> bool:
    """Power rails have holes in groups of five with a gap, like a real breadboard."""
    return (col - 1) % 6 != 5


class Breadboard:
    def __init__(self, bx: int = 120, by: int = 300, cols: int = 30):
        self.bx, self.by, self.cols = bx, by, cols

    def xy(self, col: int, row: str):
        if row in RAILS and not rail_hole(col):
            raise ValueError(f"no rail hole at column {col}")
        return (self.bx + (col - 1) * P, self.by + ROWS[row])

    def svg(self, strip=None, rail_labels=None) -> str:
        bx, by, cols = self.bx, self.by, self.cols
        x0, w = bx - 24, (cols - 1) * P + 48
        o = [f'<g class="bb"><rect x="{x0}" y="{by}" width="{w}" height="298" rx="7" fill="#f6f4ef" stroke="#d6d0c2" filter="url(#lift)"/>']
        for y, c in ((by + 7, "#3b6fd8"), (by + 45, "#d94545"), (by + 253, "#d94545"), (by + 291, "#3b6fd8")):
            o.append(f'<line x1="{x0 + 14}" y1="{y}" x2="{x0 + w - 14}" y2="{y}" stroke="{c}" stroke-width="1.6" opacity=".75"/>')
        o.append(f'<rect x="{x0 + 8}" y="{by + 142}" width="{w - 16}" height="16" rx="2" fill="#ebe7dd"/>')
        for y, s, c in ((by + 21, "−", "#3b6fd8"), (by + 37, "+", "#d94545"), (by + 267, "+", "#d94545"), (by + 283, "−", "#3b6fd8")):
            o.append(f'<text x="{x0 + 9}" y="{y}" font-size="10" font-weight="700" fill="{c}" text-anchor="middle">{s}</text>')
            o.append(f'<text x="{x0 + w - 9}" y="{y}" font-size="10" font-weight="700" fill="{c}" text-anchor="middle">{s}</text>')
        for c in (1, 5, 10, 15, 20, 25, 30):
            if c <= cols:
                o.append(f'<text x="{bx + (c - 1) * P}" y="{by + 54}" font-size="7.5" fill="#a39c8c" text-anchor="middle" font-family="JetBrains Mono">{c}</text>')
        for r in "abcdefghij":
            y = by + ROWS[r] + 2.6
            o.append(f'<text x="{bx - 14}" y="{y}" font-size="7.5" fill="#a39c8c" text-anchor="middle" font-family="JetBrains Mono">{r}</text>')
            o.append(f'<text x="{bx + (cols - 1) * P + 14}" y="{y}" font-size="7.5" fill="#a39c8c" text-anchor="middle" font-family="JetBrains Mono">{r}</text>')
        if strip:  # hovering a hole: everything joined to it lights up (F-12)
            col, half = strip
            rows = "abcde" if half == "top" else "fghij"
            x, y1 = self.xy(col, rows[0])
            _, y2 = self.xy(col, rows[-1])
            o.append(f'<rect x="{x - 7}" y="{y1 - 7}" width="14" height="{y2 - y1 + 14}" rx="7" fill="#2fb56a" opacity=".16" stroke="#2fb56a" stroke-width="1.2"/>')
        holes = []
        for c in range(1, cols + 1):
            for r in "abcdefghij":
                holes.append(self.xy(c, r))
            if rail_hole(c):
                for r in RAILS:
                    holes.append(self.xy(c, r))
        o.append("".join(f'<rect x="{f(x - 2.7)}" y="{f(y - 2.7)}" width="5.4" height="5.4" rx="1.2" fill="#4a463e"/>' for x, y in holes))
        if strip:
            col, half = strip
            for r in ("abcde" if half == "top" else "fghij"):
                x, y = self.xy(col, r)
                o.append(f'<circle cx="{x}" cy="{y}" r="4.6" fill="none" stroke="#1f9d55" stroke-width="1.6"/>')
        for row, (txt, c) in (rail_labels or {}).items():
            y = by + ROWS[row]
            o.append(f'<g transform="translate({x0 + w + 6},{y - 8})"><rect width="{len(txt) * 6 + 12}" height="16" rx="4" fill="{c}"/>'
                     f'<text x="6" y="11.5" font-size="9.5" font-weight="700" fill="#fff" font-family="Inter">{txt}</text></g>')
        o.append("</g>")
        return "".join(o)


# ------------------------------------------------------------------ wires
WIRE = {"red": ("#de3b3b", "#9e2626"), "black": ("#3a3d42", "#15171a"), "yellow": ("#efbd16", "#a68300"),
        "green": ("#2fa253", "#1c6b34"), "blue": ("#2f6fd6", "#1f4c96"), "orange": ("#f08024", "#ad560f"),
        "purple": ("#9160d6", "#5f3a95"), "white": ("#f4f5f7", "#9aa1ab"), "brown": ("#8b5a3a", "#5a3a25")}


def rpath(pts, r: float = 7) -> str:
    d = f"M{f(pts[0][0])},{f(pts[0][1])}"
    for i in range(1, len(pts) - 1):
        (x0, y0), (x1, y1), (x2, y2) = pts[i - 1], pts[i], pts[i + 1]
        l1, l2 = math.hypot(x1 - x0, y1 - y0), math.hypot(x2 - x1, y2 - y1)
        if not l1 or not l2:
            continue
        rr = min(r, l1 / 2, l2 / 2)
        ax, ay = x1 - (x1 - x0) / l1 * rr, y1 - (y1 - y0) / l1 * rr
        bx, by = x1 + (x2 - x1) / l2 * rr, y1 + (y2 - y1) / l2 * rr
        d += f" L{f(ax)},{f(ay)} Q{f(x1)},{f(y1)} {f(bx)},{f(by)}"
    return d + f" L{f(pts[-1][0])},{f(pts[-1][1])}"


def wire(pts, color: str, drawing: bool = False) -> str:
    c, d = WIRE[color]
    path = rpath(pts)
    dash = ' stroke-dasharray="7 5"' if drawing else ""
    o = (f'<g class="wire"><path d="{path}" fill="none" stroke="{d}" stroke-width="5.4" stroke-linecap="round" stroke-linejoin="round"{dash}/>'
         f'<path d="{path}" fill="none" stroke="{c}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"{dash}/>')
    ends = [pts[0]] if drawing else [pts[0], pts[-1]]
    for x, y in ends:
        o += f'<circle cx="{x}" cy="{y}" r="3.6" fill="{d}"/><circle cx="{x}" cy="{y}" r="1.6" fill="{c}"/>'
    return o + "</g>"


# ------------------------------------------------------------------ small parts
LED_COL = {"red": ("#ef3b2c", "#f2b0aa", "red"), "amber": ("#ffaa00", "#f6d79a", "amber"),
           "green": ("#22b14c", "#a9dcb7", "green"), "blue": ("#2f6fe0", "#b3c8f2", "blue")}


def led(a, k, color: str, state: str = "off", lean: int = 22) -> str:
    """5 mm LED: anode leg in hole a, cathode leg in hole k, body leaning `lean` px away (down if > 0)."""
    on_c, off_c, glow = LED_COL[color]
    cx, cy = (a[0] + k[0]) / 2, a[1] + lean
    o = ['<g class="led">']
    o.append(f'<path d="M{a[0]},{a[1]} L{f(cx - 4)},{f(cy - 7)}" stroke="#a5abb2" stroke-width="1.7" fill="none"/>'
             f'<path d="M{k[0]},{k[1]} L{f(cx + 4)},{f(cy - 7)}" stroke="#a5abb2" stroke-width="1.7" fill="none"/>')
    if state == "on":
        o.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="34" fill="url(#glow-{glow})"/>')
    fill = {"on": on_c, "off": off_c, "burnt": "#4b3b35"}[state]
    o.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="10.5" fill="{fill}" stroke="rgba(0,0,0,.18)"/>')
    o.append(f'<path d="M{f(cx + 7.4)},{f(cy - 7.4)} A10.5 10.5 0 0 1 {f(cx + 7.4)},{f(cy + 7.4)}" stroke="rgba(0,0,0,.22)" stroke-width="2.2" fill="none"/>')
    if state == "burnt":
        o.append(f'<path d="M{f(cx - 5)},{f(cy - 6)} l3,4 -2,3 4,4" stroke="#1d1512" stroke-width="1.4" fill="none"/>')
        for dx, dy, r, op in ((-6, -22, 6, .5), (2, -32, 8, .38), (-3, -45, 10, .25)):
            o.append(f'<circle cx="{f(cx + dx)}" cy="{f(cy + dy)}" r="{r}" fill="#8c8f94" opacity="{op}"/>')
    else:
        o.append(f'<ellipse cx="{f(cx - 3.5)}" cy="{f(cy - 4)}" rx="3.2" ry="2.4" fill="#fff" opacity="{.85 if state == "on" else .55}"/>')
    return "".join(o) + "</g>"


BANDS = {"220": ["#d32f2f", "#d32f2f", "#6d4c41", "#c9a227"], "1k": ["#6d4c41", "#222", "#d32f2f", "#c9a227"],
         "2k": ["#d32f2f", "#222", "#d32f2f", "#c9a227"], "10k": ["#6d4c41", "#222", "#f57c00", "#c9a227"]}


def resistor(p1, p2, value: str = "220", selected: bool = False) -> str:
    (x1, y1), (x2, y2) = p1, p2
    ang = math.degrees(math.atan2(y2 - y1, x2 - x1))
    mx, my = (x1 + x2) / 2, (y1 + y2) / 2
    o = [f'<g class="res"><line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="#a5abb2" stroke-width="1.8"/>',
         f'<g transform="translate({f(mx)},{f(my)}) rotate({f(ang)})">',
         '<rect x="-15" y="-5.5" width="30" height="11" rx="5" fill="#e3cb98" stroke="#bfa26e" stroke-width=".8"/>']
    for x, c in zip((-9.5, -4.5, 0.5, 8), BANDS[value]):
        o.append(f'<rect x="{x}" y="-5.3" width="2.6" height="10.6" fill="{c}"/>')
    if selected:
        o.append('<rect x="-21" y="-10" width="42" height="20" rx="5" fill="none" stroke="#2563d9" stroke-width="1.6" stroke-dasharray="4 3"/>')
    return "".join(o) + "</g></g>"


def button(tl, br, pressed: bool = False, cap: str = "#2f6fd6") -> str:
    """12 mm push button straddling the channel: legs at tl, (br.x, tl.y), (tl.x, br.y), br."""
    cx, cy = (tl[0] + br[0]) / 2, (tl[1] + br[1]) / 2
    o = ['<g class="btn">']
    for x, y in (tl, (br[0], tl[1]), (tl[0], br[1]), br):
        o.append(f'<line x1="{x}" y1="{y}" x2="{f(cx + (x - cx) * .55)}" y2="{f(cy + (y - cy) * .55)}" stroke="#a5abb2" stroke-width="2"/>')
    o.append(f'<rect x="{f(cx - 20)}" y="{f(cy - 20)}" width="40" height="40" rx="4" fill="#2d3136" stroke="#15181b" filter="url(#lift)"/>')
    o.append(f'<rect x="{f(cx - 15)}" y="{f(cy - 15)}" width="30" height="30" rx="3" fill="#8d949c"/>')
    for dx, dy in ((-11, -11), (11, -11), (-11, 11), (11, 11)):
        o.append(f'<circle cx="{f(cx + dx)}" cy="{f(cy + dy)}" r="1.6" fill="#5e656d"/>')
    o.append(f'<circle cx="{f(cx)}" cy="{f(cy + (1.5 if pressed else 0))}" r="{9 if pressed else 10}" fill="{cap}" stroke="rgba(0,0,0,.35)"/>')
    if not pressed:
        o.append(f'<ellipse cx="{f(cx - 3)}" cy="{f(cy - 4)}" rx="4" ry="2.5" fill="#fff" opacity=".35"/>')
    return "".join(o) + "</g>"


def buzzer(p1, p2, playing: bool = False) -> str:
    cx, cy = (p1[0] + p2[0]) / 2, p1[1] + 26
    o = ['<g class="buzzer">']
    for x, y in (p1, p2):
        o.append(f'<line x1="{x}" y1="{y}" x2="{f(cx + (x - cx) * .5)}" y2="{f(cy - 12)}" stroke="#a5abb2" stroke-width="1.8"/>')
    if playing:
        for r, op in ((30, .5), (39, .32), (48, .18)):
            o.append(f'<path d="M{f(cx + r * .7)},{f(cy - r * .7)} A{r} {r} 0 0 1 {f(cx + r * .7)},{f(cy + r * .7)}" stroke="#2563d9" stroke-width="2" fill="none" opacity="{op}"/>')
    o.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="19" fill="#26282c" stroke="#0f1012" filter="url(#lift)"/>'
             f'<circle cx="{f(cx)}" cy="{f(cy)}" r="12" fill="none" stroke="#3b3e43"/><circle cx="{f(cx)}" cy="{f(cy)}" r="3" fill="#0f1012"/>'
             f'<text x="{f(cx - 12)}" y="{f(cy - 7)}" font-size="9" font-weight="700" fill="#cfd3d8">+</text>')
    return "".join(o) + "</g>"


def pot(l, w, r, angle: float = 0, label: str = "") -> str:
    """Rotary potentiometer: legs l (one end), w (wiper), r (other end) in one row; knob above."""
    cx, cy = w[0], w[1] - 30
    o = ['<g class="pot">']
    for x, y in (l, w, r):
        o.append(f'<line x1="{x}" y1="{y}" x2="{f(cx + (x - cx) * .6)}" y2="{f(cy + 14)}" stroke="#a5abb2" stroke-width="1.8"/>')
    o.append(f'<rect x="{f(cx - 22)}" y="{f(cy - 18)}" width="44" height="34" rx="4" fill="#2b5fa8" stroke="#1b3f73" filter="url(#lift)"/>')
    o.append(f'<circle cx="{f(cx)}" cy="{f(cy - 1)}" r="14" fill="#e9ebee" stroke="#9ba2aa"/>')
    a = math.radians(angle - 90)
    o.append(f'<line x1="{f(cx)}" y1="{f(cy - 1)}" x2="{f(cx + 11 * math.cos(a))}" y2="{f(cy - 1 + 11 * math.sin(a))}" stroke="#2d3136" stroke-width="2.6" stroke-linecap="round"/>')
    if label:
        o.append(f'<text x="{f(cx)}" y="{f(cy - 24)}" font-size="9" font-weight="600" fill="#4b5563" text-anchor="middle">{label}</text>')
    return "".join(o) + "</g>"


def slide_switch(l, m, r, position: int = 0) -> str:
    """SS12D00 slide switch: legs 1 (l), 2 — the common — (m) and 3 (r) in one row, its body above them. The knob
    slides towards leg 1 (position 0: leg 2 is joined to leg 1) or towards leg 3 (position 1: 2 joined to 3)."""
    cx, cy = m[0], m[1] - 24
    o = ['<g class="slide">']
    for x, y in (l, m, r):
        o.append(f'<line x1="{x}" y1="{y}" x2="{f(cx + (x - cx) * .8)}" y2="{f(cy + 8)}" stroke="#a5abb2" stroke-width="1.8"/>')
    o.append(f'<rect x="{f(cx - 26)}" y="{f(cy - 11)}" width="52" height="20" rx="3" fill="#2d3136" stroke="#15181b" filter="url(#lift)"/>'
             f'<rect x="{f(cx - 19)}" y="{f(cy - 6)}" width="38" height="10" rx="2" fill="#15181b"/>')
    kx = cx - 18 if position == 0 else cx + 2
    o.append(f'<rect x="{f(kx)}" y="{f(cy - 7)}" width="16" height="12" rx="1.6" fill="#e9ebee" stroke="#9ba2aa"/>')
    for dx in (4, 8, 12):
        o.append(f'<line x1="{f(kx + dx)}" y1="{f(cy - 4)}" x2="{f(kx + dx)}" y2="{f(cy + 2)}" stroke="#9ba2aa" stroke-width="1"/>')
    o.append(f'<text x="{f(cx - 22)}" y="{f(cy - 14)}" font-size="6.5" font-weight="700" fill="#6b7280" text-anchor="middle">1</text>'
             f'<text x="{f(cx + 22)}" y="{f(cy - 14)}" font-size="6.5" font-weight="700" fill="#6b7280" text-anchor="middle">3</text>')
    return "".join(o) + "</g>"


def ldr(a, b, lean: int = 22) -> str:
    """Light-dependent resistor (GL5528, 5 mm): legs in holes a and b, the disc leaning `lean` px away (down if > 0),
    its red-brown track in a zigzag across it."""
    cx, cy = (a[0] + b[0]) / 2, a[1] + lean
    o = ['<g class="ldr">']
    for x, y in (a, b):
        o.append(f'<path d="M{x},{y} L{f(cx + (x - cx) * .45)},{f(cy - 8)}" stroke="#a5abb2" stroke-width="1.7" fill="none"/>')
    o.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="11" fill="#f2d7a6" stroke="#c9a46a"/>'
             f'<path d="M{f(cx - 9)},{f(cy - 3)} A11 11 0 0 1 {f(cx - 4)},{f(cy - 9.8)} M{f(cx + 9)},{f(cy + 3)} A11 11 0 0 1 {f(cx + 4)},{f(cy + 9.8)}" stroke="#d6b24c" stroke-width="2.4" fill="none"/>')
    zig = f"M{f(cx - 6)},{f(cy - 6)} h12 v3 h-12 v3 h12 v3 h-12 v3 h12"
    o.append(f'<path d="{zig}" stroke="#a5582d" stroke-width="1.3" fill="none" stroke-linejoin="round"/>'
             f'<circle cx="{f(cx)}" cy="{f(cy)}" r="11" fill="#fff" opacity=".12"/>')
    return "".join(o) + "</g>"


RGB_DIE = {"r": ("#ff3b2c", "red"), "g": ("#22c55e", "green"), "b": ("#3b82f6", "blue")}


def rgb_led(r, c, g, b, lit=(0, 0, 0), common: str = "cathode", lean: int = 24) -> str:
    """5 mm RGB LED, legs left to right: red (r), the common — the longest — (c), green (g), blue (b); the milky body
    leaning `lean` px away. `lit`: each die's brightness 0–1; the body takes their mix. Small letters name the legs."""
    cx, cy = (r[0] + b[0]) / 2, r[1] + lean
    o = ['<g class="rgb">']
    for (x, y), w in ((r, 1.6), (c, 2.1), (g, 1.6), (b, 1.6)):
        o.append(f'<path d="M{x},{y} L{f(cx + (x - cx) * .3)},{f(cy - 8)}" stroke="#a5abb2" stroke-width="{w}" fill="none"/>')
    for (x, y), t in zip((r, c, g, b), ("R", "−" if common == "cathode" else "+", "G", "B")):
        o.append(f'<text x="{x}" y="{y - 7}" font-size="6.5" font-weight="700" fill="#6b7280" text-anchor="middle">{t}</text>')
    for (k, (col, glow)), v, dx in zip(RGB_DIE.items(), lit, (-4, 0, 4)):
        if v > 0:
            o.append(f'<circle cx="{f(cx + dx)}" cy="{f(cy)}" r="34" fill="url(#glow-{glow})" opacity="{f(min(1, .25 + v))}"/>')
    o.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="11" fill="#eef1f4" stroke="rgba(0,0,0,.18)"/>')
    if any(lit):
        top = max(lit)
        mix = "#{:02x}{:02x}{:02x}".format(*(round(255 * v / top) for v in lit))
        o.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="10.5" fill="{mix}" opacity="{f(.35 + .6 * top)}"/>')
    for (k, (col, _)), v, dx, dy in zip(RGB_DIE.items(), lit, (-3.5, 3.5, 0), (-1.5, -1.5, 3)):
        o.append(f'<rect x="{f(cx + dx - 1.4)}" y="{f(cy + dy - 1.4)}" width="2.8" height="2.8" fill="{col}" opacity="{f(.45 + .55 * v)}"/>')
    o.append(f'<ellipse cx="{f(cx - 3.5)}" cy="{f(cy - 4.5)}" rx="3.2" ry="2.2" fill="#fff" opacity=".6"/>')
    return "".join(o) + "</g>"


BATTERY = {"2xAA": (96, 56, 2, "3 V"), "4xAA": (96, 100, 4, "6 V"), "9V": (64, 92, 0, "9 V")}


def battery(plus, minus, kind: str = "4xAA") -> str:
    """A battery pack (2×AA, 4×AA in a holder, or a 9 V battery with its snap): its red lead in hole `plus`, its black
    lead in `minus` — a rail pair — and the pack beyond the minus hole, away from the breadboard. Packs are drawn
    smaller than real (a 4×AA holder is 62 mm across) so they don't hide the breadboard."""
    w, h, cells, volts = BATTERY[kind]
    dx, dy = minus[0] - plus[0], minus[1] - plus[1]
    n = math.hypot(dx, dy) or 1
    ux, uy = dx / n, dy / n
    gap = 26
    cx, cy = minus[0] + ux * (gap + h / 2), minus[1] + uy * (gap + h / 2)
    rot = math.degrees(math.atan2(ux, -uy))
    a = math.radians(rot)
    world = lambda lx, ly: (cx + lx * math.cos(a) - ly * math.sin(a), cy + lx * math.sin(a) + ly * math.cos(a))
    o = ['<g class="battery">']
    for hole, lx, col in ((plus, -12, "red"), (minus, 12, "black")):
        ex, ey = world(lx, h / 2)
        mx, my = world(lx, h / 2 + gap * .55)
        c1, c2 = WIRE[col]
        path = f"M{f(ex)},{f(ey)} Q{f(mx)},{f(my)} {f(hole[0])},{f(hole[1])}"
        o.append(f'<path d="{path}" fill="none" stroke="{c2}" stroke-width="4.4" stroke-linecap="round"/>'
                 f'<path d="{path}" fill="none" stroke="{c1}" stroke-width="2.6" stroke-linecap="round"/>'
                 f'<circle cx="{hole[0]}" cy="{hole[1]}" r="3.2" fill="{c2}"/><circle cx="{hole[0]}" cy="{hole[1]}" r="1.4" fill="{c1}"/>')
    o.append(f'<g transform="translate({f(cx)},{f(cy)}) rotate({f(rot)})">')
    if cells:
        o.append(f'<rect x="{f(-w / 2)}" y="{f(-h / 2)}" width="{w}" height="{h}" rx="5" fill="#2d3136" stroke="#15181b" filter="url(#lift)"/>')
        ch = (h - 12) / cells
        for i in range(cells):
            y0 = -h / 2 + 6 + i * ch
            o.append(f'<rect x="{f(-w / 2 + 6)}" y="{f(y0 + 1)}" width="{w - 16}" height="{f(ch - 2)}" rx="{f((ch - 2) / 2)}" fill="#e8b10f"/>'
                     f'<rect x="{f(-w / 2 + 6)}" y="{f(y0 + 1)}" width="{f((w - 16) * .32)}" height="{f(ch - 2)}" rx="{f((ch - 2) / 2)}" fill="#1c1e21"/>'
                     f'<rect x="{f(w / 2 - 10)}" y="{f(y0 + ch / 2 - 3)}" width="3" height="6" rx="1" fill="#c7ccd2"/>')
    else:
        o.append(f'<rect x="{f(-w / 2)}" y="{f(-h / 2)}" width="{w}" height="{h}" rx="4" fill="#1f2227" stroke="#0e0f11" filter="url(#lift)"/>'
                 f'<rect x="{f(-w / 2)}" y="{f(-h / 2 + 14)}" width="{w}" height="{f(h * .45)}" fill="#d6b24c"/>'
                 f'<rect x="{f(-w / 2 + 4)}" y="{f(h / 2 - 12)}" width="{w - 8}" height="12" rx="3" fill="#15171a"/>')
    o.append("</g>")
    # the writing stays upright whichever way the pack is turned
    tx, ty = world(0, 0)
    o.append(f'<text x="{f(tx)}" y="{f(ty + 3.5)}" font-size="10" font-weight="700" fill="#fff" stroke="#15171a" stroke-width="2.4" '
             f'paint-order="stroke" text-anchor="middle" font-family="Inter">{volts}</text>')
    for lx, sign, col in ((-12, "+", "#ff8a7a"), (12, "−", "#cfd3d8")):
        px, py = world(lx, h / 2 - 6)
        o.append(f'<text x="{f(px)}" y="{f(py + 3)}" font-size="8" font-weight="700" fill="{col}" text-anchor="middle">{sign}</text>')
    return "".join(o) + "</g>"


def usb_plug(x, y) -> str:
    """A micro-USB cable plugged into the socket whose left end is at (x, y) (the GPIO board's 5V in): the plug's
    metal end in the socket, its grey body and the cable going left."""
    return (f'<g class="usb-plug"><path d="M{f(x - 30)},{f(y + 8)} C{f(x - 70)},{f(y + 8)} {f(x - 70)},{f(y + 60)} {f(x - 110)},{f(y + 60)}" '
            f'stroke="#2d3136" stroke-width="7" fill="none" stroke-linecap="round"/>'
            f'<rect x="{f(x - 34)}" y="{f(y - 1)}" width="28" height="18" rx="4" fill="#3a3d42" stroke="#15171a"/>'
            f'<rect x="{f(x - 7)}" y="{f(y + 3)}" width="14" height="10" rx="1.5" fill="#c7ccd2" stroke="#8f969f"/></g>')


# ------------------------------------------------------------------ boards
PICO_B = ["GP0", "GP1", "GND", "GP2", "GP3", "GP4", "GP5", "GND", "GP6", "GP7", "GP8", "GP9", "GND",
          "GP10", "GP11", "GP12", "GP13", "GND", "GP14", "GP15"]                       # pins 1–20, left → right
PICO_T = ["VBUS", "VSYS", "GND", "3V3_EN", "3V3", "ADC_VREF", "GP28", "AGND", "GP27", "GP26", "RUN",
          "GP22", "GND", "GP21", "GP20", "GP19", "GP18", "GND", "GP17", "GP16"]          # pins 40–21, left → right
SHORT = {"3V3_EN": "3V3E", "ADC_VREF": "VREF"}


def pad(x, y, ring: str = "#d6b24c", hl: bool = False) -> str:
    o = f'<circle cx="{x}" cy="{y}" r="4.4" fill="{ring}" stroke="#a8862a" stroke-width=".8"/><circle cx="{x}" cy="{y}" r="1.9" fill="#1b2b22"/>'
    if hl:
        o += f'<circle cx="{x}" cy="{y}" r="8" fill="none" stroke="#fff" stroke-width="2"/><circle cx="{x}" cy="{y}" r="8" fill="none" stroke="#2563d9" stroke-width="1.4" stroke-dasharray="3 2"/>'
    return o


def vlabel(x, y, txt, up: bool, fill: str = "#e6f2ea") -> str:
    anchor = "start" if up else "end"
    return (f'<text transform="translate({f(x + 2.2)},{y}) rotate(-90)" text-anchor="{anchor}" font-size="6" '
            f'font-family="JetBrains Mono" font-weight="600" fill="{fill}">{txt}</text>')


def pico(x0: int, yb: int, led_on: bool = False, hl=()):
    """Raspberry Pi Pico W lying flat, USB to the left. Returns (svg, {pin number: (x, y)})."""
    yt = yb - 7 * P
    xl, xr, top, bot = x0 - 16, x0 + 19 * P + 16, yt - 14, yb + 14
    cy = (yt + yb) / 2
    o = ['<g class="board pico">',
         f'<rect x="{xl}" y="{top}" width="{xr - xl}" height="{bot - top}" rx="6" fill="#2b7a4b" stroke="#1d5a37" filter="url(#lift)"/>',
         f'<rect x="{xl - 14}" y="{f(cy - 13)}" width="22" height="26" rx="3" fill="#c7ccd2" stroke="#8f969f"/>'
         f'<rect x="{xl - 11}" y="{f(cy - 7)}" width="10" height="14" rx="1.5" fill="#6d747c"/>',
         f'<rect x="{x0 + 9 * P - 17}" y="{f(cy - 17)}" width="34" height="34" rx="2" fill="#1c1e21"/>'
         f'<text x="{x0 + 9 * P}" y="{f(cy + 2)}" font-size="5.5" fill="#8d939b" text-anchor="middle" font-family="JetBrains Mono">RP2040</text>',
         f'<rect x="{x0 + 5 * P}" y="{f(cy - 8)}" width="18" height="16" rx="1.5" fill="#26292d"/>',
         f'<rect x="{x0 + 13 * P - 4}" y="{f(cy - 19)}" width="52" height="38" rx="3" fill="#c3c8ce" stroke="#9aa1a9"/>',
         f'<path d="M{x0 + 17 * P + 4},{f(cy - 14)} h10 v6 h-10 v6 h10 v6 h-10 v6 h10" stroke="#5fae80" stroke-width="2" fill="none"/>',
         f'<circle cx="{x0 + 2 * P + 6}" cy="{f(cy - 10)}" r="5.5" fill="#f4f4f4" stroke="#b8b8b8"/>'
         f'<text x="{x0 + 2 * P + 6}" y="{f(cy + 3)}" font-size="5" fill="#d8eadf" text-anchor="middle" font-family="JetBrains Mono">BOOTSEL</text>',
         f'<text x="{x0 + 5 * P + 9}" y="{f(cy + 20)}" font-size="8.5" font-weight="700" fill="#e6f2ea" text-anchor="middle" font-family="Inter">Pico W</text>']
    lx, ly = x0 + 0 * P + 2, cy + 8
    if led_on:
        o.append(f'<circle cx="{lx + 3}" cy="{f(ly + 2)}" r="12" fill="url(#glow-green)"/>')
    o.append(f'<rect x="{lx}" y="{f(ly)}" width="6" height="4" rx="1" fill="{"#8dffad" if led_on else "#d7e6db"}"/>'
             f'<text x="{lx + 3}" y="{f(ly + 11)}" font-size="5" fill="#d8eadf" text-anchor="middle" font-family="JetBrains Mono">LED</text>')
    pins = {}
    for i, name in enumerate(PICO_B):
        x = x0 + i * P
        pins[i + 1] = (x, yb)
        o.append(pad(x, yb, hl=(i + 1) in hl))
        o.append(vlabel(x, yb - 9, SHORT.get(name, name), True, "#9fc4ad" if "GND" in name else "#e6f2ea"))
    for i, name in enumerate(PICO_T):
        x = x0 + i * P
        pins[40 - i] = (x, yt)
        o.append(pad(x, yt, hl=(40 - i) in hl))
        o.append(vlabel(x, yt + 9, SHORT.get(name, name), False, "#9fc4ad" if "GND" in name else "#e6f2ea"))
    return "".join(o) + "</g>", pins


ESP_B = ["3V3", "GND", "D15", "D2", "D4", "RX2", "TX2", "D5", "D18", "D19", "D21", "RX0", "TX0", "D22", "D23"]
ESP_T = ["VIN", "GND", "D13", "D12", "D14", "D27", "D26", "D25", "D33", "D32", "D35", "D34", "VN", "VP", "EN"]


def esp32(x0: int, yb: int, led_on: bool = False):
    """ESP32 DevKit V1 (30-pin) lying flat, USB to the left. Returns (svg, {'B:name' | 'T:name': (x, y)})."""
    yt = yb - 9 * P
    xl, xr, top, bot = x0 - 30, x0 + 14 * P + 58, yt - 14, yb + 14
    cy = (yt + yb) / 2
    o = ['<g class="board esp32">',
         f'<rect x="{xl}" y="{top}" width="{xr - xl}" height="{bot - top}" rx="6" fill="#1e2733" stroke="#0e141b" filter="url(#lift)"/>',
         f'<rect x="{xl - 10}" y="{f(cy - 11)}" width="18" height="22" rx="2.5" fill="#c7ccd2" stroke="#8f969f"/>',
         f'<rect x="{xl + 16}" y="{f(cy - 30)}" width="13" height="13" rx="2" fill="#c9cdd2"/><circle cx="{xl + 22.5}" cy="{f(cy - 23.5)}" r="3.6" fill="#2a2d31"/>'
         f'<text x="{xl + 22.5}" y="{f(cy - 33)}" font-size="5.5" fill="#c9d3de" text-anchor="middle" font-family="JetBrains Mono">EN</text>',
         f'<rect x="{xl + 16}" y="{f(cy + 17)}" width="13" height="13" rx="2" fill="#c9cdd2"/><circle cx="{xl + 22.5}" cy="{f(cy + 23.5)}" r="3.6" fill="#2a2d31"/>'
         f'<text x="{xl + 22.5}" y="{f(cy + 38)}" font-size="5.5" fill="#c9d3de" text-anchor="middle" font-family="JetBrains Mono">BOOT</text>',
         f'<rect x="{x0 + 2 * P}" y="{f(cy - 11)}" width="24" height="22" rx="2" fill="#15191e"/><text x="{x0 + 2 * P + 12}" y="{f(cy + 2)}" font-size="4.6" fill="#7f8a96" text-anchor="middle" font-family="JetBrains Mono">CP2102</text>',
         f'<rect x="{x0 + 4 * P + 6}" y="{f(cy - 8)}" width="16" height="16" rx="1.5" fill="#15191e"/>',
         f'<rect x="{x0 + P * 0.5}" y="{f(cy - 20)}" width="6" height="4" rx="1" fill="#ff5b5b"/>',
         ]
    bx, by_ = x0 + P * 0.5, cy + 16
    if led_on:
        o.append(f'<circle cx="{bx + 3}" cy="{f(by_ + 2)}" r="12" fill="url(#glow-blue)"/>')
    o.append(f'<rect x="{bx}" y="{f(by_)}" width="6" height="4" rx="1" fill="{"#8fb8ff" if led_on else "#56657a"}"/>')
    mx = x0 + 7 * P - 2
    o.append(f'<rect x="{mx}" y="{f(cy - 42)}" width="{xr - 2 - mx}" height="84" rx="3" fill="#b9bfc7" stroke="#8b929b"/>')
    o.append(f'<rect x="{xr - 44}" y="{f(cy - 42)}" width="42" height="84" rx="3" fill="#1e2733"/>')
    o.append(f'<path d="M{xr - 36},{f(cy - 30)} h24 v8 h-24 v8 h24 v8 h-24 v8 h24 v8 h-24 v8 h24" stroke="#c9a44a" stroke-width="2" fill="none"/>')
    o.append(f'<text x="{(mx + xr - 44) / 2}" y="{f(cy - 4)}" font-size="7.5" font-weight="700" fill="#4f5660" text-anchor="middle" font-family="Inter">ESP32</text>'
             f'<text x="{(mx + xr - 44) / 2}" y="{f(cy + 8)}" font-size="5.2" fill="#5d646e" text-anchor="middle" font-family="JetBrains Mono">WROOM-32</text>')
    pins = {}
    for i, name in enumerate(ESP_B):
        x = x0 + i * P
        pins["B:" + name] = (x, yb)
        o.append(pad(x, yb))
        o.append(vlabel(x, yb - 9, name, True, "#93a3b5" if name == "GND" else "#e3eaf2"))
    for i, name in enumerate(ESP_T):
        x = x0 + i * P
        pins["T:" + name] = (x, yt)
        o.append(pad(x, yt))
        o.append(vlabel(x, yt + 9, name, False, "#93a3b5" if name == "GND" else "#e3eaf2"))
    return "".join(o) + "</g>", pins


# ESP32 30-pin extension board (resources/esp32_extension_board.jpg): the DevKit sits in two female headers; every
# signal comes out as a G-V-S triple (G outermost), V being the rail the JUMP jumper sets to 3.3 V or 5 V.
EXT_ROWS = ["EN", "VP", "VN", "D34", "D35", "D32", "D33", "D25", "D26", "D27", "D14", "D12", "D13",
            "D23", "D22", "TX0", "RX0", "D21", "D19", "D18", "D5", "TX2", "RX2", "D4", "D2", "D15"]


def esp32_ext(x0: int, yb: int, led_on: bool = False, v_volts: float = 5):
    """ESP32 DevKit V1 in its extension board, USB to the left; (x0, yb) as for esp32(). Returns
    (svg, {pin number: (x, y)}) numbered as board.json: triple t (EXT_ROWS order) is S 3t+1, V 3t+2, G 3t+3."""
    yt = yb - 9 * P
    esp_svg, esp_pins = esp32(x0, yb, led_on)
    PCB, EDGE, SILK = "#141518", "#000", "#e6e8eb"
    xl, xr = x0 - 160, x0 + 14 * P + 76
    top, bot = yt - 4 * P - 34, yb + 4 * P + 34
    o = ['<g class="board esp32-ext">',
         f'<rect x="{xl}" y="{top}" width="{xr - xl}" height="{bot - top}" rx="8" fill="{PCB}" stroke="{EDGE}" filter="url(#lift)"/>']
    for hx, hy in ((xl + 12, top + 12), (xr - 12, top + 12), (xl + 12, bot - 12), (xr - 12, bot - 12)):
        o.append(f'<circle cx="{hx}" cy="{hy}" r="5.5" fill="#f6f4ef" stroke="#3a3d42"/>')
    # female headers the DevKit sits in (their ends show past the module)
    for hy in (yt, yb):
        o.append(f'<rect x="{x0 - 9}" y="{hy - 8}" width="{14 * P + 18}" height="16" rx="1.5" fill="#050506" stroke="#2a2c30"/>')
    o.append(esp_svg)
    # power: DC jack, USB-C, micro-USB, regulator, PWR LED, and the JUMP jumper for V
    cy = (yt + yb) / 2
    o.append(f'<rect x="{xl - 12}" y="{f(cy - 76)}" width="44" height="38" rx="3" fill="#0b0b0c" stroke="#2a2c30"/>'
             f'<circle cx="{xl + 4}" cy="{f(cy - 57)}" r="8" fill="#2a2c30"/><circle cx="{xl + 4}" cy="{f(cy - 57)}" r="3" fill="#b9bfc7"/>'
             f'<text x="{xl + 40}" y="{f(cy - 80)}" font-size="5.5" fill="{SILK}" font-family="JetBrains Mono">DC 6.5–16V</text>')
    o.append(f'<rect x="{xl - 6}" y="{f(cy - 18)}" width="22" height="30" rx="5" fill="#c7ccd2" stroke="#8f969f"/>'
             f'<rect x="{xl - 2}" y="{f(cy - 12)}" width="8" height="18" rx="3" fill="#6d747c"/>'
             f'<text x="{xl + 22}" y="{f(cy - 1)}" font-size="5.5" fill="{SILK}" font-family="JetBrains Mono">USB-C</text>')
    o.append(f'<rect x="{xl - 8}" y="{f(cy + 30)}" width="22" height="18" rx="2" fill="#c7ccd2" stroke="#8f969f"/>'
             f'<rect x="{xl - 5}" y="{f(cy + 35)}" width="12" height="7" rx="1.5" fill="#6d747c"/>'
             f'<text x="{xl + 20}" y="{f(cy + 42)}" font-size="5.5" fill="{SILK}" font-family="JetBrains Mono">USB</text>')
    o.append(f'<rect x="{xl + 52}" y="{f(cy - 30)}" width="24" height="18" rx="1" fill="#26292d"/>'
             f'<rect x="{xl + 55}" y="{f(cy - 36)}" width="18" height="6" fill="#aab0b7"/>'
             f'<circle cx="{xl + 64}" cy="{f(cy + 2)}" r="9" fill="#b9bfc7" stroke="#7d848c"/><circle cx="{xl + 64}" cy="{f(cy + 2)}" r="5" fill="#d6dade"/>'
             f'<rect x="{xl + 52}" y="{f(cy + 22)}" width="6" height="5" rx="1" fill="#ff5a3c"/>'
             f'<text x="{xl + 61}" y="{f(cy + 27)}" font-size="5.5" fill="{SILK}" font-family="JetBrains Mono">PWR</text>')
    jx, jy = x0 - 66, cy - 22
    o.append(f'<text x="{jx}" y="{f(jy - 9)}" font-size="6" font-weight="700" fill="{SILK}" text-anchor="middle" font-family="JetBrains Mono">JUMP</text>')
    for k, lab in enumerate(("3V3", "V", "5V")):
        o.append(f'<circle cx="{jx}" cy="{f(jy + k * 12)}" r="2.6" fill="#d6b24c"/>'
                 f'<text x="{jx + 8}" y="{f(jy + k * 12 + 2)}" font-size="5.5" fill="{SILK}" font-family="JetBrains Mono">{lab}</text>')
    cap = 12 if v_volts == 5 else 0
    o.append(f'<rect x="{jx - 5}" y="{f(jy + cap - 5)}" width="10" height="22" rx="2" fill="#1f6fd1" stroke="#0d3f7d"/>')
    o.append(f'<text x="{xl + 22}" y="{f(top + 34)}" font-size="8" font-weight="700" fill="{SILK}" font-family="Inter">ESP32 30P</text>'
             f'<text x="{xl + 22}" y="{f(top + 45)}" font-size="8" font-weight="700" fill="{SILK}" font-family="Inter">Expansion board</text>')
    # G-V-S triples: the EN header's above the module, the other header's below; G outermost
    pins = {}
    xs = {**{k[2:]: v[0] for k, v in esp_pins.items() if k.startswith("T:")}, **{"B:" + k[2:]: v[0] for k, v in esp_pins.items() if k.startswith("B:")}}
    for t, name in enumerate(EXT_ROWS):
        upper = t < 13
        x = xs[name] if upper else xs["B:" + name]
        base, step = (yt, -P) if upper else (yb, P)
        for k, lab in enumerate(("S", "V", "G")):
            y = base + step * (2 + k)
            pins[t * 3 + k + 1] = (x, y)
            ring = "#d6b24c" if lab == "S" else ("#e07a6c" if lab == "V" else "#8d939b")
            o.append(f'<rect x="{x - 5}" y="{y - 5}" width="10" height="10" rx="1" fill="#050506"/>'
                     f'<circle cx="{x}" cy="{y}" r="2.8" fill="{ring}"/>')
        ly = base + step * 4 + (-9 if upper else 9)
        o.append(vlabel(x, ly, name, upper, SILK))
    # S / V / G legend in the empty VIN and GND columns, next to each row of the triples
    for base, step in ((yt, -P), (yb, P)):
        for k, lab in enumerate(("S", "V", "G")):
            o.append(f'<text x="{x0 + 0.5 * P}" y="{f(base + step * (2 + k) + 2.2)}" font-size="6.5" font-weight="700" fill="#9aa0a8" text-anchor="middle" font-family="JetBrains Mono">{lab}</text>')
    return "".join(o) + "</g>", pins


HEART = ["01010", "11111", "11111", "01110", "00100"]
# The micro:bit GPIO board (resources/microbit_gpio_board.webp): two header rows 0.3 in apart, so it straddles
# the breadboard's channel (rows e and f), and a right-angle I²C header to their right. Labels as printed.
MBIT_TOP = ["3.3V", "GND", "GND", "P20", "P19", "P16", "P15", "P14", "P13", "P12", "P11", "P10", "3.3V"]
MBIT_BOT = ["5V", "GND", "P0", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "5V"]
MBIT_I2C = ["SDA", "SCL", "GND", "3.3V"]


def mbit_pins():
    """[(number, id, label)] in board.json order: top row 1–13, bottom row 14–26, I²C header 27–30.
    A repeated label gets its number (GND@3), like board.json."""
    out, seen = [], set()
    for n, lab in enumerate(MBIT_TOP + MBIT_BOT + MBIT_I2C, start=1):
        out.append((n, lab if lab not in seen else f"{lab}@{n}", lab))
        seen.add(lab)
    return out


def _microbit_face(x: float, y: float, image, a_pressed: bool, sound: bool):
    """The micro:bit V2 itself, 320 × 258, top-left at (x, y), edge connector along the bottom."""
    W, H = 320, 258
    o = [f'<rect x="{f(x)}" y="{f(y)}" width="{W}" height="{H}" rx="16" fill="#1d1e21" stroke="#0b0b0c" filter="url(#lift)"/>']
    o.append(f'<ellipse cx="{f(x + W / 2)}" cy="{f(y + 26)}" rx="16" ry="9" fill="none" stroke="#d6b24c" stroke-width="3"/>'
             f'<circle cx="{f(x + W / 2 - 6)}" cy="{f(y + 26)}" r="2.4" fill="#d6b24c"/><circle cx="{f(x + W / 2 + 6)}" cy="{f(y + 26)}" r="2.4" fill="#d6b24c"/>')
    o.append(f'<rect x="{f(x + W / 2 + 34)}" y="{f(y + 22)}" width="6" height="8" rx="1.5" fill="{"#ff3a22" if sound else "#3a2c2c"}"/>')
    for bx, lab, pr in ((x + 40, "A", a_pressed), (x + W - 40, "B", False)):
        o.append(f'<circle cx="{f(bx)}" cy="{f(y + 112)}" r="19" fill="#c9cdd2" stroke="#8f969f"/>'
                 f'<circle cx="{f(bx)}" cy="{f(y + 112 + (1.5 if pr else 0))}" r="{12 if pr else 13}" fill="#2a2c30"/>'
                 f'<text x="{f(bx)}" y="{f(y + 78)}" font-size="14" font-weight="700" fill="#fff" text-anchor="middle" font-family="Inter">{lab}</text>')
    img = image or ["00000"] * 5
    for r in range(5):
        for c in range(5):
            lx, ly = x + W / 2 + (c - 2) * 28, y + 112 + (r - 2) * 28
            on = img[r][c] == "1"
            if on:
                o.append(f'<circle cx="{f(lx)}" cy="{f(ly)}" r="17" fill="url(#glow-mbit)"/>')
            o.append(f'<rect x="{f(lx - 3.5)}" y="{f(ly - 6)}" width="7" height="12" rx="1.5" fill="{"#ff3a22" if on else "#3b2d2d"}"/>')
    ey = y + H - 58
    big = [("0", x + 34), ("1", x + 102), ("2", x + 160), ("3V", x + 218), ("GND", x + 286)]
    o.append(f'<rect x="{f(x + 10)}" y="{f(ey)}" width="{W - 20}" height="44" fill="#1d1e21"/>')
    for i in range(60):
        fx = x + 14 + i * 5
        if all(abs(fx - bxp) > 24 for _, bxp in big):
            o.append(f'<rect x="{f(fx)}" y="{f(ey + 8)}" width="2.6" height="36" fill="#cfa640"/>')
    for lab, bxp in big:
        o.append(f'<rect x="{f(bxp - 20)}" y="{f(ey)}" width="40" height="44" rx="4" fill="#d6b24c"/>'
                 f'<circle cx="{f(bxp)}" cy="{f(ey + 15)}" r="9" fill="#1d1e21"/>'
                 f'<text x="{f(bxp)}" y="{f(ey + 37)}" font-size="9" font-weight="700" fill="#3b2f0e" text-anchor="middle" font-family="Inter">{lab}</text>')
    return "".join(o)


def mbit_usb(hx0: int, hy: int):
    """Where the GPIO board's micro-USB socket starts (its left end, top), for microbit(hx0, hy): the plug goes here."""
    stem_l = hx0 + 7.5 * P - (320 + 24) / 2
    return (stem_l - 10, hy - 84 + 8 + 24)


def microbit(hx0: int, hy: int, image=None, a_pressed: bool = False, sound: bool = False, usb: bool = False):
    """micro:bit V2 standing upright in the micro:bit GPIO board (drawn face-on so the display reads normally).
    (hx0, hy) is pin 1, the top row's left end; the bottom row is 3 pitches below, the I²C header 3 pitches to
    the right of the rows' end. Returns (svg, {pin id: (x, y)}) with the ids of mbit_pins()."""
    W, H = 320, 258
    PCB, EDGE, SILK = "#1d4f9e", "#123468", "#e9f0fa"
    by = hy + 3 * P                        # bottom row
    ix = hx0 + 15 * P                      # I²C header pins
    cx = hx0 + 7.5 * P                     # centre line of the whole board
    bar_l, bar_r, bar_t, bar_b = hx0 - 22, ix + 22, hy - 34, by + 34
    stem_w, stem_t = W + 24, hy - 84
    stem_l = cx - stem_w / 2
    slot_y = stem_t + 8
    x, y = cx - W / 2, slot_y + 10 - H     # the micro:bit's edge sits 10 deep in the slot
    o = ['<g class="board microbit">']
    # GPIO board: the wide part holding the slot, and the header part below it
    o.append(f'<rect x="{f(stem_l)}" y="{f(stem_t)}" width="{stem_w}" height="{f(bar_t + 6 - stem_t)}" rx="8" fill="{PCB}" stroke="{EDGE}" filter="url(#lift)"/>'
             f'<rect x="{f(bar_l)}" y="{f(bar_t)}" width="{f(bar_r - bar_l)}" height="{f(bar_b - bar_t)}" rx="8" fill="{PCB}" stroke="{EDGE}" filter="url(#lift)"/>'
             f'<rect x="{f(bar_l + 1)}" y="{f(bar_t - 4)}" width="{f(bar_r - bar_l - 2)}" height="12" fill="{PCB}"/>')   # one board: hide the seam
    for hx, hyy in ((bar_r - 11, bar_t + 13), (bar_r - 11, bar_b - 11)):
        o.append(f'<circle cx="{f(hx)}" cy="{f(hyy)}" r="5" fill="#f6f4ef" stroke="{EDGE}"/>')
    # micro-USB (5V in), regulator and power LED on the wide part, under the slot
    uy = slot_y + 24
    o.append(f'<rect x="{f(stem_l - 10)}" y="{f(uy)}" width="24" height="16" rx="2" fill="#c7ccd2" stroke="#8f969f"/>'
             f'<rect x="{f(stem_l - 7)}" y="{f(uy + 5)}" width="14" height="6" rx="1.5" fill="#6d747c"/>')
    o.append(f'<rect x="{f(stem_l + 26)}" y="{f(uy)}" width="20" height="14" rx="1" fill="#24272b"/>'
             f'<rect x="{f(stem_l + 29)}" y="{f(uy - 4)}" width="14" height="4" fill="#aab0b7"/>'
             f'<rect x="{f(stem_l + 54)}" y="{f(uy + 4)}" width="6" height="5" rx="1" fill="#ff5a3c"/>'
             f'<text x="{f(stem_l + 66)}" y="{f(uy + 9)}" font-size="6" fill="{SILK}" font-family="JetBrains Mono">PWR</text>')
    if usb:   # M6.1: the GPIO board's own micro-USB plugged in (its 5V pins live)
        o.append(usb_plug(stem_l - 10, uy))
    o.append(f'<text x="{f(stem_l + stem_w - 22)}" y="{f(uy + 10)}" font-size="9" font-weight="700" fill="{SILK}" text-anchor="end" font-family="Inter">micro:bit GPIO Board</text>')
    # the micro:bit, then the slot's front lip over its edge
    o.append(_microbit_face(x, y, image, a_pressed, sound))
    o.append(f'<rect x="{f(x - 6)}" y="{f(slot_y)}" width="{W + 12}" height="14" rx="3" fill="#121a24" stroke="#05080c"/>')
    # header rows with their silkscreen boxes and labels (top row labels above, bottom row below)
    pins = {}
    num = {n: pid for n, pid, _ in mbit_pins()}
    for row_y, names, up, first in ((hy, MBIT_TOP, True, 1), (by, MBIT_BOT, False, 14)):
        o.append(f'<rect x="{hx0 - 8}" y="{row_y - 8}" width="{12 * P + 16}" height="16" rx="1" fill="none" stroke="{SILK}" stroke-width=".8"/>')
        for i, name in enumerate(names):
            px = hx0 + i * P
            pins[num[first + i]] = (px, row_y)
            o.append(f'<circle cx="{px}" cy="{row_y}" r="4.4" fill="#d3d7dc" stroke="#8f969f" stroke-width=".8"/><circle cx="{px}" cy="{row_y}" r="1.9" fill="#1b2433"/>')
            o.append(vlabel(px, row_y - 9 if up else row_y + 9, name, up, "#9fb3cf" if name == "GND" else SILK))
    # right-angle I²C header: black housing, pins pointing right, labels to the left
    o.append(f'<rect x="{ix - 7}" y="{hy - 8}" width="14" height="{3 * P + 16}" rx="1.5" fill="#1c1e21"/>')
    for i, name in enumerate(MBIT_I2C):
        py = hy + i * P
        pins[num[27 + i]] = (ix, py)
        o.append(f'<rect x="{ix}" y="{f(py - 1.4)}" width="12" height="2.8" fill="#d6b24c"/>'
                 f'<circle cx="{ix}" cy="{py}" r="3.2" fill="#d6b24c" stroke="#a8862a" stroke-width=".8"/>'
                 f'<text x="{ix - 10}" y="{f(py + 2.2)}" font-size="6" font-family="JetBrains Mono" font-weight="600" fill="{"#9fb3cf" if name == "GND" else SILK}" text-anchor="end">{name}</text>')
    return "".join(o) + "</g>", pins


# ------------------------------------------------------------------ modules
def oled(x: float, y: float, lines=(), bar: float = 0, pin_names=("SDA", "SCL", "VCC", "GND")):
    """SSD1306 0.96" I²C OLED; pins along the bottom edge from (x, y + 156), one pitch apart.
    Returns (svg, {name: (x, y)})."""
    w, h = 170, 156
    px0 = x + w / 2 - 1.5 * P
    o = ['<g class="oled">',
         f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="#16314f" stroke="#0c1d30" filter="url(#lift)"/>']
    for cx, cy in ((x + 9, y + 9), (x + w - 9, y + 9), (x + 9, y + h - 9), (x + w - 9, y + h - 9)):
        o.append(f'<circle cx="{cx}" cy="{cy}" r="4" fill="#f6f4ef" stroke="#0c1d30"/>')
    o.append(f'<rect x="{x + 12}" y="{y + 22}" width="{w - 24}" height="92" rx="2" fill="#05070a" stroke="#2a3a4e"/>')
    gx, gy = x + 18, y + 28
    for i, (txt, size) in enumerate(lines):
        o.append(f'<text x="{gx}" y="{gy + (12 if i == 0 else 12 + i * 28)}" font-size="{size}" fill="#9be7ff" font-family="JetBrains Mono" font-weight="600">{txt}</text>')
    if bar:
        o.append(f'<rect x="{gx}" y="{gy + 64}" width="{f(bar)}" height="12" fill="#9be7ff"/>')
        o.append(f'<rect x="{gx}" y="{gy + 64}" width="{w - 36}" height="12" fill="none" stroke="#9be7ff" stroke-width=".8" opacity=".4"/>')
    pins = {}
    for i, name in enumerate(pin_names):
        px = px0 + i * P
        pins[name] = (px, y + h)
        o.append(pad(px, y + h))
        o.append(f'<text x="{px}" y="{y + h - 12}" font-size="6.5" fill="#cfe0f2" text-anchor="middle" font-family="JetBrains Mono" font-weight="600">{name}</text>')
    return "".join(o) + "</g>", pins


def hcsr04(x: float, y: float):
    """HC-SR04 ultrasonic sensor; pins VCC, Trig, Echo, GND along the top edge starting at (x, y)."""
    w, h = 226, 100
    cx = x + 1.5 * P
    bx = cx - w / 2
    o = ['<g class="hcsr04">', f'<rect x="{f(bx)}" y="{y}" width="{w}" height="{h}" rx="5" fill="#1f6fb5" stroke="#134a7b" filter="url(#lift)"/>']
    for tx in (bx + 54, bx + w - 54):
        o.append(f'<circle cx="{f(tx)}" cy="{y + 54}" r="38" fill="#c9cdd2" stroke="#8f969f"/>'
                 f'<circle cx="{f(tx)}" cy="{y + 54}" r="30" fill="url(#mesh)" stroke="#9aa1a9"/><circle cx="{f(tx)}" cy="{y + 54}" r="30" fill="#4d545c" opacity=".25"/>')
    o.append(f'<rect x="{f(cx - 12)}" y="{y + 62}" width="24" height="10" rx="5" fill="#c9cdd2"/>')
    o.append(f'<text x="{f(cx)}" y="{y + 94}" font-size="7" fill="#d5e6f7" text-anchor="middle" font-family="JetBrains Mono" font-weight="600">HC-SR04</text>')
    pins = {}
    for i, name in enumerate(("VCC", "Trig", "Echo", "GND")):
        px = x + i * P
        pins[name] = (px, y)
        o.append(pad(px, y))
        o.append(f'<text x="{px}" y="{y + 16}" font-size="6" fill="#e3eef9" text-anchor="middle" font-family="JetBrains Mono" font-weight="600">{name}</text>')
    return "".join(o) + "</g>", pins


def servo(x: float, y: float, angle: float = 90, s: float = 1.0, wires: bool = True, rot: float = 0, label: bool = True) -> str:
    """SG90 servo seen from above; (x, y) is the output shaft. angle 0–180°; rot turns the whole servo."""
    o = [f'<g class="servo" transform="translate({x},{y}) rotate({rot}) scale({s})">']
    if wires:
        for dy, c in ((-6, "#8b5a3a"), (0, "#de3b3b"), (6, "#f08024")):
            o.append(f'<path d="M66,{dy} C90,{dy} 96,{dy + 12} 118,{dy + 12}" stroke="{c}" stroke-width="3.6" fill="none" stroke-linecap="round"/>')
    o.append('<rect x="-30" y="-6" width="12" height="12" rx="2" fill="#2f76c9"/><rect x="58" y="-6" width="12" height="12" rx="2" fill="#2f76c9"/>'
             '<circle cx="-24" cy="0" r="2.6" fill="#173f6e"/><circle cx="64" cy="0" r="2.6" fill="#173f6e"/>')
    o.append('<rect x="-18" y="-24" width="76" height="48" rx="4" fill="#3a8ae0" stroke="#1f5ea8" filter="url(#lift)"/>'
             '<circle cx="0" cy="0" r="13" fill="#2f76c9" stroke="#1f5ea8"/>')
    if label:
        o.append('<text x="36" y="4" font-size="9" font-weight="700" fill="#e8f1fc" text-anchor="middle" font-family="Inter">SG90</text>')
    a = angle - 90
    o.append(f'<g transform="rotate({a})"><path d="M-6,0 L-4,-46 Q0,-52 4,-46 L6,0 Q0,9 -6,0Z" fill="#f4f4f4" stroke="#b9bec5"/>'
             '<circle cx="0" cy="-38" r="1.6" fill="#b9bec5"/><circle cx="0" cy="-28" r="1.6" fill="#b9bec5"/><circle cx="0" cy="-18" r="1.6" fill="#b9bec5"/>'
             '<circle cx="0" cy="0" r="6" fill="#ffffff" stroke="#b9bec5"/></g>')
    return "".join(o) + "</g>"


# ------------------------------------------------------------------ part icons (parts panel, examples)
def icon_svg(kind: str, cls: str = "") -> str:
    body = ICON_PARTS[kind]
    return f'<svg class="{cls}" viewBox="0 0 32 32">{body}</svg>'


ICON_PARTS = {
    "breadboard": '<rect x="3" y="7" width="26" height="18" rx="2" fill="#f6f4ef" stroke="#cfc8b8"/>' + "".join(
        f'<rect x="{6 + c * 4}" y="{11 + r * 4}" width="1.6" height="1.6" fill="#6b665c"/>' for c in range(6) for r in range(3)),
    "resistor": '<line x1="3" y1="16" x2="29" y2="16" stroke="#a5abb2" stroke-width="1.6"/><rect x="9" y="12" width="14" height="8" rx="4" fill="#e3cb98"/>'
                '<rect x="12" y="12" width="1.6" height="8" fill="#d32f2f"/><rect x="15" y="12" width="1.6" height="8" fill="#d32f2f"/><rect x="18" y="12" width="1.6" height="8" fill="#6d4c41"/>',
    "led": '<line x1="13" y1="20" x2="13" y2="29" stroke="#a5abb2" stroke-width="1.6"/><line x1="19" y1="20" x2="19" y2="27" stroke="#a5abb2" stroke-width="1.6"/>'
           '<path d="M9,21 V13 a7,7 0 0 1 14,0 V21Z" fill="#ef3b2c"/><rect x="8" y="20" width="16" height="2.5" rx="1" fill="#c62f22"/>',
    "rgb": '<line x1="11" y1="20" x2="11" y2="29" stroke="#a5abb2" stroke-width="1.4"/><line x1="14.5" y1="20" x2="14.5" y2="30" stroke="#a5abb2" stroke-width="1.4"/><line x1="18" y1="20" x2="18" y2="29" stroke="#a5abb2" stroke-width="1.4"/><line x1="21.5" y1="20" x2="21.5" y2="29" stroke="#a5abb2" stroke-width="1.4"/>'
           '<path d="M9,21 V13 a7,7 0 0 1 14,0 V21Z" fill="#eef1f4" stroke="#c9d0d8"/><circle cx="13" cy="13" r="2" fill="#ef3b2c"/><circle cx="18" cy="12" r="2" fill="#22b14c"/><circle cx="16" cy="17" r="2" fill="#2f6fe0"/>',
    "button": '<rect x="7" y="7" width="18" height="18" rx="2" fill="#2d3136"/><circle cx="16" cy="16" r="6" fill="#2f6fd6"/>',
    "switch": '<rect x="5" y="11" width="22" height="10" rx="2" fill="#2d3136"/><rect x="8" y="13" width="9" height="6" rx="1" fill="#e9ebee"/>',
    "pot": '<rect x="6" y="9" width="20" height="16" rx="2" fill="#2b5fa8"/><circle cx="16" cy="16" r="6.5" fill="#e9ebee"/><line x1="16" y1="16" x2="19" y2="11" stroke="#2d3136" stroke-width="2" stroke-linecap="round"/>',
    "ldr": '<circle cx="16" cy="14" r="8" fill="#f2d7a6" stroke="#c9a46a"/><path d="M11,12 h10 M11,15 h10 M11,18 h10" stroke="#a5582d" stroke-width="1.3"/><line x1="13" y1="22" x2="13" y2="29" stroke="#a5abb2" stroke-width="1.5"/><line x1="19" y1="22" x2="19" y2="29" stroke="#a5abb2" stroke-width="1.5"/>',
    "buzzer": '<circle cx="16" cy="16" r="10" fill="#26282c"/><circle cx="16" cy="16" r="6" fill="none" stroke="#3b3e43"/><circle cx="16" cy="16" r="1.8" fill="#0f1012"/>',
    "battery": '<rect x="4" y="9" width="22" height="14" rx="2" fill="#2d3136"/><rect x="26" y="13" width="3" height="6" rx="1" fill="#2d3136"/><rect x="6" y="11" width="9" height="10" fill="#e8b10f"/><text x="20" y="19.5" font-size="7" font-weight="700" fill="#fff" text-anchor="middle">+</text>',
    "hcsr04": '<rect x="2" y="9" width="28" height="14" rx="2" fill="#1f6fb5"/><circle cx="9" cy="16" r="5.5" fill="#c9cdd2"/><circle cx="23" cy="16" r="5.5" fill="#c9cdd2"/><circle cx="9" cy="16" r="3.5" fill="#6d747c"/><circle cx="23" cy="16" r="3.5" fill="#6d747c"/>',
    "dht": '<rect x="9" y="4" width="14" height="20" rx="2" fill="#3f8fe0"/>' + "".join(f'<rect x="{11 + c * 3.5}" y="{7 + r * 3.5}" width="2" height="2" fill="#1f5ea8"/>' for c in range(3) for r in range(4)) + '<path d="M12,24 v5 M15,24 v5 M18,24 v5 M21,24 v5" stroke="#a5abb2" stroke-width="1.3"/>',
    "pir": '<rect x="5" y="17" width="22" height="9" rx="2" fill="#2f8f4f"/><path d="M8,18 a8,8 0 0 1 16,0Z" fill="#f2f3f5" stroke="#c9d0d8"/>',
    "line": '<rect x="10" y="3" width="12" height="26" rx="2" fill="#2b5fa8"/><circle cx="16" cy="23" r="3" fill="#2d3136"/><circle cx="16" cy="16" r="2.5" fill="#d6d9de"/>',
    "soil": '<rect x="9" y="3" width="14" height="9" rx="2" fill="#2f8f4f"/><path d="M11,12 v15 l2,2 2,-2 v-15 M17,12 v15 l2,2 2,-2 v-15" fill="#d6b24c"/>',
    "tmp36": '<path d="M10,6 h12 v10 a6,3 0 0 1 -12,0Z" fill="#2d3136"/><path d="M12,18 v11 M16,19 v11 M20,18 v11" stroke="#a5abb2" stroke-width="1.4"/>',
    "servo": '<rect x="4" y="11" width="22" height="12" rx="2" fill="#3a8ae0"/><rect x="1" y="14" width="4" height="6" rx="1" fill="#2f76c9"/><rect x="25" y="14" width="4" height="6" rx="1" fill="#2f76c9"/><path d="M8,17 L10,5 L12,17Z" fill="#f4f4f4" stroke="#b9bec5" stroke-width=".8"/><circle cx="10" cy="17" r="2" fill="#fff" stroke="#b9bec5" stroke-width=".8"/>',
    "motor": '<rect x="4" y="9" width="18" height="14" rx="3" fill="#f1c232"/><rect x="22" y="12" width="5" height="8" rx="1" fill="#c9cdd2"/><circle cx="12" cy="16" r="3" fill="#d4a417"/>',
    "driver": '<rect x="4" y="5" width="24" height="22" rx="2" fill="#c2312f"/><rect x="11" y="3" width="10" height="10" rx="1" fill="#2d3136"/><rect x="7" y="20" width="18" height="4" fill="#2f8f4f"/>',
    "relay": '<rect x="5" y="6" width="22" height="20" rx="2" fill="#2f6fd6"/><rect x="8" y="9" width="16" height="9" rx="1" fill="#1f4c96"/><rect x="8" y="21" width="16" height="3" fill="#2f8f4f"/>',
    "oled": '<rect x="5" y="5" width="22" height="22" rx="2" fill="#16314f"/><rect x="7" y="9" width="18" height="11" fill="#05070a"/><path d="M9,13 h8 M9,16 h12" stroke="#9be7ff" stroke-width="1.4"/>',
    "lcd": '<rect x="2" y="8" width="28" height="16" rx="2" fill="#2f8f4f"/><rect x="5" y="11" width="22" height="10" fill="#a8d86a"/><path d="M7,14 h12 M7,18 h16" stroke="#3b5a1e" stroke-width="1.4"/>',
    "seg7": '<rect x="8" y="3" width="16" height="26" rx="2" fill="#2d3136"/><path d="M12,8 h8 M12,16 h8 M12,24 h8 M11,9 v6 M21,9 v6 M11,17 v6 M21,17 v6" stroke="#ef3b2c" stroke-width="1.8" stroke-linecap="round"/>',
    "neopixel": "".join(f'<circle cx="{16 + 10 * math.cos(math.radians(a))}" cy="{16 + 10 * math.sin(math.radians(a))}" r="2.6" fill="{c}"/>' for a, c in zip(range(0, 360, 45), ("#ef3b2c", "#ff8a00", "#f5d000", "#22b14c", "#16b8c9", "#2f6fe0", "#8d5bd1", "#e0409a"))) + '<circle cx="16" cy="16" r="13" fill="none" stroke="#2d3136" stroke-width="2.4" opacity=".25"/>',
    "microbit": '<rect x="3" y="6" width="26" height="20" rx="3" fill="#1d1e21"/>' + "".join(f'<rect x="{11 + c * 2.6}" y="{10 + r * 2.6}" width="1.2" height="1.8" fill="{"#ff3a22" if HEART[r][c] == "1" else "#3b2d2d"}"/>' for r in range(5) for c in range(5)) + '<circle cx="7" cy="14" r="2" fill="#c9cdd2"/><circle cx="25" cy="14" r="2" fill="#c9cdd2"/><rect x="5" y="22" width="22" height="3" fill="#d6b24c"/>',
    "pico": '<rect x="2" y="9" width="28" height="14" rx="2" fill="#2b7a4b"/><rect x="0" y="13" width="4" height="6" rx="1" fill="#c7ccd2"/><rect x="13" y="12" width="7" height="7" fill="#1c1e21"/><rect x="22" y="12" width="5" height="7" fill="#c3c8ce"/>' + "".join(f'<circle cx="{4 + i * 2.6}" cy="{c}" r=".8" fill="#d6b24c"/>' for i in range(10) for c in (10.5, 21.5)),
    "esp32": '<rect x="2" y="8" width="28" height="16" rx="2" fill="#1e2733"/><rect x="15" y="10" width="14" height="12" rx="1" fill="#b9bfc7"/><rect x="0" y="13" width="4" height="6" rx="1" fill="#c7ccd2"/>' + "".join(f'<circle cx="{4 + i * 2.6}" cy="{c}" r=".8" fill="#d6b24c"/>' for i in range(10) for c in (9.5, 22.5)),
}
