from microbit import *

pin8.set_pull(pin8.NO_PULL)   # the module has its own pull-up
# DO is 0 when the plate is wet
while True:
    pin0.write_digital(1 - pin8.read_digital())
    sleep(10)
