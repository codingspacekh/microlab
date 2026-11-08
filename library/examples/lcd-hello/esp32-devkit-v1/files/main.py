from machine import Pin, I2C
from i2c_lcd import I2cLcd
import time

i2c = I2C(0, sda=Pin(21), scl=Pin(22))
lcd = I2cLcd(i2c, 0x27, 2, 16)   # its backpack at 0x27: 2 rows of 16; the LCD on 5 V
lcd.putstr('Hello, MicroLab!')
n = 0
while True:
    lcd.move_to(0, 1)   # the second row
    lcd.putstr('Count %d' % n)
    n += 1
    time.sleep(1)
