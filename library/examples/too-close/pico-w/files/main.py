from machine import Pin, time_pulse_us
import time

led = Pin(15, Pin.OUT)
trig = Pin(14, Pin.OUT)
echo = Pin(13, Pin.IN)   # through a 1 k + 2 k divider: 5 V becomes 3.3 V
while True:
    trig.value(1)
    time.sleep_us(10)
    trig.value(0)
    cm = time_pulse_us(echo, 1, 30000) / 58   # 58 µs per cm, there and back
    print(round(cm), 'cm')
    led.value(0 < cm < 20)                    # too close!
    time.sleep(0.2)
