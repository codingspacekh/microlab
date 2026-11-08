from machine import Pin, SPI
import max7219
import time

spi = SPI(0, sck=Pin(18), mosi=Pin(19))
matrix = max7219.Matrix8x8(spi, Pin(17, Pin.OUT), 1)   # CS; the matrix on 5 V
matrix.brightness(4)
HEART = (0x00, 0x66, 0xFF, 0xFF, 0x7E, 0x3C, 0x18, 0x00)   # a row each, the left dot the top bit

while True:
    for y, row in enumerate(HEART):   # a heart …
        for x in range(8):
            matrix.pixel(x, y, row >> 7 - x & 1)
    matrix.show()
    time.sleep(0.5)
    matrix.fill(0)                    # … that beats
    matrix.show()
    time.sleep(0.5)
