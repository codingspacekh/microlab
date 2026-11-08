from microbit import *
import utime as time

A = 0x29
def w(r, v):
    i2c.write(A, bytes([r, v]))
def rd(r, n=1):
    i2c.write(A, bytes([r]))
    return i2c.read(A, n)

# the start-up of Pololu's VL53L0X library (MIT), in short
w(0x88, 0); w(0x80, 1); w(0xFF, 1); w(0x00, 0)
stop = rd(0x91)[0]
w(0x00, 1); w(0xFF, 0); w(0x80, 0)
def measure():
    w(0x80, 1); w(0xFF, 1); w(0x00, 0); w(0x91, stop); w(0x00, 1); w(0xFF, 0); w(0x80, 0)
    w(0x00, 0x01)                       # SYSRANGE_START: one measurement
    while rd(0x13)[0] & 7 == 0:         # until it is ready (about 30 ms)
        pass
    b = rd(0x1E, 2)                     # the range, mm
    w(0x0B, 1)                          # clear it
    return b[0] << 8 | b[1]

while True:
    print(measure(), 'mm')
    time.sleep_ms(200)
