from machine import Pin
import time
from ds1302 import DS1302

rtc = DS1302(Pin(18), Pin(19), Pin(5))   # CLK, DAT, RST
rtc.date_time([2026, 11, 7, 6, 8, 59, 58])   # year, month, day, weekday, hour, minute, second
while True:
    t = rtc.date_time()
    print('%02d:%02d:%02d' % (t[4], t[5], t[6]))
    time.sleep(1)
