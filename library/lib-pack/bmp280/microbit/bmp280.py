# bmp280.py for the micro:bit (MicroLab): the calls of dafvid's micropython-bmp280 — BMP280(i2c), .temperature
# (°C), .pressure (Pa), normal_measure() — on microbit.i2c, with the datasheet's compensation (Bosch BMP280, 8.1).
# MIT License. Copyright (c) 2026 MicroLab. Permission is granted to use, copy, modify and share this file, with
# this notice, without warranty (the MIT licence, https://opensource.org/licenses/MIT).


class BMP280:
    def __init__(self, i2c_bus, addr=0x76):
        self._i2c, self._addr = i2c_bus, addr
        c = self._read(0x88, 24)
        u = [c[i] | c[i + 1] << 8 for i in range(0, 24, 2)]
        s = [v - 65536 if v > 32767 else v for v in u]
        self._T = (u[0], s[1], s[2])
        self._P = [u[3]] + s[4:]
        self._t_fine = 0.0

    def _read(self, reg, n=1):
        self._i2c.write(self._addr, bytes([reg]))
        return self._i2c.read(self._addr, n)

    def _write(self, reg, v):
        self._i2c.write(self._addr, bytes([reg, v]))

    @property
    def chip_id(self):
        return self._read(0xD0)

    def normal_measure(self):
        self._write(0xF4, 0x27)   # temperature and pressure x1, normal mode

    def force_measure(self):
        self._write(0xF4, 0x25)

    def sleep(self):
        self._write(0xF4, 0x24)

    def _raw(self):
        d = self._read(0xF7, 6)
        return d[0] << 12 | d[1] << 4 | d[2] >> 4, d[3] << 12 | d[4] << 4 | d[5] >> 4

    @property
    def temperature(self):
        t1, t2, t3 = self._T
        at = self._raw()[1]
        self._t_fine = (at / 16384 - t1 / 1024) * t2 + (at / 131072 - t1 / 8192) ** 2 * t3
        return self._t_fine / 5120

    @property
    def pressure(self):
        self.temperature
        p1, p2, p3, p4, p5, p6, p7, p8, p9 = self._P
        ap = self._raw()[0]
        v1 = self._t_fine / 2 - 64000
        v2 = v1 * v1 * p6 / 32768 + v1 * p5 * 2
        v2 = v2 / 4 + p4 * 65536
        v1 = (p3 * v1 * v1 / 524288 + p2 * v1) / 524288
        v1 = (1 + v1 / 32768) * p1
        if v1 == 0:
            return 0
        p = (1048576 - ap - v2 / 4096) * 6250 / v1
        return p + (p9 * p * p / 2147483648 + p * p8 / 32768 + p7) / 16
