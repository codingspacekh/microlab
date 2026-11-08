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


def _header(pins, labels, y_body):
    """A module's 3-pin header: the black plastic strip above the holes, the pins down into them, their names."""
    xs = [x for x, _ in pins]
    y = pins[0][1]
    o = [f'<rect x="{f(min(xs) - 7)}" y="{f(y - 14)}" width="{f(max(xs) - min(xs) + 14)}" height="7" rx="1" fill="#26282c"/>']
    for (x, yy), lab in zip(pins, labels):
        o.append(f'<line x1="{x}" y1="{yy}" x2="{x}" y2="{f(y - 7)}" stroke="#c7ccd2" stroke-width="1.8"/>'
                 f'<line x1="{x}" y1="{f(y - 14)}" x2="{x}" y2="{f(y_body)}" stroke="#c7ccd2" stroke-width="1.8"/>')
    for (x, _), lab in zip(pins, labels):
        size = 5.5 if len(lab) <= 4 else 4.2   # GPIO1, XSHUT: smaller, so they don't meet
        o.append(f'<text x="{x}" y="{f(y - 18)}" font-size="{size}" font-weight="700" fill="#e9edf2" text-anchor="middle" font-family="Inter">{lab}</text>')
    return "".join(o)


def pir(vcc, out, gnd, motion: bool = False) -> str:
    """HC-SR501 PIR motion sensor standing in the breadboard: pins VCC, OUT, GND in a row, its green board above them
    with the white Fresnel dome; while it sees motion, waves round the dome. Drawn smaller than real (32 × 24 mm)."""
    cx, y = out[0], out[1]
    w, h = 84, 74
    top = y - 16 - h
    o = ['<g class="pir">']
    if motion:
        for r, op in ((40, .5), (50, .32), (60, .18)):
            o.append(f'<path d="M{f(cx - r * .8)},{f(top + 30 - r * .55)} A{r} {r} 0 0 1 {f(cx + r * .8)},{f(top + 30 - r * .55)}" stroke="#e8590c" stroke-width="2" fill="none" opacity="{op}"/>')
    o.append(f'<rect x="{f(cx - w / 2)}" y="{f(top)}" width="{w}" height="{h}" rx="4" fill="#2f7d3f" stroke="#1f5a2b" filter="url(#lift)"/>')
    o.append(f'<circle cx="{f(cx)}" cy="{f(top + 32)}" r="27" fill="#f4f4f1" stroke="#d3d3cc"/>')
    for r in (20, 13, 6):
        o.append(f'<circle cx="{f(cx)}" cy="{f(top + 32)}" r="{r}" fill="none" stroke="#e2e2db" stroke-width="1.2"/>')
    o.append(f'<ellipse cx="{f(cx - 9)}" cy="{f(top + 22)}" rx="7" ry="4" fill="#fff" opacity=".8"/>')
    o.append(_header([vcc, out, gnd], ("VCC", "OUT", "GND"), top + h))
    return "".join(o) + "</g>"


def line_sensor(out, gnd, vcc, over_line: bool = False) -> str:
    """TCRT5000 IR line sensor module standing in the breadboard: pins OUT, GND, VCC; its blue board above with the
    blue trimmer, the power LED and the signal LED (lit over white: OUT low), the TCRT5000 at the far end looking at
    the surface — drawn as a strip, white, or with the black line under it."""
    cx, y = gnd[0], gnd[1]
    w, h = 50, 84
    top = y - 16 - h
    o = ['<g class="line-sensor">']
    o.append(f'<rect x="{f(cx - 30)}" y="{f(top - 22)}" width="60" height="16" rx="3" fill="#fbfbf8" stroke="#cfcfc6"/>')
    if over_line:
        o.append(f'<rect x="{f(cx - 30)}" y="{f(top - 19)}" width="60" height="10" fill="#1b1c1f"/>')
    o.append(f'<rect x="{f(cx - w / 2)}" y="{f(top)}" width="{w}" height="{h}" rx="3" fill="#2457a6" stroke="#173c78" filter="url(#lift)"/>')
    o.append(f'<rect x="{f(cx - 14)}" y="{f(top + 4)}" width="28" height="14" rx="2" fill="#1c1e21"/>'
             f'<circle cx="{f(cx - 6.5)}" cy="{f(top + 11)}" r="4.2" fill="#3a63c9"/><circle cx="{f(cx + 6.5)}" cy="{f(top + 11)}" r="4.2" fill="#121314"/>')
    o.append(f'<rect x="{f(cx - 9)}" y="{f(top + 30)}" width="18" height="18" rx="2" fill="#2f74d8" stroke="#1d4f9e"/>'
             f'<circle cx="{f(cx)}" cy="{f(top + 39)}" r="5" fill="#e9ebee"/><line x1="{f(cx - 3)}" y1="{f(top + 39)}" x2="{f(cx + 3)}" y2="{f(top + 39)}" stroke="#6b7280" stroke-width="1.4"/>')
    o.append(f'<rect x="{f(cx - 16)}" y="{f(top + 56)}" width="7" height="4" rx="1" fill="#ff5a4a"/>'
             f'<rect x="{f(cx + 9)}" y="{f(top + 56)}" width="7" height="4" rx="1" fill="{"#3a3d42" if over_line else "#34d058"}"/>')
    if not over_line:
        o.append(f'<circle cx="{f(cx + 12.5)}" cy="{f(top + 58)}" r="7" fill="url(#glow-green)"/>')
    o.append(f'<circle cx="{f(cx - 12.5)}" cy="{f(top + 58)}" r="7" fill="url(#glow-red)" opacity=".7"/>')
    o.append(_header([out, gnd, vcc], ("OUT", "GND", "VCC"), top + h))
    return "".join(o) + "</g>"


def soil_sensor(aout, vcc, gnd, moisture: float = 0.35) -> str:
    """Capacitive soil moisture sensor v1.2 standing in the breadboard: pins AOUT, VCC, GND; its long black board above
    with the probe end in a pot of soil, as wet as `moisture` (0 dry – 1 in water)."""
    cx, y = vcc[0], vcc[1]
    w, h = 46, 130
    top = y - 16 - h
    o = ['<g class="soil">']
    o.append(f'<rect x="{f(cx - w / 2)}" y="{f(top)}" width="{w}" height="{h}" rx="4" fill="#1d1f22" stroke="#0e0f11" filter="url(#lift)"/>')
    o.append(f'<path d="M{f(cx - w / 2)},{f(top + 70)} h{w} M{f(cx - 18)},{f(top + 70)} v-60 l18,-8 l18,8 v60" stroke="#e8d49a" stroke-width="1.2" fill="none" opacity=".6"/>')
    o.append(f'<rect x="{f(cx - 11)}" y="{f(top + 82)}" width="22" height="12" rx="1.5" fill="#2b2e33"/><rect x="{f(cx - 5)}" y="{f(top + 100)}" width="10" height="7" rx="1" fill="#2b2e33"/>')
    # the pot of soil round the probe's end
    r = int(0x8a + (0x4a - 0x8a) * moisture); g = int(0x5b + (0x2f - 0x5b) * moisture); b = int(0x34 + (0x1c - 0x34) * moisture)
    o.append(f'<path d="M{f(cx - 34)},{f(top + 14)} h68 l-6,48 h-56 z" fill="#{r:02x}{g:02x}{b:02x}" opacity=".93"/>'
             f'<path d="M{f(cx - 36)},{f(top + 10)} h72 v6 h-72 z" fill="#b5651d"/>')
    for i in range(int(round(moisture * 4))):
        dx = (-20, 14, -6, 22)[i]
        o.append(f'<path d="M{f(cx + dx)},{f(top + 26 + i * 8)} q3,5 0,7 q-3,-2 0,-7z" fill="#7fb4ff" opacity=".9"/>')
    o.append(_header([aout, vcc, gnd], ("AOUT", "VCC", "GND"), top + h))
    return "".join(o) + "</g>"


def temp_sensor(vs, vout, gnd, kind: str = "TMP36") -> str:
    """TMP36 or LM35 in a TO-92 package, its flat face towards you: legs +Vs, Vout, GND; the body above them."""
    cx, y = vout[0], vout[1]
    o = ['<g class="temp">']
    for x, yy in (vs, vout, gnd):
        o.append(f'<line x1="{x}" y1="{yy}" x2="{f(cx + (x - cx) * .45)}" y2="{f(y - 18)}" stroke="#a5abb2" stroke-width="1.7"/>')
    o.append(f'<path d="M{f(cx - 13)},{f(y - 18)} v-20 a13 9 0 0 1 26 0 v20 z" fill="#1f2125" stroke="#0e0f11" filter="url(#lift)"/>'
             f'<text x="{f(cx)}" y="{f(y - 26)}" font-size="5.5" font-weight="700" fill="#cfd3d8" text-anchor="middle" font-family="JetBrains Mono">{kind}</text>')
    for x, lab in zip((vs[0], vout[0], gnd[0]), ("+Vs", "Vout", "GND")):
        o.append(f'<text x="{x}" y="{f(y + 11)}" font-size="5" font-weight="700" fill="#6b7280" text-anchor="middle" font-family="Inter">{lab}</text>')
    return "".join(o) + "</g>"


def dht(vcc, data, gnd, kind: str = "DHT22") -> str:
    """DHT11 (blue) or DHT22 (white) on its 3-pin module standing in the breadboard: pins VCC, DATA, GND; the grilled
    case above them, its name under the grille."""
    cx, y = data[0], data[1]
    top = y - 16 - 72
    case = "#3f8fe0" if kind == "DHT11" else "#f4f4f1"
    hole = "#1f5ea8" if kind == "DHT11" else "#c9cdd2"
    o = ['<g class="dht">']
    o.append(f'<rect x="{f(cx - 26)}" y="{f(top + 46)}" width="52" height="26" rx="3" fill="#2457a6" stroke="#173c78" filter="url(#lift)"/>')
    o.append(f'<rect x="{f(cx - 19)}" y="{f(top)}" width="38" height="52" rx="3" fill="{case}" stroke="#9aa1a9" filter="url(#lift)"/>')
    for c in range(4):
        for r in range(6):
            o.append(f'<rect x="{f(cx - 14 + c * 8)}" y="{f(top + 5 + r * 7)}" width="4" height="4" rx=".6" fill="{hole}"/>')
    o.append(f'<text x="{f(cx)}" y="{f(top + 64)}" font-size="6" font-weight="700" fill="#e3eef9" text-anchor="middle" font-family="JetBrains Mono">{kind}</text>')
    o.append(_header([vcc, data, gnd], ("VCC", "DATA", "GND"), top + 72))
    return "".join(o) + "</g>"


def mpu6050(pins, tilt=(0, 0)) -> str:
    """MPU6050 on its GY-521 board standing in the breadboard: 8 pins VCC GND SCL SDA XDA XCL AD0 INT in a row; the board
    above with the chip and the X / Y arrows printed on it; a small level shows its tilt (degrees about Y, about X)."""
    xs = [x for x, _ in pins]
    cx, y = (xs[0] + xs[-1]) / 2, pins[0][1]
    w, h = xs[-1] - xs[0] + 24, 74
    top = y - 16 - h
    o = ['<g class="mpu6050">']
    o.append(f'<rect x="{f(cx - w / 2)}" y="{f(top)}" width="{f(w)}" height="{h}" rx="4" fill="#3b5bb7" stroke="#26408a" filter="url(#lift)"/>')
    for hx in (cx - w / 2 + 9, cx + w / 2 - 9):
        o.append(f'<circle cx="{f(hx)}" cy="{f(top + 9)}" r="4" fill="#f6f4ef" stroke="#c9b26a" stroke-width="1.6"/>')
    o.append(f'<rect x="{f(cx - 14)}" y="{f(top + 16)}" width="28" height="28" rx="2" fill="#1c1e21"/><circle cx="{f(cx - 10)}" cy="{f(top + 20)}" r="1.4" fill="#5e656d"/>')
    ax, ay = cx + 30, top + 40
    o.append(f'<path d="M{f(ax)},{f(ay)} h18 M{f(ax + 14)},{f(ay - 3)} l4,3 l-4,3 M{f(ax)},{f(ay)} v-18 M{f(ax - 3)},{f(ay - 14)} l3,-4 l3,4" stroke="#e3eef9" stroke-width="1.3" fill="none"/>'
             f'<text x="{f(ax + 22)}" y="{f(ay + 2)}" font-size="6" font-weight="700" fill="#e3eef9" font-family="Inter">X</text>'
             f'<text x="{f(ax - 2)}" y="{f(ay - 22)}" font-size="6" font-weight="700" fill="#e3eef9" font-family="Inter">Y</text>')
    # the level: a bubble moved by the tilt
    lx, ly = cx - 40, top + 30
    tx, ty = tilt
    o.append(f'<circle cx="{f(lx)}" cy="{f(ly)}" r="12" fill="#e9f5ea" stroke="#9fd8b6"/><circle cx="{f(lx)}" cy="{f(ly)}" r="4.5" fill="none" stroke="#9fd8b6"/>'
             f'<circle cx="{f(lx - 8 * math.sin(math.radians(tx)))}" cy="{f(ly + 8 * math.sin(math.radians(ty)))}" r="3.6" fill="#2fb56a"/>')
    o.append(_header(pins, ("VCC", "GND", "SCL", "SDA", "XDA", "XCL", "AD0", "INT"), top + h))
    return "".join(o) + "</g>"


def hcsr04_in(vcc, trig, echo, gnd, up: bool = True, cm: float = 0) -> str:
    """HC-SR04 standing in the breadboard: pins VCC, Trig, Echo, GND in a row, its board standing over them — above
    the holes when `up` (turned to face away from the breadboard), below them as screen 07 drew it; while it measures,
    the sound going out (`cm` > 0)."""
    cx, y = (vcc[0] + gnd[0]) / 2, vcc[1]
    w, h = 226, 100
    s = -1 if up else 1
    near = y + s * 16                     # the board's edge by the pins
    far = near + s * h
    top = min(near, far)
    o = ['<g class="hcsr04">']
    o.append(f'<rect x="{f(cx - w / 2)}" y="{f(top)}" width="{w}" height="{h}" rx="5" fill="#1f6fb5" stroke="#134a7b" filter="url(#lift)"/>')
    for tx in (cx - w / 2 + 54, cx + w / 2 - 54):
        ty = top + h / 2 + (-4 if up else 4)
        o.append(f'<circle cx="{f(tx)}" cy="{f(ty)}" r="38" fill="#c9cdd2" stroke="#8f969f"/>'
                 f'<circle cx="{f(tx)}" cy="{f(ty)}" r="30" fill="#4d545c" opacity=".55"/>'
                 f'<circle cx="{f(tx)}" cy="{f(ty)}" r="22" fill="none" stroke="#9aa1a9" stroke-dasharray="2 2"/>')
        if cm:
            for r, op in ((48, .55), (58, .35), (68, .2)):
                yy = top - 4 if up else top + h + 4
                o.append(f'<path d="M{f(tx - r * .6)},{f(yy + s * r * .25)} A{r} {r} 0 0 {1 if up else 0} {f(tx + r * .6)},{f(yy + s * r * .25)}" stroke="#2563d9" stroke-width="2" fill="none" opacity="{op}"/>')
    o.append(f'<rect x="{f(cx - 12)}" y="{f(top + h / 2 - 5)}" width="24" height="10" rx="5" fill="#c9cdd2"/>')
    o.append(f'<text x="{f(cx)}" y="{f(top + (14 if up else h - 8))}" font-size="7" fill="#d5e6f7" text-anchor="middle" font-family="JetBrains Mono" font-weight="600">HC-SR04</text>')
    xs = [p[0] for p in (vcc, trig, echo, gnd)]
    o.append(f'<rect x="{f(min(xs) - 7)}" y="{f(y + s * 7 - (7 if up else 0))}" width="{f(max(xs) - min(xs) + 14)}" height="7" rx="1" fill="#26282c"/>')
    for (x, yy), lab in zip((vcc, trig, echo, gnd), ("VCC", "Trig", "Echo", "GND")):
        o.append(f'<line x1="{x}" y1="{yy}" x2="{x}" y2="{f(near)}" stroke="#c7ccd2" stroke-width="1.8"/>'
                 f'<text x="{x}" y="{f(near + s * 9 + (2 if not up else 0))}" font-size="5.5" font-weight="700" fill="#e3eef9" text-anchor="middle" font-family="Inter">{lab}</text>')
    return "".join(o) + "</g>"


# ------------------------------------------------------------------ the SunFounder kit's modules (M6.5, Rev 8)
PCB_BLUE, PCB_RED, PCB_BLACK = ("#2457a6", "#173c78"), ("#b8322a", "#7d1f19"), ("#26282c", "#0f1012")


def _trimpot(x, y):
    return (f'<rect x="{f(x - 5)}" y="{f(y - 5)}" width="10" height="10" rx="1.5" fill="#2f74d8" stroke="#1d4f9e"/>'
            f'<circle cx="{f(x)}" cy="{f(y)}" r="3" fill="#e9ebee"/><line x1="{f(x - 2)}" y1="{f(y)}" x2="{f(x + 2)}" y2="{f(y)}" stroke="#6b7280"/>')


def _leds(x, y, on=True):
    """A module's power LED (red) and signal LED (green, lit when `on`)."""
    o = f'<rect x="{f(x - 9)}" y="{f(y)}" width="6" height="3.5" rx="1" fill="#ff5a4a"/>'
    o += f'<rect x="{f(x + 3)}" y="{f(y)}" width="6" height="3.5" rx="1" fill="{"#34d058" if on else "#3a3d42"}"/>'
    if on:
        o += f'<circle cx="{f(x + 6)}" cy="{f(y + 2)}" r="6" fill="url(#glow-green)"/>'
    return o


def kit_module(pins, labels, pcb=PCB_BLUE, h=64, element=None, above="") -> str:
    """A small module standing in the breadboard: its pins in a row, its board above them — as wide as the pins and 7 px
    beyond, so modules one column apart don't overlap — `element(cx, top, w, h)` drawn on it, `above` over its top edge."""
    xs = [x for x, _ in pins]
    cx, y = (xs[0] + xs[-1]) / 2, pins[0][1]
    w = xs[-1] - xs[0] + 14
    top = y - 16 - h
    o = ['<g class="kit-module">', above]
    o.append(f'<rect x="{f(cx - w / 2)}" y="{f(top)}" width="{f(w)}" height="{h}" rx="3" fill="{pcb[0]}" stroke="{pcb[1]}" filter="url(#lift)"/>')
    if element:
        o.append(element(cx, top, w, h))
    o.append(_header(pins, labels, top + h))
    return "".join(o) + "</g>"


def kit_button(pins, pressed=False):
    def el(cx, top, w, h):
        return (f'<rect x="{f(cx - 9)}" y="{f(top + 12)}" width="18" height="18" rx="2" fill="#8d949c" stroke="#5e656d"/>'
                f'<circle cx="{f(cx)}" cy="{f(top + 21 + (1 if pressed else 0))}" r="{5.5 if pressed else 6}" fill="{"#1f4c96" if pressed else "#2f6fd6"}"/>')
    return kit_module(pins, ("S", "VCC", "GND"), PCB_BLACK, element=el)


def kit_touch(pins, touched=False):
    def el(cx, top, w, h):
        o = (f'<circle cx="{f(cx)}" cy="{f(top + 22)}" r="13" fill="none" stroke="#e8c26a" stroke-width="2"/>'
             f'<text x="{f(cx)}" y="{f(top + 46)}" font-size="5.5" font-weight="700" fill="#f6d9d6" text-anchor="middle" font-family="Inter">TOUCH</text>')
        if touched:
            o += f'<ellipse cx="{f(cx + 2)}" cy="{f(top + 20)}" rx="11" ry="13" fill="#e9b48f" opacity=".85" stroke="#c98b63"/>'
        return o
    return kit_module(pins, ("SIG", "VCC", "GND"), PCB_RED, element=el)


def kit_vibration(pins, shaking=False):
    def el(cx, top, w, h):
        o = (f'<rect x="{f(cx - 12)}" y="{f(top + 8)}" width="24" height="10" rx="5" fill="#c7ccd2" stroke="#8f969f"/>'
             f'{_trimpot(cx, top + 32)}{_leds(cx, top + 48, shaking)}')
        if shaking:
            o += "".join(f'<path d="M{f(cx + s * 16)},{f(top + 6)} q{s * 3},5 0,10 q{-s * 3},5 0,10" stroke="#e8590c" stroke-width="1.5" fill="none"/>' for s in (-1, 1))
        return o
    return kit_module(pins, ("VCC", "GND", "DO"), element=el)


def kit_ir_obstacle(pins, obstacle=False):
    def el(cx, top, w, h):
        return (f'<circle cx="{f(cx - 8)}" cy="{f(top + 9)}" r="5.5" fill="#e9f0fa" stroke="#9aa1a9"/><circle cx="{f(cx + 8)}" cy="{f(top + 9)}" r="5.5" fill="#1c1e21"/>'
                f'{_trimpot(cx, top + 30)}{_leds(cx, top + 48, obstacle)}')
    above = f'<rect x="{f((pins[0][0] + pins[-1][0]) / 2 - 18)}" y="{f(pins[0][1] - 16 - 64 - 26)}" width="36" height="16" rx="2" fill="#c08a52" stroke="#8a5c2e"/>' if obstacle else ""
    return kit_module(pins, ("OUT", "GND", "VCC"), element=el, above=above)


def kit_hall(pins, magnet=False):
    def el(cx, top, w, h):
        return (f'<path d="M{f(cx - 6)},{f(top + 22)} v-8 a6,4 0 0 1 12,0 v8 z" fill="#1f2125"/>'
                f'<text x="{f(cx)}" y="{f(top + 30)}" font-size="4.5" fill="#cfd3d8" text-anchor="middle" font-family="JetBrains Mono">3144</text>{_leds(cx, top + 48, magnet)}')
    cx = (pins[0][0] + pins[-1][0]) / 2
    above = (f'<rect x="{f(cx - 18)}" y="{f(pins[0][1] - 16 - 64 - 22)}" width="18" height="12" fill="#d94545"/><rect x="{f(cx)}" y="{f(pins[0][1] - 16 - 64 - 22)}" width="18" height="12" fill="#3b6fd8"/>'
             f'<text x="{f(cx - 9)}" y="{f(pins[0][1] - 16 - 64 - 13)}" font-size="7" font-weight="700" fill="#fff" text-anchor="middle">N</text><text x="{f(cx + 9)}" y="{f(pins[0][1] - 16 - 64 - 13)}" font-size="7" font-weight="700" fill="#fff" text-anchor="middle">S</text>') if magnet else ""
    return kit_module(pins, ("S", "VCC", "GND"), element=el, above=above)


def kit_flame(pins, flame=0.0):
    def el(cx, top, w, h):
        return f'<circle cx="{f(cx)}" cy="{f(top + 10)}" r="6" fill="#1c1e21"/>{_trimpot(cx, top + 30)}{_leds(cx, top + 48, flame >= .5)}'
    cx = (pins[0][0] + pins[-1][0]) / 2
    t = pins[0][1] - 16 - 64
    above = (f'<path d="M{f(cx)},{f(t - 34)} q12,14 6,26 q-6,8 -12,0 q-6,-12 6,-26z" fill="#ff8a00" opacity="{f(.4 + .6 * flame)}"/>'
             f'<path d="M{f(cx)},{f(t - 22)} q6,8 3,14 q-3,4 -6,0 q-3,-6 3,-14z" fill="#ffd43b"/>') if flame else ""
    return kit_module(pins, ("AO", "GND", "VCC", "DO"), element=el, above=above)


def kit_raindrop(pins, wet=0.0):
    def el(cx, top, w, h):
        return f'{_trimpot(cx, top + 30)}{_leds(cx, top + 48, wet >= .4)}'
    cx = (pins[0][0] + pins[-1][0]) / 2
    t = pins[0][1] - 16 - 64
    plate = (f'<rect x="{f(cx - 26)}" y="{f(t - 40)}" width="52" height="34" rx="2" fill="#2f7d3f" stroke="#1f5a2b"/>'
             f'<path d="M{f(cx - 20)},{f(t - 34)} h40 M{f(cx - 20)},{f(t - 28)} h40 M{f(cx - 20)},{f(t - 22)} h40 M{f(cx - 20)},{f(t - 16)} h40" stroke="#d6b24c" stroke-width="1.6"/>'
             f'<path d="M{f(cx - 8)},{f(t - 6)} v6 M{f(cx + 8)},{f(t - 6)} v6" stroke="#a5abb2" stroke-width="1.6"/>')
    for i in range(int(round(wet * 5))):
        dx, dy = (-14, 6, -2, 16, -18)[i], (-36, -30, -24, -20, -18)[i]
        plate += f'<path d="M{f(cx + dx)},{f(t + dy)} q3,5 0,7 q-3,-2 0,-7z" fill="#7fb4ff"/>'
    return kit_module(pins, ("AO", "DO", "GND", "VCC"), element=el, above=plate)


def kit_water(pins, level=0.0):
    def el(cx, top, w, h):
        o = "".join(f'<line x1="{f(cx - 10 + i * 5)}" y1="{f(top + 6)}" x2="{f(cx - 10 + i * 5)}" y2="{f(top + 66)}" stroke="#e8c26a" stroke-width="1.6"/>' for i in range(5))
        if level:
            o += f'<rect x="{f(cx - w / 2 - 4)}" y="{f(top - 2)}" width="{f(w + 8)}" height="{f(70 * level)}" fill="#7fb4ff" opacity=".55"/>'
        return o
    return kit_module(pins, ("S", "VCC", "GND"), PCB_RED, h=84, element=el)


def kit_mq2(pins, gas=0.0, hot=True):
    def el(cx, top, w, h):
        o = ''
        if hot:
            o += f'<circle cx="{f(cx)}" cy="{f(top + 20)}" r="20" fill="url(#glow-amber)" opacity=".7"/>'
        o += (f'<circle cx="{f(cx)}" cy="{f(top + 20)}" r="15" fill="#c7ccd2" stroke="#8f969f"/>'
              f'<circle cx="{f(cx)}" cy="{f(top + 20)}" r="11" fill="url(#mesh)" stroke="#9aa1a9"/><circle cx="{f(cx)}" cy="{f(top + 20)}" r="11" fill="#6d747c" opacity=".35"/>'
              f'{_leds(cx, top + 48, gas >= .4)}')
        return o
    cx = (pins[0][0] + pins[-1][0]) / 2
    t = pins[0][1] - 16 - 64
    above = "".join(f'<circle cx="{f(cx + dx)}" cy="{f(t - dy)}" r="{r}" fill="#9aa1a9" opacity="{f(.25 + .4 * gas)}"/>' for dx, dy, r in ((-10, 10, 8), (6, 16, 10), (16, 6, 7))) if gas else ""
    return kit_module(pins, ("AO", "DO", "GND", "VCC"), element=el, above=above)


def kit_ldr(pins):
    def el(cx, top, w, h):
        return (f'<circle cx="{f(cx)}" cy="{f(top + 18)}" r="9" fill="#f2d7a6" stroke="#c9a46a"/>'
                f'<path d="M{f(cx - 5)},{f(top + 14)} h10 v3 h-10 v3 h10 v3 h-10" stroke="#a5582d" stroke-width="1.1" fill="none"/>{_leds(cx, top + 48, False)}')
    return kit_module(pins, ("S", "VCC", "GND"), element=el)


def kit_pot(pins, angle=0):
    def el(cx, top, w, h):
        a = math.radians(angle - 90)
        return (f'<rect x="{f(cx - 15)}" y="{f(top + 6)}" width="30" height="30" rx="3" fill="#2b5fa8" stroke="#1b3f73"/>'
                f'<circle cx="{f(cx)}" cy="{f(top + 21)}" r="11" fill="#e9ebee" stroke="#9ba2aa"/>'
                f'<line x1="{f(cx)}" y1="{f(top + 21)}" x2="{f(cx + 9 * math.cos(a))}" y2="{f(top + 21 + 9 * math.sin(a))}" stroke="#2d3136" stroke-width="2.2" stroke-linecap="round"/>')
    return kit_module(pins, ("S", "VCC", "GND"), element=el)


def kit_joystick(pins, x=0.5, y=0.5):
    def el(cx, top, w, h):
        dx, dy = (x - .5) * 22, (.5 - y) * 22
        return (f'<circle cx="{f(cx)}" cy="{f(top + 34)}" r="27" fill="#c7ccd2" stroke="#8f969f"/>'
                f'<circle cx="{f(cx + dx)}" cy="{f(top + 34 + dy)}" r="17" fill="#2d3136" stroke="#0f1012"/>'
                f'<circle cx="{f(cx + dx)}" cy="{f(top + 34 + dy)}" r="12" fill="none" stroke="#4a4e54" stroke-dasharray="2 2"/>')
    return kit_module(pins, ("GND", "VCC", "VRx", "VRy", "SW"), PCB_BLACK, h=74, element=el)


def kit_encoder(pins, turning=False):
    def el(cx, top, w, h):
        o = (f'<rect x="{f(cx - 17)}" y="{f(top + 12)}" width="34" height="34" rx="3" fill="#8d949c" stroke="#5e656d"/>'
             f'<circle cx="{f(cx)}" cy="{f(top + 29)}" r="13" fill="#c7ccd2" stroke="#8f969f"/><path d="M{f(cx - 9)},{f(top + 24)} h18" stroke="#6d747c" stroke-width="2"/>')
        if turning:
            o += f'<path d="M{f(cx + 22)},{f(top + 14)} A26 26 0 0 1 {f(cx + 22)},{f(top + 44)}" stroke="#e8590c" stroke-width="2" fill="none"/><path d="M{f(cx + 18)},{f(top + 42)} l4,3 l3,-4" stroke="#e8590c" stroke-width="2" fill="none"/>'
        return o
    return kit_module(pins, ("CLK", "DT", "SW", "VCC", "GND"), h=70, element=el)


def kit_speed(pins, rpm=0):
    def el(cx, top, w, h):
        return (f'<rect x="{f(cx - 14)}" y="{f(top + 4)}" width="9" height="22" rx="1" fill="#1c1e21"/><rect x="{f(cx + 5)}" y="{f(top + 4)}" width="9" height="22" rx="1" fill="#1c1e21"/>'
                f'{_leds(cx, top + 48, rpm > 0)}')
    cx = (pins[0][0] + pins[-1][0]) / 2
    t = pins[0][1] - 16 - 64
    wheel = (f'<circle cx="{f(cx)}" cy="{f(t - 12)}" r="26" fill="#e8b10f" stroke="#a87e08"/>'
             + "".join(f'<rect x="{f(cx - 2)}" y="{f(t - 36)}" width="4" height="7" fill="#f6f4ef" transform="rotate({k * 18} {f(cx)} {f(t - 12)})"/>' for k in range(20))
             + f'<circle cx="{f(cx)}" cy="{f(t - 12)}" r="5" fill="#a87e08"/>')
    if rpm:
        wheel += f'<path d="M{f(cx - 32)},{f(t - 30)} A34 34 0 0 1 {f(cx - 10)},{f(t - 44)}" stroke="#e8590c" stroke-width="2" fill="none"/>'
    return kit_module(pins, ("VCC", "GND", "DO"), element=el, above=wheel)


PCB_PURPLE, PCB_GREEN = ("#5b3fa0", "#3b2875"), ("#2f7d3f", "#1f5a2b")


def _soic(cx, y, w=16, h=10, label=""):
    o = f'<rect x="{f(cx - w / 2)}" y="{f(y)}" width="{w}" height="{h}" rx="1" fill="#1c1e21"/>'
    o += "".join(f'<rect x="{f(cx - w / 2 + 2 + i * (w - 4) / 3 - 1)}" y="{f(y - 2)}" width="2" height="2" fill="#c7ccd2"/><rect x="{f(cx - w / 2 + 2 + i * (w - 4) / 3 - 1)}" y="{f(y + h)}" width="2" height="2" fill="#c7ccd2"/>' for i in range(4))
    if label:
        o += f'<text x="{f(cx)}" y="{f(y + h / 2 + 2)}" font-size="3.6" fill="#9aa1a9" text-anchor="middle" font-family="JetBrains Mono">{label}</text>'
    return o


def chip_pcf8591(pins, aout=0.0):
    def el(cx, top, w, h):
        o = _soic(cx, top + 12, 20, 12, "PCF8591")
        o += "".join(f'<rect x="{f(cx - 40 + i * 12)}" y="{f(top + 34)}" width="6" height="9" rx="1" fill="#1c1e21"/><rect x="{f(cx - 39 + i * 12)}" y="{f(top + 35)}" width="4" height="4" fill="#e8b10f"/>' for i in range(3))
        o += f'<rect x="{f(cx + 26)}" y="{f(top + 36)}" width="6" height="3.5" rx="1" fill="{"#ff5a4a" if aout > 0 else "#5a2a27"}"/>'
        if aout > 0:
            o += f'<circle cx="{f(cx + 29)}" cy="{f(top + 38)}" r="{f(4 + 6 * aout)}" fill="url(#glow-red)"/>'
        return o
    return kit_module(pins, ("AOUT", "AIN3", "AIN2", "AIN1", "AIN0", "SCL", "SDA", "GND", "VCC"), PCB_BLUE, h=58, element=el)


def chip_bmp280(pins):
    def el(cx, top, w, h):
        return (f'<rect x="{f(cx - 7)}" y="{f(top + 14)}" width="14" height="14" rx="1.5" fill="#c7ccd2" stroke="#8f969f"/>'
                f'<circle cx="{f(cx + 3.5)}" cy="{f(top + 17.5)}" r="1.2" fill="#6d747c"/>'
                f'<text x="{f(cx)}" y="{f(top + 44)}" font-size="5" font-weight="700" fill="#e3dff5" text-anchor="middle" font-family="Inter">BMP280</text>')
    return kit_module(pins, ("VCC", "GND", "SCL", "SDA", "CSB", "SDO"), PCB_PURPLE, h=58, element=el)


def chip_ds18b20(pins):
    def el(cx, top, w, h):
        return (f'<path d="M{f(cx - 9)},{f(top + 34)} v-14 a9,6 0 0 1 18,0 v14 z" fill="#1f2125"/>'
                f'<text x="{f(cx)}" y="{f(top + 29)}" font-size="3.6" fill="#cfd3d8" text-anchor="middle" font-family="JetBrains Mono">18B20</text>'
                f'<rect x="{f(cx + 9)}" y="{f(top + 40)}" width="8" height="4" rx="1" fill="#e3cb98"/>')
    return kit_module(pins, ("S", "VCC", "GND"), PCB_BLUE, h=58, element=el)


def chip_ds1302(pins):
    def el(cx, top, w, h):
        return (f'<circle cx="{f(cx)}" cy="{f(top + 22)}" r="17" fill="#c7ccd2" stroke="#8f969f"/>'
                f'<text x="{f(cx)}" y="{f(top + 24)}" font-size="5" font-weight="700" fill="#6d747c" text-anchor="middle" font-family="Inter">CR2032</text>'
                f'{_soic(cx - 14, top + 46, 14, 8)}'
                f'<rect x="{f(cx + 6)}" y="{f(top + 46)}" width="16" height="6" rx="3" fill="#c7ccd2" stroke="#8f969f"/>')
    return kit_module(pins, ("VCC", "GND", "CLK", "DAT", "RST"), PCB_GREEN, h=64, element=el)


def chip_vl53l0x(pins, measuring=False):
    def el(cx, top, w, h):
        return (f'<rect x="{f(cx - 9)}" y="{f(top + 12)}" width="18" height="9" rx="1.5" fill="#1c1e21"/>'
                f'<circle cx="{f(cx - 4)}" cy="{f(top + 16.5)}" r="2" fill="#3a3d42"/><circle cx="{f(cx + 4)}" cy="{f(top + 16.5)}" r="2" fill="#3a3d42"/>'
                f'<text x="{f(cx)}" y="{f(top + 44)}" font-size="5" font-weight="700" fill="#e3dff5" text-anchor="middle" font-family="Inter">VL53L0X</text>')
    cx = (pins[0][0] + pins[-1][0]) / 2
    t = pins[0][1] - 16 - 58
    beam = (f'<path d="M{f(cx - 4)},{f(t + 12)} L{f(cx - 4)},{f(t - 46)}" stroke="#e8432a" stroke-width="1.6" stroke-dasharray="3 3"/>'
            f'<rect x="{f(cx - 22)}" y="{f(t - 56)}" width="44" height="10" rx="2" fill="#c08a52" stroke="#8a5c2e"/>') if measuring else ""
    return kit_module(pins, ("VIN", "GND", "SCL", "SDA", "GPIO1", "XSHUT"), PCB_PURPLE, h=58, element=el, above=beam)


def chip_max30102(pins, finger=False):
    def el(cx, top, w, h):
        o = (f'<rect x="{f(cx - 8)}" y="{f(top + 12)}" width="16" height="12" rx="2" fill="#1c1e21"/>'
             f'<rect x="{f(cx - 6)}" y="{f(top + 14)}" width="5" height="8" rx="1" fill="#8a1d1d"/><rect x="{f(cx + 1)}" y="{f(top + 14)}" width="5" height="8" rx="1" fill="#2a2d33"/>'
             f'<text x="{f(cx)}" y="{f(top + 44)}" font-size="5" font-weight="700" fill="#e3dff5" text-anchor="middle" font-family="Inter">MAX30102</text>')
        if finger:
            o += (f'<path d="M{f(cx - 14)},{f(top + 40)} q-2,-30 14,-34 q16,4 14,34 z" fill="#e9b48f" opacity=".92" stroke="#c98b63"/>'
                  f'<ellipse cx="{f(cx)}" cy="{f(top + 12)}" rx="8" ry="4" fill="#f4d3bd" opacity=".9"/>'
                  f'<circle cx="{f(cx)}" cy="{f(top + 22)}" r="14" fill="url(#glow-red)" opacity=".6"/>')
        return o
    return kit_module(pins, ("VIN", "SCL", "SDA", "INT", "GND"), PCB_PURPLE, h=58, element=el)


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


MBIT_RINGS = [("P0", "0"), ("P1", "1"), ("P2", "2"), ("3.3V", "3V"), ("GND", "GND")]


def microbit_bare(x: float, y: float, image=None, a_pressed: bool = False, sound: bool = False):
    """The micro:bit V2 on its own (screen 24): 320 × 258 from (x, y), its five big rings along the bottom edge.
    Returns (svg, {pin id: (x, y)}): the rings' centres, keyed as the GPIO board's header (P0, P1, P2, 3.3V, GND),
    so a wire on a ring stays on the same pin when the micro:bit goes into its GPIO board."""
    W, H = 320, 258
    ey = y + H - 58
    pins = {pid: (x + bx, ey + 15) for (pid, _), bx in zip(MBIT_RINGS, (34, 102, 160, 218, 286))}
    return '<g class="board microbit">' + _microbit_face(x, y, image, a_pressed, sound) + "</g>", pins


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


# ------------------------------------------------------------------ M7 slice 1: actuators (screens 25, 25b, 25c)
def screw_block(x, y, labels, pitch: float = 11, label_above: bool = True):
    """A green screw terminal block, its screws left to right from (x, y) (the first screw's centre), one `pitch`
    apart. A wire's end goes into a screw: each screw is a point to wire, like a board's pin (M7: terminals).
    Returns (svg, {label: (x, y)})."""
    n = len(labels)
    w = (n - 1) * pitch + 10
    o = [f'<rect x="{f(x - 5)}" y="{f(y - 6)}" width="{f(w)}" height="12" rx="1.5" fill="#2f9d57" stroke="#1d6b3a"/>']
    pts = {}
    for i, lab in enumerate(labels):
        sx = x + i * pitch
        pts[lab] = (sx, y)
        o.append(f'<circle cx="{f(sx)}" cy="{f(y)}" r="3.8" fill="#c7ccd2" stroke="#7d848c" stroke-width=".7"/>'
                 f'<line x1="{f(sx - 2.4)}" y1="{f(y - 1.2)}" x2="{f(sx + 2.4)}" y2="{f(y + 1.2)}" stroke="#5e656d" stroke-width="1"/>')
        ty = y - 9 if label_above else y + 14
        o.append(f'<text x="{f(sx)}" y="{f(ty)}" font-size="5.2" font-weight="700" fill="#e9edf2" stroke="#1b1d20" stroke-width="1.6" '
                 f'paint-order="stroke" text-anchor="middle" font-family="Inter">{lab}</text>')
    return "".join(o), pts


def servo_in(pins, angle: float = 90, top: float | None = None, powered: bool = True) -> str:
    """An SG90 servo by its cable: the 3-pin plug in three holes in a row — S (orange), + (red), − (brown) — and the
    servo above the breadboard, its arm at `angle` (0–180°). `top`: where its shaft is."""
    (sx, sy), (vx, _), (gx, _) = pins
    cx = vx
    top = top if top is not None else sy - 150
    o = ['<g class="servo-in">']
    for (px, py), dx, col in ((pins[0], -6, "#f08024"), (pins[1], 0, "#de3b3b"), (pins[2], 6, "#8b5a3a")):
        o.append(f'<path d="M{f(cx + dx)},{f(top + 66)} C{f(cx + dx)},{f(top + 96)} {f(px)},{f(py - 46)} {f(px)},{f(py - 14)}" '
                 f'stroke="{col}" stroke-width="3.4" fill="none" stroke-linecap="round"/>')
    o.append(f'<rect x="{f(sx - 8)}" y="{f(sy - 16)}" width="{f(gx - sx + 16)}" height="11" rx="1.5" fill="#1d1e21"/>')
    for (px, py), lab in zip(pins, ("S", "+", "−")):
        o.append(f'<line x1="{f(px)}" y1="{f(py - 5)}" x2="{f(px)}" y2="{f(py)}" stroke="#c7ccd2" stroke-width="1.8"/>'
                 f'<text x="{f(px)}" y="{f(sy - 8)}" font-size="6" font-weight="700" fill="#e9edf2" text-anchor="middle" font-family="Inter">{lab}</text>')
    o.append(servo(cx, top, angle=angle, s=1.0, wires=False, rot=90, label=False))
    o.append(f'<text x="{f(cx)}" y="{f(top + 40)}" font-size="8.5" font-weight="700" fill="#e8f1fc" text-anchor="middle" font-family="Inter">SG90</text>')
    return "".join(o) + "</g>"


def _soic8(cx, cy, label=""):
    return (f'<rect x="{f(cx - 7)}" y="{f(cy - 5)}" width="14" height="10" rx="1" fill="#1c1e21"/>'
            + "".join(f'<rect x="{f(cx - 6 + i * 3.6)}" y="{f(cy - 7)}" width="1.6" height="2" fill="#aab0b7"/>'
                      f'<rect x="{f(cx - 6 + i * 3.6)}" y="{f(cy + 5)}" width="1.6" height="2" fill="#aab0b7"/>' for i in range(4))
            + (f'<text x="{f(cx)}" y="{f(cy + 2)}" font-size="3.6" fill="#9aa1ab" text-anchor="middle" font-family="JetBrains Mono">{label}</text>' if label else ""))


def l9110s(pins, a_dir: int = 1, b_dir: int = 0):
    """An L9110S (HG7881) two-motor driver standing in the breadboard: its header B-IA B-IB GND VCC A-IA A-IB, its
    two L9110 chips, and the motors' screw terminals on its far edge — MOTOR B left, MOTOR A right. Each motor's
    direction LED lights while it turns. Returns (svg, {'B1','B2','A1','A2': screw})."""
    xs = [x for x, _ in pins]
    cx, y = (xs[0] + xs[-1]) / 2, pins[0][1]
    w, h = xs[-1] - xs[0] + 14, 74
    top = y - 16 - h
    o = ['<g class="driver l9110s">',
         f'<rect x="{f(cx - w / 2)}" y="{f(top)}" width="{f(w)}" height="{h}" rx="3" fill="{PCB_RED[0]}" stroke="{PCB_RED[1]}" filter="url(#lift)"/>']
    o.append(_soic8(cx - 20, top + 36, "9110") + _soic8(cx + 20, top + 36, "9110"))
    o.append(f'<text x="{f(cx)}" y="{f(top + 58)}" font-size="5.5" font-weight="700" fill="#ffd9d4" text-anchor="middle" font-family="Inter">L9110S</text>')
    for lx, on in ((cx - 20, b_dir != 0), (cx + 20, a_dir != 0)):
        o.append(f'<rect x="{f(lx - 3)}" y="{f(top + 47)}" width="6" height="3.5" rx="1" fill="{"#34d058" if on else "#4a2422"}"/>')
        if on:
            o.append(f'<circle cx="{f(lx)}" cy="{f(top + 49)}" r="6" fill="url(#glow-green)"/>')
    pts = {}
    for lx, names, title in ((cx - 26, ("B1", "B2"), "MOTOR B"), (cx + 15, ("A1", "A2"), "MOTOR A")):
        sv, sp = screw_block(lx, top + 12, names, pitch=11)
        o.append(sv)
        pts.update(sp)
        o.append(f'<text x="{f(lx + 5.5)}" y="{f(top + 25)}" font-size="4.6" font-weight="700" fill="#ffd9d4" text-anchor="middle" font-family="Inter">{title}</text>')
    o.append(_header(pins, ("B-IA", "B-IB", "GND", "VCC", "A-IA", "A-IB"), top + h))
    return "".join(o) + "</g>", pts


def tt_motor(x, y, rpm: float = 0, direction: int = 1, label: str = "MOTOR1"):
    """A TT gear motor seen from above, standing beside the breadboard (not in it): its yellow gearbox, the white
    shaft at (x, y), its silver motor and the two tabs a wire goes to. Turning, the shaft's arrow says which way and
    how fast. Returns (svg, {'+': tab, '−': tab})."""
    o = ['<g class="tt-motor">',
         f'<rect x="{f(x - 34)}" y="{f(y - 18)}" width="70" height="36" rx="4" fill="#f2c230" stroke="#b58c12" filter="url(#lift)"/>',
         f'<rect x="{f(x + 36)}" y="{f(y - 15)}" width="34" height="30" rx="6" fill="#c7ccd2" stroke="#8f969f"/>',
         f'<rect x="{f(x + 66)}" y="{f(y - 6)}" width="5" height="12" fill="#aab0b7"/>',
         f'<circle cx="{f(x)}" cy="{f(y)}" r="9" fill="#f6f4ef" stroke="#c9c3b5"/>',
         f'<rect x="{f(x - 2.5)}" y="{f(y - 6)}" width="5" height="12" rx="1" fill="#e3ddd0"/>']
    tabs = {"+": (x + 78, y - 8), "−": (x + 78, y + 8)}
    for (tx, ty), col in ((tabs["+"], "#de3b3b"), (tabs["−"], "#3a3d42")):
        o.append(f'<rect x="{f(tx - 7)}" y="{f(ty - 2.5)}" width="9" height="5" rx="1" fill="#d6b24c" stroke="#a8862a" stroke-width=".6"/>'
                 f'<circle cx="{f(tx)}" cy="{f(ty)}" r="2" fill="{col}"/>')
    if rpm:
        sweep = 1 if direction > 0 else 0
        a0, a1 = (-150, 60) if direction > 0 else (60, -150)
        p0 = (x + 20 * math.cos(math.radians(a0)), y + 20 * math.sin(math.radians(a0)))
        p1 = (x + 20 * math.cos(math.radians(a1)), y + 20 * math.sin(math.radians(a1)))
        o.append(f'<path d="M{f(p0[0])},{f(p0[1])} A20 20 0 1 {sweep} {f(p1[0])},{f(p1[1])}" stroke="#2563d9" stroke-width="2.2" fill="none"/>')
        ang = a1 + (90 if direction > 0 else -90)
        hx, hy = p1
        o.append(f'<path d="M0,-4 L7,0 L0,4Z" fill="#2563d9" transform="translate({f(hx)},{f(hy)}) rotate({ang})"/>')
        o.append(f'<text x="{f(x - 34)}" y="{f(y - 26)}" font-size="9" font-weight="700" fill="#2563d9" font-family="Inter">{rpm:.0f} rpm</text>')
    o.append(f'<text x="{f(x + 4)}" y="{f(y + 32)}" font-size="8" font-weight="700" fill="#6b5a14" text-anchor="middle" font-family="Inter">{label}</text>')
    return "".join(o) + "</g>", tabs


def relay_module(pins, on: bool = False):
    """A 5 V relay module (SRD-05VDC) standing in the breadboard on its header S + −; its blue relay, power and
    signal LEDs, and the NO COM NC screws on its far edge — what it switches, apart from the board. On: the
    contact moves from NC to NO (drawn in the window). Returns (svg, {'NO','COM','NC': screw})."""
    xs = [x for x, _ in pins]
    cx, y = (xs[0] + xs[-1]) / 2, pins[0][1]
    w, h = 72, 92
    top = y - 16 - h
    o = ['<g class="relay-module">',
         f'<rect x="{f(cx - w / 2)}" y="{f(top)}" width="{w}" height="{h}" rx="3" fill="{PCB_BLUE[0]}" stroke="{PCB_BLUE[1]}" filter="url(#lift)"/>',
         f'<rect x="{f(cx - 26)}" y="{f(top + 30)}" width="52" height="36" rx="2" fill="#2f6fd6" stroke="#1d4f9e"/>',
         f'<text x="{f(cx)}" y="{f(top + 44)}" font-size="5.6" font-weight="700" fill="#e8f1fc" text-anchor="middle" font-family="Inter">SRD-05VDC</text>',
         f'<text x="{f(cx)}" y="{f(top + 52)}" font-size="4.6" fill="#cfe0f2" text-anchor="middle" font-family="Inter">10A 250VAC</text>']
    # the contact, drawn as the window would: COM to NO when on, to NC when off
    o.append(f'<path d="M{f(cx - 8)},{f(top + 58)} L{f(cx + (8 if on else -2))},{f(top + 54 if on else top + 61)}" stroke="#ffd34d" stroke-width="1.6" stroke-linecap="round"/>')
    o.append(f'<rect x="{f(cx - 22)}" y="{f(top + 72)}" width="6" height="3.5" rx="1" fill="#ff5a4a"/>'
             f'<rect x="{f(cx + 16)}" y="{f(top + 72)}" width="6" height="3.5" rx="1" fill="{"#34d058" if on else "#24313f"}"/>')
    if on:
        o.append(f'<circle cx="{f(cx + 19)}" cy="{f(top + 74)}" r="7" fill="url(#glow-green)"/>')
    sv, pts = screw_block(cx - 13, top + 11, ("NO", "COM", "NC"), pitch=13, label_above=False)
    o.append(sv)
    o.append(_header(pins, ("S", "+", "−"), top + h))
    return "".join(o) + "</g>", pts


def pump(x, y, running: bool = False):
    """A small 3–6 V submersible pump in a cup of water, beside the breadboard: its two leads end in tabs a wire goes
    to (red +, black −); running, water comes out of its tube. Returns (svg, {'+': tab, '−': tab})."""
    o = ['<g class="pump">',
         f'<path d="M{f(x - 38)},{f(y - 30)} L{f(x - 32)},{f(y + 44)} Q{f(x)},{f(y + 52)} {f(x + 32)},{f(y + 44)} L{f(x + 38)},{f(y - 30)}Z" '
         f'fill="#eef5fb" stroke="#b9c7d6" stroke-width="1.2"/>',
         f'<path d="M{f(x - 36)},{f(y - 6)} L{f(x - 32)},{f(y + 44)} Q{f(x)},{f(y + 52)} {f(x + 32)},{f(y + 44)} L{f(x + 36)},{f(y - 6)}Z" fill="#9fd0f2" opacity=".75"/>',
         f'<rect x="{f(x - 14)}" y="{f(y + 8)}" width="28" height="30" rx="7" fill="#26282c"/>',
         f'<path d="M{f(x + 6)},{f(y + 10)} C{f(x + 6)},{f(y - 40)} {f(x + 50)},{f(y - 48)} {f(x + 60)},{f(y - 26)}" stroke="#d9e2ea" stroke-width="5" fill="none" stroke-linecap="round"/>']
    if running:
        o.append(f'<path d="M{f(x + 60)},{f(y - 24)} C{f(x + 64)},{f(y - 14)} {f(x + 50)},{f(y - 8)} {f(x + 34)},{f(y - 6)}" stroke="#3b8fd9" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-dasharray="5 3"/>')
        o.append(f'<text x="{f(x - 44)}" y="{f(y - 36)}" font-size="8.5" font-weight="700" fill="#2563d9" text-anchor="end" font-family="Inter">pumping</text>')
    tabs = {"+": (x - 8, y - 46), "−": (x + 8, y - 46)}
    for (tx, ty), col in ((tabs["+"], ("#de3b3b", "#9e2626")), (tabs["−"], ("#3a3d42", "#15171a"))):
        o.append(f'<path d="M{f(tx)},{f(y + 10)} C{f(tx)},{f(y - 10)} {f(tx)},{f(ty + 20)} {f(tx)},{f(ty + 4)}" stroke="{col[1]}" stroke-width="3.6" fill="none"/>'
                 f'<path d="M{f(tx)},{f(y + 10)} C{f(tx)},{f(y - 10)} {f(tx)},{f(ty + 20)} {f(tx)},{f(ty + 4)}" stroke="{col[0]}" stroke-width="2" fill="none"/>'
                 f'<rect x="{f(tx - 3)}" y="{f(ty - 4)}" width="6" height="8" rx="1" fill="#d6b24c" stroke="#a8862a" stroke-width=".6"/>')
    o.append(f'<text x="{f(x)}" y="{f(y + 64)}" font-size="8" font-weight="700" fill="#4b5563" text-anchor="middle" font-family="Inter">PUMP1</text>')
    return "".join(o) + "</g>", tabs


def uln2003(pins, coils=(1, 1, 0, 0)):
    """A ULN2003 stepper driver standing in the breadboard on IN1 IN2 IN3 IN4 − +; its chip, the four LEDs A–D that
    light with the coils, and the white socket on its far edge the 28BYJ-48's cable plugs into. Returns (svg, the
    socket's middle)."""
    xs = [x for x, _ in pins]
    cx, y = (xs[0] + xs[-1]) / 2, pins[0][1]
    w, h = xs[-1] - xs[0] + 14, 92
    top = y - 16 - h
    o = ['<g class="uln2003">',
         f'<rect x="{f(cx - w / 2)}" y="{f(top)}" width="{f(w)}" height="{h}" rx="3" fill="{PCB_GREEN[0]}" stroke="{PCB_GREEN[1]}" filter="url(#lift)"/>',
         f'<rect x="{f(cx - 18)}" y="{f(top + 2)}" width="36" height="12" rx="1.5" fill="#f4f5f7" stroke="#c9cdd2"/>']
    o.append("".join(f'<rect x="{f(cx - 14 + i * 7)}" y="{f(top + 5)}" width="3.5" height="5" fill="#c7ccd2"/>' for i in range(5)))
    o.append(f'<rect x="{f(cx - 30)}" y="{f(top + 26)}" width="40" height="16" rx="1.5" fill="#1c1e21"/>'
             f'<text x="{f(cx - 10)}" y="{f(top + 36)}" font-size="5" fill="#9aa1ab" text-anchor="middle" font-family="JetBrains Mono">ULN2003</text>')
    for i, (lab, on) in enumerate(zip("ABCD", coils)):
        lx = cx + 18 + (i % 2) * 12
        ly = top + 24 + (i // 2) * 14
        o.append(f'<rect x="{f(lx - 3)}" y="{f(ly)}" width="6" height="4" rx="1" fill="{"#ff4b3a" if on else "#4b2a2a"}"/>'
                 f'<text x="{f(lx)}" y="{f(ly + 10)}" font-size="4.4" fill="#d7f0dc" text-anchor="middle" font-family="Inter">{lab}</text>')
        if on:
            o.append(f'<circle cx="{f(lx)}" cy="{f(ly + 2)}" r="7" fill="url(#glow-red)"/>')
    o.append(f'<text x="{f(cx)}" y="{f(top + 60)}" font-size="5" font-weight="700" fill="#d7f0dc" text-anchor="middle" font-family="Inter">5–12V</text>')
    o.append(_header(pins, ("IN1", "IN2", "IN3", "IN4", "−", "+"), top + h))
    return "".join(o) + "</g>", (cx, top + 8)


def stepper(x, y, socket, steps: int = 0, turning: bool = True):
    """A 28BYJ-48 stepper beside the breadboard: its silver can, the blue cap and its shaft off centre, its cable of
    five (blue, pink, yellow, orange, red) to the ULN2003's socket at `socket`. Turning: an arrow and its steps."""
    sx, sy = socket
    o = ['<g class="stepper">']
    for i, col in enumerate(("#2f6fd6", "#f29bc0", "#efbd16", "#f08024", "#de3b3b")):
        dx = (i - 2) * 3
        o.append(f'<path d="M{f(x + dx)},{f(y + 40)} C{f(x + dx)},{f(y + 80)} {f(sx + dx * 2)},{f(sy - 60)} {f(sx + dx * 2)},{f(sy)}" '
                 f'stroke="{col}" stroke-width="2.2" fill="none"/>')
    o.append(f'<rect x="{f(sx - 9)}" y="{f(sy - 7)}" width="18" height="9" rx="1.5" fill="#f4f5f7" stroke="#c9cdd2"/>')
    o.append(f'<rect x="{f(x - 62)}" y="{f(y - 8)}" width="124" height="16" rx="8" fill="#b9bfc7" stroke="#8f969f"/>'
             f'<circle cx="{f(x - 54)}" cy="{f(y)}" r="3" fill="#7d848c"/><circle cx="{f(x + 54)}" cy="{f(y)}" r="3" fill="#7d848c"/>')
    o.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="44" fill="#c7ccd2" stroke="#8f969f" filter="url(#lift)"/>'
             f'<circle cx="{f(x)}" cy="{f(y + 6)}" r="30" fill="#2f6fd6" stroke="#1d4f9e"/>'
             f'<circle cx="{f(x)}" cy="{f(y - 14)}" r="9" fill="#d6b24c" stroke="#a8862a"/>'
             f'<rect x="{f(x - 2)}" y="{f(y - 21)}" width="4" height="14" rx="1" fill="#f5e6b0"/>')
    o.append(f'<text x="{f(x)}" y="{f(y + 22)}" font-size="7.5" font-weight="700" fill="#e8f1fc" text-anchor="middle" font-family="Inter">28BYJ-48</text>')
    if turning:
        o.append(f'<path d="M{f(x + 22)},{f(y - 40)} A46 46 0 0 1 {f(x + 46)},{f(y - 14)}" stroke="#2563d9" stroke-width="2.2" fill="none"/>'
                 f'<path d="M0,-4 L7,0 L0,4Z" fill="#2563d9" transform="translate({f(x + 47)},{f(y - 12)}) rotate(100)"/>'
                 f'<text x="{f(x + 52)}" y="{f(y - 34)}" font-size="9" font-weight="700" fill="#2563d9" font-family="Inter">step {steps}</text>')
    return "".join(o) + "</g>"


def l298n(x, y, out=(1, 0)):
    """An L298N driver board, too big for the breadboard: it lies beside it and is wired with jumper wires. Its black
    heat sink, OUT1/OUT2 (motor A) and OUT3/OUT4 (motor B) screws, the 12V GND 5V screws, and its header ENA IN1 IN2
    IN3 IN4 ENB (the ENA and ENB jumpers on). Every screw and header pin is a point to wire. Returns (svg, points)."""
    w, h = 150, 140
    o = ['<g class="l298n">',
         f'<rect x="{f(x)}" y="{f(y)}" width="{w}" height="{h}" rx="4" fill="#b8322a" stroke="#7d1f19" filter="url(#lift)"/>',
         f'<rect x="{f(x + 45)}" y="{f(y + 6)}" width="60" height="48" rx="2" fill="#1f2227"/>']
    o.append("".join(f'<rect x="{f(x + 49 + i * 7)}" y="{f(y + 6)}" width="3.5" height="48" fill="#3a3d42"/>' for i in range(8)))
    o.append(f'<text x="{f(x + 75)}" y="{f(y + 68)}" font-size="7" font-weight="700" fill="#ffd9d4" text-anchor="middle" font-family="Inter">L298N</text>')
    pts = {}
    for sx, sy, names in ((x + 12, y + 20, ("OUT1", "OUT2")), (x + w - 27, y + 20, ("OUT3", "OUT4"))):
        sv, sp = screw_block(sx, sy, names, pitch=15, label_above=False)
        o.append(sv)
        pts.update(sp)
    sv, sp = screw_block(x + 16, y + h - 16, ("12V", "GND", "5V"), pitch=13, label_above=True)
    o.append(sv)
    pts.update(sp)
    hx = x + 74
    for i, name in enumerate(("ENA", "IN1", "IN2", "IN3", "IN4", "ENB")):
        px, py = hx + i * 11, y + h - 16
        pts[name] = (px, py)
        o.append(f'<rect x="{f(px - 3.5)}" y="{f(py - 3.5)}" width="7" height="7" fill="#1c1e21"/><rect x="{f(px - 1.2)}" y="{f(py - 1.2)}" width="2.4" height="2.4" fill="#d6b24c"/>'
                 f'<text x="{f(px)}" y="{f(py - 8)}" font-size="4.4" font-weight="700" fill="#ffd9d4" text-anchor="middle" font-family="Inter">{name}</text>')
    for i in (0, 5):   # the ENA and ENB jumpers: full speed until a PWM pin is wired there instead
        px = hx + i * 11
        o.append(f'<rect x="{f(px - 4.5)}" y="{f(y + h - 34)}" width="9" height="12" rx="1.5" fill="#efbd16" stroke="#a68300"/>')
    for i, on in enumerate(out):
        lx = x + 22 + i * (w - 44)
        o.append(f'<rect x="{f(lx - 3)}" y="{f(y + 38)}" width="6" height="3.5" rx="1" fill="{"#34d058" if on else "#4a2422"}"/>')
        if on:
            o.append(f'<circle cx="{f(lx)}" cy="{f(y + 40)}" r="6" fill="url(#glow-green)"/>')
    return "".join(o) + "</g>", pts


def kit_traffic(pins, lit=(1, 0, 0)):
    """The kit's traffic light module: red, yellow and green LEDs (their resistors on the board), pins R Y G GND."""
    def el(cx, top, w, h):
        o = ""
        for i, (on, col, glow) in enumerate(zip(lit, ("#ef3b2c", "#f5c400", "#22b14c"), ("red", "amber", "green"))):
            lx = cx - 18 + i * 18
            o += f'<circle cx="{f(lx)}" cy="{f(top + 22)}" r="6.5" fill="{col if on else "#3a3d42"}" stroke="#15171a"/>'
            if on:
                o += f'<circle cx="{f(lx)}" cy="{f(top + 22)}" r="16" fill="url(#glow-{glow})"/>'
        return o
    return kit_module(pins, ("R", "Y", "G", "GND"), PCB_BLACK, h=44, element=el)


def kit_rgb(pins, rgb=(0, 0, 0)):
    """The kit's RGB LED module: one common-cathode RGB LED with its resistors, pins R G B −."""
    def el(cx, top, w, h):
        r, g, b = rgb
        mix = f"rgb({int(120 + 135 * r)},{int(120 + 135 * g)},{int(120 + 135 * b)})" if any(rgb) else "#e9edf2"
        o = f'<circle cx="{f(cx)}" cy="{f(top + 22)}" r="9" fill="{mix}" stroke="#c9d0d8"/>'
        for v, glow, dx in ((r, "red", -3), (g, "green", 0), (b, "blue", 3)):
            if v:
                o += f'<circle cx="{f(cx + dx)}" cy="{f(top + 22)}" r="{f(10 + 12 * v)}" fill="url(#glow-{glow})" opacity="{f(.4 + .6 * v)}"/>'
        return o
    return kit_module(pins, ("R", "G", "B", "−"), PCB_BLACK, h=44, element=el)


def kit_passive_buzzer(pins, playing: bool = False, note: str = ""):
    """The kit's passive buzzer module: it plays the note of the PWM on I/O; pins I/O VCC GND."""
    def el(cx, top, w, h):
        o = (f'<circle cx="{f(cx)}" cy="{f(top + 24)}" r="13" fill="#26282c"/><circle cx="{f(cx)}" cy="{f(top + 24)}" r="8" fill="none" stroke="#3b3e43"/>'
             f'<circle cx="{f(cx)}" cy="{f(top + 24)}" r="2" fill="#0f1012"/>')
        if playing:
            for k in (1, 2):
                o += f'<path d="M{f(cx + 14 + 5 * k)},{f(top + 14)} q{f(5 + 2 * k)},10 0,20" stroke="#2563d9" stroke-width="1.5" fill="none"/>'
            if note:
                o += f'<text x="{f(cx)}" y="{f(top - 6)}" font-size="9" font-weight="700" fill="#2563d9" text-anchor="middle" font-family="Inter">♪ {note}</text>'
        return o
    return kit_module(pins, ("I/O", "VCC", "GND"), PCB_BLACK, h=50, element=el)


def power_supply(bb, top: str = "5V", bottom: str = "3.3V", on: bool = True) -> str:
    """The breadboard power supply module (MB102) on the breadboard's left end: its pins go into both rail pairs at
    columns 1–2, its jumpers set each pair to 5 V or 3.3 V (as printed), its own DC jack and USB give the power, its
    switch and LED. The rails then give that, apart from the board (join a GND to the board's)."""
    x0 = bb.bx - 24
    y0 = bb.by
    o = ['<g class="power-supply">',
         f'<rect x="{f(x0 - 54)}" y="{f(y0 + 2)}" width="98" height="294" rx="4" fill="#26282c" stroke="#0f1012" filter="url(#lift)"/>',
         f'<rect x="{f(x0 - 50)}" y="{f(y0 + 96)}" width="26" height="30" rx="3" fill="#15171a"/><circle cx="{f(x0 - 37)}" cy="{f(y0 + 111)}" r="6" fill="#3a3d42"/>',
         f'<rect x="{f(x0 - 50)}" y="{f(y0 + 168)}" width="24" height="18" rx="1.5" fill="#c7ccd2" stroke="#8f969f"/><rect x="{f(x0 - 46)}" y="{f(y0 + 174)}" width="16" height="6" fill="#4b5563"/>',
         f'<text x="{f(x0 - 37)}" y="{f(y0 + 140)}" font-size="5.5" fill="#cfd3d8" text-anchor="middle" font-family="Inter">6.5–12V</text>',
         f'<text x="{f(x0 - 37)}" y="{f(y0 + 196)}" font-size="5.5" fill="#cfd3d8" text-anchor="middle" font-family="Inter">USB</text>',
         f'<rect x="{f(x0 - 12)}" y="{f(y0 + 136)}" width="22" height="12" rx="2" fill="#f4f5f7"/><rect x="{f(x0 + (-1 if on else -10))}" y="{f(y0 + 138)}" width="9" height="8" rx="1" fill="#3a3d42"/>',
         f'<text x="{f(x0)}" y="{f(y0 + 158)}" font-size="5.5" fill="#cfd3d8" text-anchor="middle" font-family="Inter">{"ON" if on else "OFF"}</text>',
         f'<rect x="{f(x0 + 20)}" y="{f(y0 + 140)}" width="6" height="3.5" rx="1" fill="{"#34d058" if on else "#3a3d42"}"/>']
    if on:
        o.append(f'<circle cx="{f(x0 + 23)}" cy="{f(y0 + 142)}" r="7" fill="url(#glow-green)"/>')
    for (ra, rb), volts, jy in ((("T-", "T+"), top, y0 + 66), (("B+", "B-"), bottom, y0 + 214)):
        for r in (ra, rb):
            for c in (1, 2):
                hx, hy = bb.xy(c, r)
                o.append(f'<rect x="{f(hx - 2.2)}" y="{f(hy - 2.2)}" width="4.4" height="4.4" fill="#d6b24c"/>')
        o.append(f'<rect x="{f(x0 - 2)}" y="{f(jy)}" width="34" height="14" rx="2" fill="#15171a"/>'
                 f'<rect x="{f(x0 + (0 if volts == "5V" else 15))}" y="{f(jy + 2)}" width="15" height="10" rx="1.5" fill="#efbd16" stroke="#a68300"/>'
                 f'<text x="{f(x0 + 4)}" y="{f(jy + 22)}" font-size="5.2" fill="#cfd3d8" text-anchor="middle" font-family="Inter">5V</text>'
                 f'<text x="{f(x0 + 24)}" y="{f(jy + 22)}" font-size="5.2" fill="#cfd3d8" text-anchor="middle" font-family="Inter">3.3V</text>')
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
    "kbutton": '<rect x="5" y="9" width="22" height="16" rx="2" fill="#26282c"/><path d="M10,25 v5 M16,25 v5 M22,25 v5" stroke="#a5abb2" stroke-width="1.3"/><rect x="11" y="12" width="10" height="10" rx="1" fill="#8d949c"/><circle cx="16" cy="17" r="3.5" fill="#2f6fd6"/>',
    "ktouch": '<rect x="5" y="9" width="22" height="16" rx="2" fill="#b8322a"/><path d="M10,25 v5 M16,25 v5 M22,25 v5" stroke="#a5abb2" stroke-width="1.3"/><circle cx="16" cy="17" r="5.5" fill="none" stroke="#e8c26a" stroke-width="1.6"/>',
    "kvibration": '<rect x="5" y="9" width="22" height="16" rx="2" fill="#2457a6"/><path d="M10,25 v5 M16,25 v5 M22,25 v5" stroke="#a5abb2" stroke-width="1.3"/><rect x="9" y="12" width="14" height="6" rx="3" fill="#c7ccd2"/>',
    "kir": '<rect x="5" y="9" width="22" height="16" rx="2" fill="#2457a6"/><path d="M10,25 v5 M16,25 v5 M22,25 v5" stroke="#a5abb2" stroke-width="1.3"/><circle cx="12" cy="14" r="3.2" fill="#e9f0fa"/><circle cx="20" cy="14" r="3.2" fill="#1c1e21"/>',
    "khall": '<rect x="5" y="9" width="22" height="16" rx="2" fill="#2457a6"/><path d="M10,25 v5 M16,25 v5 M22,25 v5" stroke="#a5abb2" stroke-width="1.3"/><path d="M13,20 v-5 a3,2.5 0 0 1 6,0 v5z" fill="#1f2125"/><rect x="9" y="3" width="7" height="5" fill="#d94545"/><rect x="16" y="3" width="7" height="5" fill="#3b6fd8"/>',
    "kflame": '<rect x="5" y="9" width="22" height="16" rx="2" fill="#2457a6"/><path d="M10,25 v5 M16,25 v5 M22,25 v5" stroke="#a5abb2" stroke-width="1.3"/><path d="M16,3 q6,6 3,12 q-3,4 -6,0 q-3,-6 3,-12z" fill="#ff8a00"/>',
    "krain": '<rect x="5" y="9" width="22" height="16" rx="2" fill="#2457a6"/><path d="M10,25 v5 M16,25 v5 M22,25 v5" stroke="#a5abb2" stroke-width="1.3"/><rect x="7" y="2" width="18" height="8" rx="1" fill="#2f7d3f"/><path d="M9,4.5 h14 M9,7.5 h14" stroke="#d6b24c" stroke-width="1"/>',
    "kwater": '<rect x="11" y="2" width="10" height="24" rx="1.5" fill="#b8322a"/><path d="M13,3 v14 M16,3 v14 M19,3 v14" stroke="#e8c26a" stroke-width="1"/><rect x="9" y="2" width="14" height="9" fill="#7fb4ff" opacity=".6"/><path d="M13,26 v4 M16,26 v4 M19,26 v4" stroke="#a5abb2" stroke-width="1.3"/>',
    "kgas": '<rect x="5" y="9" width="22" height="16" rx="2" fill="#2457a6"/><path d="M10,25 v5 M16,25 v5 M22,25 v5" stroke="#a5abb2" stroke-width="1.3"/><circle cx="16" cy="16" r="6" fill="#c7ccd2" stroke="#8f969f"/><circle cx="16" cy="16" r="3.5" fill="#6d747c"/>',
    "kldr": '<rect x="5" y="9" width="22" height="16" rx="2" fill="#2457a6"/><path d="M10,25 v5 M16,25 v5 M22,25 v5" stroke="#a5abb2" stroke-width="1.3"/><circle cx="16" cy="16" r="5" fill="#f2d7a6" stroke="#c9a46a"/>',
    "kpot": '<rect x="5" y="9" width="22" height="16" rx="2" fill="#2457a6"/><path d="M10,25 v5 M16,25 v5 M22,25 v5" stroke="#a5abb2" stroke-width="1.3"/><circle cx="16" cy="16" r="5.5" fill="#e9ebee"/><line x1="16" y1="16" x2="18" y2="12" stroke="#2d3136" stroke-width="1.6"/>',
    "kjoystick": '<rect x="4" y="6" width="24" height="20" rx="2" fill="#26282c"/><circle cx="16" cy="16" r="8" fill="#c7ccd2"/><circle cx="17" cy="15" r="5" fill="#2d3136"/>',
    "kencoder": '<rect x="5" y="9" width="22" height="16" rx="2" fill="#2457a6"/><path d="M10,25 v5 M16,25 v5 M22,25 v5" stroke="#a5abb2" stroke-width="1.3"/><circle cx="16" cy="16" r="6" fill="#c7ccd2" stroke="#8f969f"/><path d="M12,14 h8" stroke="#6d747c" stroke-width="1.4"/>',
    "kspeed": '<rect x="5" y="9" width="22" height="16" rx="2" fill="#2457a6"/><path d="M10,25 v5 M16,25 v5 M22,25 v5" stroke="#a5abb2" stroke-width="1.3"/><circle cx="16" cy="8" r="7" fill="#e8b10f"/><rect x="11" y="12" width="3" height="8" fill="#1c1e21"/><rect x="18" y="12" width="3" height="8" fill="#1c1e21"/>',
    "pcf8591": '<rect x="2" y="9" width="28" height="15" rx="2" fill="#2457a6"/><rect x="11" y="12" width="10" height="7" rx="1" fill="#1c1e21"/><path d="M5,24 v5 M9,24 v5 M13,24 v5 M17,24 v5 M21,24 v5 M25,24 v5" stroke="#a5abb2" stroke-width="1.2"/>',
    "bmp280": '<rect x="6" y="9" width="20" height="15" rx="2" fill="#5b3fa0"/><rect x="12" y="12" width="8" height="8" rx="1" fill="#c7ccd2"/><path d="M9,24 v5 M13,24 v5 M17,24 v5 M21,24 v5" stroke="#a5abb2" stroke-width="1.2"/>',
    "ds18b20": '<rect x="8" y="9" width="16" height="15" rx="2" fill="#2457a6"/><path d="M12,21 v-6 a4,3 0 0 1 8,0 v6z" fill="#1f2125"/><path d="M12,24 v5 M16,24 v5 M20,24 v5" stroke="#a5abb2" stroke-width="1.3"/>',
    "ds1302": '<rect x="5" y="6" width="22" height="18" rx="2" fill="#2f7d3f"/><circle cx="16" cy="14" r="6" fill="#c7ccd2"/><path d="M8,24 v5 M12,24 v5 M16,24 v5 M20,24 v5 M24,24 v5" stroke="#a5abb2" stroke-width="1.2"/>',
    "vl53l0x": '<rect x="6" y="9" width="20" height="15" rx="2" fill="#5b3fa0"/><rect x="11" y="12" width="10" height="5" rx="1" fill="#1c1e21"/><path d="M14,8 v-6" stroke="#e8432a" stroke-width="1.4" stroke-dasharray="2 1.5"/>',
    "max30102": '<rect x="6" y="9" width="20" height="15" rx="2" fill="#5b3fa0"/><rect x="12" y="12" width="8" height="6" rx="1" fill="#1c1e21"/><rect x="13" y="13" width="3" height="4" fill="#8a1d1d"/>',
    "mpu6050": '<rect x="4" y="8" width="24" height="16" rx="2" fill="#3b5bb7"/><rect x="12" y="11" width="8" height="8" rx="1" fill="#1c1e21"/><path d="M6,27 v3 M9,27 v3 M12,27 v3 M15,27 v3 M18,27 v3 M21,27 v3 M24,27 v3 M27,27 v3" stroke="#a5abb2" stroke-width="1.2"/>',
    "dht": '<rect x="9" y="4" width="14" height="20" rx="2" fill="#3f8fe0"/>' + "".join(f'<rect x="{11 + c * 3.5}" y="{7 + r * 3.5}" width="2" height="2" fill="#1f5ea8"/>' for c in range(3) for r in range(4)) + '<path d="M12,24 v5 M15,24 v5 M18,24 v5 M21,24 v5" stroke="#a5abb2" stroke-width="1.3"/>',
    "pir": '<rect x="5" y="17" width="22" height="9" rx="2" fill="#2f8f4f"/><path d="M8,18 a8,8 0 0 1 16,0Z" fill="#f2f3f5" stroke="#c9d0d8"/>',
    "line": '<rect x="10" y="3" width="12" height="26" rx="2" fill="#2b5fa8"/><circle cx="16" cy="23" r="3" fill="#2d3136"/><circle cx="16" cy="16" r="2.5" fill="#d6d9de"/>',
    "soil": '<path d="M11,3 h10 v20 l-5,6 l-5,-6 z" fill="#1d1f22"/><path d="M13,8 h6 M13,12 h6" stroke="#e8d49a" stroke-width="1" opacity=".6"/>',
    "tmp36": '<path d="M10,6 h12 v10 a6,3 0 0 1 -12,0Z" fill="#2d3136"/><path d="M12,18 v11 M16,19 v11 M20,18 v11" stroke="#a5abb2" stroke-width="1.4"/>',
    "servo": '<rect x="4" y="11" width="22" height="12" rx="2" fill="#3a8ae0"/><rect x="1" y="14" width="4" height="6" rx="1" fill="#2f76c9"/><rect x="25" y="14" width="4" height="6" rx="1" fill="#2f76c9"/><path d="M8,17 L10,5 L12,17Z" fill="#f4f4f4" stroke="#b9bec5" stroke-width=".8"/><circle cx="10" cy="17" r="2" fill="#fff" stroke="#b9bec5" stroke-width=".8"/>',
    "motor": '<rect x="4" y="9" width="18" height="14" rx="3" fill="#f1c232"/><rect x="22" y="12" width="5" height="8" rx="1" fill="#c9cdd2"/><circle cx="12" cy="16" r="3" fill="#d4a417"/>',
    "driver": '<rect x="4" y="5" width="24" height="22" rx="2" fill="#c2312f"/><rect x="11" y="3" width="10" height="10" rx="1" fill="#2d3136"/><rect x="7" y="20" width="18" height="4" fill="#2f8f4f"/>',
    "relay": '<rect x="5" y="6" width="22" height="20" rx="2" fill="#2f6fd6"/><rect x="8" y="9" width="16" height="9" rx="1" fill="#1f4c96"/><rect x="8" y="21" width="16" height="3" fill="#2f8f4f"/>',
    "oled": '<rect x="5" y="5" width="22" height="22" rx="2" fill="#16314f"/><rect x="7" y="9" width="18" height="11" fill="#05070a"/><path d="M9,13 h8 M9,16 h12" stroke="#9be7ff" stroke-width="1.4"/>',
    "lcd": '<rect x="2" y="8" width="28" height="16" rx="2" fill="#2f8f4f"/><rect x="5" y="11" width="22" height="10" fill="#a8d86a"/><path d="M7,14 h12 M7,18 h16" stroke="#3b5a1e" stroke-width="1.4"/>',
    "seg7": '<rect x="8" y="3" width="16" height="26" rx="2" fill="#2d3136"/><path d="M12,8 h8 M12,16 h8 M12,24 h8 M11,9 v6 M21,9 v6 M11,17 v6 M21,17 v6" stroke="#ef3b2c" stroke-width="1.8" stroke-linecap="round"/>',
    "neopixel": "".join(f'<circle cx="{16 + 10 * math.cos(math.radians(a))}" cy="{16 + 10 * math.sin(math.radians(a))}" r="2.6" fill="{c}"/>' for a, c in zip(range(0, 360, 45), ("#ef3b2c", "#ff8a00", "#f5d000", "#22b14c", "#16b8c9", "#2f6fe0", "#8d5bd1", "#e0409a"))) + '<circle cx="16" cy="16" r="13" fill="none" stroke="#2d3136" stroke-width="2.4" opacity=".25"/>',
    "stepper": '<circle cx="16" cy="17" r="11" fill="#c7ccd2" stroke="#8f969f"/><circle cx="16" cy="19" r="7.5" fill="#2f6fd6"/><circle cx="16" cy="13" r="2.6" fill="#d6b24c"/>',
    "pump": '<path d="M7,8 L9,27 Q16,29 23,27 L25,8Z" fill="#9fd0f2" stroke="#7fa9c8"/><rect x="12" y="16" width="8" height="10" rx="2.5" fill="#26282c"/><path d="M17,16 C17,6 26,4 27,8" stroke="#d9e2ea" stroke-width="2" fill="none"/>',
    "traffic": '<rect x="4" y="11" width="24" height="11" rx="2" fill="#26282c"/><circle cx="10" cy="16.5" r="3" fill="#ef3b2c"/><circle cx="16" cy="16.5" r="3" fill="#f5c400"/><circle cx="22" cy="16.5" r="3" fill="#22b14c"/>',
    "krgb": '<rect x="6" y="9" width="20" height="15" rx="2" fill="#26282c"/><circle cx="16" cy="16.5" r="5" fill="#e9edf2"/><circle cx="14" cy="15" r="1.6" fill="#ef3b2c"/><circle cx="18" cy="15" r="1.6" fill="#22b14c"/><circle cx="16" cy="18.5" r="1.6" fill="#2f6fe0"/>',
    "kbuzzer": '<rect x="6" y="9" width="20" height="15" rx="2" fill="#26282c"/><circle cx="16" cy="16.5" r="5.5" fill="#15171a" stroke="#3b3e43"/>',
    "psu": '<rect x="5" y="4" width="22" height="24" rx="2" fill="#26282c"/><rect x="8" y="8" width="7" height="6" fill="#15171a"/><rect x="8" y="18" width="7" height="5" fill="#c7ccd2"/><rect x="18" y="9" width="6" height="4" fill="#efbd16"/><rect x="18" y="19" width="6" height="4" fill="#efbd16"/>',
    "l298n": '<rect x="3" y="5" width="26" height="22" rx="2" fill="#b8322a"/><rect x="11" y="7" width="10" height="9" fill="#1f2227"/><rect x="5" y="9" width="5" height="4" fill="#2f9d57"/><rect x="22" y="9" width="5" height="4" fill="#2f9d57"/>',
    "gpioboard": '<rect x="3" y="12" width="26" height="15" rx="2" fill="#1d4f9e"/><rect x="7" y="4" width="18" height="11" rx="2" fill="#1d1e21"/><rect x="6" y="13" width="20" height="3" rx="1" fill="#121a24"/>' + "".join(f'<circle cx="{6 + i * 2.5}" cy="{y}" r=".8" fill="#d3d7dc"/>' for i in range(9) for y in (20, 24)),
    "microbit": '<rect x="3" y="6" width="26" height="20" rx="3" fill="#1d1e21"/>' + "".join(f'<rect x="{11 + c * 2.6}" y="{10 + r * 2.6}" width="1.2" height="1.8" fill="{"#ff3a22" if HEART[r][c] == "1" else "#3b2d2d"}"/>' for r in range(5) for c in range(5)) + '<circle cx="7" cy="14" r="2" fill="#c9cdd2"/><circle cx="25" cy="14" r="2" fill="#c9cdd2"/><rect x="5" y="22" width="22" height="3" fill="#d6b24c"/>',
    "pico": '<rect x="2" y="9" width="28" height="14" rx="2" fill="#2b7a4b"/><rect x="0" y="13" width="4" height="6" rx="1" fill="#c7ccd2"/><rect x="13" y="12" width="7" height="7" fill="#1c1e21"/><rect x="22" y="12" width="5" height="7" fill="#c3c8ce"/>' + "".join(f'<circle cx="{4 + i * 2.6}" cy="{c}" r=".8" fill="#d6b24c"/>' for i in range(10) for c in (10.5, 21.5)),
    "esp32": '<rect x="2" y="8" width="28" height="16" rx="2" fill="#1e2733"/><rect x="15" y="10" width="14" height="12" rx="1" fill="#b9bfc7"/><rect x="0" y="13" width="4" height="6" rx="1" fill="#c7ccd2"/>' + "".join(f'<circle cx="{4 + i * 2.6}" cy="{c}" r=".8" fill="#d6b24c"/>' for i in range(10) for c in (9.5, 22.5)),
}
