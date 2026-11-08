from machine import Pin
from neopixel import NeoPixel
import time

ring = NeoPixel(Pin(0), 12)   # a ring of 12, its DIN on GP0

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
    ring.write()
    hue = (hue + 4) % 256
    time.sleep_ms(30)
