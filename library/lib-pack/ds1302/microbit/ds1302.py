# ds1302.py for the micro:bit (MicroLab): the calls of omarbenhamid's micropython-ds1302-rtc — DS1302(clk, dio, cs)
# with the micro:bit's pins (pin13, pin14, pin15); date_time(), second() … ram(). Bytes LSB first (Maxim DS1302).
# MIT License. Copyright (c) 2026 MicroLab. Permission is granted to use, copy, modify and share this file, with
# this notice, without warranty (the MIT licence, https://opensource.org/licenses/MIT).


def _bcd(v):
    return (v // 10) << 4 | v % 10


def _dec(b):
    return (b >> 4) * 10 + (b & 15)


class DS1302:
    def __init__(self, clk, dio, cs):
        self.clk, self.dio, self.cs = clk, dio, cs
        clk.write_digital(0)
        cs.write_digital(0)

    def _write_byte(self, b):
        for i in range(8):
            self.dio.write_digital((b >> i) & 1)
            self.clk.write_digital(1)
            self.clk.write_digital(0)

    def _read_byte(self):
        self.dio.set_pull(self.dio.NO_PULL)
        d = 0
        for i in range(8):
            d |= self.dio.read_digital() << i
            self.clk.write_digital(1)
            self.clk.write_digital(0)
        return d

    def _get_reg(self, reg):
        self.cs.write_digital(1)
        self._write_byte(reg)
        d = self._read_byte()
        self.cs.write_digital(0)
        return d

    def _set_reg(self, reg, v):
        self.cs.write_digital(1)
        self._write_byte(reg)
        self._write_byte(v)
        self.cs.write_digital(0)

    def _wr(self, reg, v):
        self._set_reg(0x8E, 0)   # write protect off
        self._set_reg(reg, v)
        self._set_reg(0x8E, 0x80)

    def start(self):
        self._wr(0x80, self._get_reg(0x81) & 0x7F)

    def stop(self):
        self._wr(0x80, self._get_reg(0x81) | 0x80)

    def _field(self, reg, v, mod, add=0):
        if v is None:
            return _dec(self._get_reg(reg + 1) & (0x7F if reg == 0x80 else 0xFF)) + add
        self._wr(reg, _bcd(v % mod))

    def second(self, second=None):
        return self._field(0x80, second, 60)

    def minute(self, minute=None):
        return self._field(0x82, minute, 60)

    def hour(self, hour=None):
        return self._field(0x84, hour, 24)

    def day(self, day=None):
        return self._field(0x86, day, 32)

    def month(self, month=None):
        return self._field(0x88, month, 13)

    def weekday(self, weekday=None):
        return self._field(0x8A, weekday, 8)

    def year(self, year=None):
        return self._field(0x8C, year, 100, 2000)

    def date_time(self, dat=None):
        if dat is None:
            return [self.year(), self.month(), self.day(), self.weekday(), self.hour(), self.minute(), self.second()]
        for f, v in zip((self.year, self.month, self.day, self.weekday, self.hour, self.minute, self.second), dat):
            f(v)

    def ram(self, reg, dat=None):
        if dat is None:
            return self._get_reg(0xC1 + (reg % 31) * 2)
        self._wr(0xC0 + (reg % 31) * 2, dat)
