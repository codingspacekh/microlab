from machine import Pin, ADC
import time

led = Pin(15, Pin.OUT)
s = ADC(26)
# pushed right: VRx over 2.5 V
while True:
    led.value(s.read_u16() > 49648)
    time.sleep_ms(10)
