from machine import Pin, ADC
import time

led = Pin(15, Pin.OUT)
s = ADC(26)
# under water: over 1 V
while True:
    led.value(s.read_u16() > 19859)
    time.sleep_ms(10)
