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


FIGS = {"turtlewin": turtle_window, "cardart": card_art, "spiral": spiral}


def fig(name: str, *args: str) -> str:
    return FIGS[name](*args)
