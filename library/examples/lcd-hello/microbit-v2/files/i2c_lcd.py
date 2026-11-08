# i2c_lcd.py for the micro:bit (MicroLab): the calls of Dave Hylands' python_lcd — I2cLcd(i2c, addr, lines,
# columns), clear, putchar, putstr, move_to, show_cursor, hide_cursor, blink_cursor_on / off, display_on / off,
# backlight_on / off, custom_char — for an HD44780 LCD behind a PCF8574 backpack, on microbit.i2c.
# MIT License. Copyright (c) 2026 MicroLab. Permission is granted to use, copy, modify and share this file, with
# this notice, without warranty (the MIT licence, https://opensource.org/licenses/MIT).
from microbit import sleep


class I2cLcd:
    def __init__(self, i2c, i2c_addr, num_lines, num_columns):
        self.i2c, self.addr = i2c, i2c_addr
        self.num_lines, self.num_columns = min(num_lines, 4), min(num_columns, 40)
        self.cursor_x = self.cursor_y = 0
        self.backlight = True
        i2c.write(i2c_addr, bytes([0]))
        sleep(20)
        for n in (0x30, 0x30, 0x30, 0x20):   # reset three times, then 4-bit mode
            self._pulse(n)
            sleep(5)
        self._cmd(0x28 if num_lines > 1 else 0x20)
        self.display_off()
        self.backlight_on()
        self.clear()
        self._cmd(0x06)                      # entry mode: the cursor moves right
        self.display_on()

    def _pulse(self, b):                     # D4–D7 on P4–P7, taken as E (P2) falls
        self.i2c.write(self.addr, bytes([b | 0x04]))
        self.i2c.write(self.addr, bytes([b]))

    def _send(self, v, rs):
        light = 0x08 if self.backlight else 0
        self._pulse(rs | light | (v & 0xF0))
        self._pulse(rs | light | ((v << 4) & 0xF0))

    def _cmd(self, c):
        self._send(c, 0)
        if c <= 3:
            sleep(5)

    def clear(self):
        self._cmd(0x01)
        self._cmd(0x02)
        self.cursor_x = self.cursor_y = 0

    def show_cursor(self):
        self._cmd(0x0E)

    def hide_cursor(self):
        self._cmd(0x0C)

    def blink_cursor_on(self):
        self._cmd(0x0F)

    blink_cursor_off = show_cursor
    display_on = hide_cursor

    def display_off(self):
        self._cmd(0x08)

    def backlight_on(self):
        self.backlight = True
        self.i2c.write(self.addr, bytes([0x08]))

    def backlight_off(self):
        self.backlight = False
        self.i2c.write(self.addr, bytes([0]))

    def move_to(self, x, y):
        self.cursor_x, self.cursor_y = x, y
        a = (x & 0x3F) + (0x40 if y & 1 else 0) + (self.num_columns if y & 2 else 0)
        self._cmd(0x80 | a)

    def putchar(self, ch):
        if ch == '\n':
            self.cursor_x = self.num_columns
        else:
            self._send(ord(ch), 1)
            self.cursor_x += 1
        if self.cursor_x >= self.num_columns:
            self.cursor_x = 0
            self.cursor_y = (self.cursor_y + 1) % self.num_lines
        self.move_to(self.cursor_x, self.cursor_y)

    def putstr(self, s):
        for ch in s:
            self.putchar(ch)

    def custom_char(self, location, charmap):
        self._cmd(0x40 | ((location & 7) << 3))
        for i in range(8):
            self._send(charmap[i], 1)
        self.move_to(self.cursor_x, self.cursor_y)
