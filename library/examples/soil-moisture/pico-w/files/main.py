from machine import Pin, ADC
import time

led = Pin(15, Pin.OUT)
soil = ADC(26)   # dry soil: about 2.4 V, wet: about 0.9 V
while True:
    led.value(soil.read_u16() > 40000)   # dry: water me!
    time.sleep_ms(20)
