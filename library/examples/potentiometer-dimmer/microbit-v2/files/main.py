from microbit import *

while True:
    pin0.write_analog(pin2.read_analog())
    sleep(20)
