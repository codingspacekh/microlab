from machine import Pin
import time
from ds1302 import DS1302

rtc = DS1302(Pin(13), Pin(14), Pin(16))   # CLK, DAT, RST
rtc.set_time(2026, 11, 7, 8, 59, 58)
while True:
    y, mo, d, h, mi, s = rtc.time()
    print('%02d:%02d:%02d' % (h, mi, s))
    time.sleep(1)
