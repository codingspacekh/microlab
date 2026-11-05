from machine import Pin
import time

led = Pin(15, Pin.OUT)
button = Pin(4, Pin.IN, Pin.PULL_UP)   # pressed = 0
while True:
    led.value(not button.value())
    time.sleep_ms(10)
