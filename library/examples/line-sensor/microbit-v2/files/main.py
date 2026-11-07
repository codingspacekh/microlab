from microbit import *

# the line sensor: 0 over white, 1 over the black line
while True:
    pin0.write_digital(pin1.read_digital())
    sleep(10)
