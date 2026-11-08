from machine import Pin, I2C, ADC
from ssd1306 import SSD1306_I2C
import time

i2c = I2C(0, sda=Pin(21), scl=Pin(22))
oled = SSD1306_I2C(128, 64, i2c)   # 128×64 at 0x3C
knob = ADC(Pin(34), atten=ADC.ATTN_11DB)

while True:
    pc = knob.read_u16() * 100 // 65535   # the knob, 0–100 %
    oled.fill(0)
    oled.text('Knob', 0, 0)
    oled.text('%d %%' % pc, 0, 16)
    oled.rect(0, 40, 128, 12, 1)            # a bar as long as the knob is turned
    oled.fill_rect(0, 40, pc * 128 // 100, 12, 1)
    oled.show()
    time.sleep(0.1)
