from microbit import *

pin8.set_pull(pin8.NO_PULL)   # the module has its own pull-up
# DO is 1 while it is shaken
while True:
    pin0.write_digital(pin8.read_digital())
    sleep(10)
