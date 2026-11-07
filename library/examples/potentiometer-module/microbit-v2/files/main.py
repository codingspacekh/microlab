from microbit import *

# past half way: over 1.65 V
while True:
    pin0.write_digital(pin2.read_analog() > 512)
    sleep(10)
