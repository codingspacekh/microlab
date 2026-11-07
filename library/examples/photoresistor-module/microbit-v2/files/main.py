from microbit import *

# more light, more volts: dark under 1.5 V
while True:
    pin0.write_digital(pin2.read_analog() < 465)
    sleep(10)
