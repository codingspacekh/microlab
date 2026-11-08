# tm1637.py for the micro:bit (MicroLab): the calls of Mike Causer's micropython-tm1637 — TM1637(clk, dio,
# brightness=7), write, brightness, encode_digit / _string / _char, hex, number, numbers, temperature, show,
# scroll — on the micro:bit's pins (TM1637(clk=pin1, dio=pin2)).
# MIT License. Copyright (c) 2026 MicroLab. Permission is granted to use, copy, modify and share this file, with
# this notice, without warranty (the MIT licence, https://opensource.org/licenses/MIT).
from microbit import sleep
from utime import sleep_us

# 0-9, a-z, blank, dash, star: segments a (bit 0) to g (bit 6)
_S = b'\x3F\x06\x5B\x4F\x66\x6D\x7D\x07\x7F\x6F\x77\x7C\x39\x5E\x79\x71\x3D\x76\x06\x1E\x76\x38\x55\x54\x3F\x73\x67\x50\x6D\x78\x3E\x1C\x2A\x76\x6E\x5B\x00\x40\x63'


class TM1637:
    def __init__(self, clk, dio, brightness=7):
        if not 0 <= brightness <= 7:
            raise ValueError("Brightness out of range")
        self.clk, self.dio, self._brightness = clk, dio, brightness
        clk.write_digital(0)
        dio.write_digital(0)
        self._frame(0x40)                    # data command: the address moves on
        self._frame(0x88 | brightness)       # display on, its brightness

    def _set(self, pin, v):
        pin.write_digital(v)
        sleep_us(10)

    def _frame(self, *data):                 # start, the bytes LSB first (a ninth clock each), stop
        c, d = self.clk, self.dio
        self._set(d, 0)
        self._set(c, 0)
        for b in data:
            for i in range(9):
                if i < 8:
                    self._set(d, b >> i & 1)
                self._set(c, 1)
                self._set(c, 0)
        self._set(d, 0)
        self._set(c, 1)
        d.write_digital(1)

    def brightness(self, val=None):
        if val is None:
            return self._brightness
        if not 0 <= val <= 7:
            raise ValueError("Brightness out of range")
        self._brightness = val
        self._frame(0x40)
        self._frame(0x88 | val)

    def write(self, segments, pos=0):
        if not 0 <= pos <= 5:
            raise ValueError("Position out of range")
        self._frame(0x40)
        self._frame(0xC0 | pos, *segments)
        self._frame(0x88 | self._brightness)

    def encode_digit(self, digit):
        return _S[digit & 0x0f]

    def encode_string(self, string):
        return bytearray(self.encode_char(c) for c in string)

    def encode_char(self, char):
        o = ord(char)
        for lo, hi, at in ((32, 32, 36), (42, 42, 38), (45, 45, 37), (65, 90, 10), (97, 122, 10), (48, 57, 0)):
            if lo <= o <= hi:
                return _S[at + (o - lo if hi > lo else 0)]
        raise ValueError("Character out of range: {:d} '{:s}'".format(o, chr(o)))

    def hex(self, val):
        self.write(self.encode_string('{:04x}'.format(val & 0xffff)))

    def number(self, num):
        self.write(self.encode_string('{0: >4d}'.format(max(-999, min(num, 9999)))))

    def numbers(self, num1, num2, colon=True):
        s = self.encode_string('{0:0>2d}{1:0>2d}'.format(max(-9, min(num1, 99)), max(-9, min(num2, 99))))
        if colon:
            s[1] |= 0x80
        self.write(s)

    def temperature(self, num):
        self.show('lo' if num < -9 else 'hi' if num > 99 else '{0: >2d}'.format(num))
        self.write([_S[38], _S[12]], 2)

    def show(self, string, colon=False):
        s = self.encode_string(string)
        if len(s) > 1 and colon:
            s[1] |= 128
        self.write(s[:4])

    def scroll(self, string, delay=250):
        s = string if isinstance(string, list) else list(self.encode_string(string))
        data = [0] * 4 + s + [0] * 4
        for i in range(len(s) + 5):
            self.write(data[i:i + 4])
            sleep(delay)
