from machine import Pin
import time

clk, dt = Pin(14, Pin.IN), Pin(13, Pin.IN)   # pulled up on the module
n, last = 0, 1
while True:
    now = clk.value()
    if last and not now:            # CLK falls: DT says which way
        n += 1 if dt.value() else -1
        print('steps', n)
    last = now
    time.sleep_ms(1)
