from microbit import *
import max7219

spi.init(baudrate=1000000, sclk=pin13, mosi=pin15)
matrix = max7219.Matrix8x8(spi, pin16, 1)   # CS on P16; the matrix on 5V
matrix.brightness(4)
HEART = (0x00, 0x66, 0xFF, 0xFF, 0x7E, 0x3C, 0x18, 0x00)   # a row each, the left dot the top bit

while True:
    for y, row in enumerate(HEART):   # a heart …
        for x in range(8):
            matrix.pixel(x, y, row >> 7 - x & 1)
    matrix.show()
    sleep(500)
    matrix.fill(0)                    # … that beats
    matrix.show()
    sleep(500)
