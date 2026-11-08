from machine import Pin, ADC
import time

led = Pin(15, Pin.OUT)
s = ADC(Pin(34), atten=ADC.ATTN_11DB)
# its heater needs 5 V; gas: AO over 2 V
while True:
    led.value(s.read_u16() > 39718)
    time.sleep_ms(10)
