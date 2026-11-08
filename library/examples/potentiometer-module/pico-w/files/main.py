from machine import Pin, ADC
import time

led = Pin(15, Pin.OUT)
s = ADC(26)
# past half way: over 1.65 V
while True:
    led.value(s.read_u16() > 32768)
    time.sleep_ms(10)
