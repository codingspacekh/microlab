from microbit import *
import struct

i2c.write(0x68, b'\x6b\x00')           # wake the MPU6050 up (it starts asleep)
while True:
    i2c.write(0x68, b'\x3b')              # from ACCEL_XOUT_H on
    x, y, z = struct.unpack('>hhh', i2c.read(0x68, 6))
    pin0.write_digital(abs(x) > 5600 or abs(y) > 5600)   # more than 20°: 16384 × sin 20°
    sleep(50)
