from microbit import *
from ssd1306 import SSD1306_I2C

oled = SSD1306_I2C(128, 64, i2c)   # 128×64 at 0x3C, on P19 (SCL) and P20 (SDA)

while True:
    pc = pin0.read_analog() * 100 // 1023   # the knob, 0–100 %
    oled.fill(0)
    oled.text('Knob', 0, 0)
    oled.text('%d %%' % pc, 0, 16)
    oled.rect(0, 40, 128, 12, 1)            # a bar as long as the knob is turned
    oled.fill_rect(0, 40, pc * 128 // 100, 12, 1)
    oled.show()
    sleep(100)
