from machine import Pin, PWM
import time

# the module's R, G and B, each through its resistor on the board; PWM mixes them
leds = [PWM(Pin(n), freq=1000, duty_u16=0) for n in (13, 14, 15)]
while True:
    for colour in ((65535, 0, 0), (0, 65535, 0), (0, 0, 65535), (65535, 0, 65535)):   # red, green, blue, purple
        for led, duty in zip(leds, colour):
            led.duty_u16(duty)
        time.sleep(0.5)
