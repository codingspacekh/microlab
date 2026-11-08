from machine import Pin
import time

led = Pin(15, Pin.OUT)
switch = Pin(4, Pin.IN, Pin.PULL_UP)    # slid to 1 (towards GND): reads 0
while True:
    led.value(not switch.value())
    time.sleep_ms(10)
