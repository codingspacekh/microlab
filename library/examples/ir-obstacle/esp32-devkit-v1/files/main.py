from machine import Pin, ADC
import time

led = Pin(15, Pin.OUT)
s = Pin(4, Pin.IN)
# OUT is 0 with something in front
while True:
    led.value(not s.value())
    time.sleep_ms(10)
