"""npm run art — the approved prototype drawings (design/svgparts.py) as the app's library art.

For each board and each fixed-footprint part it writes
  library/<boards|parts>/<id>/art.svg    a standalone picture (its own <defs>)
  library/<boards|parts>/<id>/art.json   {width, height, pitch, pins|legs: {key: [x, y]}} in the picture's units
Board pins are keyed by their `number` in board.json; part legs by leg name. One pitch (0.1 in) = 16 units,
so every pin and leg lands on a breadboard hole (F-12, F-13). Resistors and LEDs have no fixed art: they are
drawn from the holes their legs are in (the renderer, M4).
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "design"))
import svgparts as s  # noqa: E402

MARGIN = 8  # room for the drop shadow


def bbox(svg: str, points):
    """Bounding box of the rects and circles (every drawing has a body that holds the rest) and the pins or
    legs themselves, which can stick out of the body."""
    xs, ys = [x for x, _ in points], [y for _, y in points]
    for m in re.finditer(r'<rect x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"', svg):
        x, y, w, h = map(float, m.groups())
        xs += [x, x + w]
        ys += [y, y + h]
    for m in re.finditer(r'<circle cx="([-\d.]+)" cy="([-\d.]+)" r="([\d.]+)"', svg):
        x, y, r = map(float, m.groups())
        xs += [x - r, x + r]
        ys += [y - r, y + r]
    return min(xs) - MARGIN, min(ys) - MARGIN, max(xs) + MARGIN, max(ys) + MARGIN


def write(kind: str, ident: str, svg: str, points: dict, key: str) -> None:
    x0, y0, x1, y1 = bbox(svg, points.values())
    w, h = x1 - x0, y1 - y0
    folder = ROOT / "library" / kind / ident
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "art.svg").write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{s.f(x0)} {s.f(y0)} {s.f(w)} {s.f(h)}" '
        f'width="{s.f(w)}" height="{s.f(h)}">{s.defs()}{svg}</svg>\n')
    rel = {str(k): [round(x - x0, 2), round(y - y0, 2)] for k, (x, y) in points.items()}
    (folder / "art.json").write_text(json.dumps({"width": round(w, 2), "height": round(h, 2), "pitch": s.P, key: rel}, indent=2) + "\n")
    print(f"library/{kind}/{ident}: {len(rel)} {key}, {w:.0f} × {h:.0f}")


def boards() -> None:
    svg, pins = s.pico(200, 400)                       # keys: physical pin number
    write("boards", "pico-w", svg, pins, "pins")

    svg, pins = s.esp32(200, 400)                      # keys: 'T:label' (1–15, EN at the right end), 'B:label' (16–30)
    numbered = {}
    for i, name in enumerate(s.ESP_T):
        numbered[15 - i] = pins["T:" + name]
    for i, name in enumerate(s.ESP_B):
        numbered[30 - i] = pins["B:" + name]
    write("boards", "esp32-devkit-v1", svg, numbered, "pins")

    svg, pins = s.esp32_ext(200, 400)                  # keys: pin number (G-V-S triples, see board.json)
    write("boards", "esp32-devkit-v1-ext", svg, pins, "pins")

    svg, pins = s.microbit(200, 600)                   # keys: pin id (GND@3); 1–13 top row, 14–26 bottom, 27–30 I²C
    write("boards", "microbit-v2", svg, {n: pins[pid] for n, pid, _ in s.mbit_pins()}, "pins")


def parts() -> None:
    bb = s.Breadboard(200, 200)
    # Push button across the channel: legs in one column are joined inside; pressing joins the two columns.
    legs = {"1a": bb.xy(24, "e"), "2a": bb.xy(26, "e"), "1b": bb.xy(24, "f"), "2b": bb.xy(26, "f")}
    write("parts", "button", s.button(legs["1a"], legs["2b"]), legs, "legs")
    # Potentiometer: ends 1 and 3, wiper 2, two holes apart in one row.
    legs = {"1": bb.xy(21, "e"), "2": bb.xy(23, "e"), "3": bb.xy(25, "e")}
    write("parts", "potentiometer", s.pot(legs["1"], legs["2"], legs["3"]), legs, "legs")


if __name__ == "__main__":
    boards()
    parts()
