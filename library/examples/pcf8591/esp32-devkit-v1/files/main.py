from machine import I2C, Pin
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
import time

while True:
    i2c.writeto(0x48, bytes([0x40]))        # AOUT on, read AIN0
    v = i2c.readfrom(0x48, 2)[1]            # the first byte is the conversion before
    i2c.writeto(0x48, bytes([0x40, v]))     # the knob's value out on AOUT: the LED
    time.sleep_ms(20)
