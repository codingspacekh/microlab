from machine import Pin, ADC
import time

light = ADC(Pin(34), atten=ADC.ATTN_11DB)   # more light: less resistance, more volts
led = Pin(15, Pin.OUT)
while True:
    led.value(light.read_u16() < 20000)   # dark: switch the light on
    time.sleep_ms(20)
