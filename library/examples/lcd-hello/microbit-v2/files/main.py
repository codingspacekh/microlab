from microbit import *
from i2c_lcd import I2cLcd

lcd = I2cLcd(i2c, 0x27, 2, 16)   # its backpack at 0x27: 2 rows of 16, on P19 / P20; the LCD on 5V
lcd.putstr('Hello, MicroLab!')
n = 0
while True:
    lcd.move_to(0, 1)   # the second row
    lcd.putstr('Count %d' % n)
    n += 1
    sleep(1000)
