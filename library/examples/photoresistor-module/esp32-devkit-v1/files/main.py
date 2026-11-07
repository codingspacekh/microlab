from machine import Pin, ADC
import time

led = Pin(15, Pin.OUT)
s = ADC(Pin(34), atten=ADC.ATTN_11DB)
# more light, more volts: dark under 1.5 V
while True:
    led.value(s.read_u16() < 29789)
    time.sleep_ms(10)
