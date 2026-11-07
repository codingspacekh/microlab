from machine import Pin, ADC
import time

led = Pin(15, Pin.OUT)
s = Pin(14, Pin.IN)
# SIG is 1 while it is touched
while True:
    led.value(s.value())
    time.sleep_ms(10)
