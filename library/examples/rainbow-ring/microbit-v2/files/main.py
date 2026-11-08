from microbit import *
import neopixel

ring = neopixel.NeoPixel(pin0, 12)   # a ring of 12, its DIN on P0

def wheel(h):                  # 0–255 round the colours
    if h < 85:
        return (255 - h * 3, h * 3, 0)
    if h < 170:
        h -= 85
        return (0, 255 - h * 3, h * 3)
    h -= 170
    return (h * 3, 0, 255 - h * 3)

hue = 0
while True:
    for i in range(12):
        r, g, b = wheel((hue + i * 21) % 256)
        ring[i] = (r // 8, g // 8, b // 8)   # an eighth bright: plenty
    ring.show()
    hue = (hue + 4) % 256
    sleep(30)
