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


FIGS = {"turtlewin": turtle_window}


def fig(name: str, *args: str) -> str:
    return FIGS[name](*args)
