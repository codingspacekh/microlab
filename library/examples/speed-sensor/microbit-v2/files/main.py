from microbit import *
import utime

pin8.set_pull(pin8.NO_PULL)
n, last = 0, 0
t0 = utime.ticks_ms()
while utime.ticks_diff(utime.ticks_ms(), t0) < 1000:
    v = pin8.read_digital()
    if v and not last:
        n += 1
    last = v
    sleep(1)
print('pulses a second:', n)   # 20 slots: 20 a turn
