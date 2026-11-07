from machine import Pin
import time

s = Pin(4, Pin.IN)
n, last = 0, 0
t0 = time.ticks_ms()
while time.ticks_diff(time.ticks_ms(), t0) < 1000:
    v = s.value()
    if v and not last:
        n += 1
    last = v
    time.sleep_ms(1)
print('pulses a second:', n)   # 20 slots: 20 a turn
