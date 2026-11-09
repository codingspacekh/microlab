"""MicroLab's app icon (M11, requirements Rev 13): three options for the teacher, drawn at 1024 × 1024 in the macOS
layout (the body a rounded square of 824 with its margin and soft shadow; Windows uses the same picture). Each grows
from the logo in the top bar: the chip with its pins and the green LED at its heart."""


def _body(inner: str, uid: str, top: str = "#3f86f5", bottom: str = "#1b4fc4") -> str:
    return (f'<defs><linearGradient id="bg{uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{top}"/>'
            f'<stop offset="1" stop-color="{bottom}"/></linearGradient>'
            f'<radialGradient id="led{uid}" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#d9ffe9"/><stop offset=".45" stop-color="#7fe0a8"/>'
            f'<stop offset="1" stop-color="#7fe0a8" stop-opacity="0"/></radialGradient>'
            f'<filter id="sh{uid}" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#0b1f4d" flood-opacity=".32"/></filter></defs>'
            f'<rect x="100" y="100" width="824" height="824" rx="185" fill="url(#bg{uid})" filter="url(#sh{uid})"/>'
            f'{inner}')


def _chip(cx: int, cy: int, size: int, uid: str, pins: int = 3, stroke: str = "#fff", fill: str = "none", led: bool = True) -> str:
    h = size / 2
    w = size * 0.075
    out = [f'<rect x="{cx - h}" y="{cy - h}" width="{size}" height="{size}" rx="{size * .13}" fill="{fill}" stroke="{stroke}" stroke-width="{w}"/>']
    step = size / (pins + 1)
    plen = size * 0.27
    for i in range(1, pins + 1):
        o = -h + i * step
        out.append(f'<path d="M{cx + o} {cy - h} V{cy - h - plen} M{cx + o} {cy + h} V{cy + h + plen} M{cx - h} {cy + o} H{cx - h - plen} M{cx + h} {cy + o} H{cx + h + plen}" '
                   f'stroke="{stroke}" stroke-width="{w}" stroke-linecap="round"/>')
    if led:
        out.append(f'<circle cx="{cx}" cy="{cy}" r="{size * .42}" fill="url(#led{uid})"/><circle cx="{cx}" cy="{cy}" r="{size * .14}" fill="#7fe0a8"/>')
    return "".join(out)


def chip(uid: str = "a") -> str:
    """A — the logo itself, given depth: the chip, its twelve pins, the LED glowing at its heart."""
    return _body(_chip(512, 512, 330, uid), uid)


def breadboard(uid: str = "b") -> str:
    """B — the chip set into a breadboard: rows of holes behind it, a red and a blue rail."""
    holes = []
    for row in range(9):
        for col in range(9):
            x, y = 238 + col * 68.5, 238 + row * 68.5
            holes.append(f'<rect x="{x - 9}" y="{y - 9}" width="18" height="18" rx="4" fill="#0e2f7a" opacity=".55"/>')
    rails = ('<path d="M190 168 H834" stroke="#ff6b6b" stroke-width="10" stroke-linecap="round" opacity=".9"/>'
             '<path d="M190 856 H834" stroke="#7fb2ff" stroke-width="10" stroke-linecap="round" opacity=".9"/>')
    inner = "".join(holes) + rails + _chip(512, 512, 300, uid, fill="#1b4fc4")
    return _body(inner, uid)


def circuit(uid: str = "c") -> str:
    """C — a little circuit: the chip on the left, two wires from its pins to an LED that glows on the right."""
    wires = ('<path d="M512 452 H640 Q676 452 676 488 V640" stroke="#ffd166" stroke-width="20" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
             '<path d="M512 572 H580 Q604 572 604 600 V700 Q604 724 628 724 H760 Q784 724 784 700 V640" stroke="#ffd166" stroke-width="20" fill="none" stroke-linecap="round" stroke-linejoin="round"/>')
    led = (f'<circle cx="730" cy="470" r="170" fill="url(#led{uid})"/>'
           '<path d="M676 640 V610 M784 640 V610" stroke="#fff" stroke-width="16" stroke-linecap="round"/>'
           '<path d="M660 610 V470 A70 70 0 0 1 800 470 V610 Z" fill="#7fe0a8" stroke="#fff" stroke-width="16" stroke-linejoin="round"/>'
           '<path d="M640 610 H820" stroke="#fff" stroke-width="16" stroke-linecap="round"/>')
    inner = wires + _chip(352, 512, 230, uid, led=False) + led
    return _body(inner, uid)


ICONS = {"chip": chip, "breadboard": breadboard, "circuit": circuit}


def icon(name: str, size: str = "256", uid: str = "") -> str:  # uid keeps two pictures of one size apart
    s = int(size)
    body = ICONS[name](uid or f"{name}{size}")
    return f'<svg class="appicon" width="{s}" height="{s}" viewBox="0 0 1024 1024" role="img" aria-label="MicroLab icon: {name}">{body}</svg>'


def fig(name: str, *args: str) -> str:
    return icon(name, *args)
