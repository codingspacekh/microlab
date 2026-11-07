# imu.py for the micro:bit (MicroLab): the MPU6050 calls of micropython-IMU's imu — MPU6050(i2c), .accel (g) and
# .gyro (°/s) as vectors (.x .y .z .xyz .magnitude), .temperature (°C) — on microbit.i2c, at ±2 g and ±250 °/s.
# MIT License. Copyright (c) 2026 MicroLab. Permission is granted to use, copy, modify and share this file, with
# this notice, without warranty (the MIT licence, https://opensource.org/licenses/MIT).
import math
import struct


class Vector3d:
    def __init__(self, read, scale):
        self._read, self._scale = read, scale

    @property
    def xyz(self):
        return tuple(v / self._scale for v in self._read())

    @property
    def x(self):
        return self.xyz[0]

    @property
    def y(self):
        return self.xyz[1]

    @property
    def z(self):
        return self.xyz[2]

    @property
    def magnitude(self):
        return math.sqrt(sum(v * v for v in self.xyz))


class MPU6050:
    def __init__(self, i2c, device_addr=None):
        self._i2c = i2c
        self._addr = 0x68 if device_addr in (None, 0) else (0x69 if device_addr == 1 else device_addr)
        self._i2c.write(self._addr, b'\x6b\x00')   # wake it up: it starts asleep
        self._i2c.write(self._addr, b'\x1c\x00')   # ±2 g
        self._i2c.write(self._addr, b'\x1b\x00')   # ±250 °/s
        self.accel = Vector3d(lambda: self._words(0x3B), 16384)
        self.gyro = Vector3d(lambda: self._words(0x43), 131)

    def _words(self, reg, n=3):
        self._i2c.write(self._addr, bytes([reg]))
        return struct.unpack('>' + 'h' * n, self._i2c.read(self._addr, 2 * n))

    @property
    def temperature(self):
        return self._words(0x41, 1)[0] / 340 + 35
