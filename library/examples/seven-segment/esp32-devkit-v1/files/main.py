from machine import Pin
import time

# a … g: one pin each, to the digit's segments; its COM through one 220 Ω to GND
segs = [Pin(n, Pin.OUT) for n in (13, 12, 14, 27, 26, 25, 33)]
FONT = [0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F]   # 0–9: bit 0 is a … bit 6 is g

while True:
    for n in range(10):
        for i, s in enumerate(segs):
            s.value(FONT[n] >> i & 1)
        time.sleep(0.5)
