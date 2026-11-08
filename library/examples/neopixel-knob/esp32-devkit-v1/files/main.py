from machine import Pin, ADC
from neopixel import NeoPixel
import time

strip = NeoPixel(Pin(5), 8)    # the stick, DIN on D5
ring = NeoPixel(Pin(18), 12)  # the ring, DIN on D18 (its 5V and GND from the stick's other end)
knob = ADC(Pin(34), atten=ADC.ATTN_11DB)

def wheel(h):                  # 0–255 round the colours
    if h < 85:
        return (255 - h * 3, h * 3, 0)
    if h < 170:
        h -= 85
        return (0, 255 - h * 3, h * 3)
    h -= 170
    return (h * 3, 0, 255 - h * 3)

t = 0
while True:
    k = 1 + knob.read_u16() // 4096    # the knob: how bright, 1–16
    for i in range(8):
        r, g, b = wheel((t * 4 + i * 32) % 256)
        strip[i] = (r * k // 64, g * k // 64, b * k // 64)
    strip.write()
    ring.fill((0, 0, 0))
    ring[t % 12] = (0, 0, 8 * k)       # a spinner
    ring[(t - 1) % 12] = (0, 0, 2 * k)  # and its tail
    ring.write()
    t += 1
    time.sleep(0.08)
