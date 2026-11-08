# ssd1306.py for the micro:bit (MicroLab): the calls of MicroPython's ssd1306.py — SSD1306_I2C(width, height, i2c,
# addr=0x3C), fill, pixel, hline, vline, line, rect, fill_rect, text, show, contrast, invert, poweroff, poweron — on
# microbit.i2c (the micro:bit's MicroPython has no framebuf: the drawing calls are here, in Python).
# MIT License. Copyright (c) 2026 MicroLab. Permission is granted to use, copy, modify and share this file, with
# this notice, without warranty (the MIT licence, https://opensource.org/licenses/MIT). Its 8x8 letters are
# MicroPython's framebuf font (font_petme128_8x8.h, MIT, Copyright (c) 2013, 2014 Damien P. George).
# the letters ' ' to '~', 8 bytes each: a column each, bit 0 at the top (MicroPython's framebuf font)
_FONT = b'\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00OO\x00\x00\x00\x00\x07\x07\x00\x00\x07\x07\x00\x14\x7f\x7f\x14\x14\x7f\x7f\x14\x00$.kk:\x12\x00\x00c3\x18\x0cfc\x00\x002\x7fMMwrP\x00\x00\x00\x04\x06\x03\x01\x00\x00\x00\x1c>cA\x00\x00\x00\x00Ac>\x1c\x00\x00\x08*>\x1c\x1c>*\x08\x00\x08\x08>>\x08\x08\x00\x00\x00\x80\xe0`\x00\x00\x00\x00\x08\x08\x08\x08\x08\x08\x00\x00\x00\x00``\x00\x00\x00\x00@`0\x18\x0c\x06\x02\x00>\x7fIE\x7f>\x00\x00@D\x7f\x7f@@\x00\x00bsQIOF\x00\x00"cII\x7f6\x00\x00\x18\x18\x14\x16\x7f\x7f\x10\x00\'gEE}9\x00\x00>\x7fII{2\x00\x00\x03\x03y}\x07\x03\x00\x006\x7fII\x7f6\x00\x00&oII\x7f>\x00\x00\x00\x00$$\x00\x00\x00\x00\x00\x80\xe4d\x00\x00\x00\x00\x08\x1c6cAA\x00\x00\x14\x14\x14\x14\x14\x14\x00\x00AAc6\x1c\x08\x00\x00\x02\x03QY\x0f\x06\x00\x00>\x7fAMO.\x00\x00|~\x0b\x0b~|\x00\x00\x7f\x7fII\x7f6\x00\x00>\x7fAAc"\x00\x00\x7f\x7fAc>\x1c\x00\x00\x7f\x7fIIAA\x00\x00\x7f\x7f\t\t\x01\x01\x00\x00>\x7fAI{:\x00\x00\x7f\x7f\x08\x08\x7f\x7f\x00\x00\x00A\x7f\x7fA\x00\x00\x00 `A\x7f?\x01\x00\x00\x7f\x7f\x1c6cA\x00\x00\x7f\x7f@@@@\x00\x00\x7f\x7f\x06\x0c\x06\x7f\x7f\x00\x7f\x7f\x0e\x1c\x7f\x7f\x00\x00>\x7fAA\x7f>\x00\x00\x7f\x7f\t\t\x0f\x06\x00\x00\x1e?!a\x7f^\x00\x00\x7f\x7f\x199oF\x00\x00&oII{2\x00\x00\x01\x01\x7f\x7f\x01\x01\x00\x00?\x7f@@\x7f?\x00\x00\x1f?``?\x1f\x00\x00\x7f\x7f0\x180\x7f\x7f\x00cw\x1c\x1cwc\x00\x00\x07\x0fxx\x0f\x07\x00\x00aqYMGC\x00\x00\x00\x7f\x7fAA\x00\x00\x00\x02\x06\x0c\x180`@\x00\x00AA\x7f\x7f\x00\x00\x00\x08\x0c\x06\x06\x0c\x08\x00\xc0\xc0\xc0\xc0\xc0\xc0\xc0\xc0\x00\x00\x01\x03\x06\x04\x00\x00\x00 tTT|x\x00\x00\x7f\x7fDD|8\x00\x008|DDl(\x00\x008|DD\x7f\x7f\x00\x008|TT\\X\x00\x00\x08~\x7f\t\x03\x02\x00\x00\x98\xbc\xa4\xa4\xfc|\x00\x00\x7f\x7f\x04\x04|x\x00\x00\x00\x00}}\x00\x00\x00\x00@\xc0\x80\x80\xfd}\x00\x00\x7f\x7f08lD\x00\x00\x00A\x7f\x7f@\x00\x00\x00||\x180\x18||\x00||\x04\x04|x\x00\x008|DD|8\x00\x00\xfc\xfc$$<\x18\x00\x00\x18<$$\xfc\xfc\x00\x00||\x04\x04\x0c\x08\x00\x00H\\TTt \x00\x04\x04?\x7fDd \x00\x00<|@@|<\x00\x00\x1c<``<\x1c\x00\x00\x1c|0\x180|\x1c\x00Dl88lD\x00\x00\x9c\xbc\xa0\xa0\xfc|\x00\x00Ddt\\LD\x00\x00\x08\x08>wAA\x00\x00\x00\x00\xff\xff\x00\x00\x00\x00AAw>\x08\x08\x00\x00\x02\x03\x01\x03\x02\x03\x01\xaaU\xaaU\xaaU\xaaU'


class _Canvas:
    """The drawing calls of MicroPython's framebuf, on a buffer of this display's own layout (_get, _set)."""

    def fill(self, c):
        for i in range(len(self.buffer)):
            self.buffer[i] = 0xFF if c else 0

    def pixel(self, x, y, c=None):
        if not (0 <= x < self.width and 0 <= y < self.height):
            return
        if c is None:
            return self._get(x, y)
        self._set(x, y, c)

    def hline(self, x, y, w, c):
        for i in range(w):
            self.pixel(x + i, y, c)

    def vline(self, x, y, h, c):
        for i in range(h):
            self.pixel(x, y + i, c)

    def rect(self, x, y, w, h, c, f=False):
        if f:
            self.fill_rect(x, y, w, h, c)
            return
        self.hline(x, y, w, c)
        self.hline(x, y + h - 1, w, c)
        self.vline(x, y, h, c)
        self.vline(x + w - 1, y, h, c)

    def fill_rect(self, x, y, w, h, c):
        for j in range(h):
            self.hline(x, y + j, w, c)

    def line(self, x0, y0, x1, y1, c):
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
        e = dx + dy
        while True:
            self.pixel(x0, y0, c)
            if x0 == x1 and y0 == y1:
                return
            e2 = 2 * e
            if e2 >= dy:
                e += dy
                x0 += sx
            if e2 <= dx:
                e += dx
                y0 += sy

    def text(self, s, x, y, c=1):
        for ch in s:
            o = ord(ch)
            o = (o if 32 <= o <= 127 else 127) - 32
            for col in range(8):
                bits = _FONT[o * 8 + col]
                for row in range(8):
                    if bits >> row & 1:
                        self.pixel(x + col, y + row, c)
            x += 8


class SSD1306_I2C(_Canvas):
    def __init__(self, width, height, i2c, addr=0x3C, external_vcc=False):
        self.width, self.height, self.i2c, self.addr = width, height, i2c, addr
        self.pages = height // 8
        self.buffer = bytearray(self.pages * width)
        for cmd in (0xAE, 0x20, 0x00, 0x40, 0xA1, 0xA8, height - 1, 0xC8, 0xD3, 0x00, 0xDA,
                    0x02 if width > 2 * height else 0x12, 0xD5, 0x80, 0xD9, 0x22 if external_vcc else 0xF1,
                    0xDB, 0x30, 0x81, 0xFF, 0xA4, 0xA6, 0x8D, 0x10 if external_vcc else 0x14, 0xAF):
            self.write_cmd(cmd)
        self.fill(0)
        self.show()

    def _get(self, x, y):
        return self.buffer[(y >> 3) * self.width + x] >> (y & 7) & 1

    def _set(self, x, y, c):
        i = (y >> 3) * self.width + x
        if c:
            self.buffer[i] |= 1 << (y & 7)
        else:
            self.buffer[i] &= ~(1 << (y & 7)) & 0xFF

    def write_cmd(self, cmd):
        self.i2c.write(self.addr, bytes([0x80, cmd]))

    def show(self):
        for cmd in (0x21, 0, self.width - 1, 0x22, 0, self.pages - 1):
            self.write_cmd(cmd)
        self.i2c.write(self.addr, b'@' + self.buffer)

    def poweroff(self):
        self.write_cmd(0xAE)

    def poweron(self):
        self.write_cmd(0xAF)

    def contrast(self, contrast):
        self.write_cmd(0x81)
        self.write_cmd(contrast)

    def invert(self, invert):
        self.write_cmd(0xA6 | (invert & 1))
