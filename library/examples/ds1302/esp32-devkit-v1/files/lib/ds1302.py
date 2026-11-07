# ds1302.py — a small DS1302 driver for MicroLab's examples (MIT): its three pins by hand, bytes LSB first
# (Maxim DS1302 datasheet). The registers are BCD.
from machine import Pin

def _bcd(v):
    return (v // 10) << 4 | v % 10

def _dec(b):
    return (b >> 4) * 10 + (b & 15)

class DS1302:
    def __init__(self, clk, dat, rst):
        self.clk, self.dat, self.rst = clk, dat, rst
        self.clk.init(Pin.OUT, value=0)
        self.rst.init(Pin.OUT, value=0)

    def _write(self, b):
        self.dat.init(Pin.OUT)
        for i in range(8):
            self.dat.value((b >> i) & 1)
            self.clk.value(1)
            self.clk.value(0)

    def _read(self):
        self.dat.init(Pin.IN)
        d = 0
        for i in range(8):
            d |= self.dat.value() << i
            self.clk.value(1)
            self.clk.value(0)
        return d

    def get(self, reg):
        self.rst.value(1)
        self._write(reg | 1)
        d = self._read()
        self.rst.value(0)
        return d

    def put(self, reg, v):
        self.rst.value(1)
        self._write(reg)
        self._write(v)
        self.rst.value(0)

    def set_time(self, year, month, day, hour, minute, second):
        self.put(0x8E, 0)                       # write protect off
        for reg, v in ((0x8C, year % 100), (0x88, month), (0x86, day), (0x84, hour), (0x82, minute), (0x80, second)):
            self.put(reg, _bcd(v))

    def time(self):
        """(year, month, day, hour, minute, second)"""
        return (2000 + _dec(self.get(0x8C)), _dec(self.get(0x88)), _dec(self.get(0x86)),
                _dec(self.get(0x84)), _dec(self.get(0x82)), _dec(self.get(0x80) & 0x7F))
