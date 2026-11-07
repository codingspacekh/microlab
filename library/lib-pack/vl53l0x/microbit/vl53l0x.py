# vl53l0x.py for the micro:bit (MicroLab): the calls of kevinmcaleer's vl53l0x — VL53L0X(i2c), ping() (mm), read()
# — on microbit.i2c, with the short start-up of Pololu's VL53L0X library (its stop variable) and single ranges.
# MIT License. Copyright (c) 2026 MicroLab. Permission is granted to use, copy, modify and share this file, with
# this notice, without warranty (the MIT licence, https://opensource.org/licenses/MIT).
import utime


class VL53L0X:
    def __init__(self, i2c, address=0x29):
        self.i2c, self.address = i2c, address
        self._w(0x88, 0)
        self._config((0x80, 1), (0xFF, 1), (0x00, 0))
        self._stop_variable = self._r(0x91)[0]
        self._config((0x00, 1), (0xFF, 0), (0x80, 0))

    def _w(self, reg, v):
        self.i2c.write(self.address, bytes([reg, v]))

    def _r(self, reg, n=1):
        self.i2c.write(self.address, bytes([reg]))
        return self.i2c.read(self.address, n)

    def _config(self, *pairs):
        for reg, v in pairs:
            self._w(reg, v)

    def ping(self):
        """One range: the distance in mm (8190 or more: nothing within 2 m)."""
        self._config((0x80, 1), (0xFF, 1), (0x00, 0), (0x91, self._stop_variable), (0x00, 1), (0xFF, 0), (0x80, 0))
        self._w(0x00, 0x01)   # SYSRANGE_START
        for _ in range(500):
            if self._r(0x13)[0] & 0x07:   # RESULT_INTERRUPT_STATUS: ready
                break
            utime.sleep_ms(1)
        else:
            raise OSError('VL53L0X timeout')
        b = self._r(0x1E, 2)
        self._w(0x0B, 0x01)   # clear it
        return b[0] << 8 | b[1]

    read = ping
