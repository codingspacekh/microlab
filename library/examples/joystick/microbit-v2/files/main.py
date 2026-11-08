from microbit import *

# pushed right: VRx over 2.5 V
while True:
    pin0.write_digital(pin2.read_analog() > 775)
    sleep(10)
