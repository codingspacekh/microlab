# mfrc522.py (MicroLab): the calls of danjperron's micropython-mfrc522 (after Stefan Wendler's) — MFRC522(sck, mosi,
# miso, rst, cs), request, anticoll, SelectTagSN, auth, read, write, … — on SoftSPI (the Pico W, the ESP32: pin
# numbers) or microbit.spi (the micro:bit: its pin objects); each SPI byte one byte, as bytes([...]) makes it.
# MIT License. Copyright (c) 2026 MicroLab. Permission is granted to use, copy, modify and share this file, with
# this notice, without warranty (the MIT licence, https://opensource.org/licenses/MIT).
try:
    import microbit as _mb
except ImportError:
    _mb = None


class MFRC522:
    OK, NOTAGERR, ERR = 0, 1, 2
    REQIDL, REQALL, AUTHENT1A, AUTHENT1B = 0x26, 0x52, 0x60, 0x61
    PICC_ANTICOLL1 = 0x93

    def __init__(self, sck, mosi, miso, rst, cs, baudrate=1000000, spi_id=0):
        if _mb:
            _mb.spi.init(baudrate=baudrate, sclk=sck, mosi=mosi, miso=miso)
            self.spi, self.rst, self.cs = _mb.spi, rst, cs
            self._pin = lambda p, v: p.write_digital(v)
        else:
            from machine import Pin, SoftSPI
            self.spi = SoftSPI(baudrate=baudrate, polarity=0, phase=0, sck=Pin(sck), mosi=Pin(mosi), miso=Pin(miso))
            self.rst, self.cs = Pin(rst, Pin.OUT), Pin(cs, Pin.OUT)
            self._pin = lambda p, v: p.value(v)
        self._pin(self.rst, 0)
        self._pin(self.cs, 1)
        self._pin(self.rst, 1)
        self.init()

    def _wreg(self, reg, val):
        self._pin(self.cs, 0)
        self.spi.write(bytes([(reg << 1) & 0x7E, val & 0xFF]))
        self._pin(self.cs, 1)

    def _rreg(self, reg):
        self._pin(self.cs, 0)
        self.spi.write(bytes([((reg << 1) & 0x7E) | 0x80]))
        v = self.spi.read(1)[0]
        self._pin(self.cs, 1)
        return v

    def _sflags(self, reg, mask):
        self._wreg(reg, self._rreg(reg) | mask)

    def _cflags(self, reg, mask):
        self._wreg(reg, self._rreg(reg) & ~mask)

    def _tocard(self, cmd, send):
        recv, bits = [], 0
        irq_en, wait = (0x12, 0x10) if cmd == 0x0E else (0x77, 0x30)
        self._wreg(0x02, irq_en | 0x80)
        self._cflags(0x04, 0x80)
        self._sflags(0x0A, 0x80)
        self._wreg(0x01, 0x00)
        for c in send:
            self._wreg(0x09, c)
        self._wreg(0x01, cmd)
        if cmd == 0x0C:
            self._sflags(0x0D, 0x80)
        for _ in range(2000):
            n = self._rreg(0x04)
            if n & wait:
                break
        else:
            return self.ERR, recv, bits
        self._cflags(0x0D, 0x80)
        if self._rreg(0x06) & 0x1B:
            return self.ERR, recv, bits
        if n & irq_en & 0x01:
            return self.NOTAGERR, recv, bits
        if cmd == 0x0C:
            n = self._rreg(0x0A)
            last = self._rreg(0x0C) & 0x07
            bits = (n - 1) * 8 + last if last else n * 8
            recv = [self._rreg(0x09) for _ in range(min(max(n, 1), 16))]
        return self.OK, recv, bits

    def _crc(self, data):
        self._cflags(0x05, 0x04)
        self._sflags(0x0A, 0x80)
        for c in data:
            self._wreg(0x09, c)
        self._wreg(0x01, 0x03)
        for _ in range(255):
            if self._rreg(0x05) & 0x04:
                break
        return [self._rreg(0x22), self._rreg(0x21)]

    def init(self):
        self._wreg(0x01, 0x0F)
        for r, v in ((0x2A, 0x8D), (0x2B, 0x3E), (0x2D, 30), (0x2C, 0), (0x15, 0x40), (0x11, 0x3D)):
            self._wreg(r, v)
        self._sflags(0x14, 0x03)   # the antenna on

    def request(self, mode):
        self._wreg(0x0D, 0x07)
        stat, _, bits = self._tocard(0x0C, [mode])
        return (stat if stat == self.OK and bits == 0x10 else self.ERR), bits

    def anticoll(self, anticolN=0x93):
        self._wreg(0x0D, 0x00)
        stat, recv, _ = self._tocard(0x0C, [anticolN, 0x20])
        if stat == self.OK and (len(recv) != 5 or recv[0] ^ recv[1] ^ recv[2] ^ recv[3] != recv[4]):
            stat = self.ERR
        return stat, recv

    def PcdSelect(self, serNum, anticolN=0x93):
        buf = [anticolN, 0x70] + list(serNum)
        stat, _, bits = self._tocard(0x0C, buf + self._crc(buf))
        return 1 if stat == self.OK and bits == 0x18 else 0

    def SelectTagSN(self):
        stat, uid = self.anticoll(self.PICC_ANTICOLL1)
        if stat != self.OK or not self.PcdSelect(uid, self.PICC_ANTICOLL1):
            return self.ERR, []
        return self.OK, uid[:4]

    def tohexstring(self, v):
        return '[' + ', '.join('0x{:02X}'.format(i) for i in v) + ']'

    def auth(self, mode, addr, sect, ser):
        return self._tocard(0x0E, [mode, addr] + list(sect) + list(ser[:4]))[0]

    def authKeys(self, uid, addr, keyA=None, keyB=None):
        if keyA is not None:
            return self.auth(self.AUTHENT1A, addr, keyA, uid)
        return self.ERR if keyB is None else self.auth(self.AUTHENT1B, addr, keyB, uid)

    def stop_crypto1(self):
        self._cflags(0x08, 0x08)

    def read(self, addr):
        data = [0x30, addr]
        stat, recv, _ = self._tocard(0x0C, data + self._crc(data))
        return stat, recv

    def write(self, addr, data):
        for buf in ([0xA0, addr], list(data[:16])):
            stat, recv, bits = self._tocard(0x0C, buf + self._crc(buf))
            if stat != self.OK or bits != 4 or recv[0] & 0x0F != 0x0A:
                return self.ERR
        return self.OK

    def readSectorBlock(self, uid, sector, block, keyA=None, keyB=None):
        b = sector * 4 + block % 4
        if b < 64 and self.authKeys(uid, b, keyA, keyB) != self.ERR:
            return self.read(b)
        return self.ERR, None

    def writeSectorBlock(self, uid, sector, block, data, keyA=None, keyB=None):
        b = sector * 4 + block % 4
        if b < 64 and len(data) == 16 and self.authKeys(uid, b, keyA, keyB) != self.ERR:
            return self.write(b, data)
        return self.ERR
