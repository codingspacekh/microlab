from machine import Pin, ADC
import time

light = ADC(26)                # more light: less resistance, more volts
led = Pin(15, Pin.OUT)
while True:
    led.value(light.read_u16() < 20000)   # dark: switch the light on
    time.sleep_ms(20)
