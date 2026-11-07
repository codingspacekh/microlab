from machine import Pin, ADC
import time

led = Pin(15, Pin.OUT)
s = Pin(4, Pin.IN)
# DO is 1 while it is shaken
while True:
    led.value(s.value())
    time.sleep_ms(10)
