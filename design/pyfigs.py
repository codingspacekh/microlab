"""The Python 3 screens (M12 design, requirements Rev 10): code samples, and a turtle window as the student's
program opens it beside MicroLab."""
import math

CODES = {
    "guess": '''import random

secret = random.randint(1, 10)
tries = 0
print("I'm thinking of a number from 1 to 10.")

while True:
    guess = int(input("Your guess: "))
    tries = tries + 1
    if guess < secret:
        print("Higher!")
    elif guess > secret:
        print("Lower!")
    else:
        print(f"Yes! {secret} in {tries} tries.")
        break''',
    "spiral": '''import turtle

t = turtle.Turtle()
t.speed(0)
turtle.bgcolor("black")
colours = ["red", "orange", "yellow", "green", "cyan", "violet"]

for i in range(120):
    t.pencolor(colours[i % 6])
    t.forward(i * 3)
    t.left(59)

turtle.done()''',
}


def turtle_window(steps: int = 96, w: int = 360, h: int = 330) -> str:
    """A 'Python Turtle Graphics' window, as macOS draws it: its title bar, a black canvas, the hexagonal spiral the
    spiral program draws (step i: forward 3i, left 59°), the turtle at its end."""
    colours = ["#ff3b30", "#ff9500", "#ffcc00", "#34c759", "#32ade6", "#af52de"]
    x, y, a = w / 2, (h + 28) / 2, 0.0
    segs = []
    scale = .55
    for i in range(steps):
        nx, ny = x + i * 3 * scale * math.cos(math.radians(a)), y - i * 3 * scale * math.sin(math.radians(a))
        segs.append(f'<line x1="{x:.1f}" y1="{y:.1f}" x2="{nx:.1f}" y2="{ny:.1f}" stroke="{colours[i % 6]}" stroke-width="1.3"/>')
        x, y, a = nx, ny, a + 59
    head = (f'<g transform="translate({x:.1f},{y:.1f}) rotate({-a:.0f})"><path d="M7,0 L-5,-4.5 L-3,0 L-5,4.5 Z" fill="#fff"/></g>')
    bar = (f'<rect x="0" y="0" width="{w}" height="28" fill="#e9e9eb"/>'
           f'<circle cx="16" cy="14" r="6" fill="#ff5f57"/><circle cx="34" cy="14" r="6" fill="#febc2e"/><circle cx="52" cy="14" r="6" fill="#28c840"/>'
           f'<text x="{w / 2}" y="18.5" font-size="12.5" font-weight="600" fill="#3a3a3c" text-anchor="middle" font-family="Inter">Python Turtle Graphics</text>')
    return (f'<svg class="oswin" width="{w}" height="{h}" viewBox="0 0 {w} {h}" font-family="Inter">'
            f'<rect x="0" y="0" width="{w}" height="{h}" rx="10" fill="#000"/>'
            f'<clipPath id="tw"><rect x="0" y="0" width="{w}" height="{h}" rx="10"/></clipPath><g clip-path="url(#tw)">'
            f'{bar}{"".join(segs)}{head}</g></svg>')


def card_art(w: int = 270, h: int = 135) -> str:
    """The Start page's Python 3 card: a small editor with a few lines of Python, and the spiral they draw."""
    lines = [("#c678dd", "import", " turtle"), ("#61afef", "t", " = turtle.Turtle()"), ("#c678dd", "for", " i in range(60):"),
             ("#e5c07b", "    t", ".forward(i * 3)"), ("#e5c07b", "    t", ".left(59)")]
    o = [f'<rect x="8" y="10" width="150" height="112" rx="9" fill="#1f2430"/>',
         '<circle cx="20" cy="21" r="3.2" fill="#ff5f57"/><circle cx="30" cy="21" r="3.2" fill="#febc2e"/><circle cx="40" cy="21" r="3.2" fill="#28c840"/>']
    for i, (c, a, b) in enumerate(lines):
        y = 42 + i * 15
        o.append(f'<text x="18" y="{y}" font-size="9.5" font-family="JetBrains Mono" fill="{c}">{a}<tspan fill="#d7dae0">{b}</tspan></text>')
    colours = ["#ff3b30", "#ff9500", "#ffcc00", "#34c759", "#32ade6", "#af52de"]
    x, y, a = 212, 68, 0.0
    for i in range(54):
        nx, ny = x + i * 1.05 * math.cos(math.radians(a)), y - i * 1.05 * math.sin(math.radians(a))
        o.append(f'<line x1="{x:.1f}" y1="{y:.1f}" x2="{nx:.1f}" y2="{ny:.1f}" stroke="{colours[i % 6]}" stroke-width="1.4"/>')
        x, y, a = nx, ny, a + 59
    return f'<svg class="scene" width="{w}" height="{h}" viewBox="0 0 270 135" font-family="Inter">{"".join(o)}</svg>'


def spiral(size: str = "34") -> str:
    """A Python project in Recent: the spiral the card's program draws, small (boards show their picture there)."""
    w = int(size)
    colours = ["#ff3b30", "#ff9500", "#ffcc00", "#34c759", "#32ade6", "#af52de"]
    x, y, a = w / 2, w / 2, 0.0
    o = []
    for i in range(40):
        nx, ny = x + i * .42 * w / 34 * math.cos(math.radians(a)), y - i * .42 * w / 34 * math.sin(math.radians(a))
        o.append(f'<line x1="{x:.1f}" y1="{y:.1f}" x2="{nx:.1f}" y2="{ny:.1f}" stroke="{colours[i % 6]}" stroke-width="1.2"/>')
        x, y, a = nx, ny, a + 59
    return f'<svg width="{w}" height="{w}" viewBox="0 0 {w} {w}">{"".join(o)}</svg>'


_LOGO_N = 0


def logo(size: str = "14") -> str:
    """The Python logo (the Python Software Foundation's, unaltered: Wikimedia Commons Python-logo-notext.svg) — on
    every .py file (the teacher, Rev 12)."""
    global _LOGO_N
    _LOGO_N += 1
    a, b = f"pyl{_LOGO_N}a", f"pyl{_LOGO_N}b"
    return (f'<svg class="pylogo" width="{size}" height="{size}" viewBox="0.21 -0.077 110 110" aria-hidden="true">'
            f'<linearGradient id="{a}" gradientUnits="userSpaceOnUse" x1="63.8159" y1="56.6829" x2="118.4934" y2="1.8225" gradientTransform="matrix(1 0 0 -1 -53.2974 66.4321)"><stop offset="0" stop-color="#387EB8"/><stop offset="1" stop-color="#366994"/></linearGradient>'
            f'<path fill="url(#{a})" d="M55.023-0.077c-25.971,0-26.25,10.081-26.25,12.156c0,3.148,0,12.594,0,12.594h26.75v3.781c0,0-27.852,0-37.375,0c-7.949,0-17.938,4.833-17.938,26.25c0,19.673,7.792,27.281,15.656,27.281c2.335,0,9.344,0,9.344,0s0-9.765,0-13.125c0-5.491,2.721-15.656,15.406-15.656c15.91,0,19.971,0,26.531,0c3.902,0,14.906-1.696,14.906-14.406c0-13.452,0-17.89,0-24.219C82.054,11.426,81.515-0.077,55.023-0.077z M40.273,8.392c2.662,0,4.813,2.15,4.813,4.813c0,2.661-2.151,4.813-4.813,4.813s-4.813-2.151-4.813-4.813C35.46,10.542,37.611,8.392,40.273,8.392z"/>'
            f'<linearGradient id="{b}" gradientUnits="userSpaceOnUse" x1="97.0444" y1="21.6321" x2="155.6665" y2="-34.5308" gradientTransform="matrix(1 0 0 -1 -53.2974 66.4321)"><stop offset="0" stop-color="#FFE052"/><stop offset="1" stop-color="#FFC331"/></linearGradient>'
            f'<path fill="url(#{b})" d="M55.397,109.923c25.959,0,26.282-10.271,26.282-12.156c0-3.148,0-12.594,0-12.594H54.897v-3.781c0,0,28.032,0,37.375,0c8.009,0,17.938-4.954,17.938-26.25c0-23.322-10.538-27.281-15.656-27.281c-2.336,0-9.344,0-9.344,0s0,10.216,0,13.125c0,5.491-2.631,15.656-15.406,15.656c-15.91,0-19.476,0-26.532,0c-3.892,0-14.906,1.896-14.906,14.406c0,14.475,0,18.265,0,24.219C28.366,100.497,31.562,109.923,55.397,109.923z M70.148,101.454c-2.662,0-4.813-2.151-4.813-4.813s2.15-4.813,4.813-4.813c2.661,0,4.813,2.151,4.813,4.813S72.809,101.454,70.148,101.454z"/></svg>')


FIGS = {"turtlewin": turtle_window, "cardart": card_art, "spiral": spiral, "logo": logo}


def fig(name: str, *args: str) -> str:
    return FIGS[name](*args)
