from microbit import *

while True:
    # more light: less resistance, more volts on pin 2
    pin0.write_digital(pin2.read_analog() < 300)   # dark: switch the light on
    sleep(20)
