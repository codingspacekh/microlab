from microbit import *

# CLK pin13, DAT pin14, RST pin15: bytes LSB first (the DS1302 datasheet)
def wbyte(b):
    for i in range(8):
        pin14.write_digital((b >> i) & 1)
        pin13.write_digital(1)
        pin13.write_digital(0)
def rbyte():
    pin14.set_pull(pin14.NO_PULL)
    d = 0
    for i in range(8):
        d |= pin14.read_digital() << i
        pin13.write_digital(1)
        pin13.write_digital(0)
    return d
def put(reg, v):
    pin15.write_digital(1)
    wbyte(reg)
    wbyte(v)
    pin15.write_digital(0)
def get(reg):
    pin15.write_digital(1)
    wbyte(reg | 1)
    d = rbyte()
    pin15.write_digital(0)
    return d
bcd = lambda v: (v // 10) << 4 | v % 10
dec = lambda b: (b >> 4) * 10 + (b & 15)

pin13.write_digital(0)
pin15.write_digital(0)
put(0x8E, 0)
for reg, v in ((0x84, 8), (0x82, 59), (0x80, 58)):   # 08:59:58
    put(reg, bcd(v))
while True:
    print('%02d:%02d:%02d' % (dec(get(0x84)), dec(get(0x82)), dec(get(0x80) & 0x7F)))
    sleep(1000)
