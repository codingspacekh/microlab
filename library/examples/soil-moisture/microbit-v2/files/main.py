from microbit import *

# dry soil: about 2.4 V on pin 2, wet: about 0.9 V
while True:
    pin0.write_digital(pin2.read_analog() > 620)   # dry: water me!
    sleep(20)
