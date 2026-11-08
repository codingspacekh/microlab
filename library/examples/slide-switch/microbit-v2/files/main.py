from microbit import *

pin1.set_pull(pin1.PULL_UP)             # slid to 1 (towards GND): reads 0
while True:
    pin0.write_digital(1 - pin1.read_digital())
    sleep(10)
