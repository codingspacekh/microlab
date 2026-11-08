from machine import Pin, ADC
import time

led = Pin(15, Pin.OUT)
s = Pin(4, Pin.IN)
# DO is 0 when the plate is wet
while True:
    led.value(not s.value())
    time.sleep_ms(10)
