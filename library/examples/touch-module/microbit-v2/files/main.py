from microbit import *

# SIG is 1 while it is touched
while True:
    pin0.write_digital(pin8.read_digital())
    sleep(10)
