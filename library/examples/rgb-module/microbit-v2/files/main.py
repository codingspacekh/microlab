from microbit import *

# the module's R, G and B, each through its resistor on the board; write_analog mixes them
leds = (pin0, pin1, pin2)
while True:
    for colour in ((1023, 0, 0), (0, 1023, 0), (0, 0, 1023), (1023, 0, 1023)):   # red, green, blue, purple
        for led, level in zip(leds, colour):
            led.write_analog(level)
        sleep(500)
