from microbit import *

# under water: over 1 V
while True:
    pin0.write_digital(pin2.read_analog() > 310)
    sleep(10)
