from microbit import *

while True:
    i2c.write(0x48, bytes([0x40]))        # AOUT on, read AIN0
    v = i2c.read(0x48, 2)[1]              # the first byte is the conversion before
    i2c.write(0x48, bytes([0x40, v]))     # the knob's value out on AOUT: the LED
    sleep(20)
