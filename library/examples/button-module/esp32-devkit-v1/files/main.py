from machine import Pin, ADC
import time

led = Pin(15, Pin.OUT)
s = Pin(4, Pin.IN)
# S is pulled up on the module: pressed reads 0
while True:
    led.value(not s.value())
    time.sleep_ms(10)
