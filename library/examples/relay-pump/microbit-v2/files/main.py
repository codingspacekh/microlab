from microbit import *

# the relay module's S; its COM and NO switch the pump on its own batteries
while True:
    pin1.write_digital(1)   # COM to NO: the pump runs
    sleep(1000)
    pin1.write_digital(0)
    sleep(1000)
