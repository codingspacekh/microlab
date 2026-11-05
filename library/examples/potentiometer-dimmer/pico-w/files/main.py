from machine import Pin, ADC, PWM
import time

knob = ADC(26)
led = PWM(Pin(15), freq=1000)
while True:
    led.duty_u16(knob.read_u16())
    time.sleep_ms(20)
