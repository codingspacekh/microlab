from microbit import *
from machine import time_pulse_us
import utime

# Echo comes through a 1 k + 2 k divider: 5 V becomes 3.3 V on pin 2
while True:
    pin1.write_digital(1)
    utime.sleep_us(10)
    pin1.write_digital(0)
    cm = time_pulse_us(pin2, 1, 30000) / 58   # 58 µs per cm, there and back
    print(round(cm), 'cm')
    pin0.write_digital(0 < cm < 20)            # too close!
    sleep(200)
