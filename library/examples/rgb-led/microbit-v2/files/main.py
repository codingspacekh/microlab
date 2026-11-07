from microbit import *

while True:
    for colour in (pin0, pin1, pin2):    # red, green, blue
        colour.write_digital(1)
        sleep(500)
        colour.write_digital(0)
