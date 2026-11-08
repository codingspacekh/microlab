from microbit import *

# the module's R, Y and G, each LED with its resistor on the board
red, yellow, green = pin0, pin1, pin2
while True:
    for light, ms in ((red, 1000), (green, 1000), (yellow, 500)):
        light.write_digital(1)
        sleep(ms)
        light.write_digital(0)
