from machine import I2C, Pin
i2c = I2C(0, sda=Pin(4), scl=Pin(5))
import time

def read(reg, n):
    return i2c.readfrom_mem(0x76, reg, n)
def write(reg, v):
    i2c.writeto_mem(0x76, reg, bytes([v]))

def u16(b, i):
    return b[i] | b[i + 1] << 8
def s16(b, i):
    v = u16(b, i)
    return v - 65536 if v > 32767 else v
c = read(0x88, 24)                          # its calibration words
T1, T2, T3, P1 = u16(c, 0), s16(c, 2), s16(c, 4), u16(c, 6)
P = [s16(c, i) for i in range(8, 24, 2)]
write(0xF4, 0x27)                           # normal mode, x1 oversampling
def measure():
    d = read(0xF7, 6)
    ap = d[0] << 12 | d[1] << 4 | d[2] >> 4
    at = d[3] << 12 | d[4] << 4 | d[5] >> 4
    v1 = (at / 16384 - T1 / 1024) * T2       # the datasheet's compensation (8.1)
    tf = v1 + (at / 131072 - T1 / 8192) ** 2 * T3
    v1 = tf / 2 - 64000
    v2 = (v1 * v1 * P[4] / 32768 + v1 * P[3] * 2) / 4 + P[2] * 65536
    v1 = (1 + (P[1] * v1 * v1 / 524288 + P[0] * v1) / 524288 / 32768) * P1
    p = (1048576 - ap - v2 / 4096) * 6250 / v1
    p += (P[7] * p * p / 2147483648 + p * P[6] / 32768 + P[5]) / 16
    return tf / 5120, p / 100

while True:
    t, p = measure()
    print('%.1f C %.1f hPa' % (t, p))
    time.sleep(0.5)
