# max30102.py for the micro:bit (MicroLab): the calls of n-elia's MAX30102-MicroPython-driver — MAX30102(i2c),
# setup_sensor(), check(), available(), pop_red_from_storage(), pop_ir_from_storage(), check_part_id() — on
# microbit.i2c, in SpO2 mode (red and IR, 18 bits) from the chip's FIFO (Maxim MAX30102 datasheet).
# MIT License. Copyright (c) 2026 MicroLab. Permission is granted to use, copy, modify and share this file, with
# this notice, without warranty (the MIT licence, https://opensource.org/licenses/MIT).


class MAX30102:
    def __init__(self, i2c, i2c_hex_address=0x57):
        self._i2c, self._addr = i2c, i2c_hex_address
        self._red, self._ir = [], []

    def _w(self, reg, v):
        self._i2c.write(self._addr, bytes([reg, v]))

    def _r(self, reg, n=1):
        self._i2c.write(self._addr, bytes([reg]))
        return self._i2c.read(self._addr, n)

    def check_part_id(self):
        return self._r(0xFF)[0] == 0x15

    def setup_sensor(self, led_power=0x24, sample_rate=100):
        self._w(0x09, 0x40)   # reset
        rates = {50: 0, 100: 1, 200: 2, 400: 3, 800: 4, 1000: 5, 1600: 6, 3200: 7}
        self._w(0x0A, 0x23 | rates.get(sample_rate, 1) << 2)   # 4096 nA range, the rate, 18 bits
        self._w(0x0C, led_power)
        self._w(0x0D, led_power)
        self._w(0x04, 0); self._w(0x05, 0); self._w(0x06, 0)   # empty FIFO
        self._w(0x09, 0x03)   # SpO2 mode: red and IR

    def check(self):
        n = (self._r(0x04)[0] - self._r(0x06)[0]) & 31
        for _ in range(n):
            d = self._r(0x07, 6)
            self._red.append((d[0] << 16 | d[1] << 8 | d[2]) & 0x3FFFF)
            self._ir.append((d[3] << 16 | d[4] << 8 | d[5]) & 0x3FFFF)
        self._red, self._ir = self._red[-32:], self._ir[-32:]   # keep the newest 32
        return n > 0

    def available(self):
        return len(self._red)

    def pop_red_from_storage(self):
        return self._red.pop(0) if self._red else 0

    def pop_ir_from_storage(self):
        return self._ir.pop(0) if self._ir else 0
